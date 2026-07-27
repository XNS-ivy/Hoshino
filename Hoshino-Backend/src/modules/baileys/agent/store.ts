import fs from "node:fs"
import path from "node:path"
import { convertLID } from "../baileys-functions"
import type { Agent, AgentStatus } from "./types"

const FILE = path.resolve("./store/agents.json")

function ensureStoreDir(): void {
	const dir = path.dirname(FILE)
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true })
	}
	if (!fs.existsSync(FILE)) {
		fs.writeFileSync(FILE, JSON.stringify([]))
	}
}

export function readAgents(): Agent[] {
	ensureStoreDir()
	try {
		const raw = fs.readFileSync(FILE, "utf-8")
		const agents = JSON.parse(raw) as Partial<Agent>[]
		return agents.map((agent) => ({
			userId: agent.userId ?? "",
			phoneNumber: agent.phoneNumber ?? null,
			status: agent.status ?? "active",
			prefix: agent.prefix ?? ".",
			createdAt: agent.createdAt ?? new Date().toISOString(),
			autodelete: normalizeLids(agent.autodelete),
			commandBlacklist: normalizeLids(agent.commandBlacklist),
			commands: agent.commands ?? [],
		}))
	} catch {
		return []
	}
}

export function writeAgents(agents: Agent[]): void {
	ensureStoreDir()
	const tmp = `${FILE}.tmp`
	fs.writeFileSync(tmp, JSON.stringify(agents, null, 2))
	fs.renameSync(tmp, FILE)
}

export function normalizeLids(lids: string[] | undefined): string[] {
	if (!lids) return []
	const converted = lids
		.map((lid) => convertLID(lid))
		.filter((lid): lid is string => Boolean(lid))
	return [...new Set(converted)]
}

export class AgentStore {
	getAll(): Agent[] {
		return readAgents()
	}

	get(userId: string): Agent | null {
		return readAgents().find((a) => a.userId === userId) ?? null
	}

	add(userId: string, phoneNumber: string | null): Agent {
		const agents = readAgents()
		if (agents.some((a) => a.userId === userId)) {
			throw new Error(`Agent ${userId} already exists`)
		}

		const agent: Agent = {
			userId,
			phoneNumber,
			status: "active",
			prefix: ".",
			autodelete: [],
			commandBlacklist: [],
			commands: [],
			createdAt: new Date().toISOString(),
		}

		writeAgents([...agents, agent])
		return agent
	}

	remove(userId: string): void {
		writeAgents(readAgents().filter((a) => a.userId !== userId))
	}

	updateStatus(userId: string, status: AgentStatus): void {
		const agents = readAgents()
		const agent = agents.find((a) => a.userId === userId)
		if (!agent) return
		agent.status = status
		writeAgents(agents)
	}

	updatePhone(userId: string, phoneNumber: string): void {
		const agents = readAgents()
		const agent = agents.find((a) => a.userId === userId)
		if (!agent) return
		agent.phoneNumber = phoneNumber
		writeAgents(agents)
	}

	isAuthExists(userId: string): boolean {
		const credsPath = path.resolve(`./auth/${userId}/creds.json`)
		return fs.existsSync(credsPath)
	}

	cleanAuth(userId: string): void {
		const authDir = path.resolve(`./auth/${userId}`)
		if (!fs.existsSync(authDir)) return

		try {
			fs.rmSync(authDir, { recursive: true, force: true })
			logger.system(`[${userId}] Auth folder cleaned`)
		} catch (err) {
			logger.error(`[${userId}] Failed to clean auth folder: ${err}`)
		}
	}

	cleanOrphanAuth(): void {
		const authDir = path.resolve("./auth")
		if (!fs.existsSync(authDir)) return

		const registeredIds = new Set(readAgents().map((a) => a.userId))
		const folders = fs
			.readdirSync(authDir, { withFileTypes: true })
			.filter((f) => f.isDirectory())
			.map((f) => f.name)

		for (const folder of folders) {
			if (registeredIds.has(folder)) continue
			try {
				fs.rmSync(path.join(authDir, folder), { recursive: true, force: true })
				logger.system(`[${folder}] Orphan auth folder removed`)
			} catch (err) {
				logger.error(`[${folder}] Failed to remove orphan auth: ${err}`)
			}
		}
	}
}

export const agentStore = new AgentStore()

// Backward-compatible function exports
export const getAllAgents = () => agentStore.getAll()
export const getAgent = (userId: string) => agentStore.get(userId)
export const addAgent = (userId: string, phoneNumber: string | null) =>
	agentStore.add(userId, phoneNumber)
export const removeAgent = (userId: string) => agentStore.remove(userId)
export const updateAgentStatus = (userId: string, status: AgentStatus) =>
	agentStore.updateStatus(userId, status)
export const updateAgentPhone = (userId: string, phoneNumber: string) =>
	agentStore.updatePhone(userId, phoneNumber)
export const isAuthExists = (userId: string) => agentStore.isAuthExists(userId)
export const cleanAgentAuth = (userId: string) => agentStore.cleanAuth(userId)
export const cleanOrphanAuth = () => agentStore.cleanOrphanAuth()
