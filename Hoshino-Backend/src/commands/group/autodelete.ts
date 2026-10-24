import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"
import { resolveUserIdentities } from "@services/contextBuilder"

const command: ICommand = {
	name: ["autodelete"],
	category: "group",
	description:
		"Add user to auto-delete list (bot auto-deletes their messages in groups)",
	usage: ["autodelete @user", "autodelete (replying to message)"],
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
				`❌ Mention user or reply to their message to add to auto-delete!\nExample: *${ctx.prefix}autodelete @user*`,
			)
			return
		}

		const groupMeta = await ctx.getGroupMetadata()
		const credsMe = ctx.sock.authState?.creds?.me
		const targetIdentities = await resolveUserIdentities(
			ctx.sock,
			[targetJid],
			groupMeta,
			true,
		)
		const botIdentities = await resolveUserIdentities(
			ctx.sock,
			[ctx.sock.user?.id, ctx.sock.user?.lid, credsMe?.id, credsMe?.lid],
			groupMeta,
			true,
		)

		if (targetIdentities.some((id) => botIdentities.includes(id))) {
			await ctx.reply("❌ Bot cannot add itself to auto-delete list!")
			return
		}

		const isOwner = await commandRepository.isOwner(
			ctx.agentId,
			targetIdentities,
		)
		if (isOwner) {
			await ctx.reply("❌ Cannot add Bot Owner to auto-delete list!")
			return
		}

		await commandRepository.addAutoDelete(
			ctx.agentId,
			targetIdentities.length > 0 ? targetIdentities : targetJid,
			ctx.jid,
		)
		await ctx.reply(
			`🗑️ User *@${targetJid.split("@")[0]}* added to Auto-Delete list for *this group*.\nBot will automatically delete all future messages from this user in this group.`,
		)
	},
}

export default command
