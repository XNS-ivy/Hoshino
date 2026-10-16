import type NodeCache from "@cacheable/node-cache"
import {
	type MessageRecord,
	messageRepository,
} from "@repositories/message.repository"
import { commandLoader } from "@services/commandLoader"
import { wsManager } from "@services/wsManager"
import type { MessageUpsertType, proto, WAMessage, WASocket } from "baileys"
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
 * Handles 'messages.upsert' event, processing each incoming message with clean guard clauses.
 */
export async function handleMessagesUpsert(
	upsert: { messages: WAMessage[]; type: MessageUpsertType },
	ctx: MessageHandlerContext,
): Promise<void> {
	const { messages } = upsert
	if (!messages?.length) return

	const { sock, safeAgentId, groupCache, messageStore } = ctx

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

		// 2. Resolve group subject if in group chat
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
