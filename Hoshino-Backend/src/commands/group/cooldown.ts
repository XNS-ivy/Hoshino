import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"
import { CommandLoader } from "@services/commandLoader"

const command: ICommand = {
	name: ["cooldown", "antispam"],
	category: "group",
	description:
		"Check or configure group command cooldown, quota, and anti-spam limits",
	usage: [
		"cooldown",
		"cooldown on",
		"cooldown off",
		"cooldown set <quota> <minutes>",
		"cooldown default",
		"cooldown reset [@user]",
	],
	inGroup: true,
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const action = (args[0] || "").toLowerCase()
		const groupSettings = await commandRepository.getGroupSettings(
			ctx.agentId,
			ctx.jid,
		)
		const commandLoader = CommandLoader.getInstance()
		const agent = await commandLoader.getAgentCooldownConfig(ctx.agentId)

		// Effective values
		const isEnabled =
			groupSettings.cooldownEnabled !== undefined
				? groupSettings.cooldownEnabled
				: (agent?.cooldownEnabled ?? true)
		const quota =
			groupSettings.cooldownQuota || agent?.cooldownQuota || 3
		const windowMinutes =
			groupSettings.cooldownWindowMinutes || agent?.cooldownWindowMinutes || 5
		const warningThreshold = agent?.cooldownWarningThreshold ?? 5
		const blacklistThreshold = agent?.cooldownBlacklistThreshold ?? 5

		// 1. Status view (accessible by all group members)
		if (!action || action === "status" || action === "info") {
			const status = commandLoader.getRateLimitStatus(
				ctx.agentId,
				ctx.jid,
				ctx.senderJid,
				windowMinutes,
			)

			const isOwnerOrMaster = await ctx.getOwnerRole()
			const roleBypass = isOwnerOrMaster ? " *(Bypass Cooldown)*" : ""

			await ctx.reply(
				`🛡️ *Pengaturan Cooldown & Anti-Spam Grup*\n\n` +
					`• *Status:* ${isEnabled ? "✅ AKTIF (ON)" : "❌ NONAKTIF (OFF)"}\n` +
					`• *Kuota Perintah:* ${quota} perintah / ${windowMinutes} menit\n` +
					`• *Batas Peringatan:* ${warningThreshold} perintah / ${windowMinutes} menit\n` +
					`• *Batas Blacklist:* > ${blacklistThreshold} perintah / ${windowMinutes} menit\n\n` +
					`📊 *Status Kuota Kamu:*${roleBypass}\n` +
					`• Terpakai: *${status.count}/${quota}* perintah dalam kurun ${windowMinutes} menit terakhir\n\n` +
					`💡 *Panduan Admin:*\n` +
					`• \`${ctx.prefix}cooldown on\` - Aktifkan cooldown grup\n` +
					`• \`${ctx.prefix}cooldown off\` - Matikan cooldown grup\n` +
					`• \`${ctx.prefix}cooldown set <kuota> <menit>\` - Atur kuota grup\n` +
					`• \`${ctx.prefix}cooldown default\` - Kembalikan ke default bot\n` +
					`• \`${ctx.prefix}cooldown reset [@user]\` - Reset timer cooldown`,
			)
			return
		}

		// All following actions require Group Admin or Bot Owner permission
		const isOwnerOrMaster = await ctx.getOwnerRole()
		const { isAdmin } = await ctx.getSenderAdminStatus()
		if (!isAdmin && !isOwnerOrMaster) {
			await ctx.reply(
				"❌ Tindakan ini hanya boleh dijalankan oleh Admin Grup atau Owner Bot.",
			)
			return
		}

		// 2. Toggle ON
		if (action === "on" || action === "enable" || action === "1") {
			await commandRepository.updateGroupSettings(ctx.agentId, ctx.jid, {
				cooldownEnabled: true,
			})
			await ctx.reply(
				`✅ *Cooldown Grup Diaktifkan (ON)*\nSetiap anggota grup kini memiliki kuota *${quota} perintah per ${windowMinutes} menit*.`,
			)
			return
		}

		// 3. Toggle OFF
		if (action === "off" || action === "disable" || action === "0") {
			await commandRepository.updateGroupSettings(ctx.agentId, ctx.jid, {
				cooldownEnabled: false,
			})
			await ctx.reply(
				"🔕 *Cooldown Grup Dinonaktifkan (OFF)*\nPerintah di grup ini tidak lagi dibatasi oleh kuota anti-spam.",
			)
			return
		}

		// 4. Set custom quota and window
		if (action === "set") {
			const newQuota = Number.parseInt(args[1] || "", 10)
			const newMinutes = Number.parseInt(args[2] || "", 10)

			if (
				Number.isNaN(newQuota) ||
				Number.isNaN(newMinutes) ||
				newQuota < 1 ||
				newMinutes < 1 ||
				newQuota > 100 ||
				newMinutes > 1440
			) {
				await ctx.reply(
					`❌ Format salah!\nContoh penggunaan: *${ctx.prefix}cooldown set 5 10*\n(Memberi kuota 5 perintah per 10 menit)`,
				)
				return
			}

			await commandRepository.updateGroupSettings(ctx.agentId, ctx.jid, {
				cooldownQuota: newQuota,
				cooldownWindowMinutes: newMinutes,
				cooldownEnabled: true,
			})
			await ctx.reply(
				`⚙️ *Cooldown Grup Berhasil Diubah!*\n\n• Kuota: *${newQuota} perintah*\n• Durasi: *${newMinutes} menit*`,
			)
			return
		}

		// 5. Reset to default
		if (action === "default" || action === "resetdefault") {
			await commandRepository.updateGroupSettings(ctx.agentId, ctx.jid, {
				cooldownQuota: null,
				cooldownWindowMinutes: null,
				cooldownEnabled: true,
			})
			const defQuota = agent?.cooldownQuota ?? 3
			const defMinutes = agent?.cooldownWindowMinutes ?? 5
			await ctx.reply(
				`🔄 *Cooldown Grup Dikembalikan ke Default Bot*\n• Kuota: *${defQuota} perintah / ${defMinutes} menit*`,
			)
			return
		}

		// 6. Reset user cooldown
		if (action === "reset") {
			const mentions = (await ctx.getMentions()).filter(Boolean)
			const quoted = await ctx.getQuotedMessage()
			let targetJid = mentions.length > 0 ? mentions[0] : null

			if (!targetJid && args[1]) {
				const cleanDigits = args[1].replace(/[^0-9]/g, "")
				if (cleanDigits.length >= 6 && cleanDigits.length <= 16) {
					targetJid = `${cleanDigits}@s.whatsapp.net`
				}
			}

			if (!targetJid && quoted?.senderJid) {
				targetJid = quoted.senderJid
			}

			if (!targetJid) {
				targetJid = ctx.senderJid
			}

			commandLoader.resetUserRateLimit(ctx.agentId, ctx.jid, targetJid)
			const displayTarget = targetJid.replace(/[@a-z.]/g, "")
			await ctx.reply(
				`✅ Cooldown dan riwayat kuota untuk *+${displayTarget}* di grup ini telah di-reset!`,
			)
			return
		}

		await ctx.reply(
			`💡 Panduan penggunaan *${ctx.prefix}cooldown*:\n` +
				`• \`${ctx.prefix}cooldown\` (cek status)\n` +
				`• \`${ctx.prefix}cooldown on / off\` (aktifkan / matikan)\n` +
				`• \`${ctx.prefix}cooldown set 3 5\` (atur kuota 3 cmd / 5 menit)\n` +
				`• \`${ctx.prefix}cooldown reset @user\` (reset cooldown user)`,
		)
	},
}

export default command

