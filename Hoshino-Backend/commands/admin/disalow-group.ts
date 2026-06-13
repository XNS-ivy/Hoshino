import { groupDb } from "@modules/databases-handler/groupDB"

export default {
    name: 'disallow',
    usage: 'disallow',
    category: 'admin',
    inGroup: true,
    inGroupAccess: 'admin',
    execute: async (args, { msg, socket, whoAMI }) => {
        if (!whoAMI.ownerRole && whoAMI.groupRole !== 'admin') return

        try {
            await groupDb.disallow(msg.remoteJid, msg.agentId)
            await socket.sendMessage(msg.remoteJid, { text: '❌ Group disalowance, sorry ojiisan gonna go. ' }, { quoted: msg.raw })
        } catch (err: any) {
            await socket.sendMessage(msg.remoteJid, { text: `❌ ${err.message}` })
        }
    }
} satisfies ICommand