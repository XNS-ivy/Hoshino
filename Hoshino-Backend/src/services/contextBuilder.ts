import type { CommandContext, ParsedQuotedMessage } from "@customTypes/command"
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
	const senderJid = commandRepository.normalizeJid(key.participant || jid)
	const pushName = rawMsg.pushName || undefined

	// Extract raw message body text
	const m = rawMsg.message
	let body = ""
	if (m) {
		body =
			m.conversation ||
			m.extendedTextMessage?.text ||
			m.imageMessage?.caption ||
			m.videoMessage?.caption ||
			""
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
		const isOwner = await commandRepository.isOwner(agentId, senderJid)
		ownerRoleCache = isOwner ? "owner" : null
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
		const participant = meta.participants.find(
			(p) => commandRepository.normalizeJid(p.id) === senderIdentity,
		)
		const isAdmin =
			participant?.admin === "admin" || participant?.admin === "superadmin"

		const botJid = commandRepository.normalizeJid(
			sock.user?.id || sock.user?.lid || "",
		)
		const botParticipant = meta.participants.find(
			(p) => commandRepository.normalizeJid(p.id) === botJid,
		)
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
			senderJid: commandRepository.normalizeJid(
				contextInfo?.participant || jid,
			),
			text,
			caption: text,
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
			)) as Buffer
			mediaBufferCache = buffer
			return buffer
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
