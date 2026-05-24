import fs from 'fs'
import path from 'path'

export type AgentStatus = 'active' | 'loggedOut'

export interface CommandStatus {
    name: string
    status: 'enabled' | 'disabled'
}

export interface AgentConfig {
    prefix: string
    commandsEnabled: boolean
}

export interface Agent {
    userId: string
    phoneNumber: string | null
    status: AgentStatus
    prefix: string
    commands: CommandStatus[]
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
        prefix: '.',
        commands: [],
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

export function cleanOrphanAuth() {
    const authDir = path.resolve('./auth')

    if (!fs.existsSync(authDir)) return

    const registeredIds = new Set(read().map(a => a.userId))

    const folders = fs.readdirSync(authDir, { withFileTypes: true })
        .filter(f => f.isDirectory())
        .map(f => f.name)

    for (const folder of folders) {
        if (!registeredIds.has(folder)) {
            try {
                fs.rmSync(path.join(authDir, folder), { recursive: true, force: true })
                logger.system('/modules/baileys/agent.ts', `[${folder}] Orphan auth folder removed`)
            } catch (err) {
                logger.error('/modules/baileys/agent.ts', `[${folder}] Failed to remove orphan auth: ${err}`)
            }
        }
    }
}

export function updateAgentPhone(userId: string, phoneNumber: string) {
    const agents = read()
    const idx = agents.findIndex(a => a.userId === userId)
    if (idx === -1) return
    const agent = agents[idx]
    if (!agent) return
    agent.phoneNumber = phoneNumber
    write(agents)
}

export function getAgentConfig(userId: string): AgentConfig | null {
    const agent = getAgent(userId)
    return agent ? { prefix: agent.prefix, commandsEnabled: true } : null
}

export function updateAgentConfig(userId: string, config: Partial<{ prefix: string; commandsEnabled: boolean }>): void {
    const agents = read()
    const idx = agents.findIndex(a => a.userId === userId)
    if (idx === -1) return
    const agent = agents[idx]
    if (!agent) return
    if (config.prefix) agent.prefix = config.prefix
    write(agents)
}

export function updateAgentCommands(userId: string, commands: CommandStatus[]): void {
    const agents = read()
    const idx = agents.findIndex(a => a.userId === userId)
    if (idx === -1) return
    const agent = agents[idx]
    if (!agent) return
    agent.commands = commands
    write(agents)
}

export function getAgentCommands(userId: string): CommandStatus[] {
    const agent = getAgent(userId)
    return agent?.commands ?? []
}

export function updateCommandStatus(userId: string, commandName: string, status: 'enabled' | 'disabled'): void {
    const agents = read()
    const idx = agents.findIndex(a => a.userId === userId)
    if (idx === -1) return
    const agent = agents[idx]
    if (!agent) return

    const cmdIdx = agent.commands.findIndex(c => c.name === commandName)
    if (cmdIdx !== -1) {
        const cmd = agent.commands[cmdIdx]
        if (!cmd) return
        cmd.status = status
    } else {
        agent.commands.push({ name: commandName, status })
    }
    write(agents)
}

export class ConfigManager {
    constructor(private userId: string) { }

    getPrefix(): string | null {
        const agent = getAgent(this.userId)
        return agent?.prefix ?? null
    }

    setPrefix(prefix: string): void {
        updateAgentConfig(this.userId, { prefix })
    }

    getCommands(): CommandStatus[] {
        return getAgentCommands(this.userId)
    }

    setCommandStatus(commandName: string, status: 'enabled' | 'disabled'): void {
        updateCommandStatus(this.userId, commandName, status)
    }
}