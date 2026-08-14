import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"

const command: ICommand = {
	name: ["enablebot"],
	category: "group",
	description: "Enable Bot Listening and command execution in this group",
	usage: ["enablebot"],
	inGroup: true,
	inGroupAccess: "admin",
	textOnly: true,
	execute: async (_args: string[], ctx: CommandContext) => {
		await commandRepository.updateGroupSettings(ctx.agentId, ctx.jid, {
			botEnabled: true,
		})

		await ctx.reply(
			"🤖 *Bot Listening Mode: ENABLED (ON)*\n✅ Bot is now listening and responding to commands in this group.",
		)
	},
}

export default command
