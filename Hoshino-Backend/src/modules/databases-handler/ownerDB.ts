import fs from "node:fs"
import path from "node:path"
import { convertLID } from "@modules/baileys/baileys-functions"

export type OwnerRole = "master" | "owner"

export interface OwnerEntry {
	agentId: string
	lid: string
	level: OwnerRole
}

const FILE = path.resolve("./databases/owner.json")

function ensureFileExists(): void {
	const dir = path.dirname(FILE)
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true })
	}
	if (!fs.existsSync(FILE)) {
		fs.writeFileSync(FILE, JSON.stringify([], null, 2), "utf-8")
	}
}

export class OwnerDatabase {
	constructor() {
		ensureFileExists()
	}

	private read(): OwnerEntry[] {
		ensureFileExists()
		try {
			const content = fs.readFileSync(FILE, "utf-8")
			return JSON.parse(content) as OwnerEntry[]
		} catch {
			return []
		}
	}

	private write(owners: OwnerEntry[]): void {
		ensureFileExists()
		const tmp = `${FILE}.tmp`
		fs.writeFileSync(tmp, JSON.stringify(owners, null, 2), "utf-8")
		fs.renameSync(tmp, FILE)
	}

	async getRole(lid: string, agentId: string): Promise<OwnerRole | null> {
		const clean = convertLID(lid)
		if (!clean) return null
		const owners = this.read()
		const entry = owners.find((o) => o.agentId === agentId && o.lid === clean)
		return entry?.level ?? null
	}

	async isOwner(lid: string, agentId: string): Promise<boolean> {
		const role = await this.getRole(lid, agentId)
		return role !== null
	}

	async addOwner(
		lid: string,
		level: OwnerRole,
		agentId: string,
	): Promise<void> {
		const clean = convertLID(lid)
		if (!clean) throw new Error("Invalid LID")

		const existing = await this.getRole(clean, agentId)
		if (existing) throw new Error(`Owner ${clean} already registered`)

		const owners = this.read()
		owners.push({ agentId, lid: clean, level })
		this.write(owners)
	}

	async removeOwner(lid: string, agentId: string): Promise<void> {
		const clean = convertLID(lid)
		if (!clean) throw new Error("Invalid LID")

		const role = await this.getRole(clean, agentId)
		if (!role) throw new Error(`Owner ${clean} not found`)
		if (role === "master") throw new Error("Cannot delete master owner")

		const owners = this.read().filter(
			(o) => !(o.agentId === agentId && o.lid === clean),
		)
		this.write(owners)
	}

	async changeLevel(
		lid: string,
		level: OwnerRole,
		agentId: string,
	): Promise<void> {
		const clean = convertLID(lid)
		if (!clean) throw new Error("Invalid LID")

		const owners = this.read()
		const idx = owners.findIndex(
			(o) => o.agentId === agentId && o.lid === clean,
		)
		if (idx === -1) throw new Error(`${clean} is not registered as owner`)

		const owner = owners[idx]
		if (!owner) throw new Error(`${clean} is not registered as owner`)
		if (owner.level === level)
			throw new Error(`${clean} is already at level ${level}`)

		owner.level = level
		this.write(owners)
	}

	async getAll(agentId: string): Promise<OwnerEntry[]> {
		return this.read().filter((o) => o.agentId === agentId)
	}

	async initMaster(lid: string, agentId: string): Promise<void> {
		const clean = convertLID(lid)
		if (!clean) throw new Error("Invalid LID")

		const owners = this.read().filter(
			(o) => !(o.agentId === agentId && o.level === "master"),
		)
		owners.push({ agentId, lid: clean, level: "master" })
		this.write(owners)
	}
}

export const ownerDb = new OwnerDatabase()
