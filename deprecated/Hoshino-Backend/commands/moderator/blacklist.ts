import { getAgent, updateAgentConfig } from '@modules/baileys/agent'
import { resolveTargetLids } from '@modules/baileys/command-target'

export default {
    name: 'blacklist',
    usage: ['blacklist @user', 'blacklist (reply pesan)'],
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
                    text: `Target not found. Tag the user or reply to their message.\nExample: ${agent.prefix}blacklist @user`
                }, { quoted: msg.raw })
                return
            }

            const commandBlacklist = new Set(agent.commandBlacklist)
            const enabled: string[] = []
            const disabled: string[] = []

            for (const lid of targetLids) {
                if (commandBlacklist.delete(lid)) {
                    disabled.push(lid)
                } else {
                    commandBlacklist.add(lid)
                    enabled.push(lid)
                }
            }

            updateAgentConfig(msg.agentId, {
                commandBlacklist: [...commandBlacklist]
            })
            await socket.sendMessage(msg.remoteJid, {
                text: renderResult(enabled, disabled)
            }, { quoted: msg.raw })
        } catch (err: any) {
            logger.error('/commands/moderator/blacklist.ts', `[${msg.agentId}] ${err?.message}`)
            await socket.sendMessage(msg.remoteJid, {
                text: `Failed to update blacklist command: ${err?.message ?? 'Unknown error'}`
            }, { quoted: msg.raw })
        }
    }
} satisfies ICommand

function renderResult(enabled: string[], disabled: string[]): string {
    const lines = ['Blacklist command updated successfully.']
    if (enabled.length > 0) lines.push(`Blocked: ${enabled.join(', ')}`)
    if (disabled.length > 0) lines.push(`Opened: ${disabled.join(', ')}`)
    return lines.join('\n')
}
