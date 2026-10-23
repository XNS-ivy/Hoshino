import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"
import { resolveUserIdentities } from "@services/contextBuilder"

const command: ICommand = {
	name: ["disableautodelete", "delautodelete"],
	category: "group",
	description: "Remove user from auto-delete list",
	usage: ["disableautodelete @user", "delautodelete @user"],
	inGroup: true,
	inGroupAccess: "admin",
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const mentions = await ctx.getMentions()
		const quoted = await ctx.getQuotedMessage()
		let targetJid = mentions.length > 0 ? mentions[0] : null

		if (!targetJid && args[0]) {
			const cleanDigits = args[0].replace(/[^0-9]/g, "")
			if (cleanDigits.length >= 7) {
				targetJid = commandRepository.normalizeJid(
					args[0].includes("@") ? args[0] : cleanDigits,
				)
			}
		}

		if (!targetJid && quoted?.senderJid) {
			targetJid = commandRepository.normalizeJid(quoted.senderJid)
		}

		if (!targetJid) {
			await ctx.reply(
				`❌ Mention user or reply to their message to remove from auto-delete!\nExample: *${ctx.prefix}disableautodelete @user*`,
			)
			return
		}

		const groupMeta = await ctx.getGroupMetadata()
		const targetIdentities = await resolveUserIdentities(
			ctx.sock,
			[targetJid],
			groupMeta,
			true,
		)

		await commandRepository.removeAutoDelete(
			ctx.agentId,
			targetIdentities.length > 0 ? targetIdentities : targetJid,
			ctx.jid,
		)
		await ctx.reply(
			`✅ User *@${targetJid.split("@")[0]}* removed from Auto-Delete list for *this group*.`,
		)
	},
}

export default command
