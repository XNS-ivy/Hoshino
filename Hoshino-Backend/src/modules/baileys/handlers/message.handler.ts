import type NodeCache from "@cacheable/node-cache"
import {
	type MessageRecord,
	messageRepository,
} from "@repositories/message.repository"
import { commandLoader } from "@services/commandLoader"
import { wsManager } from "@services/wsManager"
import {
	downloadMediaMessage,
	type MessageUpsertType,
	type proto,
	type WAMessage,
	type WASocket,
} from "baileys"
import type { Logger } from "pino"
import { resolveGroupSubject } from "../utils/groupHelper"
import {
	extractQuotedContext,
	parseIncomingMessage,
} from "../utils/messageParser"

export interface MessageHandlerContext {
	sock: WASocket
	safeAgentId: string
	groupCache: NodeCache<unknown>
	messageStore: Map<string, proto.IMessage | WAMessage>
	baileysLogger: Logger
}

/**
 * Auto-downloads media preview for stickers and images to store base64 in DB for instant offline rendering.
 */
async function autoDownloadMediaPreview(
	msg: WAMessage,
	sock: WASocket,
	baileysLogger: Logger,
): Promise<string | undefined> {
	const isStickerOrImage =
		msg.message?.stickerMessage || msg.message?.imageMessage
	if (!isStickerOrImage) return undefined

	try {
		const buffer = await downloadMediaMessage(
			msg,
			"buffer",
			{},
			{
				logger: baileysLogger,
				reuploadRequest: sock.updateMediaMessage,
			},
		)

		if (!buffer) return undefined

		const mime =
			msg.message?.stickerMessage?.mimetype ||
			msg.message?.imageMessage?.mimetype ||
			"image/webp"

		return `data:${mime};base64,${buffer.toString("base64")}`
	} catch {
		return undefined
	}
}

/**
 * Handles 'messages.upsert' event, processing each incoming message with clean guard clauses.
 */
export async function handleMessagesUpsert(
	upsert: { messages: WAMessage[]; type: MessageUpsertType },
	ctx: MessageHandlerContext,
): Promise<void> {
	const { messages } = upsert
	if (!messages?.length) return

	const { sock, safeAgentId, groupCache, messageStore, baileysLogger } = ctx

	for (const msg of messages) {
		// Guard: message key and message payload must exist
		if (!msg.key.id || !msg.message) continue

		const jid = msg.key.remoteJid
		if (!jid) continue

		// Cache raw message payload for quote extraction / media download fallback
		messageStore.set(`${jid}:${msg.key.id}`, msg.message)

		// 1. Parse content and quoted message context
		const { messageType, contentData } = parseIncomingMessage(msg.message)
		const quoted = extractQuotedContext(msg.message)
		if (quoted) {
			contentData.quoted = quoted
		}

		// 2. Auto-download media preview for stickers & images
		const mediaPreview = await autoDownloadMediaPreview(
			msg,
			sock,
			baileysLogger,
		)
		if (mediaPreview) {
			contentData.mediaData = mediaPreview
		}

		// 3. Resolve group subject if in group chat
		const groupSubject = await resolveGroupSubject(jid, sock, groupCache)

		// 4. Determine sender JID and display name
		const senderJid = msg.key.participant || jid
		const senderPhone = senderJid.split("@")[0]
			? `+${senderJid.split("@")[0]}`
			: senderJid

		const record: MessageRecord = {
			id: msg.key.id,
			agentId: safeAgentId,
			jid,
			fromMe: !!msg.key.fromMe,
			sender: senderJid,
			pushName: msg.pushName || senderPhone,
			messageType,
			content: contentData,
			status: msg.key.fromMe ? "sent" : "received",
			timestamp: new Date(
				(msg.messageTimestamp as number) * 1000 || Date.now(),
			),
		}

		// 5. Persist to database & broadcast via WebSocket
		await messageRepository.saveMessage(record, groupSubject)
		wsManager.broadcast({
			type: "message_new",
			agentId: safeAgentId,
			payload: record,
		})

		// 6. Execute command processing pipeline asynchronously
		void commandLoader.executeMessage(safeAgentId, sock, msg)
	}
}
