import { getAgent } from '@modules/baileys/agent'

export default {
    category: 'admin',
    inGroup: true,
    usage: ['kick', 'kick @123xxxx09', 'kick (reply pesan)'],
    name: 'kick',
    inGroupAccess: 'admin',
    async execute(_, { msg, socket, whoAMI }) {
        if (!msg.isOnGroup && this.inGroup) {
            socket.sendMessage(msg.remoteJid, {
                text: '❌ This command can only be used in groups!'
            }, { quoted: msg.raw })
            return
        }
        if ((!whoAMI || whoAMI.groupRole !== 'admin')) {
            socket.sendMessage(msg.remoteJid, {
                text: '❌ This command is for admin only!'
            }, { quoted: msg.raw })
            return
        }
        const agent = getAgent(msg.agentId)
        const prefix = agent?.prefix

        let targetJid: string[] = []
        if (msg.mentionedJid && msg.mentionedJid.length > 0) {
            targetJid = msg.mentionedJid
        }
        else if (msg.quoted && msg.raw?.message) {
            const rawMsg = msg.raw.message as any
            const contextInfo = rawMsg?.extendedTextMessage?.contextInfo

            if (contextInfo?.participant) {
                targetJid = [contextInfo.participant]
            }
            else if (contextInfo?.stanzaId && msg.raw.key?.participant) {
                targetJid = [msg.raw.key.participant]
            }
        }
        if (targetJid.length === 0) {
            socket.sendMessage(msg.remoteJid, {
                text: `❌ Mention the user or reply to their message to kick them!\nExample: ${prefix}kick @user`
            }, { quoted: msg.raw })
            return
        }
        const botJid = socket.user?.id || socket.user?.lid

        if (!botJid) {
            socket.sendMessage(msg.remoteJid, {
                text: '❌ Cant get bot ID!'
            }, { quoted: msg.raw })
            return
        }
        const normalizeJid = (jid: string) => {
            return jid?.split(':')[0]?.split('@')[0] || ''
        }

        const botNumber = normalizeJid(botJid)
        const targetContainsBot = targetJid.some(jid => {
            const targetNumber = normalizeJid(jid)
            return targetNumber === botNumber
        })

        if (targetContainsBot) {
            socket.sendMessage(msg.remoteJid, {
                text: '❌ Cant kick bot alone!'
            }, { quoted: msg.raw })
            return
        }
        try {
            await socket.groupParticipantsUpdate(msg.remoteJid, targetJid, 'remove')
            socket.sendMessage(msg.remoteJid, {
                text: `✅ Successful kick ${targetJid.length} user`
            }, { quoted: msg.raw })
        } catch (err: any) {
            logger.error(`/commands/admin/kick.ts`, `[${msg.agentId}] Error Kicking : ${err.message}`)
            socket.sendMessage(msg.remoteJid, {
                text: '❌ Failed to kick user: ' + (err.message || 'Unknown error')
            }, { quoted: msg.raw })
        }
    },
} as ICommand