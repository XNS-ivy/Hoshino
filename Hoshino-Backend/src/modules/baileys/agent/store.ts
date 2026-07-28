import fs from "node:fs"
import path from "node:path"
import { convertLID } from "../baileys-functions"
import type { Agent, AgentConfig, AgentStatus, CommandStatus } from "./types"

const FILE = path.resolve("./store/agents.json")

function ensureFileExists(): void {
	const dir = path.dirname(FILE)
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true })
	}
	if (!fs.existsSync(FILE)) {
		fs.writeFileSync(FILE, JSON.stringify([], null, 2), "utf-8")
	}
}

export function normalizeLids(lids: string[] | undefined): string[] {
	if (!lids) return []
	const converted = lids
		.map((lid) => convertLID(lid))
		.filter((lid): lid is string => Boolean(lid))
	return [...new Set(converted)]
}

export class AgentStore {
	constructor() {
		ensureFileExists()
	}

	private read(): Agent[] {
		ensureFileExists()
		try {
			const content = fs.readFileSync(FILE, "utf-8")
			const agents = JSON.parse(content) as Partial<Agent>[]
			return agents.map((agent) => ({
				userId: agent.userId ?? "",
				phoneNumber: agent.phoneNumber ?? null,
				status: (agent.status as AgentStatus) ?? "active",
				prefix: agent.prefix ?? ".",
				autodelete: normalizeLids(agent.autodelete),
				commandBlacklist: normalizeLids(agent.commandBlacklist),
				commands: agent.commands ?? [],
				createdAt: agent.createdAt ?? new Date().toISOString(),
				isFromTerminal: Boolean(agent.isFromTerminal),
			}))
		} catch {
			return []
		}
	}

	private write(agents: Agent[]): void {
		ensureFileExists()
		const tmp = `${FILE}.tmp`
		fs.writeFileSync(tmp, JSON.stringify(agents, null, 2), "utf-8")
		fs.renameSync(tmp, FILE)
	}

	getAll(): Agent[] {
		return this.read()
	}

	get(userId: string): Agent | null {
		return this.read().find((a) => a.userId === userId) ?? null
	}

	add(
		userId: string,
		phoneNumber: string | null,
		isFromTerminal = false,
	): Agent {
		const agents = this.read()
		if (agents.some((a) => a.userId === userId)) {
			throw new Error(`Agent ${userId} already exists`)
		}

		const agent: Agent = {
			userId,
			phoneNumber: phoneNumber ?? null,
			status: "active",
			prefix: ".",
			autodelete: [],
			commandBlacklist: [],
			commands: [],
			createdAt: new Date().toISOString(),
			isFromTerminal,
		}

		this.write([...agents, agent])
		return agent
	}

	remove(userId: string): void {
		const agents = this.read().filter((a) => a.userId !== userId)
		this.write(agents)
	}

	updateStatus(userId: string, status: AgentStatus): void {
		const agents = this.read()
		const idx = agents.findIndex((a) => a.userId === userId)
		if (idx === -1) return
		const agent = agents[idx]
		if (!agent) return
		agent.status = status
		this.write(agents)
	}

	updatePhone(userId: string, phoneNumber: string | null): void {
		const agents = this.read()
		const idx = agents.findIndex((a) => a.userId === userId)
		if (idx === -1) return
		const agent = agents[idx]
		if (!agent) return
		agent.phoneNumber = phoneNumber
		this.write(agents)
	}

	updateIsFromTerminal(userId: string, isFromTerminal: boolean): void {
		const agents = this.read()
		const idx = agents.findIndex((a) => a.userId === userId)
		if (idx === -1) return
		const agent = agents[idx]
		if (!agent) return
		agent.isFromTerminal = isFromTerminal
		this.write(agents)
	}

	updateConfig(userId: string, config: Partial<AgentConfig>): void {
		const agents = this.read()
		const idx = agents.findIndex((a) => a.userId === userId)
		if (idx === -1) return
		const agent = agents[idx]
		if (!agent) return
		if (config.prefix !== undefined) agent.prefix = config.prefix
		if (config.autodelete !== undefined) {
			agent.autodelete = normalizeLids(config.autodelete)
		}
		if (config.commandBlacklist !== undefined) {
			agent.commandBlacklist = normalizeLids(config.commandBlacklist)
		}
		this.write(agents)
	}

	updateCommands(userId: string, commands: CommandStatus[]): void {
		const agents = this.read()
		const idx = agents.findIndex((a) => a.userId === userId)
		if (idx === -1) return
		const agent = agents[idx]
		if (!agent) return
		agent.commands = commands
		this.write(agents)
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
			if (fs.existsSync(authDir)) {
				fs.rmSync(authDir, { recursive: true, force: true })
			}
			logger.system(`[${userId}] Auth folder cleaned`)
		} catch (err) {
			logger.error(`[${userId}] Failed to clean auth folder: ${err}`)
		}
	}

	cleanOrphanAuth(): void {
		const authDir = path.resolve("./auth")
		if (!fs.existsSync(authDir)) return

		const registeredIds = new Set(this.getAll().map((a) => a.userId))
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
export const addAgent = (
	userId: string,
	phoneNumber: string | null,
	isFromTerminal = false,
) => agentStore.add(userId, phoneNumber, isFromTerminal)
export const removeAgent = (userId: string) => agentStore.remove(userId)
export const updateAgentStatus = (userId: string, status: AgentStatus) =>
	agentStore.updateStatus(userId, status)
export const updateAgentPhone = (userId: string, phoneNumber: string | null) =>
	agentStore.updatePhone(userId, phoneNumber)
export const updateAgentIsFromTerminal = (
	userId: string,
	isFromTerminal: boolean,
) => agentStore.updateIsFromTerminal(userId, isFromTerminal)
export const isAuthExists = (userId: string) => agentStore.isAuthExists(userId)
export const cleanAgentAuth = (userId: string) => agentStore.cleanAuth(userId)
export const cleanOrphanAuth = () => agentStore.cleanOrphanAuth()
