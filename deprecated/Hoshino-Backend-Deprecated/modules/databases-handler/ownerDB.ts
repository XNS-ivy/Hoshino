import fs from 'fs/promises'
import path from 'path'
import { convertLID } from '@modules/baileys/baileys-functions'

export type OwnerRole = 'master' | 'owner'

export interface OwnerEntry {
    agentId: string
    lid: string
    level: OwnerRole
}

class OwnerDatabase {
    private dbPath = path.resolve('./databases/owner.json')

    private async readDB(): Promise<OwnerEntry[]> {
        try {
            const raw = await fs.readFile(this.dbPath, 'utf-8')
            return JSON.parse(raw) as OwnerEntry[]
        } catch {
            return []
        }
    }

    private async writeDB(data: OwnerEntry[]): Promise<void> {
        await fs.mkdir(path.dirname(this.dbPath), { recursive: true })
        await fs.writeFile(this.dbPath, JSON.stringify(data, null, 2), 'utf-8')
    }

    async getRole(lid: string, agentId: string): Promise<OwnerRole | null> {
        const clean = convertLID(lid)
        if (!clean) return null
        const db = await this.readDB()
        const found = db.find(o => o.lid === clean && o.agentId === agentId)
        return found?.level ?? null
    }

    async isOwner(lid: string, agentId: string): Promise<boolean> {
        const role = await this.getRole(lid, agentId)
        return role !== null
    }

    async addOwner(lid: string, level: OwnerRole, agentId: string): Promise<void> {
        const clean = convertLID(lid)
        if (!clean) throw new Error('Invalid LID')
        const db = await this.readDB()
        const exists = db.some(o => o.lid === clean && o.agentId === agentId)
        if (exists) throw new Error(`Owner ${clean} already registered`)
        db.push({ agentId, lid: clean, level })
        await this.writeDB(db)
    }

    async removeOwner(lid: string, agentId: string): Promise<void> {
        const clean = convertLID(lid)
        if (!clean) throw new Error('Invalid LID')
        const db = await this.readDB()
        const entry = db.find(o => o.lid === clean && o.agentId === agentId)
        if (!entry) throw new Error(`Owner ${clean} not found`)
        if (entry.level === 'master') throw new Error('Cannot delete master owner')
        await this.writeDB(db.filter(o => !(o.lid === clean && o.agentId === agentId)))
    }

    async changeLevel(lid: string, level: OwnerRole, agentId: string): Promise<void> {
        const clean = convertLID(lid)
        if (!clean) throw new Error('Invalid LID')
        const db = await this.readDB()
        const entry = db.find(o => o.lid === clean && o.agentId === agentId)
        if (!entry) throw new Error(`${clean} is not registered as owner`)
        if (entry.level === level) throw new Error(`${clean} is already at level ${level}`)
        entry.level = level
        await this.writeDB(db)
    }

    async getAll(agentId: string): Promise<OwnerEntry[]> {
        const db = await this.readDB()
        return db.filter(o => o.agentId === agentId)
    }

    async initMaster(lid: string, agentId: string): Promise<void> {
        const clean = convertLID(lid)
        if (!clean) throw new Error('Invalid LID')
        const db = await this.readDB()
        const alreadyExists = db.some(o => o.lid === clean && o.level === 'master' && o.agentId === agentId)
        if (!alreadyExists) {
            const filtered = db.filter(o => !(o.level === 'master' && o.agentId === agentId))
            filtered.unshift({ agentId, lid: clean, level: 'master' })
            await this.writeDB(filtered)
        }
    }
}

export const ownerDb = new OwnerDatabase()
