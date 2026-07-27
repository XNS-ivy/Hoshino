import { getAgent, updateAgentConfig } from '@modules/baileys/agent'
import { resolveTargetLids } from '@modules/baileys/command-target'

export default {
    name: 'autodelete',
    usage: ['autodelete @user', 'autodelete (reply pesan)'],
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
                    text: `Target not found. Tag the user or reply to their message.\nExample: ${agent.prefix}autodelete @user`
                }, { quoted: msg.raw })
                return
            }

            const autodelete = new Set(agent.autodelete)
            const enabled: string[] = []
            const disabled: string[] = []

            for (const lid of targetLids) {
                if (autodelete.delete(lid)) {
                    disabled.push(lid)
                } else {
                    autodelete.add(lid)
                    enabled.push(lid)
                }
            }

            updateAgentConfig(msg.agentId, { autodelete: [...autodelete] })
            await socket.sendMessage(msg.remoteJid, {
                text: renderResult('Auto-delete', enabled, disabled)
            }, { quoted: msg.raw })
        } catch (err: any) {
            logger.error('/commands/admin/autodelete.ts', `[${msg.agentId}] ${err?.message}`)
            await socket.sendMessage(msg.remoteJid, {
                text: `Failed to update auto-delete: ${err?.message ?? 'Unknown error'}`
            }, { quoted: msg.raw })
        }
    }
} satisfies ICommand

function renderResult(label: string, enabled: string[], disabled: string[]): string {
    const lines = [`${label} updated successfully.`]
    if (enabled.length > 0) lines.push(`Active: ${enabled.join(', ')}`)
    if (disabled.length > 0) lines.push(`Non-active: ${disabled.join(', ')}`)
    return lines.join('\n')
}
