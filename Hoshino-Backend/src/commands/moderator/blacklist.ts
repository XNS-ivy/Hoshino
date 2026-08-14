import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"

const command: ICommand = {
	name: ["blacklist", "blockuser"],
	category: "moderator",
	description:
		"Add user to bot blacklist (prevents user from using bot commands)",
	usage: ["blacklist @user Spammer", "blockuser @user"],
	access: "owner",
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const mentions = await ctx.getMentions()
		const quoted = await ctx.getQuotedMessage()
		let targetJid = mentions.length > 0 ? mentions[0] : null

		if (!targetJid && quoted?.senderJid) {
			targetJid = commandRepository.normalizeJid(quoted.senderJid)
		}

		if (!targetJid) {
			await ctx.reply(
				`❌ Mention user or reply to their message to blacklist!\nExample: *${ctx.prefix}blacklist @user*`,
			)
			return
		}

		const reason = args.slice(1).join(" ") || "No reason specified"
		await commandRepository.addBlacklist(ctx.agentId, targetJid, reason)
		await ctx.reply(
			`🚫 User *@${targetJid.split("@")[0]}* added to Blacklist.\nReason: _${reason}_`,
		)
	},
}

export default command
