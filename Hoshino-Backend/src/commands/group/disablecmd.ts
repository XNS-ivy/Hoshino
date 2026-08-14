import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"
import { commandLoader } from "@services/commandLoader"
import { logger } from "@utils/logger"

const command: ICommand = {
	name: ["disablecmd", "discCmd"],
	category: "group",
	description: "Disable a specific command feature in this group",
	usage: ["disablecmd nsfw", "discCmd sticker"],
	inGroup: true,
	inGroupAccess: "admin",
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		logger.info(
			"/commands/group/disablecmd.ts",
			`[CMD-EXEC] Executing disablecmd command for ${ctx.senderJid} in ${ctx.jid}`,
		)
		const targetCmd = (args[0] || "").toLowerCase()
		if (!targetCmd) {
			await ctx.reply(
				`❌ Usage format: *${ctx.prefix}${ctx.commandName} <command_name>*\nExample: *${ctx.prefix}disablecmd nsfw*`,
			)
			return
		}

		const allCommands = commandLoader.getAllCommands()
		const found = allCommands.find((c) => {
			const names = Array.isArray(c.name) ? c.name : [c.name]
			return names.map((n: string) => n.toLowerCase()).includes(targetCmd)
		})

		if (!found) {
			await ctx.reply(
				`❌ Command *"${targetCmd}"* was not found in the system.`,
			)
			return
		}

		const primaryName =
			(Array.isArray(found.name) ? found.name[0] : found.name) || targetCmd

		await commandRepository.setGroupCommandStatus(
			ctx.agentId,
			ctx.jid,
			primaryName,
			"disabled",
		)

		await ctx.reply(
			`🚫 Command *"${primaryName}"* has been *disabled* for this group.`,
		)
	},
}

export default command
