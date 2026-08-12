import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"
import { commandLoader } from "@services/commandLoader"

const command: ICommand = {
	name: ["enablecmd", "disablecmd"],
	category: "group",
	description:
		"Mengaktifkan atau mematikan registrasi fitur perintah tertentu di dalam grup",
	inGroup: true,
	inGroupAccess: "admin",
	execute: async (args: string[], ctx: CommandContext) => {
		const targetCmd = (args[0] || "").toLowerCase()
		if (!targetCmd) {
			await ctx.reply(
				`❌ Gunakan format: *${ctx.prefix}${ctx.commandName} <nama_command>*\nContoh: *${ctx.prefix}enablecmd nsfw*`,
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
				`❌ Perintah *"${targetCmd}"* tidak ditemukan dalam sistem.`,
			)
			return
		}

		const primaryName =
			(Array.isArray(found.name) ? found.name[0] : found.name) || targetCmd

		const isEnable = ctx.commandName === "enablecmd"
		const newStatus = isEnable ? "enabled" : "disabled"

		await commandRepository.setGroupCommandStatus(
			ctx.agentId,
			ctx.jid,
			primaryName,
			newStatus,
		)

		if (isEnable) {
			await ctx.reply(
				`✅ Perintah *"${primaryName}"* berhasil didaftarkan & *diaktifkan* untuk grup ini.`,
			)
		} else {
			await ctx.reply(
				`🚫 Perintah *"${primaryName}"* berhasil *dinonaktifkan* untuk grup ini.`,
			)
		}
	},
}

export default command
