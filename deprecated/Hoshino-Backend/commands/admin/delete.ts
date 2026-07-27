import { getAgent } from '@modules/baileys/agent'

export default {
    category: 'admin',
    inGroup: true,
    usage: ['delete', 'delete (reply message)'],
    name: 'delete',
    inGroupAccess: 'admin',
    async execute(_, { msg, socket, whoAMI }) {
        if (!msg.isOnGroup && this.inGroup) {
            socket.sendMessage(msg.remoteJid, {
                text: '❌ This command can only be used in groups!'
            }, { quoted: msg.raw })
            return
        }
        if (!whoAMI || whoAMI.groupRole !== 'admin') {
            socket.sendMessage(msg.remoteJid, {
                text: '❌ This command is for admin only!'
            }, { quoted: msg.raw })
            return
        }

        const agent = getAgent(msg.agentId)
        const prefix = agent?.prefix
        if (!msg.quoted || !msg.raw?.message) {
            socket.sendMessage(msg.remoteJid, {
                text: `❌ Reply to the message you want to delete!\nExample: ${prefix}delete (reply message)`
            }, { quoted: msg.raw })
            return
        }
        const rawMsg = msg.raw.message
        const contextInfo = rawMsg?.extendedTextMessage?.contextInfo

        if (!contextInfo?.stanzaId) {
            socket.sendMessage(msg.remoteJid, {
                text: '❌ Cannot get message ID!'
            }, { quoted: msg.raw })
            return
        }
        const participant = contextInfo.participant || msg.raw.key?.participant
        const messageKey = {
            remoteJid: msg.remoteJid,
            fromMe: false,
            id: contextInfo.stanzaId,
            participant: participant
        }
        const botJid = socket.user?.id || socket.user?.lid
        if (botJid && participant) {
            const normalizeJid = (jid: string) => {
                return jid?.split(':')[0]?.split('@')[0] || ''
            }

            const botNumber = normalizeJid(botJid)
            const senderNumber = normalizeJid(participant)
            if (senderNumber === botNumber) {
                messageKey.fromMe = true
            }
        }

        try {
            await socket.sendMessage(msg.remoteJid, { delete: messageKey })
            await socket.sendMessage(msg.remoteJid, {
                delete: msg.key
            })
        } catch (err: any) {
            logger.error(`/commands/admin/delete.ts`, `[${msg.agentId}] Delete message error: ${err}`)
            socket.sendMessage(msg.remoteJid, {
                text: '❌ Failed to delete message: ' + (err.message || 'Unknown error')
            }, { quoted: msg.raw })
        }
    },
} as ICommand