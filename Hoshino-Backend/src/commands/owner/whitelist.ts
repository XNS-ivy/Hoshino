import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"

const command: ICommand = {
	name: ["whitelist", "unblockuser"],
	category: "owner",
	description: "Remove user from bot blacklist",
	usage: ["whitelist @user", "unblockuser @user"],
	access: "owner",
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
				`❌ Mention user or reply to their message to whitelist!\nExample: *${ctx.prefix}whitelist @user*`,
			)
			return
		}

		await commandRepository.removeBlacklist(ctx.agentId, targetJid)
		await ctx.reply(
			`✅ User *@${targetJid.split("@")[0]}* removed from Blacklist.`,
		)
	},
}

export default command
