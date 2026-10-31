import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"
import {
	findGroupParticipant,
	getParticipantIdentities,
	resolveUserIdentities,
} from "@services/contextBuilder"

const command: ICommand = {
	name: ["disableautodelete", "delautodelete"],
	category: "group",
	description: "Remove user from auto-delete list",
	usage: ["disableautodelete @user", "delautodelete @user"],
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
				`❌ Mention user or reply to their message to remove from auto-delete!\nExample: *${ctx.prefix}disableautodelete @user*`,
			)
			return
		}

		const groupMeta = await ctx.getGroupMetadata()
		const targetDigits = targetJid.split("@")[0]?.replace(/[^0-9]/g, "") || ""
		const initialCandidates = [
			targetJid,
			...(targetDigits.length >= 6
				? [`${targetDigits}@lid`, `${targetDigits}@s.whatsapp.net`]
				: []),
		]

		const targetIdentities = await resolveUserIdentities(
			ctx.sock,
			initialCandidates,
			groupMeta,
			true,
		)
		const matchedParticipant = findGroupParticipant(
			groupMeta?.participants,
			targetIdentities,
		)
		if (matchedParticipant) {
			for (const pid of getParticipantIdentities(matchedParticipant)) {
				if (!targetIdentities.includes(pid)) {
					targetIdentities.push(pid)
				}
			}
		}

		await commandRepository.removeAutoDelete(
			ctx.agentId,
			targetIdentities.length > 0 ? targetIdentities : initialCandidates,
			ctx.jid,
		)
		const displayJid = matchedParticipant?.id
			? commandRepository.normalizeJid(matchedParticipant.id)
			: targetJid
		await ctx.reply({
			text: `✅ User *@${displayJid.split("@")[0]}* removed from Auto-Delete list for *this group*.`,
			mentions: [displayJid],
		})
	},
}

export default command
