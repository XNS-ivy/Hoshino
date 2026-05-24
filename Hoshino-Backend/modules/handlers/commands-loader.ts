import { type IMessageFetch } from '@modules/baileys/mesage-parse'
import { type WASocket } from 'baileys'
import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath, pathToFileURL } from "url"
import { ownerDb } from '@modules/databases-handler/ownerDB'
import { updateAgentCommands, getAgent } from '@modules/baileys/agent'

// push command map name ke agent dengan setting default enable

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class CommandHandling {
    private commandPath = path.resolve(__dirname, "../../commands")
    private commands = new Map<string, ICommand>()
    constructor() { }
    async init() {
        await this.loadCommands(this.commandPath)
        logger.system('/modules/handlers/commands-loader.ts', `Loaded ${this.commands.size} commands`)
    }
    async execute(msg: IMessageFetch, socket: WASocket, agentId: string): Promise<void> {
        const { commandContent } = msg
        if (!commandContent) return

        const { cmd, args } = commandContent

        const command = this.commands.get(cmd)
        if (!command) return

        const agent = getAgent(agentId)
        const commandConfig = agent?.commands.find(c => c.name === cmd)
        if (commandConfig?.status === 'disabled') {
            logger.warn('/modules/handlers/commands-loader.ts', `[${agentId}] Command "${cmd}" is disabled`)
            return
        }
        const ownerRole = await ownerDb.getRole(msg.lid ?? '', agentId)
        const ownerResult: 'master' | 'owner' | false = ownerRole ?? false

        let groupRole: 'admin' | 'member' | 'private' = 'private'
        if (msg.isOnGroup) {
            try {
                const participants = (await socket.groupMetadata(msg.remoteJid)).participants
                const user = participants.find(p => p.id === msg.lid)
                groupRole = user?.admin ? 'admin' : 'member'
            } catch (err: any) {
                logger.warn('/modules/handlers/commands-loader.ts', `Failed to get group metadata: ${err?.message}`)
                groupRole = 'member'
            }
        }

        const whoAMI: ICTX['whoAMI'] = { groupRole, ownerRole: ownerResult }
        const primaryName = Array.isArray(command.name) ? command.name[0] : command.name

        void command.execute(args, { msg, socket, whoAMI })
        logger.info('/modules/handlers/commands-loader.ts', `[${agentId}] ${primaryName} executed (via: ${cmd})`)
    }
    async initOwner(socket: WASocket, agentId: string): Promise<void> {
        await this.pushCommandsToAgent(agentId)
        await ownerDb.initMaster(socket.user?.lid ?? '', agentId)
    }
    private async loadCommands(dir: string) {
        const files = await fs.readdir(dir, { withFileTypes: true })

        for (const file of files) {
            const fullPath = path.join(dir, file.name)

            if (file.isDirectory()) {
                await this.loadCommands(fullPath)
                continue
            }

            if (!file.name.match(/\.(ts|js)$/)) continue

            const module = await import(pathToFileURL(fullPath).href)
            const command = module.default as ICommand
            if (!command?.name || typeof command.execute !== 'function') continue

            const relative = path.relative(this.commandPath, dir)
            command.category = (relative ? relative.split(path.sep)[0] : 'general') ?? 'general'

            const names = Array.isArray(command.name) ? command.name : [command.name]
            for (const name of names) {
                this.commands.set(name, command)
            }
        }
    }

    private async pushCommandsToAgent(agentId: string) {
        const agent = getAgent(agentId)
        if (!agent) return

        const existing = agent.commands ?? []
        const loadedNames = [...new Set(
            [...this.commands.values()].map(c => {
                const n = Array.isArray(c.name) ? c.name[0] : c.name
                return n as string
            }).filter(Boolean)
        )]

        const merged = loadedNames.map(name => {
            const found = existing.find(c => c.name === name)
            return { name, status: found?.status ?? 'enabled' as const }
        })
        updateAgentCommands(agentId, merged)
    }

    async getCommandMapOnly(whoAMI: ICTX['whoAMI'], isGroup: boolean) {
        const seen = new Set<string>()
        const result: ICommand[] = []

        for (const [, command] of this.commands) {
            const primaryName = Array.isArray(command.name) ? command.name[0]! : command.name as string
            if (seen.has(primaryName)) continue
            seen.add(primaryName)

            if (command.inGroup && !isGroup) continue
            if (isGroup && command.inGroupAccess) {
                if (command.inGroupAccess === 'admin' && whoAMI.groupRole !== 'admin' && !whoAMI.ownerRole) continue
            }
            if (command.access === 'owner' || command.access === 'master') {
                if (!whoAMI.ownerRole) continue
            }

            result.push(command)
        }

        return result
    }
}

/* export interface ICommand {
    name: string
    execute: (
        args: string[] | null | undefined,
        ctx: ICTX,
    ) => Promise<void> | void
}
 
export interface ICTX {
    msg: IMessageFetch,
    socket: WASocket,
    whoAMI: {
        role: 'private' | 'admin' | 'member'
    },
} */

const command = new CommandHandling
export default command