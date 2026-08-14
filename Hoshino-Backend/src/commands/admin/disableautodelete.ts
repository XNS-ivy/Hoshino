import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"

const command: ICommand = {
	name: ["disableautodelete", "delautodelete"],
	category: "admin",
	description: "Remove user from auto-delete list",
	usage: ["disableautodelete @user", "delautodelete @user"],
	inGroup: true,
	inGroupAccess: "admin",
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
				`❌ Mention user or reply to their message to remove from auto-delete!\nExample: *${ctx.prefix}disableautodelete @user*`,
			)
			return
		}

		await commandRepository.removeAutoDelete(ctx.agentId, targetJid)
		await ctx.reply(
			`✅ User *@${targetJid.split("@")[0]}* removed from Auto-Delete list.`,
		)
	},
}

export default command
