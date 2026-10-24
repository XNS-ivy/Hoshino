import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"
import {
	findGroupParticipant,
	resolveUserIdentities,
} from "@services/contextBuilder"

const command: ICommand = {
	name: ["kick"],
	category: "group",
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
			await ctx.reply("❌ Bot cannot kick itself!")
			return
		}

		const isTargetOwner = await commandRepository.isOwner(
			ctx.agentId,
			targetIdentities,
		)
		if (isTargetOwner) {
			await ctx.reply("❌ Cannot kick Bot Owner!")
			return
		}

		const matchedParticipant = findGroupParticipant(
			groupMeta?.participants,
			targetIdentities,
		)
		const removeJid = matchedParticipant?.id
			? commandRepository.normalizeJid(matchedParticipant.id)
			: targetJid

		try {
			await ctx.sock.groupParticipantsUpdate(ctx.jid, [removeJid], "remove")
			await ctx.reply(
				`✅ Successfully kicked *@${targetJid.split("@")[0]}* from group.`,
			)
		} catch (error) {
			await ctx.reply(`❌ Failed to kick user: ${error}`)
		}
	},
}

export default command
