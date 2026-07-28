import { agentStore } from "./store"
import type { AgentConfig, CommandStatus } from "./types"

export class ConfigManager {
	constructor(private userId: string) {}

	getPrefix(): string | null {
		const agent = agentStore.get(this.userId)
		return agent?.prefix ?? null
	}

	setPrefix(prefix: string): void {
		agentStore.updateConfig(this.userId, { prefix })
	}

	getAutodelete(): string[] {
		return agentStore.get(this.userId)?.autodelete ?? []
	}

	setAutodelete(lids: string[]): void {
		agentStore.updateConfig(this.userId, { autodelete: lids })
	}

	getCommandBlacklist(): string[] {
		return agentStore.get(this.userId)?.commandBlacklist ?? []
	}

	setCommandBlacklist(lids: string[]): void {
		agentStore.updateConfig(this.userId, { commandBlacklist: lids })
	}

	getCommands(): CommandStatus[] {
		return ConfigManager.getCommands(this.userId)
	}

	setCommandStatus(commandName: string, status: "enabled" | "disabled"): void {
		ConfigManager.updateCommandStatus(this.userId, commandName, status)
	}

	static getConfig(userId: string): AgentConfig | null {
		const agent = agentStore.get(userId)
		if (!agent) return null
		return {
			prefix: agent.prefix,
			autodelete: agent.autodelete,
			commandBlacklist: agent.commandBlacklist,
		}
	}

	static updateConfig(userId: string, config: Partial<AgentConfig>): void {
		agentStore.updateConfig(userId, config)
	}

	static getCommands(userId: string): CommandStatus[] {
		const agent = agentStore.get(userId)
		return agent?.commands ?? []
	}

	static updateCommands(userId: string, commands: CommandStatus[]): void {
		agentStore.updateCommands(userId, commands)
	}

	static updateCommandStatus(
		userId: string,
		commandName: string,
		status: "enabled" | "disabled",
	): void {
		const commands = ConfigManager.getCommands(userId)
		const cmd = commands.find((c) => c.name === commandName)
		if (cmd) {
			cmd.status = status
		} else {
			commands.push({ name: commandName, status })
		}
		agentStore.updateCommands(userId, commands)
	}
}

// Backward-compatible function exports
export const getAgentConfig = ConfigManager.getConfig
export const updateAgentConfig = ConfigManager.updateConfig
export const getAgentCommands = ConfigManager.getCommands
export const updateAgentCommands = ConfigManager.updateCommands
export const updateCommandStatus = ConfigManager.updateCommandStatus
