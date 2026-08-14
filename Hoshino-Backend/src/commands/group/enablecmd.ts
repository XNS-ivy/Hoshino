import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"
import { commandLoader } from "@services/commandLoader"
import { logger } from "@utils/logger"

const command: ICommand = {
	name: ["enablecmd", "gencmd"],
	category: "group",
	description: "Enable a specific command feature in this group",
	usage: ["enablecmd nsfw", "gencmd sticker"],
	inGroup: true,
	inGroupAccess: "admin",
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		logger.info(
			"/commands/group/enablecmd.ts",
			`[CMD-EXEC] Executing enablecmd command for ${ctx.senderJid} in ${ctx.jid}`,
		)
		const targetCmd = (args[0] || "").toLowerCase()
		if (!targetCmd) {
			await ctx.reply(
				`❌ Usage format: *${ctx.prefix}${ctx.commandName} <command_name>*\nExample: *${ctx.prefix}enablecmd nsfw*`,
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
			"enabled",
		)

		await ctx.reply(
			`✅ Command *"${primaryName}"* has been registered & *enabled* for this group.`,
		)
	},
}

export default command
