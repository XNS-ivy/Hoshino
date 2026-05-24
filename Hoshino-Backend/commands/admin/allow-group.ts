import { groupDb } from "@modules/databases-handler/groupDB"

export default {
    name: 'allowgroup',
    usage: 'allowgroup',
    category: 'admin',
    inGroup: true,
    inGroupAccess: 'admin',
    execute: async (args, { msg, socket, whoAMI }) => {
        if (!whoAMI.ownerRole && whoAMI.groupRole !== 'admin') return

        try {
            await groupDb.allow(msg.remoteJid, msg.agentId)
            await socket.sendMessage(msg.remoteJid, { text: '✅ Group allowed' })
        } catch (err: any) {
            await socket.sendMessage(msg.remoteJid, { text: `❌ ${err.message}` })
        }
    }
} satisfies ICommand