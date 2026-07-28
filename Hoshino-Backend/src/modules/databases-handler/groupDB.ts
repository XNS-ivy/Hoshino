import fs from "node:fs"
import path from "node:path"

export interface GroupEntry {
	agentId: string
	jid: string
	allowedAt: string
}

const FILE = path.resolve("./databases/groups.json")

function ensureFileExists(): void {
	const dir = path.dirname(FILE)
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true })
	}
	if (!fs.existsSync(FILE)) {
		fs.writeFileSync(FILE, JSON.stringify([], null, 2), "utf-8")
	}
}

export class GroupDatabase {
	constructor() {
		ensureFileExists()
	}

	private read(): GroupEntry[] {
		ensureFileExists()
		try {
			const content = fs.readFileSync(FILE, "utf-8")
			return JSON.parse(content) as GroupEntry[]
		} catch {
			return []
		}
	}

	private write(groups: GroupEntry[]): void {
		ensureFileExists()
		const tmp = `${FILE}.tmp`
		fs.writeFileSync(tmp, JSON.stringify(groups, null, 2), "utf-8")
		fs.renameSync(tmp, FILE)
	}

	async isAllowed(groupJid: string, agentId: string): Promise<boolean> {
		const groups = this.read()
		return groups.some((g) => g.agentId === agentId && g.jid === groupJid)
	}

	async allow(groupJid: string, agentId: string): Promise<void> {
		const allowed = await this.isAllowed(groupJid, agentId)
		if (allowed) throw new Error(`Group ${groupJid} is already allowed`)

		const groups = this.read()
		groups.push({
			agentId,
			jid: groupJid,
			allowedAt: new Date().toISOString(),
		})
		this.write(groups)
	}

	async disallow(groupJid: string, agentId: string): Promise<void> {
		const allowed = await this.isAllowed(groupJid, agentId)
		if (!allowed) throw new Error(`Group ${groupJid} not found`)

		const groups = this.read().filter(
			(g) => !(g.agentId === agentId && g.jid === groupJid),
		)
		this.write(groups)
	}

	async getAll(agentId: string): Promise<GroupEntry[]> {
		return this.read().filter((g) => g.agentId === agentId)
	}
}

export const groupDb = new GroupDatabase()
