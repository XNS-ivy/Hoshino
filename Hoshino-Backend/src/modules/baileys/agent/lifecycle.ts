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
		const { userId, phoneNumber } = agent

		if (agent.status === "loggedOut") {
			if (agentStore.isAuthExists(userId)) {
				logger.info(`[${userId}] Auth residue found, cleaning...`)
				agentStore.cleanAuth(userId)
			}
			return
		}

		if (!agentStore.isAuthExists(userId)) {
			if (phoneNumber) {
				logger.info(`[${userId}] Auth lost, will request reconnect`)
				await baileysManager.startAgent(userId, phoneNumber)
			} else {
				logger.info(`[${userId}] Auth missing & no phone number, skip`)
				agentStore.updateStatus(userId, "loggedOut")
			}
			return
		}

		await baileysManager.startAgent(userId, phoneNumber)
	}

	async register(userId: string, phoneNumber: string | null): Promise<void> {
		agentStore.add(userId, phoneNumber)
		await baileysManager.startAgent(userId, phoneNumber)
	}

	async reRegister(userId: string, phoneNumber: string | null): Promise<void> {
		agentStore.cleanAuth(userId)
		agentStore.updateStatus(userId, "active")
		await baileysManager.startAgent(userId, phoneNumber)
	}

	async delete(userId: string): Promise<void> {
		const sock = baileysManager.getSocket(userId)
		if (sock) {
			await sock.logout()
			sock.end(undefined)
			baileysManager.removeRunningSocket(userId)
		}
		agentStore.remove(userId)
		agentStore.cleanAuth(userId)
	}
}

export const agentLifecycle = new AgentLifecycle()

// Backward-compatible function exports
export const bootAllAgents = () => agentLifecycle.bootAll()
export const bootSingleAgent = (agent: Agent) =>
	agentLifecycle.bootSingle(agent)
export const registerAgent = (userId: string, phoneNumber: string | null) =>
	agentLifecycle.register(userId, phoneNumber)
export const reRegisterAgent = (userId: string, phoneNumber: string | null) =>
	agentLifecycle.reRegister(userId, phoneNumber)
export const deleteAgent = (userId: string) => agentLifecycle.delete(userId)
