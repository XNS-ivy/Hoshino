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
	type: "message_new" | "status_change" | "qr_update"
	agentId: string
	payload: unknown
}

export interface SenseiProfileItem {
	agentId: string
	userJid: string
	pushName?: string
	pyroxenes: number
	sparkPoints: number
	totalPulls: number
	totalStudents?: number
	totalBonds?: number
	highestBondLevel?: number
	lastDaily?: string | null
	createdAt?: string
	updatedAt?: string
}

export interface SenseiStudentItem {
	agentId: string
	userJid: string
	studentId: number
	studentName: string
	starGrade: number
	count: number
	firstObtainedAt: string
}

export interface SenseiBondItem {
	agentId: string
	userJid: string
	studentId: number
	studentName: string
	bondLevel: number
	bondExp: number
	totalTalks: number
	lastTalk: string
}

export interface AgentGeneralSettings {
	prefix: string
	welcomeMessage?: string | null
	goodbyeMessage?: string | null
	autoRead: boolean
	typingIndicator: boolean
}
