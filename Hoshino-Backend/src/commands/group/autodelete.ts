import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"
import {
	findGroupParticipant,
	getParticipantIdentities,
	resolveUserIdentities,
	setCachedGroupMetadata,
} from "@services/contextBuilder"

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
				`❌ Mention user or reply to their message to add to auto-delete!\nExample: *${ctx.prefix}autodelete @user*`,
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
			targetIdentities.length > 0 ? targetIdentities : initialCandidates,
			ctx.jid,
		)

		const displayJid = matchedParticipant?.id
			? commandRepository.normalizeJid(matchedParticipant.id)
			: targetJid
		await ctx.reply({
			text: `🗑️ User *@${displayJid.split("@")[0]}* added to Auto-Delete list for *this group*.\nBot will automatically delete all future messages from this user in this group.`,
			mentions: [displayJid],
		})
	},
}

export default command
