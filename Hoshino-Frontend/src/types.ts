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
