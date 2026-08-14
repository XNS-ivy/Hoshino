export type AgentStatus =
	| "connecting"
	| "connected"
	| "disconnected"
	| "qr_code"
	| "pairing_code"

export interface Agent {
	agentId: string
	name: string
	phoneNumber?: string
	status: AgentStatus
	pairingCode?: string
	qrCode?: string
	createdAt?: string
	updatedAt?: string
}

export interface ApiResponse<T> {
	success: boolean
	data?: T
	message?: string
}

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

export interface ChatMessage {
	id: string
	agentId: string
	jid: string
	fromMe: boolean
	sender?: string | null
	pushName?: string | null
	messageType: MessageType
	content: Record<string, unknown>
	status: "sending" | "sent" | "delivered" | "read" | "received" | "failed"
	timestamp: string
}

export interface ChatSummary {
	agentId: string
	jid: string
	name?: string | null
	unreadCount: number
	lastMessageAt: string
	createdAt?: string
	updatedAt?: string
}

export interface WSEvent {
	type: "message_new" | "status_change" | "qr_code" | "pairing_code"
	agentId: string
	payload: unknown
}
