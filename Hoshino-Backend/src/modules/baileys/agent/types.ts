export type AgentStatus = "active" | "loggedOut"

export interface CommandStatus {
	name: string
	status: "enabled" | "disabled"
}

export interface AgentConfig {
	prefix: string
	autodelete: string[]
	commandBlacklist: string[]
}

export interface Agent {
	userId: string
	phoneNumber: string | null
	status: AgentStatus
	prefix: string
	autodelete: string[]
	commandBlacklist: string[]
	commands: CommandStatus[]
	createdAt: string
	isFromTerminal: boolean
}
