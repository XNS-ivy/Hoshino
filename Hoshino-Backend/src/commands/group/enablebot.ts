import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"

const command: ICommand = {
	name: ["enablebot", "disablebot", "bot", "listen"],
	category: "group",
	description: "Enable or disable Bot Listening / Command Execution in group",
	inGroup: true,
	inGroupAccess: "admin",
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const action = (args[0] || "").toLowerCase()
		let shouldEnable = ctx.commandName === "enablebot"

		if (ctx.commandName === "disablebot") {
			shouldEnable = false
		} else if (ctx.commandName === "bot" || ctx.commandName === "listen") {
			if (action === "on" || action === "enable" || action === "1") {
				shouldEnable = true
			} else if (action === "off" || action === "disable" || action === "0") {
				shouldEnable = false
			} else {
				const current = await commandRepository.getGroupSettings(
					ctx.agentId,
					ctx.jid,
				)
				await ctx.reply(
					`📌 Bot Listening mode in this group is currently: *${current.botEnabled ? "ENABLED (ON)" : "DISABLED (OFF)"}*\n\n💡 Usage: *${ctx.prefix}${ctx.commandName} on* or *${ctx.prefix}${ctx.commandName} off*`,
				)
				return
			}
		}

		await commandRepository.updateGroupSettings(ctx.agentId, ctx.jid, {
			botEnabled: shouldEnable,
		})

		if (shouldEnable) {
			await ctx.reply(
				"🤖 *Bot Listening Mode: ENABLED (ON)*\n✅ Bot is now listening and responding to commands in this group.",
			)
		} else {
			await ctx.reply(
				"🔕 *Bot Listening Mode: DISABLED (OFF)*\n🚫 Bot stopped responding to commands in this group. (Use *!bot on* to re-enable)",
			)
		}
	},
}

export default command
