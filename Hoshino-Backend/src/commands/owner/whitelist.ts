import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"
import { resolveUserIdentities } from "@services/contextBuilder"

const command: ICommand = {
	name: ["whitelist", "unblockuser"],
	category: "owner",
	description: "Remove user from bot blacklist",
	usage: ["whitelist @user", "unblockuser @user"],
	access: "owner",
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
				`❌ Mention user or reply to their message to whitelist!\nExample: *${ctx.prefix}whitelist @user*`,
			)
			return
		}

		const groupMeta = ctx.isGroup ? await ctx.getGroupMetadata() : null
		const targetIdentities = await resolveUserIdentities(
			ctx.sock,
			[targetJid],
			groupMeta,
			true,
		)

		await commandRepository.removeBlacklist(
			ctx.agentId,
			targetIdentities.length > 0 ? targetIdentities : targetJid,
		)
		await ctx.reply(
			`✅ User *@${targetJid.split("@")[0]}* removed from Blacklist.`,
		)
	},
}

export default command
