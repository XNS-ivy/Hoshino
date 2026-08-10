import type { WASocket } from "baileys"

export interface AgentSession {
	agentId: string
	agentName: string
	phoneNumber?: string
	socket?: WASocket
	status: "connected" | "connecting" | "disconnected"
	qrCode?: string
	updatedAt: Date
}
