import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"

const command: ICommand = {
	name: ["enablebot", "disablebot", "bot", "listen"],
	category: "group",
	description:
		"Mengaktifkan atau mematikan fitur Bot Listening/Respon Perintah di dalam grup",
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
					`📌 Mode Bot Listening saat ini di grup ini: *${current.botEnabled ? "AKTIF (ON)" : "NONAKTIF (OFF)"}*\n\n💡 Gunakan: *${ctx.prefix}${ctx.commandName} on* atau *${ctx.prefix}${ctx.commandName} off*`,
				)
				return
			}
		}

		await commandRepository.updateGroupSettings(ctx.agentId, ctx.jid, {
			botEnabled: shouldEnable,
		})

		if (shouldEnable) {
			await ctx.reply(
				"🤖 *Bot Listening Mode: AKTIF (ON)*\n✅ Bot sekarang mendengarkan & merespon perintah di grup ini.",
			)
		} else {
			await ctx.reply(
				"🔕 *Bot Listening Mode: NONAKTIF (OFF)*\n🚫 Bot telah dihentikan dari merespon perintah di grup ini. (Gunakan *!bot on* untuk mengaktifkan kembali)",
			)
		}
	},
}

export default command
