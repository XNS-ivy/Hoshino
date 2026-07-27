import { type WAMessage, type proto, type WAMessageKey, getContentType, type WASocket } from "baileys"
import { getAgent } from "./agent"
import { ownerDb, type OwnerRole } from "@modules/databases-handler/ownerDB"
import { groupDb } from "@modules/databases-handler/groupDB"
import { convertLID } from './baileys-functions'

export class MessageParse {
    private static denied: (keyof proto.IMessage)[] = [
        "senderKeyDistributionMessage",
        "messageContextInfo",
        "secretEncryptedMessage",
    ]
    async fetch(msg: WAMessage, sock: WASocket, agentId: string): Promise<IMessageFetch | null> {

        const { key, pushName, message } = msg
        const rawMessage = unwrapMessage(message as proto.IMessage)
        const { remoteJid } = key
        const lid = this.getLID(key)
        const messageTimestamp = Date.now()

        if (!message || !pushName) return null
        if (remoteJid === "status@broadcast" || !remoteJid) return null
        if (!rawMessage) return null

        const m = message as proto.IMessage
        const res: Partial<Record<keyof proto.IMessage, any>> = {}

        for (const k of Object.keys(m) as (keyof proto.IMessage)[]) {
            if (!MessageParse.denied.includes(k)) {
                res[k] = m[k]
            }
        }

        const messageObject = getContentType(rawMessage) as keyof proto.IMessage
        if (!messageObject) return null
        const content = res[messageObject]
        if (!content) return null

        let textMsg: string | null = null
        let caption: string | null = null
        let description: string | null = null
        let contextInfo: proto.IContextInfo | undefined
        let expiration = 0

        if (messageObject === 'conversation') {
            textMsg = content as string
        }
        else if (messageObject === 'extendedTextMessage') {
            const c = content as proto.Message.IExtendedTextMessage
            textMsg = c.text ?? null
            description = c.description ?? null
            contextInfo = c.contextInfo ?? undefined
            expiration = (c as any).expiration ?? 0
        }
        else {
            const c = content as {
                caption?: string
                contextInfo?: proto.IContextInfo
                expiration?: number
            }
            caption = c?.caption ?? null
            contextInfo = c?.contextInfo ?? undefined
            expiration = c?.expiration ?? 0
        }

        const quotedMessage = contextInfo?.quotedMessage
        const mentionedJid = contextInfo?.mentionedJid ?? []
        const chatExpiration = expiration > 0 ? expiration : 0
        const quoted = quotedMessage
            ? await this.quotedMessageFetch(quotedMessage)
            : null
        const isOnGroup = remoteJid.endsWith('@g.us') ? remoteJid : false

        const agent = getAgent(agentId)
        const prefix = agent?.prefix ?? '.'
        const convertedLid = lid ? convertLID(lid) : null
        if (!lid) return null

        const isAutodeleteLid = convertedLid !== null
            && (agent?.autodelete.includes(convertedLid) ?? false)
        const isCommandBlacklisted = convertedLid !== null
            && (agent?.commandBlacklist.includes(convertedLid) ?? false)
        const body: string = textMsg ?? caption ?? ""
        let commandContent: null | { cmd: string; args: string[] } = null
        if (!isCommandBlacklisted && body?.startsWith(prefix)) {
            const parts = body
                .slice(prefix.length)
                .trim()
                .split(/\s+/)
            const cmd = parts.shift() ?? ""
            const args = parts
            commandContent = {
                cmd,
                args
            }
        }

        const senderJid = key.participant ?? remoteJid
        const ownerLookup = convertedLid ?? senderJid
        const ownerRole = await ownerDb.getRole(ownerLookup, agentId)
        const isOwner: boolean = ownerRole !== null

        let isAdmin = false
        let isBotAdmin = false
        if (isOnGroup) {
            try {
                const meta = await sock.groupMetadata(remoteJid)
                const senderIdentity = normalizeJid(senderJid)
                const participant = meta.participants.find(
                    p => [p.id, p.lid, p.phoneNumber]
                        .filter((jid): jid is string => Boolean(jid))
                        .some(jid => normalizeJid(jid) === senderIdentity)
                )
                isAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin'

                const botJids = [sock.user?.id, sock.user?.lid]
                    .filter((jid): jid is string => Boolean(jid))
                    .map(normalizeJid)
                const botParticipant = meta.participants.find(
                    p => botJids.includes(normalizeJid(p.id))
                )
                isBotAdmin = botParticipant?.admin === 'admin'
                    || botParticipant?.admin === 'superadmin'
            } catch {
                isAdmin = false
                isBotAdmin = false
            }
        }
        const shouldDelete = isAutodeleteLid && Boolean(isOnGroup) && isBotAdmin
        const isGroupAllowed = isOnGroup
            ? await groupDb.isAllowed(remoteJid, agentId)
            : true

        return {
            remoteJid,
            lid,
            key,
            pushName,
            isOnGroup,
            messageTimestamp,
            type: messageObject,
            text: textMsg,
            caption,
            description,
            expiration: chatExpiration,
            mentionedJid,
            quoted,
            raw: msg,
            rawQuoted: quotedMessage ?? null,
            commandContent,
            shouldDelete,
            isCommandBlacklisted,
            convertedLid,
            isOwner,
            ownerRole,
            isAdmin,
            isBotAdmin,
            isGroupAllowed,
            agentId,
        }
    }

    private async quotedMessageFetch(qMsg: proto.IMessage): Promise<IQuotedMessage | null> {
        if (!qMsg) return null
        const extracted = this.extractQuoted(qMsg)
        if (!extracted) return null

        const quotedType = getContentType(extracted) as keyof proto.IMessage
        const quotedContent: any = extracted[quotedType]

        const text = quotedType === 'conversation'
            ? (typeof quotedContent === 'string' ? quotedContent : null)
            : quotedContent?.text ?? null

        return {
            type: quotedType,
            text,
            caption: quotedContent?.caption ?? null,
            description: quotedContent?.description ?? null,
            expiration: quotedContent?.expiration ?? 0,
            mentionedJid: quotedContent?.contextInfo?.mentionedJid ?? [],
            rawQuoted: extracted,
        }
    }

    private extractQuoted(quotedMessage: proto.IMessage | undefined): proto.IMessage | null {
        if (!quotedMessage) return null

        const msg = quotedMessage as proto.IMessage | undefined
        if (!msg) return null

        const keys = Object.keys(msg) as (keyof proto.IMessage)[]
        const main = keys.find(k => !MessageParse.denied.includes(k))
        if (!main) return null

        return {
            [main]: msg[main]
        }
    }

    getLID(key: WAMessageKey): string | null {
        const lid = key?.remoteJid?.endsWith('@lid')
            ? key.remoteJid
            : key?.participant?.endsWith('@lid')
                ? key.participant
                : null
        return lid
    }
}

export interface IMessageParse {
    fetch(message: WAMessage, sock: WASocket, agentId: string): Promise<IMessageFetch | null>
}

interface IKeyFetch {
    remoteJid: string,
    lid: string,
    key: WAMessageKey,
}

export interface IMessageFetch extends IKeyFetch {
    pushName: string | null | undefined,
    isOnGroup: string | false
    messageTimestamp: number,
    type: keyof proto.IMessage,
    messageObject?: string,
    text: string | null | undefined,
    caption: string | null | undefined,
    description: string | null | undefined,
    expiration: number,
    mentionedJid: Array<string> | [],
    quoted: IQuotedMessage | null,
    raw: WAMessage,
    rawQuoted?: proto.IMessage | null,
    commandContent: null | {
        cmd: string,
        args: Array<string>,
    }
    shouldDelete: boolean,
    isCommandBlacklisted: boolean,
    convertedLid: string | null,
    isOwner: boolean,
    ownerRole: OwnerRole | null,
    isAdmin: boolean,
    isBotAdmin: boolean,
    isGroupAllowed: boolean,
    agentId: string
    // add more type here if needed
}

interface IQuotedMessage {
    type: keyof proto.IMessage,
    text: string | null,
    caption: string | null,
    description: string | null,
    expiration: number,
    mentionedJid: Array<string | null>,
    rawQuoted: proto.IMessage,
}

export const message = new MessageParse()

type MessageContent<T extends keyof proto.IMessage> = proto.IMessage[T]


function unwrapMessage(msg: proto.IMessage | undefined | null): proto.IMessage | null {
    if (!msg) return null

    if (msg.ephemeralMessage?.message)
        return unwrapMessage(msg.ephemeralMessage.message)

    if (msg.viewOnceMessage?.message)
        return unwrapMessage(msg.viewOnceMessage.message)

    if (msg.viewOnceMessageV2?.message)
        return unwrapMessage(msg.viewOnceMessageV2.message)

    return msg
}

function normalizeJid(jid: string): string {
    return jid.split(':')[0]?.split('@')[0] ?? jid
}
