import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"

const command: ICommand = {
	name: ["kick"],
	category: "admin",
	description: "Kick target user from group chat",
	usage: ["kick @user", "kick (replying to message)"],
	inGroup: true,
	inGroupAccess: "admin",
	botAdminRequired: true,
	textOnly: true,
	execute: async (_args: string[], ctx: CommandContext) => {
		const mentions = await ctx.getMentions()
		const quoted = await ctx.getQuotedMessage()
		let targetJid = mentions.length > 0 ? mentions[0] : null

		if (!targetJid && quoted?.senderJid) {
			targetJid = commandRepository.normalizeJid(quoted.senderJid)
		}

		if (!targetJid) {
			await ctx.reply(
				`❌ Mention user or reply to their message to kick!\nExample: *${ctx.prefix}kick @user*`,
			)
			return
		}

		const botJid = commandRepository.normalizeJid(
			ctx.sock.user?.id || ctx.sock.user?.lid || "",
		)

		if (targetJid === botJid) {
			await ctx.reply("❌ Bot cannot kick itself!")
			return
		}

		try {
			await ctx.sock.groupParticipantsUpdate(ctx.jid, [targetJid], "remove")
			await ctx.reply(
				`✅ Successfully kicked *@${targetJid.split("@")[0]}* from group.`,
			)
		} catch (error) {
			await ctx.reply(`❌ Failed to kick user: ${error}`)
		}
	},
}

export default command
