import { sql } from "@utils/db"

export type MessageType =
	| "text"
	| "image"
	| "video"
	| "audio"
	| "sticker"
	| "document"
	| "location"
	| "contact"
	| "reaction"
	| "other"

export interface MessageRecord {
	id: string
	agentId: string
	jid: string
	fromMe: boolean
	sender?: string | null
	pushName?: string | null
	messageType: MessageType
	content: Record<string, unknown>
	status: "sending" | "sent" | "delivered" | "read" | "received" | "failed"
	timestamp: Date
}

export interface ChatRecord {
	agentId: string
	jid: string
	name?: string | null
	unreadCount: number
	lastMessageAt: Date
	createdAt: Date
	updatedAt: Date
}

export class MessageRepository {
	private static instance: MessageRepository

	private constructor() {}

	public static getInstance(): MessageRepository {
		if (!MessageRepository.instance) {
			MessageRepository.instance = new MessageRepository()
		}
		return MessageRepository.instance
	}

	/**
	 * Saves message record and upserts corresponding chat in PostgreSQL.
	 */
	public async saveMessage(
		msg: MessageRecord,
		groupSubject?: string,
	): Promise<void> {
		try {
			// 1. Insert message
			await sql`
				INSERT INTO public.messages (
					id, agent_id, jid, from_me, sender, push_name, message_type, content, status, timestamp
				) VALUES (
					${msg.id}, ${msg.agentId}, ${msg.jid}, ${msg.fromMe}, ${msg.sender ?? null}, ${msg.pushName ?? null},
					${msg.messageType}, ${JSON.stringify(msg.content)}, ${msg.status}, ${msg.timestamp}
				)
				ON CONFLICT (agent_id, id)
				DO UPDATE SET
					status = EXCLUDED.status,
					content = EXCLUDED.content;
			`

			// 2. Upsert chat record
			const chatName = groupSubject || msg.pushName || msg.jid
			await sql`
				INSERT INTO public.chats (agent_id, jid, name, unread_count, last_message_at, updated_at)
				VALUES (${msg.agentId}, ${msg.jid}, ${chatName}, ${msg.fromMe ? 0 : 1}, ${msg.timestamp}, CURRENT_TIMESTAMP)
				ON CONFLICT (agent_id, jid)
				DO UPDATE SET
					name = COALESCE(EXCLUDED.name, public.chats.name),
					unread_count = CASE WHEN ${msg.fromMe} THEN public.chats.unread_count ELSE public.chats.unread_count + 1 END,
					last_message_at = EXCLUDED.last_message_at,
					updated_at = CURRENT_TIMESTAMP;
			`
		} catch (error) {
			logger.error(
				"/repositories/message.repository.ts",
				`Failed to save message ${msg.id} for agent ${msg.agentId}: ${error}`,
			)
		}
	}

	/**
	 * Looks up the latest pushName/nickname for a specific user JID.
	 */
	public async getPushName(
		agentId: string,
		senderJid: string,
	): Promise<string | null> {
		try {
			const phone = senderJid.split("@")[0]
			const normalized = senderJid.includes("@")
				? senderJid
				: `${senderJid}@s.whatsapp.net`
			const rows = await sql`
				SELECT push_name as "pushName"
				FROM public.messages
				WHERE agent_id = ${agentId} 
				  AND (sender = ${normalized} OR sender LIKE ${`%${phone}%`})
				  AND push_name IS NOT NULL
				  AND push_name != ''
				ORDER BY timestamp DESC
				LIMIT 1
			`
			return (rows[0]?.pushName as string) || null
		} catch {
			return null
		}
	}

	/**
	 * Fetches all active chats for a given agent.
	 */
	public async getChatsByAgent(agentId: string): Promise<ChatRecord[]> {
		const rows = await sql`
			SELECT agent_id as "agentId", jid, name, unread_count as "unreadCount", last_message_at as "lastMessageAt", created_at as "createdAt", updated_at as "updatedAt"
			FROM public.chats
			WHERE agent_id = ${agentId}
			ORDER BY last_message_at DESC
		`
		return rows as unknown as ChatRecord[]
	}

	/**
	 * Fetches paginated messages for a specific chat.
	 */
	public async getMessagesByChat(
		agentId: string,
		jid: string,
		limit = 50,
		offset = 0,
	): Promise<MessageRecord[]> {
		const rows = await sql`
			SELECT id, agent_id as "agentId", jid, from_me as "fromMe", sender, push_name as "pushName", message_type as "messageType", content, status, timestamp
			FROM public.messages
			WHERE agent_id = ${agentId} AND jid = ${jid}
			ORDER BY timestamp DESC
			LIMIT ${limit} OFFSET ${offset}
		`
		const records = (
			rows as unknown as (Omit<MessageRecord, "content"> & {
				content: unknown
			})[]
		).map((row) => {
			let contentObj: Record<string, unknown> = {}
			if (typeof row.content === "string") {
				try {
					contentObj = JSON.parse(row.content)
				} catch {
					contentObj = { text: row.content }
				}
			} else if (row.content && typeof row.content === "object") {
				contentObj = row.content as Record<string, unknown>
			}
			return {
				...row,
				content: contentObj,
			}
		})
		return records.reverse()
	}

	/**
	 * Reset unread count for a chat.
	 */
	public async markChatAsRead(agentId: string, jid: string): Promise<void> {
		await sql`
			UPDATE public.chats
			SET unread_count = 0, updated_at = CURRENT_TIMESTAMP
			WHERE agent_id = ${agentId} AND jid = ${jid}
		`
	}

	/**
	 * Fetches all unique user contacts (@s.whatsapp.net) for an agent.
	 */
	public async findContactsByAgent(
		agentId: string,
	): Promise<{ jid: string; pushName: string | null; phoneNumber: string }[]> {
		const rows = await sql`
			SELECT DISTINCT ON (c.jid)
				c.jid,
				c.name as "pushName"
			FROM public.chats c
			WHERE c.agent_id = ${agentId} AND c.jid NOT LIKE '%@g.us' AND c.jid != 'status@broadcast'
			ORDER BY c.jid ASC, c.updated_at DESC
		`

		return (rows as unknown as { jid: string; pushName: string | null }[]).map(
			(row) => {
				const digits = (row.jid.split("@")[0] || "").replace(/[^0-9]/g, "")
				return {
					jid: row.jid,
					pushName: row.pushName || null,
					phoneNumber: digits ? `+${digits}` : row.jid,
				}
			},
		)
	}

	/**
	 * Fetches single message by ID.
	 */
	public async getMessageById(
		agentId: string,
		messageId: string,
	): Promise<MessageRecord | null> {
		const rows = await sql`
			SELECT id, agent_id as "agentId", jid, from_me as "fromMe", sender, push_name as "pushName", message_type as "messageType", content, status, timestamp
			FROM public.messages
			WHERE agent_id = ${agentId} AND id = ${messageId}
			LIMIT 1
		`
		if (rows.length === 0) return null
		const row = rows[0] as unknown as Omit<MessageRecord, "content"> & {
			content: unknown
		}
		let contentObj: Record<string, unknown> = {}
		if (typeof row.content === "string") {
			try {
				contentObj = JSON.parse(row.content)
			} catch {
				contentObj = { text: row.content }
			}
		} else if (row.content && typeof row.content === "object") {
			contentObj = row.content as Record<string, unknown>
		}
		return { ...row, content: contentObj }
	}
}

export const messageRepository = MessageRepository.getInstance()
