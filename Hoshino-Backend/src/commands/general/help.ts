import type { CommandContext, ICommand } from "@customTypes/command"
import { commandLoader } from "@services/commandLoader"
import { logger } from "@utils/logger"

const command: ICommand = {
	name: ["help", "menu"],
	category: "general",
	description: "Display a list of all available bot commands",
	textOnly: true,
	execute: async (_args: string[], ctx: CommandContext) => {
		logger.info(
			"/commands/general/help.ts",
			`[CMD-EXEC] Executing help command for ${ctx.senderJid} in ${ctx.jid}`,
		)
		const allCommands = commandLoader.getAllCommands()
		const categories = new Map<string, ICommand[]>()

		for (const cmd of allCommands) {
			const cat = cmd.category || "general"
			if (!categories.has(cat)) categories.set(cat, [])
			categories.get(cat)?.push(cmd)
		}

		let menuText = "✨ *HOSHINO BOT COMMAND MENU* ✨\n"
		menuText += `📌 Prefix: *${ctx.prefix}*\n\n`

		for (const [category, cmds] of categories.entries()) {
			menuText += `📁 *[ ${category.toUpperCase()} ]*\n`
			for (const cmd of cmds) {
				const primaryName = Array.isArray(cmd.name) ? cmd.name[0] : cmd.name
				const desc = cmd.description ? ` - ${cmd.description}` : ""
				menuText += `  • *${ctx.prefix}${primaryName}*${desc}\n`
			}
			menuText += "\n"
		}

		menuText += "💡 _Type a command name with its prefix to execute it._"
		await ctx.reply(menuText)
	},
}

export default command
