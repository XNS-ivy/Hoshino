import commandHandler from '@modules/handlers/commands-loader'
import { getAgent } from '@modules/baileys/agent'

export default {
    name: 'menu',
    access: 'regular',
    usage: ['menu', 'menu <command>', 'menu usage <command>'],
    async execute(args, { msg, socket, whoAMI }: ICTX) {
        const agent = getAgent(msg.agentId)
        const prefix   = agent?.prefix
        const commands = await commandHandler.getCommandMapOnly(whoAMI, !!msg.isOnGroup) // Bug 2: coerce to boolean

        const cmdMap = new Map(
            commands.map(c => [getPrimaryName(c), c])
        )
        if (args.length === 1 && args[0]) {
            const target = cmdMap.get(args[0])
            if (!target) {
                return void socket.sendMessage(msg.remoteJid, {
                    text: `❌ Command *${args[0]}* not found`
                }, { quoted: msg.raw })
            }
            return void socket.sendMessage(msg.remoteJid, {
                text: renderCommandDetail(target, prefix ?? '')
            }, { quoted: msg.raw })
        }

        if (args.length === 2 && args[0] === 'usage' && args[1]) {
            const target = cmdMap.get(args[1])
            if (!target) {
                return void socket.sendMessage(msg.remoteJid, {
                    text: `❌ Command *${args[1]}* not found`
                }, { quoted: msg.raw })
            }

            const usages = renderUsage(target.usage, getPrimaryName(target))
            return void socket.sendMessage(msg.remoteJid, {
                text:
                    `🧾 *Usage ${getPrimaryName(target)}:*\n` +
                    usages.map(u => `• ${u}`).join('\n')
            }, { quoted: msg.raw })
        }

        const map = new Map<string, ICommand[]>()
        for (const cmd of commands) {
            const key = cmd.category ?? cmd.access ?? 'general'
            if (!map.has(key)) map.set(key, [])
            map.get(key)!.push(cmd)
        }

        const sortedMap = new Map(
            [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
        )

        const botName = 'Hoshino'
        const selfName = getPrimaryName(this as unknown as ICommand)

        let text = `╔══════════════╗\n`
        text += `║  🌸 *${botName}*\n`
        text += `╚══════════════╝\n\n`

        for (const [category, cmds] of sortedMap) {
            const sorted = cmds.sort((a, b) =>
                getPrimaryName(a).localeCompare(getPrimaryName(b))
            )
            text += `╔ 📁 *${category.toUpperCase()}*\n`
            for (const c of sorted) {
                text += `║ • ${prefix}${getPrimaryName(c)}\n`
            }
            text += `╚══════════\n\n`
        }

        text += `📌 *${prefix}${selfName} <cmd>* — detail\n`
        text += `📌 *${prefix}${selfName} usage <cmd>* — usage\n`
        text += `🔑 Prefix: *" ${prefix} "*\n`
        text += `📦 Total: *${commands.length} commands*`

        await socket.sendMessage(msg.remoteJid, {
            text
        }, { quoted: msg.raw })
    },
} as ICommand

function getPrimaryName(cmd: ICommand): string {
    return Array.isArray(cmd.name) ? cmd.name[0]! : cmd.name as string
}

function renderUsage(usage: ICommand['usage'], name: string): string[] {
    if (!usage) return [name]
    if (typeof usage === 'string') return [usage]
    if (Array.isArray(usage)) return usage
    if (typeof usage === 'function') {
        const res = usage()
        return Array.isArray(res) ? res : [String(res)]
    }
    return [name]
}

function renderCommandDetail(cmd: ICommand, prefix: string): string {
    const lines: string[] = []
    const primaryName = getPrimaryName(cmd)

    lines.push(`📌 *Command:* ${primaryName}`)

    if (Array.isArray(cmd.name) && cmd.name.length > 1) {
        lines.push(`🔀 *Alias:* ${cmd.name.slice(1).join(', ')}`)
    }

    lines.push(`🔐 *Access:* ${Array.isArray(cmd.access) ? cmd.access.join(', ') : cmd.access ?? 'regular'}`)
    lines.push(`📁 *Category:* ${cmd.category ?? cmd.access ?? 'general'}`)

    if (cmd.inGroup) {
        lines.push(`👥 *Group Only:* yes`)
        if (cmd.inGroupAccess) lines.push(`🛡 *Group Role:* ${cmd.inGroupAccess}`)
    }

    const usages = renderUsage(cmd.usage, primaryName)
    lines.push(`\n🧾 *Usage:*`)
    for (const u of usages) {
        lines.push(`• ${prefix}${u}`)
    }

    if (cmd.args?.length) {
        lines.push(`\n📥 *Args:* ${cmd.args.join(', ')}`)
    }

    return lines.join('\n')
}