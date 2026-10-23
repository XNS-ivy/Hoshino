import type {
	CommandContext,
	MessageKind,
	ParsedQuotedMessage,
} from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"
import type {
	AnyMessageContent,
	GroupMetadata,
	WAMessage,
	WASocket,
} from "baileys"
import { downloadMediaMessage } from "baileys"
import NodeCache from "node-cache"

// Cache group metadata in-memory for 5 minutes to prevent network spam
const groupMetadataCache = new NodeCache({ stdTTL: 300, checkperiod: 60 })

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
	const directSender = key.fromMe
		? sock.user?.id || sock.user?.lid || jid
		: key.participant || jid
	const altSender = key.fromMe
		? undefined
		: isGroup
			? key.participantAlt
			: key.remoteJidAlt
	const senderJid = commandRepository.normalizeJid(altSender || directSender)

	// All known identities of the sender (WhatsApp may address the same user
	// by LID `xxx@lid` or by phone `62xxx@s.whatsapp.net`). Used for owner checks.
	const senderIdentities = Array.from(
		new Set(
			(key.fromMe
				? [sock.user?.id, sock.user?.lid]
				: [
						key.participant,
						key.participantAlt,
						isGroup ? undefined : jid,
						isGroup ? undefined : key.remoteJidAlt,
					]
			)
				.filter((j): j is string => !!j)
				.map((j) => commandRepository.normalizeJid(j)),
		),
	)
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
		for (const id of senderIdentities) {
			const role = await commandRepository.getOwnerRole(agentId, id)
			if (role) {
				matchedRole = role
				break
			}
		}

		// 2. If not matched, try resolving LID <-> Phone Number via Baileys Signal Store
		if (!matchedRole && sock.signalRepository?.lidMapping) {
			const lidMapping = sock.signalRepository.lidMapping

			// 2a. Reverse check: if any sender identity is a LID, resolve to Phone Number (PN)
			for (const id of senderIdentities) {
				if (id.endsWith("@lid")) {
					try {
						const pn = await lidMapping.getPNForLID(id)
						if (pn) {
							const cleanPn = commandRepository.normalizeJid(pn)
							if (!senderIdentities.includes(cleanPn)) {
								senderIdentities.push(cleanPn)
							}
							const role = await commandRepository.getOwnerRole(agentId, cleanPn)
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

		const meta = await getGroupMetadata()
		if (!meta) {
			adminStatusCache = { isAdmin: false, isBotAdmin: false }
			return adminStatusCache
		}

		const senderIdentity = commandRepository.normalizeJid(senderJid)
		const senderDigits =
			(senderIdentity || "").split("@")[0]?.replace(/[^0-9]/g, "") || ""

		const participants = meta?.participants || []

		const participant = participants.find((p) => {
			if (!p?.id) return false
			const pNorm = commandRepository.normalizeJid(p.id)
			if (pNorm === senderIdentity) return true
			if (senderDigits && senderDigits.length > 5) {
				const pDigits =
					(pNorm || "").split("@")[0]?.replace(/[^0-9]/g, "") || ""
				if (pDigits === senderDigits) return true
			}
			return false
		})

		const isAdmin =
			participant?.admin === "admin" || participant?.admin === "superadmin"

		const rawBotId = sock.user?.id || sock.user?.lid || ""
		const botJid = commandRepository.normalizeJid(rawBotId)
		const botDigits = (botJid || "").split("@")[0]?.replace(/[^0-9]/g, "") || ""

		const botParticipant = participants.find((p) => {
			if (!p?.id) return false
			const pNorm = commandRepository.normalizeJid(p.id)
			if (pNorm === botJid) return true
			if (botDigits && botDigits.length > 5) {
				const pDigits =
					(pNorm || "").split("@")[0]?.replace(/[^0-9]/g, "") || ""
				if (pDigits === botDigits) return true
			}
			return false
		})

		const isBotAdmin =
			botParticipant?.admin === "admin" ||
			botParticipant?.admin === "superadmin"

		adminStatusCache = { isAdmin, isBotAdmin }
		return adminStatusCache
	}

	const getQuotedMessage = async (): Promise<ParsedQuotedMessage | null> => {
		if (quotedCache !== undefined) return quotedCache
		const contextInfo =
			m?.extendedTextMessage?.contextInfo ||
			m?.imageMessage?.contextInfo ||
			m?.videoMessage?.contextInfo ||
			m?.documentMessage?.contextInfo

		const quotedMsg = contextInfo?.quotedMessage
		if (!quotedMsg) {
			quotedCache = null
			return null
		}

		const quotedKey = {
			remoteJid: jid,
			fromMe: contextInfo?.participant === sock.user?.id,
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
