import type { CommandContext, ICommand } from "@customTypes/command"
import { commandLoader } from "@services/commandLoader"
import { logger } from "@utils/logger"

function getPrimaryName(cmd: ICommand): string {
	return (Array.isArray(cmd.name) ? cmd.name[0] : cmd.name) || ""
}

function renderCommandDetail(cmd: ICommand, prefix: string): string {
	const lines: string[] = []
	const primaryName = getPrimaryName(cmd)

	lines.push(`📌 *COMMAND DETAIL: ${primaryName.toUpperCase()}*`)
	lines.push(`───────────`)

	if (Array.isArray(cmd.name) && cmd.name.length > 1) {
		lines.push(
			`🔀 *Aliases:* ${cmd.name
				.slice(1)
				.map((a) => `${prefix}${a}`)
				.join(", ")}`,
		)
	}

	lines.push(`🔐 *Access:* ${cmd.access || "user"}`)
	lines.push(`📁 *Category:* ${cmd.category || "general"}`)

	if (cmd.description) {
		lines.push(`💬 *Description:* ${cmd.description}`)
	}

	if (cmd.inGroup) {
		lines.push(`👥 *Group Only:* Yes`)
		if (cmd.inGroupAccess) {
			lines.push(`🛡️ *Required Group Role:* ${cmd.inGroupAccess}`)
		}
	}

	if (cmd.allowedMediaTypes && cmd.allowedMediaTypes.length > 0) {
		lines.push(`📥 *Allowed Media:* ${cmd.allowedMediaTypes.join(", ")}`)
	}

	if (cmd.cooldown) {
		lines.push(`⏱️ *Cooldown:* ${cmd.cooldown} second(s)`)
	}

	const usages = cmd.usage && cmd.usage.length > 0 ? cmd.usage : [primaryName]
	lines.push(`\n🧾 *Usage Examples:*`)
	for (const u of usages) {
		lines.push(`  • *${prefix}${u}*`)
	}

	return lines.join("\n")
}

const command: ICommand = {
	name: ["help", "menu"],
	category: "general",
	description:
		"Display bot command menu or get detailed help for a specific command",
	usage: ["help", "help sticker", "menu kick"],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		logger.info(
			"/commands/general/help.ts",
			`[CMD-EXEC] Executing help command for ${ctx.senderJid} in ${ctx.jid}`,
		)
		const allCommands = commandLoader.getAllCommands()
		const cmdMap = new Map<string, ICommand>()

		for (const cmd of allCommands) {
			const names = Array.isArray(cmd.name) ? cmd.name : [cmd.name]
			for (const n of names) {
				cmdMap.set(n.toLowerCase(), cmd)
			}
		}

		// Mode B: Detail View (!help <command_name>)
		const targetArg = (args[0] || "").toLowerCase().replace(/^[.!/#]/, "")
		if (targetArg) {
			const targetCmd = cmdMap.get(targetArg)
			if (!targetCmd) {
				await ctx.reply(`❌ Command *"${targetArg}"* not found in system menu.`)
				return
			}

			await ctx.reply(renderCommandDetail(targetCmd, ctx.prefix))
			return
		}

		// Mode A: Global Category Menu View
		const isOwnerOrMaster = Boolean(await ctx.getOwnerRole())
		// Filter commands relevant to context and access level
		const visibleCommands = allCommands.filter((cmd) => {
			if (cmd.access === "owner" || cmd.access === "master") {
				return isOwnerOrMaster
			}
			return true
		})

		const categoryMap = new Map<string, ICommand[]>()
		for (const cmd of visibleCommands) {
			const cat = (cmd.category || "general").toLowerCase()
			if (!categoryMap.has(cat)) categoryMap.set(cat, [])
			categoryMap.get(cat)?.push(cmd)
		}

		const sortedCategories = Array.from(categoryMap.keys()).sort()

		let text = "╔═════════════════╗\n"
		text += "║  🌸 *HOSHINO BOT MENU*\n"
		text += "╚═════════════════╝\n\n"

		for (const cat of sortedCategories) {
			const cmds = categoryMap.get(cat) || []
			const sortedCmds = cmds.sort((a, b) =>
				getPrimaryName(a).localeCompare(getPrimaryName(b)),
			)

			text += `╔ 📁 *${cat.toUpperCase()}*\n`
			for (const c of sortedCmds) {
				const primary = getPrimaryName(c)
				const adminBadge = c.inGroupAccess === "admin" ? " 🛡️" : ""
				text += `║ • *${ctx.prefix}${primary}*${adminBadge}\n`
			}
			text += "╚═════════════════\n\n"
		}

		text += `📌 *${ctx.prefix}help <command>* — View command detail & usage\n`
		text += `📌 *Prefix:* "${ctx.prefix}"\n`
		text += `📦 *Total:* ${visibleCommands.length} commands available`

		await ctx.reply(text)
	},
}

export default command
