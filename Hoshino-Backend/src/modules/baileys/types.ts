import type { WASocket } from "baileys"

export type AgentStatus =
	| "connecting"
	| "connected"
	| "disconnected"
	| "qr_code"
	| "pairing_code"

export interface AgentSession {
	agentId: string
	agentName: string
	phoneNumber?: string
	socket?: WASocket
	status: AgentStatus
	qrCode?: string
	pairingCode?: string
	updatedAt: Date
}

export interface CreateAgentDTO {
	name: string
	phoneNumber?: string
}
