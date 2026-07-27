import { normalizeLids, readAgents, writeAgents } from "./store"
import type { AgentConfig, CommandStatus } from "./types"

export class ConfigManager {
	constructor(private userId: string) {}

	getPrefix(): string | null {
		return ConfigManager.getAgent(this.userId)?.prefix ?? null
	}

	setPrefix(prefix: string): void {
		ConfigManager.updateConfig(this.userId, { prefix })
	}

	getAutodelete(): string[] {
		return ConfigManager.getAgent(this.userId)?.autodelete ?? []
	}

	setAutodelete(lids: string[]): void {
		ConfigManager.updateConfig(this.userId, { autodelete: lids })
	}

	getCommandBlacklist(): string[] {
		return ConfigManager.getAgent(this.userId)?.commandBlacklist ?? []
	}

	setCommandBlacklist(lids: string[]): void {
		ConfigManager.updateConfig(this.userId, { commandBlacklist: lids })
	}

	getCommands(): CommandStatus[] {
		return ConfigManager.getCommands(this.userId)
	}

	setCommandStatus(commandName: string, status: "enabled" | "disabled"): void {
		ConfigManager.updateCommandStatus(this.userId, commandName, status)
	}

	private static getAgent(userId: string) {
		return readAgents().find((a) => a.userId === userId) ?? null
	}

	static getConfig(userId: string): AgentConfig | null {
		const agent = ConfigManager.getAgent(userId)
		if (!agent) return null
		return {
			prefix: agent.prefix,
			autodelete: agent.autodelete,
			commandBlacklist: agent.commandBlacklist,
		}
	}

	static updateConfig(userId: string, config: Partial<AgentConfig>): void {
		const agents = readAgents()
		const agent = agents.find((a) => a.userId === userId)
		if (!agent) return

		if (config.prefix !== undefined) agent.prefix = config.prefix
		if (config.autodelete !== undefined) {
			agent.autodelete = normalizeLids(config.autodelete)
		}
		if (config.commandBlacklist !== undefined) {
			agent.commandBlacklist = normalizeLids(config.commandBlacklist)
		}
		writeAgents(agents)
	}

	static getCommands(userId: string): CommandStatus[] {
		return ConfigManager.getAgent(userId)?.commands ?? []
	}

	static updateCommands(userId: string, commands: CommandStatus[]): void {
		const agents = readAgents()
		const agent = agents.find((a) => a.userId === userId)
		if (!agent) return
		agent.commands = commands
		writeAgents(agents)
	}

	static updateCommandStatus(
		userId: string,
		commandName: string,
		status: "enabled" | "disabled",
	): void {
		const agents = readAgents()
		const agent = agents.find((a) => a.userId === userId)
		if (!agent) return

		const cmd = agent.commands.find((c) => c.name === commandName)
		if (cmd) {
			cmd.status = status
		} else {
			agent.commands.push({ name: commandName, status })
		}
		writeAgents(agents)
	}
}

// Backward-compatible function exports
export const getAgentConfig = ConfigManager.getConfig
export const updateAgentConfig = ConfigManager.updateConfig
export const getAgentCommands = ConfigManager.getCommands
export const updateAgentCommands = ConfigManager.updateCommands
export const updateCommandStatus = ConfigManager.updateCommandStatus
