// global.d.ts — tanpa import di atas
declare global {

    // ──────────────────────────────────────────────────────────────
    // Logger
    // ──────────────────────────────────────────────────────────────
    var logger: import('@utils/logger').Logger

    // ──────────────────────────────────────────────────────────────
    // Agent Types
    // ──────────────────────────────────────────────────────────────
    type AgentStatus = 'active' | 'loggedOut'
    type OwnerRole = 'master' | 'owner'
    type accessKey = 'owner' | 'regular' | 'premium' | 'master'

    interface CommandStatus {
        name: string
        status: 'enabled' | 'disabled'
    }

    interface Agent {
        userId: string
        phoneNumber: string | null
        status: AgentStatus
        prefix: string
        commands: CommandStatus[]
        createdAt: string
    }

    interface GroupEntry {
        agentId: string
        jid: string
        allowedAt: string
    }

    interface OwnerEntry {
        agentId: string
        lid: string
        level: OwnerRole
    }

    // ──────────────────────────────────────────────────────────────
    // Message & Command Types
    // ──────────────────────────────────────────────────────────────

    interface IQuotedMessage {
        type: keyof import('baileys').proto.IMessage
        text: string | null
        caption: string | null
        description: string | null
        expiration: number
        mentionedJid: Array<string | null>
        rawQuoted: import('baileys').proto.IMessage
    }

    interface IMessageFetch {
        remoteJid: string
        lid: string
        key: import('baileys').WAMessageKey
        pushName: string | null | undefined
        isOnGroup: string | false
        messageTimestamp: number
        type: keyof import('baileys').proto.IMessage
        messageObject?: string
        text: string | null | undefined
        caption: string | null | undefined
        description: string | null | undefined
        expiration: number
        mentionedJid: string[]
        quoted: IQuotedMessage | null
        raw: import('baileys').WAMessage
        rawQuoted?: import('baileys').proto.IMessage | null
        commandContent: null | {
            cmd: string
            args: string[]
        }
        convertedLid: string | null
        isOwner: boolean
        ownerRole: OwnerRole | null
        isAdmin: boolean
        isGroupAllowed: boolean
        agentId: string 
    }

    interface ICTX {
        msg: IMessageFetch
        socket: import('baileys').WASocket
        whoAMI: {
            groupRole: 'admin' | 'member' | 'private'
            ownerRole: OwnerRole | false
        }
    }

    interface ICommand {
        name: string | string[]
        access?: accessKey[] | accessKey
        inGroup?: boolean
        inGroupAccess?: 'admin' | 'member'
        args?: string[]
        usage: string | string[] | undefined | null | Function
        category: string
        execute: (
            args: string[],
            ctx: ICTX
        ) => Promise<void> | void
    }
}

export {}