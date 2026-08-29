import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"

const command: ICommand = {
	name: ["autodelete"],
	category: "group",
	description:
		"Add user to auto-delete list (bot auto-deletes their messages in groups)",
	usage: ["autodelete @user", "autodelete (replying to message)"],
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
				`❌ Mention user or reply to their message to add to auto-delete!\nExample: *${ctx.prefix}autodelete @user*`,
			)
			return
		}

		await commandRepository.addAutoDelete(ctx.agentId, targetJid)
		await ctx.reply(
			`🗑️ User *@${targetJid.split("@")[0]}* added to Auto-Delete list.\nBot will automatically delete all future messages from this user in groups.`,
		)
	},
}

export default command
