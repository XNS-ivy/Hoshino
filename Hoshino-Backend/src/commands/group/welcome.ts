import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"

const command: ICommand = {
	name: ["welcome", "enablewelcome", "disablewelcome"],
	category: "group",
	description:
		"Toggle or check Welcome greeting message when new members join this group",
	usage: [
		"welcome on",
		"welcome off",
		"welcome",
		"enablewelcome",
		"disablewelcome",
	],
	inGroup: true,
	inGroupAccess: "admin",
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const cmd = ctx.commandName.toLowerCase()
		const action = (args[0] || "").toLowerCase()

		const shouldEnable =
			cmd === "enablewelcome" ||
			action === "on" ||
			action === "enable" ||
			action === "1" ||
			action === "true"

		const shouldDisable =
			cmd === "disablewelcome" ||
			action === "off" ||
			action === "disable" ||
			action === "0" ||
			action === "false"

		if (shouldEnable) {
			await commandRepository.updateGroupSettings(ctx.agentId, ctx.jid, {
				welcomeEnabled: true,
			})
			await ctx.reply(
				"👋 *Welcome Message: ENABLED (ON)*\n✅ Bot will now greet new members when they join this group.",
			)
			return
		}

		if (shouldDisable) {
			await commandRepository.updateGroupSettings(ctx.agentId, ctx.jid, {
				welcomeEnabled: false,
			})
			await ctx.reply(
				"🔕 *Welcome Message: DISABLED (OFF)*\n🚫 Welcome greetings are now turned off for this group.",
			)
			return
		}

		const current = await commandRepository.getGroupSettings(
			ctx.agentId,
			ctx.jid,
		)
		await ctx.reply(
			`📌 Welcome message in this group is currently: *${current.welcomeEnabled ? "ENABLED (ON)" : "DISABLED (OFF)"}*\n\n💡 Usage: *${ctx.prefix}${ctx.commandName} on* or *${ctx.prefix}${ctx.commandName} off*`,
		)
	},
}

export default command
