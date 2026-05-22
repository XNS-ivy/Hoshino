import fs from 'fs'
import path from 'path'

export type AgentStatus = 'active' | 'loggedOut'

export interface Agent {
    userId: string
    phoneNumber: string | null
    status: AgentStatus
    createdAt: string
}

const FILE = path.resolve('./store/agents.json')

if (!fs.existsSync(path.dirname(FILE))) {
    fs.mkdirSync(path.dirname(FILE), { recursive: true })
}
if (!fs.existsSync(FILE)) {
    fs.writeFileSync(FILE, JSON.stringify([]))
}

function read(): Agent[] {
    return JSON.parse(fs.readFileSync(FILE, 'utf-8'))
}

function write(agents: Agent[]) {
    fs.writeFileSync(FILE + '.tmp', JSON.stringify(agents, null, 2))
    fs.renameSync(FILE + '.tmp', FILE)
}

export function getAllAgents(): Agent[] {
    return read()
}

export function getAgent(userId: string): Agent | null {
    return read().find(a => a.userId === userId) ?? null
}

export function addAgent(userId: string, phoneNumber: string | null): Agent {
    const agents = read()

    if (agents.find(a => a.userId === userId)) {
        throw new Error(`Agent ${userId} already exists`)
    }

    const agent: Agent = {
        userId,
        phoneNumber,
        status: 'active',
        createdAt: new Date().toISOString(),
    }

    write([...agents, agent])
    return agent
}

export function cleanAgentAuth(userId: string) {
    const authDir = path.resolve(`./auth/${userId}`)

    if (fs.existsSync(authDir)) {
        try {
            fs.rmSync(authDir, { recursive: true, force: true })
            logger.system('/modules/baileys/agent.ts', `[${userId}] Auth folder cleaned`)
        } catch (err) {
            logger.error(`/modules/baileys/agent.ts`, `[${userId}] Failed to clean auth folder: ${err}`)
        }
    }
}

export async function cleanAgentAuthWithRetry(userId: string, maxRetries = 3) {
    const authDir = path.resolve(`./auth/${userId}`)

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (!fs.existsSync(authDir)) {
            logger.system(`/modules/baileys/agent.ts`, `[${userId}] Auth folder cleaned (attempt ${attempt})`)
            return true
        }

        try {
            fs.rmSync(authDir, { recursive: true, force: true })
            logger.system(`/modules/baileys/agent.ts`, `[${userId}] Auth folder cleaned (attempt ${attempt})`)
            return true
        } catch (err) {
            if (attempt === maxRetries) {
                logger.error(`/modules/baileys/agent.ts`, `[${userId}] Failed to clean auth folder after ${maxRetries} attempts: ${err}`)
                return false
            }
            await new Promise(r => setTimeout(r, 100 * attempt))
        }
    }
    return false
}

export function updateAgentStatus(userId: string, status: AgentStatus) {
    const agents = read()
    const idx = agents.findIndex(a => a.userId === userId)
    if (idx === -1) return
    const agent = agents[idx]
    if (!agent) return
    agent.status = status
    write(agents)
}

export function removeAgent(userId: string) {
    write(read().filter(a => a.userId !== userId))
}

export function isAuthExists(userId: string): boolean {
    const authDir = path.resolve(`./auth/${userId}`)
    const credsPath = path.join(authDir, 'creds.json')
    return fs.existsSync(credsPath)
}