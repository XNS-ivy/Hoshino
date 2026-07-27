import { getAgent, updateAgentConfig } from '@modules/baileys/agent'
import { resolveTargetLids } from '@modules/baileys/command-target'

export default {
    name: 'whitelist',
    usage: ['whitelist @user', 'whitelist (reply pesan)'],
    category: 'moderator',
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
                    text: `Target not found. Tag the user or reply to their message.\nExample: ${agent.prefix}whitelist @user`
                }, { quoted: msg.raw })
                return
            }

            const targets = new Set(targetLids)
            const removed = agent.commandBlacklist.filter(lid => targets.has(lid))
            const commandBlacklist = agent.commandBlacklist.filter(
                lid => !targets.has(lid)
            )

            updateAgentConfig(msg.agentId, { commandBlacklist })
            await socket.sendMessage(msg.remoteJid, {
                text: removed.length > 0
                    ? `Command access opened for LID: ${removed.join(', ')}`
                    : 'The target is not listed in the command blacklist.'
            }, { quoted: msg.raw })
        } catch (err: any) {
            logger.error('/commands/moderator/whitelist.ts', `[${msg.agentId}] ${err?.message}`)
            await socket.sendMessage(msg.remoteJid, {
                text: `Failed to open blacklist command: ${err?.message ?? 'Unknown error'}`
            }, { quoted: msg.raw })
        }
    }
} satisfies ICommand
