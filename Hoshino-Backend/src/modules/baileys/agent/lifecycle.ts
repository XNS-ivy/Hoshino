import baileysManager from "../socket"
import { agentStore } from "./store"
import type { Agent } from "./types"

export class AgentLifecycle {
	async bootAll(): Promise<void> {
		agentStore.cleanOrphanAuth()
		const agents = agentStore.getAll()

		for (const agent of agents) {
			await this.bootSingle(agent)
		}

		logger.info(
			`Boot complete, ${baileysManager.getRunningAgents().length} agent running`,
		)
	}

	async bootSingle(agent: Agent): Promise<void> {
		const { userId, phoneNumber, status } = agent

		if (status === "loggedOut") {
			if (agentStore.isAuthExists(userId)) {
				logger.info(`[${userId}] Auth residue found, cleaning...`)
				agentStore.cleanAuth(userId)
			}
			return
		}

		await baileysManager.startAgent(userId, phoneNumber)
	}

	async register(
		userId: string,
		phoneNumber: string | null,
		isFromTerminal = false,
	): Promise<void> {
		agentStore.add(userId, phoneNumber, isFromTerminal)
		await baileysManager.startAgent(userId, phoneNumber)
	}

	async reRegister(
		userId: string,
		phoneNumber: string | null,
		isFromTerminal = false,
	): Promise<void> {
		baileysManager.removeRunningSocket(userId)
		await new Promise((resolve) => setTimeout(resolve, 500))
		agentStore.cleanAuth(userId)
		agentStore.updateStatus(userId, "active")
		agentStore.updatePhone(userId, phoneNumber)
		agentStore.updateIsFromTerminal(userId, isFromTerminal)
		await baileysManager.startAgent(userId, phoneNumber)
	}

	async logout(userId: string): Promise<void> {
		await baileysManager.logoutAgent(userId)
		agentStore.cleanAuth(userId)
		agentStore.updateStatus(userId, "loggedOut")
	}

	async delete(userId: string): Promise<void> {
		await baileysManager.logoutAgent(userId)
		agentStore.remove(userId)
		agentStore.cleanAuth(userId)
	}
}

export const agentLifecycle = new AgentLifecycle()

// Backward-compatible function exports
export const bootAllAgents = () => agentLifecycle.bootAll()
export const bootSingleAgent = (agent: Agent) =>
	agentLifecycle.bootSingle(agent)
export const registerAgent = (
	userId: string,
	phoneNumber: string | null,
	isFromTerminal = false,
) => agentLifecycle.register(userId, phoneNumber, isFromTerminal)
export const reRegisterAgent = (
	userId: string,
	phoneNumber: string | null,
	isFromTerminal = false,
) => agentLifecycle.reRegister(userId, phoneNumber, isFromTerminal)
export const logoutAgent = (userId: string) => agentLifecycle.logout(userId)
export const deleteAgent = (userId: string) => agentLifecycle.delete(userId)
