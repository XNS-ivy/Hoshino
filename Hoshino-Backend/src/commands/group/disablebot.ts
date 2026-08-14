import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"

const command: ICommand = {
	name: ["disablebot"],
	category: "group",
	description: "Disable Bot Listening and command execution in this group",
	inGroup: true,
	inGroupAccess: "admin",
	textOnly: true,
	execute: async (_args: string[], ctx: CommandContext) => {
		await commandRepository.updateGroupSettings(ctx.agentId, ctx.jid, {
			botEnabled: false,
		})

		await ctx.reply(
			"🔕 *Bot Listening Mode: DISABLED (OFF)*\n🚫 Bot stopped responding to commands in this group. (Use *!enablebot* to re-enable)",
		)
	},
}

export default command
