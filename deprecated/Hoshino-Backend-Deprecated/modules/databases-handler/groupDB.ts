import fs from 'fs/promises'
import path from 'path'

export interface GroupEntry {
    agentId: string
    jid: string
    allowedAt: string
}

class GroupDatabase {
    private dbPath = path.resolve('./databases/groups.json')

    private async readDB(): Promise<GroupEntry[]> {
        try {
            const raw = await fs.readFile(this.dbPath, 'utf-8')
            return JSON.parse(raw) as GroupEntry[]
        } catch {
            return []
        }
    }

    private async writeDB(data: GroupEntry[]): Promise<void> {
        await fs.mkdir(path.dirname(this.dbPath), { recursive: true })
        await fs.writeFile(this.dbPath, JSON.stringify(data, null, 2), 'utf-8')
    }

    async isAllowed(groupJid: string, agentId: string): Promise<boolean> {
        const db = await this.readDB()
        return db.some(g => g.jid === groupJid && g.agentId === agentId)
    }

    async allow(groupJid: string, agentId: string): Promise<void> {
        const db = await this.readDB()
        if (db.some(g => g.jid === groupJid && g.agentId === agentId)) {
            throw new Error(`Group ${groupJid} is already allowed`)
        }
        db.push({ agentId, jid: groupJid, allowedAt: new Date().toISOString() })
        await this.writeDB(db)
    }

    async disallow(groupJid: string, agentId: string): Promise<void> {
        const db = await this.readDB()
        const entry = db.find(g => g.jid === groupJid && g.agentId === agentId)
        if (!entry) throw new Error(`Group ${groupJid} not found`)
        await this.writeDB(db.filter(g => !(g.jid === groupJid && g.agentId === agentId)))
    }

    async getAll(agentId: string): Promise<GroupEntry[]> {
        const db = await this.readDB()
        return db.filter(g => g.agentId === agentId)
    }
}

export const groupDb = new GroupDatabase()
