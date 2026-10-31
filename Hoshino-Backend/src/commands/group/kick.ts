import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"
import {
	findGroupParticipant,
	getParticipantIdentities,
	resolveUserIdentities,
	setCachedGroupMetadata,
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
	execute: async (args: string[], ctx: CommandContext) => {
		const mentions = (await ctx.getMentions()).filter(Boolean)
		const quoted = await ctx.getQuotedMessage()
		let targetJid = mentions.length > 0 ? mentions[0] : null

		if (!targetJid && args.length > 0) {
			for (const arg of args) {
				const cleanDigits = arg.replace(/[^0-9]/g, "")
				if (cleanDigits.length >= 6 && cleanDigits.length <= 16) {
					const candidate = commandRepository.normalizeJid(
						arg.includes("@") ? arg : cleanDigits,
					)
					if (candidate && !candidate.endsWith("@g.us")) {
						targetJid = candidate
						break
					}
				}
			}
		}

		if (!targetJid && quoted?.senderJid) {
			targetJid = commandRepository.normalizeJid(quoted.senderJid)
		}

		if (!targetJid) {
			await ctx.reply(
				`❌ Mention user or reply to their message to kick!\nExample: *${ctx.prefix}kick @user*`,
			)
			return
		}

		let groupMeta = await ctx.getGroupMetadata()
		const credsMe = ctx.sock.authState?.creds?.me
		const targetDigits = targetJid.split("@")[0]?.replace(/[^0-9]/g, "") || ""
		const initialCandidates = [
			targetJid,
			...(targetDigits.length >= 6
				? [`${targetDigits}@lid`, `${targetDigits}@s.whatsapp.net`]
				: []),
		]

		let targetIdentities = await resolveUserIdentities(
			ctx.sock,
			initialCandidates,
			groupMeta,
			true,
		)
		let matchedParticipant = findGroupParticipant(
			groupMeta?.participants,
			targetIdentities,
		)

		// If participant not found in cached group metadata, fetch fresh group metadata
		if (!matchedParticipant) {
			try {
				const freshMeta = await ctx.sock.groupMetadata(ctx.jid)
				if (freshMeta) {
					setCachedGroupMetadata(ctx.jid, freshMeta, ctx.sock)
					groupMeta = freshMeta
					targetIdentities = await resolveUserIdentities(
						ctx.sock,
						initialCandidates,
						groupMeta,
						true,
					)
					matchedParticipant = findGroupParticipant(
						groupMeta.participants,
						targetIdentities,
					)
				}
			} catch {}
		}

		if (matchedParticipant) {
			for (const pid of getParticipantIdentities(matchedParticipant)) {
				if (!targetIdentities.includes(pid)) {
					targetIdentities.push(pid)
				}
			}
		}

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

		const removeJid = matchedParticipant?.id
			? commandRepository.normalizeJid(matchedParticipant.id)
			: targetIdentities.find((id) => id.endsWith("@lid")) || targetJid

		try {
			await ctx.sock.groupParticipantsUpdate(ctx.jid, [removeJid], "remove")
			await ctx.reply({
				text: `✅ Successfully kicked *@${removeJid.split("@")[0]}* from group.`,
				mentions: [removeJid],
			})
		} catch (error) {
			// Fallback: if removeJid used @s.whatsapp.net and failed, try @lid (or vice versa)
			const altJid = removeJid.endsWith("@lid")
				? targetIdentities.find((id) => id.endsWith("@s.whatsapp.net"))
				: targetIdentities.find((id) => id.endsWith("@lid"))
			if (altJid && altJid !== removeJid) {
				try {
					await ctx.sock.groupParticipantsUpdate(ctx.jid, [altJid], "remove")
					await ctx.reply({
						text: `✅ Successfully kicked *@${altJid.split("@")[0]}* from group.`,
						mentions: [altJid],
					})
					return
				} catch {}
			}
			await ctx.reply(`❌ Failed to kick user: ${error}`)
		}
	},
}

export default command
