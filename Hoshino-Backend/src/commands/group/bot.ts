import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"

const command: ICommand = {
	name: ["bot", "listen"],
	category: "group",
	description:
		"Query or toggle Bot Listening status in this group (bot on / bot off)",
	usage: ["bot on", "bot off", "bot"],
	inGroup: true,
	inGroupAccess: "admin",
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const action = (args[0] || "").toLowerCase()

		if (action === "on" || action === "enable" || action === "1") {
			await commandRepository.updateGroupSettings(ctx.agentId, ctx.jid, {
				botEnabled: true,
			})
			await ctx.reply(
				"🤖 *Bot Listening Mode: ENABLED (ON)*\n✅ Bot is now listening and responding to commands in this group.",
			)
			return
		}

		if (action === "off" || action === "disable" || action === "0") {
			await commandRepository.updateGroupSettings(ctx.agentId, ctx.jid, {
				botEnabled: false,
			})
			await ctx.reply(
				"🔕 *Bot Listening Mode: DISABLED (OFF)*\n🚫 Bot stopped responding to commands in this group.",
			)
			return
		}

		const current = await commandRepository.getGroupSettings(
			ctx.agentId,
			ctx.jid,
		)
		await ctx.reply(
			`📌 Bot Listening mode in this group is currently: *${current.botEnabled ? "ENABLED (ON)" : "DISABLED (OFF)"}*\n\n💡 Usage: *${ctx.prefix}${ctx.commandName} on* or *${ctx.prefix}${ctx.commandName} off*`,
		)
	},
}

export default command
