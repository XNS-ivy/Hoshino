import { getAgent, updateAgentConfig } from '@modules/baileys/agent'
import { resolveTargetLids } from '@modules/baileys/command-target'

export default {
    name: 'disableautodelete',
    usage: ['disableautodelete @user', 'disableautodelete (reply pesan)'],
    category: 'admin',
    inGroup: true,
    inGroupAccess: 'admin',
    async execute(_, { msg, socket, whoAMI }) {
        if (whoAMI.groupRole !== 'admin' && !whoAMI.ownerRole) return

        const agent = getAgent(msg.agentId)
        if (!agent) return

        try {
            const targetLids = await resolveTargetLids(msg, socket)
            if (targetLids.length === 0) {
                await socket.sendMessage(msg.remoteJid, {
                    text: `Target not found. Tag the user or reply to their message.\nExample: ${agent.prefix}disableautodelete @user`
                }, { quoted: msg.raw })
                return
            }

            const targets = new Set(targetLids)
            const removed = agent.autodelete.filter(lid => targets.has(lid))
            const autodelete = agent.autodelete.filter(lid => !targets.has(lid))

            updateAgentConfig(msg.agentId, { autodelete })
            await socket.sendMessage(msg.remoteJid, {
                text: removed.length > 0
                    ? `Auto-delete is disabled for LID: ${removed.join(', ')}`
                    : 'The target is not listed in auto-delete.'
            }, { quoted: msg.raw })
        } catch (err: any) {
            logger.error('/commands/admin/disable-autodelete.ts', `[${msg.agentId}] ${err?.message}`)
            await socket.sendMessage(msg.remoteJid, {
                text: `Failed to disable auto-delete: ${err?.message ?? 'Unknown error'}`
            }, { quoted: msg.raw })
        }
    }
} satisfies ICommand
