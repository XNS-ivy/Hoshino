import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"

const command: ICommand = {
	name: ["goodbye", "enablegoodbye", "disablegoodbye", "left"],
	category: "group",
	description:
		"Toggle or check Goodbye farewell message when members leave or are removed from this group",
	usage: [
		"goodbye on",
		"goodbye off",
		"goodbye",
		"enablegoodbye",
		"disablegoodbye",
	],
	inGroup: true,
	inGroupAccess: "admin",
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const cmd = ctx.commandName.toLowerCase()
		const action = (args[0] || "").toLowerCase()

		const shouldEnable =
			cmd === "enablegoodbye" ||
			action === "on" ||
			action === "enable" ||
			action === "1" ||
			action === "true"

		const shouldDisable =
			cmd === "disablegoodbye" ||
			action === "off" ||
			action === "disable" ||
			action === "0" ||
			action === "false"

		if (shouldEnable) {
			await commandRepository.updateGroupSettings(ctx.agentId, ctx.jid, {
				goodbyeEnabled: true,
			})
			await ctx.reply(
				"👋 *Goodbye Message: ENABLED (ON)*\n✅ Bot will now send farewell messages when members leave this group.",
			)
			return
		}

		if (shouldDisable) {
			await commandRepository.updateGroupSettings(ctx.agentId, ctx.jid, {
				goodbyeEnabled: false,
			})
			await ctx.reply(
				"🔕 *Goodbye Message: DISABLED (OFF)*\n🚫 Goodbye farewell messages are now turned off for this group.",
			)
			return
		}

		const current = await commandRepository.getGroupSettings(
			ctx.agentId,
			ctx.jid,
		)
		await ctx.reply(
			`📌 Goodbye message in this group is currently: *${current.goodbyeEnabled ? "ENABLED (ON)" : "DISABLED (OFF)"}*\n\n💡 Usage: *${ctx.prefix}${ctx.commandName} on* or *${ctx.prefix}${ctx.commandName} off*`,
		)
	},
}

export default command
