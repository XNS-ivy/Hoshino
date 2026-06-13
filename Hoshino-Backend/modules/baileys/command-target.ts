import type { WASocket } from 'baileys'
import type { IMessageFetch } from './mesage-parse'
import { convertLID } from './baileys-functions'

export async function resolveTargetLids(
    msg: IMessageFetch,
    socket: WASocket
): Promise<string[]> {
    const targetJids = getTargetJids(msg)
    if (targetJids.length === 0) return []

    const metadata = msg.isOnGroup
        ? await socket.groupMetadata(msg.remoteJid)
        : null
    const lids: string[] = []

    for (const targetJid of targetJids) {
        const targetIdentity = normalizeIdentity(targetJid)
        const participant = metadata?.participants.find(p =>
            [p.id, p.lid, p.phoneNumber]
                .filter((jid): jid is string => Boolean(jid))
                .some(jid => normalizeIdentity(jid) === targetIdentity)
        )

        let lidJid = participant?.lid
            ?? (participant?.id.endsWith('@lid') ? participant.id : null)
            ?? (targetJid.endsWith('@lid') ? targetJid : null)

        if (!lidJid) {
            const phoneJid = participant?.phoneNumber ?? targetJid
            lidJid = await socket.signalRepository.lidMapping.getLIDForPN(phoneJid)
        }

        const lid = convertLID(lidJid)
        if (lid) lids.push(lid)
    }

    return [...new Set(lids)]
}

function getTargetJids(msg: IMessageFetch): string[] {
    if (msg.mentionedJid.length > 0) return msg.mentionedJid

    const contextInfo = msg.raw.message?.extendedTextMessage?.contextInfo
    return contextInfo?.participant ? [contextInfo.participant] : []
}

function normalizeIdentity(jid: string): string {
    return jid.split(':')[0]?.split('@')[0] ?? jid
}
