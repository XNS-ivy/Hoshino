import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"
import { resolveUserIdentities } from "@services/contextBuilder"

const command: ICommand = {
	name: ["blacklist", "blockuser"],
	category: "owner",
	description:
		"Add user to bot blacklist (prevents user from using bot commands)",
	usage: ["blacklist @user Spammer", "blockuser @user"],
	access: "owner",
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const mentions = await ctx.getMentions()
		const quoted = await ctx.getQuotedMessage()
		let targetJid = mentions.length > 0 ? mentions[0] : null
		let usedFirstArgAsTarget = mentions.length > 0

		if (!targetJid && args[0]) {
			const cleanDigits = args[0].replace(/[^0-9]/g, "")
			if (cleanDigits.length >= 7) {
				targetJid = commandRepository.normalizeJid(
					args[0].includes("@") ? args[0] : cleanDigits,
				)
				usedFirstArgAsTarget = true
			}
		}

		if (!targetJid && quoted?.senderJid) {
			targetJid = commandRepository.normalizeJid(quoted.senderJid)
		}

		if (!targetJid) {
			await ctx.reply(
				`❌ Mention user or reply to their message to blacklist!\nExample: *${ctx.prefix}blacklist @user*`,
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
		const botIdentities = await resolveUserIdentities(
			ctx.sock,
			[ctx.sock.user?.id, ctx.sock.user?.lid],
			groupMeta,
			false,
		)

		if (targetIdentities.some((id) => botIdentities.includes(id))) {
			await ctx.reply("❌ Bot cannot blacklist itself!")
			return
		}

		const isTargetOwner = await commandRepository.isOwner(
			ctx.agentId,
			targetIdentities,
		)
		if (isTargetOwner) {
			await ctx.reply("❌ Cannot blacklist a Bot Owner!")
			return
		}

		const reasonArgs = usedFirstArgAsTarget ? args.slice(1) : args
		const reason = reasonArgs.join(" ").trim() || "No reason specified"
		await commandRepository.addBlacklist(
			ctx.agentId,
			targetIdentities.length > 0 ? targetIdentities : targetJid,
			reason,
		)
		await ctx.reply(
			`🚫 User *@${targetJid.split("@")[0]}* added to Blacklist.\nReason: _${reason}_`,
		)
	},
}

export default command
