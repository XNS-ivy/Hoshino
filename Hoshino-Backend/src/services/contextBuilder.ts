import type {
	CommandContext,
	MessageKind,
	ParsedQuotedMessage,
} from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"
import type {
	AnyMessageContent,
	GroupMetadata,
	GroupParticipant,
	WAMessage,
	WASocket,
} from "baileys"
import { downloadMediaMessage } from "baileys"
import NodeCache from "node-cache"

// Cache group metadata in-memory for 5 minutes to prevent network spam
const groupMetadataCache = new NodeCache({ stdTTL: 300, checkperiod: 60 })

/**
 * Extracts all candidate normalized JIDs for a group participant (`id`, `lid`, `phoneNumber`).
 */
export function getParticipantIdentities(p?: GroupParticipant | null): string[] {
	if (!p) return []
	const pExt = p as GroupParticipant & { jid?: string }
	return commandRepository.normalizeJidList([
		p.id,
		p.lid,
		p.phoneNumber,
		pExt.jid,
	])
}

/**
 * Finds a matching participant in a group's participant list against a set of candidate user JIDs/LIDs.
 */
export function findGroupParticipant(
	participants: GroupParticipant[] | undefined,
	targetIdentities: (string | undefined | null)[],
): GroupParticipant | undefined {
	if (!participants || participants.length === 0) return undefined
	const cleanTargets = commandRepository.normalizeJidList(targetIdentities)
	if (cleanTargets.length === 0) return undefined

	const targetSet = new Set(cleanTargets)
	const targetDigits = new Set(
		cleanTargets
			.map((id) => id.split("@")[0]?.replace(/[^0-9]/g, "") || "")
			.filter((d) => d.length > 5),
	)

	return participants.find((p) => {
		const pIds = getParticipantIdentities(p)
		for (const pId of pIds) {
			if (targetSet.has(pId)) return true
			const digits = pId.split("@")[0]?.replace(/[^0-9]/g, "") || ""
			if (digits.length > 5 && targetDigits.has(digits)) return true
		}
		return false
	})
}

/**
 * Extracts direct sender, canonical senderJid, and all immediate sender identities from a raw WAMessage.
 */
export function extractSenderIdentities(
	sock: WASocket,
	rawMsg: WAMessage,
): {
	senderJid: string
	directSender: string
	senderIdentities: string[]
} {
	const key = rawMsg.key
	const jid = key.remoteJid || ""
	const isGroup = jid.endsWith("@g.us")
	const directSender = key.fromMe
		? sock.user?.id || sock.user?.lid || jid
		: key.participant || rawMsg.participant || jid
	const altSender = key.fromMe
		? undefined
		: isGroup
			? key.participantAlt
			: key.remoteJidAlt
	const senderJid = commandRepository.normalizeJid(altSender || directSender)

	const senderIdentities = commandRepository.normalizeJidList(
		key.fromMe
			? [sock.user?.id, sock.user?.lid]
			: [
					key.participant,
					key.participantAlt,
					rawMsg.participant,
					isGroup ? undefined : jid,
					isGroup ? undefined : key.remoteJidAlt,
				],
	)

	if (senderJid && !senderIdentities.includes(senderJid)) {
		senderIdentities.push(senderJid)
	}

	return { senderJid, directSender, senderIdentities }
}

/**
 * Resolves all known identities (both `@lid` and `@s.whatsapp.net`) for a user
 * using GroupMetadata participants and Baileys Signal LID mapping store.
 */
export async function resolveUserIdentities(
	sock: WASocket | undefined,
	initialJids: (string | undefined | null)[],
	groupMeta?: GroupMetadata | null,
	includeUSyncPnLookup = false,
): Promise<string[]> {
	const identities = new Set<string>(
		commandRepository.normalizeJidList(initialJids),
	)
	if (identities.size === 0) return []

	// 1. Enrich from GroupMetadata participants if available
	if (groupMeta?.participants?.length) {
		const matchedParticipant = findGroupParticipant(
			groupMeta.participants,
			Array.from(identities),
		)
		if (matchedParticipant) {
			for (const pId of getParticipantIdentities(matchedParticipant)) {
				identities.add(pId)
			}
		}
	}

	// 2. Enrich from Baileys Signal Store LID <-> PN mapping
	const lidMapping = sock?.signalRepository?.lidMapping
	if (lidMapping) {
		for (const id of Array.from(identities)) {
			if (id.endsWith("@lid")) {
				try {
					const pn = await lidMapping.getPNForLID(id)
					if (pn) {
						const cleanPn = commandRepository.normalizeJid(pn)
						if (cleanPn) identities.add(cleanPn)
					}
				} catch {}
			} else if (id.endsWith("@s.whatsapp.net") && includeUSyncPnLookup) {
				try {
					const lid = await lidMapping.getLIDForPN(id)
					if (lid) {
						const cleanLid = commandRepository.normalizeJid(lid)
						if (cleanLid) identities.add(cleanLid)
					}
				} catch {}
			}
		}
	}

	// 3. Re-match GroupMetadata participants in case lidMapping revealed a new PN/LID
	if (groupMeta?.participants?.length) {
		const matchedParticipant = findGroupParticipant(
			groupMeta.participants,
			Array.from(identities),
		)
		if (matchedParticipant) {
			for (const pId of getParticipantIdentities(matchedParticipant)) {
				identities.add(pId)
			}
		}
	}

	return Array.from(identities)
}

export function detectMessageType(m: unknown): MessageKind {
	if (!m || typeof m !== "object") return "other"
	const msg = m as Record<string, unknown>
	if (msg.conversation || msg.extendedTextMessage) return "text"
	if (msg.imageMessage) return "image"
	if (msg.videoMessage) return "video"
	if (msg.audioMessage) return "audio"
	if (msg.documentMessage) return "document"
	if (msg.stickerMessage) return "sticker"
	return "other"
}

export function buildCommandContext(
	agentId: string,
	sock: WASocket,
	rawMsg: WAMessage,
	prefix: string,
	commandName: string,
	args: string[],
): CommandContext {
	const key = rawMsg.key
	const jid = key.remoteJid || ""
	const isGroup = jid.endsWith("@g.us")
	const { senderJid, senderIdentities } = extractSenderIdentities(sock, rawMsg)
	const pushName = rawMsg.pushName || undefined

	// Extract raw message body text & detect message type
	const m = rawMsg.message
	const rawContent =
		m?.ephemeralMessage?.message ||
		m?.viewOnceMessage?.message ||
		m?.viewOnceMessageV2?.message ||
		m

	const messageType = detectMessageType(rawContent)
	let body = ""
	if (rawContent) {
		const contentObj = rawContent as Record<
			string,
			{ text?: string; caption?: string } | string
		>
		const extText =
			typeof contentObj.extendedTextMessage === "object"
				? contentObj.extendedTextMessage?.text
				: undefined
		const imgCap =
			typeof contentObj.imageMessage === "object"
				? contentObj.imageMessage?.caption
				: undefined
		const vidCap =
			typeof contentObj.videoMessage === "object"
				? contentObj.videoMessage?.caption
				: undefined
		const convText =
			typeof contentObj.conversation === "string"
				? contentObj.conversation
				: undefined

		body = (convText || extText || imgCap || vidCap || "").trim()
	}

	// Internal single-flight caches for lazy getters
	let ownerRoleCache: "master" | "owner" | null | undefined
	let groupMetaCache: GroupMetadata | null | undefined
	let adminStatusCache: { isAdmin: boolean; isBotAdmin: boolean } | undefined
	let quotedCache: ParsedQuotedMessage | null | undefined
	let mediaBufferCache: Buffer | null | undefined

	const reply = async (
		content: string | AnyMessageContent,
	): Promise<WAMessage> => {
		const payload = typeof content === "string" ? { text: content } : content
		const sent = await sock.sendMessage(jid, payload, { quoted: rawMsg })
		if (!sent) {
			throw new Error("Failed to send reply message via Baileys")
		}
		return sent
	}

	const getGroupMetadata = async (): Promise<GroupMetadata | null> => {
		if (!isGroup) return null
		if (groupMetaCache !== undefined) return groupMetaCache

		const cached = groupMetadataCache.get<GroupMetadata>(jid)
		if (cached) {
			groupMetaCache = cached
			return cached
		}

		try {
			const meta = await sock.groupMetadata(jid)
			groupMetadataCache.set(jid, meta)
			groupMetaCache = meta
			return meta
		} catch {
			groupMetaCache = null
			return null
		}
	}

	const getOwnerRole = async (): Promise<"master" | "owner" | null> => {
		if (ownerRoleCache !== undefined) return ownerRoleCache
		let matchedRole: "master" | "owner" | null = null

		// 1. Direct check with all known sender identities
		matchedRole = await commandRepository.getOwnerRole(
			agentId,
			senderIdentities,
		)

		// 2. If not matched, try resolving LID <-> Phone Number via Baileys Signal Store
		if (!matchedRole && sock.signalRepository?.lidMapping) {
			const lidMapping = sock.signalRepository.lidMapping

			// 2a. Reverse check: if any sender identity is a LID, resolve to Phone Number (PN)
			for (const id of [...senderIdentities]) {
				if (id.endsWith("@lid")) {
					try {
						const pn = await lidMapping.getPNForLID(id)
						if (pn) {
							const cleanPn = commandRepository.normalizeJid(pn)
							if (!senderIdentities.includes(cleanPn)) {
								senderIdentities.push(cleanPn)
							}
							const role = await commandRepository.getOwnerRole(
								agentId,
								cleanPn,
							)
							if (role) {
								matchedRole = role
								// Auto-persist owner's LID in database for future zero-cost instant checks
								await commandRepository
									.addOwner(agentId, id, role)
									.catch(() => {})
								break
							}
						}
					} catch {}
				}
			}

			// 2b. Forward check: resolve registered owners' phone numbers to LIDs via USync
			if (!matchedRole) {
				try {
					const registeredOwners = await commandRepository.getOwners(agentId)
					for (const owner of registeredOwners) {
						const cleanOwnerJid = commandRepository.normalizeJid(owner.userJid)
						if (cleanOwnerJid.endsWith("@s.whatsapp.net")) {
							try {
								const ownerLid = await lidMapping.getLIDForPN(cleanOwnerJid)
								if (ownerLid) {
									const cleanOwnerLid = commandRepository.normalizeJid(ownerLid)
									// Auto-persist owner's LID in database
									await commandRepository
										.addOwner(
											agentId,
											cleanOwnerLid,
											(owner.role as "master" | "owner") || "owner",
										)
										.catch(() => {})

									if (senderIdentities.includes(cleanOwnerLid)) {
										matchedRole =
											(owner.role as string)?.toLowerCase() === "master"
												? "master"
												: "owner"
										if (!senderIdentities.includes(cleanOwnerJid)) {
											senderIdentities.push(cleanOwnerJid)
										}
										break
									}
								}
							} catch {}
						} else if (cleanOwnerJid.endsWith("@lid")) {
							try {
								const ownerPn = await lidMapping.getPNForLID(cleanOwnerJid)
								if (ownerPn) {
									const cleanOwnerPn = commandRepository.normalizeJid(ownerPn)
									// Auto-persist owner's PN in database
									await commandRepository
										.addOwner(
											agentId,
											cleanOwnerPn,
											(owner.role as "master" | "owner") || "owner",
										)
										.catch(() => {})

									if (senderIdentities.includes(cleanOwnerPn)) {
										matchedRole =
											(owner.role as string)?.toLowerCase() === "master"
												? "master"
												: "owner"
										if (!senderIdentities.includes(cleanOwnerJid)) {
											senderIdentities.push(cleanOwnerJid)
										}
										break
									}
								}
							} catch {}
						}
					}
				} catch {}
			}
		}

		ownerRoleCache = matchedRole
		return ownerRoleCache
	}

	const getSenderAdminStatus = async (): Promise<{
		isAdmin: boolean
		isBotAdmin: boolean
	}> => {
		if (adminStatusCache !== undefined) return adminStatusCache
		if (!isGroup) {
			adminStatusCache = { isAdmin: false, isBotAdmin: false }
			return adminStatusCache
		}

		const wasCached = groupMetadataCache.has(jid)
		let meta = await getGroupMetadata()
		if (!meta) {
			adminStatusCache = { isAdmin: false, isBotAdmin: false }
			return adminStatusCache
		}

		const evaluateAdminRoles = async (currentMeta: GroupMetadata) => {
			const resolvedSenderIds = await resolveUserIdentities(
				sock,
				senderIdentities,
				currentMeta,
				false,
			)
			for (const id of resolvedSenderIds) {
				if (!senderIdentities.includes(id)) {
					senderIdentities.push(id)
				}
			}

			const resolvedBotIds = await resolveUserIdentities(
				sock,
				[sock.user?.id, sock.user?.lid],
				currentMeta,
				false,
			)

			const participants = currentMeta.participants || []
			const participant = findGroupParticipant(participants, resolvedSenderIds)
			const botParticipant = findGroupParticipant(participants, resolvedBotIds)

			const isAdmin =
				Boolean(participant?.isAdmin) ||
				Boolean(participant?.isSuperAdmin) ||
				participant?.admin === "admin" ||
				participant?.admin === "superadmin"

			const isBotAdmin =
				Boolean(botParticipant?.isAdmin) ||
				Boolean(botParticipant?.isSuperAdmin) ||
				botParticipant?.admin === "admin" ||
				botParticipant?.admin === "superadmin"

			return { isAdmin, isBotAdmin }
		}

		let status = await evaluateAdminRoles(meta)

		// If group metadata came from cache and caller/bot lacks admin status, refresh once in case of recent promotion
		if (wasCached && (!status.isAdmin || !status.isBotAdmin)) {
			try {
				const freshMeta = await sock.groupMetadata(jid)
				if (freshMeta) {
					groupMetadataCache.set(jid, freshMeta)
					groupMetaCache = freshMeta
					meta = freshMeta
					status = await evaluateAdminRoles(freshMeta)
				}
			} catch {
				// Keep cached evaluation if live fetch fails
			}
		}

		adminStatusCache = status
		return adminStatusCache
	}

	const getQuotedMessage = async (): Promise<ParsedQuotedMessage | null> => {
		if (quotedCache !== undefined) return quotedCache
		const contextInfo =
			m?.extendedTextMessage?.contextInfo ||
			m?.imageMessage?.contextInfo ||
			m?.videoMessage?.contextInfo ||
			m?.documentMessage?.contextInfo ||
			m?.stickerMessage?.contextInfo ||
			m?.audioMessage?.contextInfo

		const quotedMsg = contextInfo?.quotedMessage
		if (!quotedMsg) {
			quotedCache = null
			return null
		}

		const botIds = commandRepository.normalizeJidList([
			sock.user?.id,
			sock.user?.lid,
		])
		const quotedParticipantNorm = contextInfo?.participant
			? commandRepository.normalizeJid(contextInfo.participant)
			: ""

		const quotedKey = {
			remoteJid: jid,
			fromMe: quotedParticipantNorm
				? botIds.includes(quotedParticipantNorm)
				: false,
			id: contextInfo?.stanzaId,
			participant: contextInfo?.participant,
		}

		const text =
			quotedMsg.conversation ||
			quotedMsg.extendedTextMessage?.text ||
			quotedMsg.imageMessage?.caption ||
			quotedMsg.videoMessage?.caption ||
			null

		quotedCache = {
			key: quotedKey,
			message: quotedMsg,
			rawQuoted: quotedMsg,
			senderJid: commandRepository.normalizeJid(
				contextInfo?.participant || jid,
			),
			text,
			caption: text,
			getMediaBuffer: async () => {
				try {
					const fakeMsg = {
						key: quotedKey,
						message: quotedMsg,
					} as WAMessage
					const buffer = (await downloadMediaMessage(
						fakeMsg,
						"buffer",
						{},
						{
							logger: { level: "silent" } as unknown as NonNullable<
								Parameters<typeof downloadMediaMessage>[3]
							>["logger"],
							reuploadRequest: sock.updateMediaMessage,
						},
					)) as Buffer
					return buffer && buffer.length > 0 ? buffer : null
				} catch {
					return null
				}
			},
		}
		return quotedCache
	}

	const getMediaBuffer = async (): Promise<Buffer | null> => {
		if (mediaBufferCache !== undefined) return mediaBufferCache
		try {
			const buffer = (await downloadMediaMessage(
				rawMsg,
				"buffer",
				{},
				{
					logger: { level: "silent" } as unknown as NonNullable<
						Parameters<typeof downloadMediaMessage>[3]
					>["logger"],
					reuploadRequest: sock.updateMediaMessage,
				},
			)) as Buffer
			if (buffer && buffer.length > 0) {
				mediaBufferCache = buffer
				return buffer
			}
			mediaBufferCache = null
			return null
		} catch {
			mediaBufferCache = null
			return null
		}
	}

	const getGroupInviteCode = async (): Promise<string | null> => {
		if (!isGroup) return null
		try {
			const code = await sock.groupInviteCode(jid)
			return code || null
		} catch {
			return null
		}
	}

	const getProfilePicUrl = async (
		targetJid?: string,
	): Promise<string | null> => {
		const target = targetJid
			? commandRepository.normalizeJid(targetJid)
			: senderJid
		try {
			const url = await sock.profilePictureUrl(target, "image")
			return url || null
		} catch {
			return null
		}
	}

	const getMentions = async (): Promise<string[]> => {
		const contextInfo =
			m?.extendedTextMessage?.contextInfo ||
			m?.imageMessage?.contextInfo ||
			m?.videoMessage?.contextInfo
		const list = contextInfo?.mentionedJid || []
		return list.map((item) => commandRepository.normalizeJid(item))
	}

	const getBusinessProfile = async (
		targetJid?: string,
	): Promise<unknown | null> => {
		const target = targetJid
			? commandRepository.normalizeJid(targetJid)
			: senderJid
		try {
			return await sock.getBusinessProfile(target)
		} catch {
			return null
		}
	}

	const getNewsletterMetadata = async (
		channelJid: string,
	): Promise<unknown | null> => {
		try {
			return await sock.newsletterMetadata("jid", channelJid)
		} catch {
			return null
		}
	}

	const getPollVotes = async (): Promise<unknown | null> => {
		const pollUpdate = m?.pollUpdateMessage
		if (!pollUpdate) return null
		return pollUpdate
	}

	return {
		agentId,
		sock,
		rawMsg,
		jid,
		senderJid,
		pushName,
		isGroup,
		body,
		prefix,
		commandName,
		args,
		messageType,
		reply,
		getOwnerRole,
		getGroupMetadata,
		getSenderAdminStatus,
		getQuotedMessage,
		getMediaBuffer,
		getGroupInviteCode,
		getProfilePicUrl,
		getMentions,
		getBusinessProfile,
		getNewsletterMetadata,
		getPollVotes,
	}
}
