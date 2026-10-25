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
 * Updates the shared group metadata cache used by CommandContext.
 */
export function setCachedGroupMetadata(
	jid: string,
	meta: GroupMetadata,
	sock?: WASocket,
): void {
	if (!jid || !meta) return
	groupMetadataCache.set(jid, meta)
	if (sock) {
		syncGroupLidMappings(sock, meta)
	}
}

/**
 * Invalidates cached group metadata for a specific group JID.
 */
export function invalidateCachedGroupMetadata(jid: string): void {
	if (!jid) return
	groupMetadataCache.del(jid)
}

/**
 * Extracts and persists any LID <-> PN pairs present in GroupMetadata into Baileys' LIDMappingStore.
 */
export function syncGroupLidMappings(
	sock: WASocket | undefined,
	meta: GroupMetadata | null | undefined,
): void {
	const lidMapping = sock?.signalRepository?.lidMapping
	if (!lidMapping || !meta) return

	const pairs: { lid: string; pn: string }[] = []
	const seen = new Set<string>()
	const addPair = (a?: string | null, b?: string | null) => {
		if (!a || !b) return
		const normA = commandRepository.normalizeJid(a)
		const normB = commandRepository.normalizeJid(b)
		if (normA.endsWith("@lid") && normB.endsWith("@s.whatsapp.net")) {
			const key = `${normA}|${normB}`
			if (!seen.has(key)) {
				seen.add(key)
				pairs.push({ lid: normA, pn: normB })
			}
		} else if (normB.endsWith("@lid") && normA.endsWith("@s.whatsapp.net")) {
			const key = `${normB}|${normA}`
			if (!seen.has(key)) {
				seen.add(key)
				pairs.push({ lid: normB, pn: normA })
			}
		}
	}

	addPair(meta.owner, meta.ownerPn)
	addPair(meta.subjectOwner, meta.subjectOwnerPn)
	addPair(meta.descOwner, meta.descOwnerPn)

	if (meta.participants?.length) {
		for (const p of meta.participants) {
			const pExt = p as GroupParticipant & { jid?: string }
			addPair(p.id, p.phoneNumber)
			addPair(p.id, p.lid)
			addPair(p.lid, p.phoneNumber)
			addPair(pExt.jid, p.id)
			addPair(pExt.jid, p.lid)
			addPair(pExt.jid, p.phoneNumber)
		}
	}

	if (pairs.length > 0) {
		Promise.resolve(lidMapping.storeLIDPNMappings(pairs)).catch(() => {})
	}
}

/**
 * Checks whether a GroupParticipant entry has admin or superadmin privileges.
 */
export function isParticipantAdmin(p?: GroupParticipant | null): boolean {
	if (!p) return false
	return (
		Boolean(p.isAdmin) ||
		Boolean(p.isSuperAdmin) ||
		p.admin === "admin" ||
		p.admin === "superadmin"
	)
}

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
 * Finds all matching participants in a group's participant list against a set of candidate user JIDs/LIDs.
 */
export function findGroupParticipants(
	participants: GroupParticipant[] | undefined,
	targetIdentities: (string | undefined | null)[],
): GroupParticipant[] {
	if (!participants || participants.length === 0) return []
	const cleanTargets = commandRepository.normalizeJidList(targetIdentities)
	if (cleanTargets.length === 0) return []

	const targetSet = new Set(cleanTargets)
	const targetDigits = new Set(
		cleanTargets
			.map((id) => id.split("@")[0]?.replace(/[^0-9]/g, "") || "")
			.filter((d) => d.length > 5),
	)

	return participants.filter((p) => {
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
 * Finds a matching participant in a group's participant list against a set of candidate user JIDs/LIDs.
 * Prefers a participant entry with admin privileges if multiple entries match.
 */
export function findGroupParticipant(
	participants: GroupParticipant[] | undefined,
	targetIdentities: (string | undefined | null)[],
): GroupParticipant | undefined {
	const matches = findGroupParticipants(participants, targetIdentities)
	if (matches.length === 0) return undefined
	return matches.find((p) => isParticipantAdmin(p)) || matches[0]
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
	const credsMe = sock.authState?.creds?.me
	const directSender = key.fromMe
		? sock.user?.id ||
			credsMe?.id ||
			sock.user?.lid ||
			credsMe?.lid ||
			key.participant ||
			rawMsg.participant ||
			jid
		: key.participant || rawMsg.participant || jid
	const altSender = key.fromMe
		? key.participantAlt || sock.user?.id || credsMe?.id
		: isGroup
			? key.participantAlt
			: key.remoteJidAlt
	const senderJid = commandRepository.normalizeJid(altSender || directSender)

	const senderIdentities = commandRepository.normalizeJidList([
		key.participant,
		key.participantAlt,
		rawMsg.participant,
		isGroup ? undefined : jid,
		isGroup ? undefined : key.remoteJidAlt,
		...(key.fromMe
			? [sock.user?.id, sock.user?.lid, credsMe?.id, credsMe?.lid]
			: []),
	])

	if (senderJid && !senderIdentities.includes(senderJid)) {
		senderIdentities.push(senderJid)
	}

	// Persist LID <-> PN mapping if both forms are present on the message envelope
	const lidMapping = sock?.signalRepository?.lidMapping
	if (lidMapping && senderIdentities.length >= 2) {
		const lids = senderIdentities.filter((id) => id.endsWith("@lid"))
		const pns = senderIdentities.filter((id) => id.endsWith("@s.whatsapp.net"))
		if (lids.length > 0 && pns.length > 0) {
			const pairs: { lid: string; pn: string }[] = []
			for (const lid of lids) {
				for (const pn of pns) {
					pairs.push({ lid, pn })
				}
			}
			Promise.resolve(lidMapping.storeLIDPNMappings(pairs)).catch(() => {})
		}
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
	includeUSyncPnLookup = true,
): Promise<string[]> {
	const identities = new Set<string>(
		commandRepository.normalizeJidList(initialJids),
	)
	if (identities.size === 0) return []

	const enrichFromGroupMeta = (meta?: GroupMetadata | null) => {
		if (!meta) return
		if (meta.participants?.length) {
			const matchedParticipants = findGroupParticipants(
				meta.participants,
				Array.from(identities),
			)
			for (const matched of matchedParticipants) {
				for (const pId of getParticipantIdentities(matched)) {
					identities.add(pId)
				}
			}
		}
		const metaPairs: [string | undefined, string | undefined][] = [
			[meta.owner, meta.ownerPn],
			[meta.subjectOwner, meta.subjectOwnerPn],
			[meta.descOwner, meta.descOwnerPn],
		]
		for (const [a, b] of metaPairs) {
			const normIds = commandRepository.normalizeJidList([a, b])
			if (normIds.length === 2 && normIds.some((id) => identities.has(id))) {
				for (const id of normIds) identities.add(id)
			}
		}
	}

	// 1. Sync and enrich from GroupMetadata if available
	if (groupMeta) {
		syncGroupLidMappings(sock, groupMeta)
		enrichFromGroupMeta(groupMeta)
	}

	// 2. Enrich from Baileys Signal Store LID <-> PN mapping
	const lidMapping = sock?.signalRepository?.lidMapping
	const authKeys = sock?.authState?.keys
	for (const id of Array.from(identities)) {
		if (id.endsWith("@lid")) {
			if (lidMapping) {
				try {
					const pn = await lidMapping.getPNForLID(id)
					if (pn) {
						const cleanPn = commandRepository.normalizeJid(pn)
						if (cleanPn) identities.add(cleanPn)
					}
				} catch {}
			}
			if (authKeys) {
				try {
					const lidUser = id.split("@")[0]
					if (lidUser) {
						const revKey = `${lidUser}_reverse`
						const stored = await authKeys.get("lid-mapping", [revKey])
						const pnUser = stored?.[revKey]
						if (typeof pnUser === "string" && pnUser) {
							const cleanPn = commandRepository.normalizeJid(
								`${pnUser}@s.whatsapp.net`,
							)
							if (cleanPn) identities.add(cleanPn)
						}
					}
				} catch {}
			}
		} else if (id.endsWith("@s.whatsapp.net")) {
			let resolvedLid: string | null | undefined
			if (authKeys) {
				try {
					const pnUser = id.split("@")[0]
					if (pnUser) {
						const stored = await authKeys.get("lid-mapping", [pnUser])
						const lidUser = stored?.[pnUser]
						if (typeof lidUser === "string" && lidUser) {
							resolvedLid = `${lidUser}@lid`
						}
					}
				} catch {}
			}
			if (!resolvedLid && lidMapping && includeUSyncPnLookup) {
				try {
					resolvedLid = await lidMapping.getLIDForPN(id)
				} catch {}
			}
			if (resolvedLid) {
				const cleanLid = commandRepository.normalizeJid(resolvedLid)
				if (cleanLid) identities.add(cleanLid)
			}
		}
	}

	// 3. Re-match GroupMetadata participants in case lidMapping revealed a new PN/LID
	if (groupMeta) {
		enrichFromGroupMeta(groupMeta)
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
			syncGroupLidMappings(sock, cached)
			groupMetaCache = cached
			return cached
		}

		try {
			const meta = await sock.groupMetadata(jid)
			if (meta) {
				setCachedGroupMetadata(jid, meta, sock)
			}
			groupMetaCache = meta || null
			return groupMetaCache
		} catch {
			groupMetaCache = null
			return null
		}
	}

	const getOwnerRole = async (): Promise<"master" | "owner" | null> => {
		if (ownerRoleCache !== undefined) return ownerRoleCache
		let matchedRole: "master" | "owner" | null = null

		// Enrich senderIdentities from local auth.keys and any cached group metadata first
		const initialResolved = await resolveUserIdentities(
			sock,
			senderIdentities,
			isGroup
				? (groupMetaCache ?? groupMetadataCache.get<GroupMetadata>(jid))
				: null,
			false,
		)
		for (const id of initialResolved) {
			if (!senderIdentities.includes(id)) {
				senderIdentities.push(id)
			}
		}

		// 1. Direct check with all known sender identities
		matchedRole = await commandRepository.getOwnerRole(
			agentId,
			senderIdentities,
		)

		// 1b. If in a group and not yet matched, enrich from group metadata participants
		if (!matchedRole && isGroup && groupMetaCache === undefined) {
			const meta = await getGroupMetadata()
			if (meta) {
				const groupResolved = await resolveUserIdentities(
					sock,
					senderIdentities,
					meta,
					false,
				)
				for (const id of groupResolved) {
					if (!senderIdentities.includes(id)) {
						senderIdentities.push(id)
					}
				}
				matchedRole = await commandRepository.getOwnerRole(
					agentId,
					senderIdentities,
				)
			}
		}

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

		const usedCachedMeta =
			groupMetadataCache.has(jid) || groupMetaCache !== undefined
		let meta = await getGroupMetadata()
		if (!meta) {
			adminStatusCache = { isAdmin: false, isBotAdmin: false }
			return adminStatusCache
		}

		const credsMe = sock.authState?.creds?.me
		const botCandidateJids = [
			sock.user?.id,
			sock.user?.lid,
			credsMe?.id,
			credsMe?.lid,
		]

		const evaluateAdminRoles = async (currentMeta: GroupMetadata) => {
			syncGroupLidMappings(sock, currentMeta)

			let resolvedSenderIds = await resolveUserIdentities(
				sock,
				senderIdentities,
				currentMeta,
				true,
			)
			for (const id of resolvedSenderIds) {
				if (!senderIdentities.includes(id)) {
					senderIdentities.push(id)
				}
			}

			let resolvedBotIds = await resolveUserIdentities(
				sock,
				botCandidateJids,
				currentMeta,
				true,
			)

			const participants = currentMeta.participants || []
			let senderMatches = findGroupParticipants(participants, resolvedSenderIds)
			let botMatches = findGroupParticipants(participants, resolvedBotIds)

			let isAdmin = senderMatches.some((p) => isParticipantAdmin(p))
			let isBotAdmin = botMatches.some((p) => isParticipantAdmin(p))

			// If sender or bot could NOT be matched in participants at all (e.g. unlinked LID), resolve LID <-> PN
			const senderFound = senderMatches.length > 0
			const botFound = botMatches.length > 0
			if ((!senderFound || !botFound) && sock.signalRepository?.lidMapping) {
				const lidMapping = sock.signalRepository.lidMapping
				const adminParticipants = participants.filter((p) =>
					isParticipantAdmin(p),
				)
				const pnsToResolve: string[] = []
				const pnToParticipantMap = new Map<string, GroupParticipant[]>()

				for (const p of adminParticipants) {
					const pIds = getParticipantIdentities(p)
					const hasLid = pIds.some((id) => id.endsWith("@lid"))
					const hasPn = pIds.some((id) => id.endsWith("@s.whatsapp.net"))

					if (hasPn && !hasLid) {
						const pnJid = pIds.find((id) => id.endsWith("@s.whatsapp.net"))
						if (pnJid) {
							pnsToResolve.push(pnJid)
							const list = pnToParticipantMap.get(pnJid) || []
							list.push(p)
							pnToParticipantMap.set(pnJid, list)
						}
					} else if (hasLid && !hasPn) {
						const lidJid = pIds.find((id) => id.endsWith("@lid"))
						if (lidJid) {
							try {
								const resolvedPn = await lidMapping.getPNForLID(lidJid)
								if (resolvedPn) {
									p.phoneNumber = commandRepository.normalizeJid(resolvedPn)
								}
							} catch {}
						}
					}
				}

				if (pnsToResolve.length > 0) {
					try {
						if (typeof lidMapping.getLIDsForPNs === "function") {
							const lidPairs = await lidMapping.getLIDsForPNs(pnsToResolve)
							if (Array.isArray(lidPairs)) {
								for (const pair of lidPairs) {
									if (!pair?.pn || !pair?.lid) continue
									const cleanPn = commandRepository.normalizeJid(pair.pn)
									const cleanLid = commandRepository.normalizeJid(pair.lid)
									const targetParticipants =
										pnToParticipantMap.get(cleanPn) ||
										pnToParticipantMap.get(pair.pn) ||
										[]
									for (const p of targetParticipants) {
										p.lid = cleanLid
									}
								}
							}
						} else {
							for (const pnJid of pnsToResolve) {
								try {
									const resolvedLid = await lidMapping.getLIDForPN(pnJid)
									if (resolvedLid) {
										const cleanLid = commandRepository.normalizeJid(resolvedLid)
										for (const p of pnToParticipantMap.get(pnJid) || []) {
											p.lid = cleanLid
										}
									}
								} catch {}
							}
						}
					} catch {}
				}

				resolvedSenderIds = await resolveUserIdentities(
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
				resolvedBotIds = await resolveUserIdentities(
					sock,
					botCandidateJids,
					currentMeta,
					false,
				)

				senderMatches = findGroupParticipants(participants, resolvedSenderIds)
				botMatches = findGroupParticipants(participants, resolvedBotIds)

				isAdmin = senderMatches.some((p) => isParticipantAdmin(p))
				isBotAdmin = botMatches.some((p) => isParticipantAdmin(p))
			}

			// Fallback check against group creator/owner metadata if participant list didn't flag superadmin
			if (!isAdmin || !isBotAdmin) {
				const groupOwnerIds = commandRepository.normalizeJidList([
					currentMeta.owner,
					currentMeta.ownerPn,
				])
				if (groupOwnerIds.length > 0) {
					if (
						!isAdmin &&
						senderMatches.length > 0 &&
						resolvedSenderIds.some((id) => groupOwnerIds.includes(id))
					) {
						isAdmin = true
					}
					if (
						!isBotAdmin &&
						botMatches.length > 0 &&
						resolvedBotIds.some((id) => groupOwnerIds.includes(id))
					) {
						isBotAdmin = true
					}
				}
			}

			return { isAdmin, isBotAdmin }
		}

		const status = await evaluateAdminRoles(meta)

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

		const credsMe = sock.authState?.creds?.me
		const botIds = await resolveUserIdentities(
			sock,
			[sock.user?.id, sock.user?.lid, credsMe?.id, credsMe?.lid],
			isGroup
				? (groupMetaCache ?? groupMetadataCache.get<GroupMetadata>(jid))
				: null,
			false,
		)
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
