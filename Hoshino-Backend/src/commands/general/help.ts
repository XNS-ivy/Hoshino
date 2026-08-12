import type { CommandContext, ICommand } from "@customTypes/command"
import { commandLoader } from "@services/commandLoader"

const command: ICommand = {
	name: ["help", "menu"],
	category: "general",
	description: "Menampilkan daftar seluruh perintah bot yang tersedia",
	execute: async (_args: string[], ctx: CommandContext) => {
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

		menuText += "💡 _Ketik nama perintah dengan prefix untuk menjalankannya._"
		await ctx.reply(menuText)
	},
}

export default command
