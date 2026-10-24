import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"
import { resolveUserIdentities } from "@services/contextBuilder"

const command: ICommand = {
	name: ["delete", "del", "d"],
	category: "group",
	description: "Delete a message sent by user or bot",
	usage: ["del (replying to target message)"],
	inGroup: true,
	inGroupAccess: "admin",
	textOnly: true,
	execute: async (_args: string[], ctx: CommandContext) => {
		const quoted = await ctx.getQuotedMessage()

		if (!quoted?.rawQuoted) {
			await ctx.reply(
				`❌ Reply to the message you want to delete!\nExample: *${ctx.prefix}del* (replying to target message)`,
			)
			return
		}

		try {
			const contextInfo = (
				ctx.rawMsg.message?.extendedTextMessage ||
				ctx.rawMsg.message?.imageMessage ||
				ctx.rawMsg.message?.videoMessage
			)?.contextInfo

			const targetId = contextInfo?.stanzaId || quoted.key?.id
			const targetParticipant = contextInfo?.participant || quoted.senderJid

			if (!targetId) {
				await ctx.reply("❌ Unable to extract target message ID for deletion.")
				return
			}

			const credsMe = ctx.sock.authState?.creds?.me
			const groupMeta = await ctx.getGroupMetadata()
			const botIdentities = await resolveUserIdentities(
				ctx.sock,
				[ctx.sock.user?.id, ctx.sock.user?.lid, credsMe?.id, credsMe?.lid],
				groupMeta,
				true,
			)
			const isFromMe =
				Boolean(quoted.key?.fromMe) ||
				botIdentities.includes(commandRepository.normalizeJid(quoted.senderJid))

			const { isBotAdmin } = await ctx.getSenderAdminStatus()
			if (!isFromMe && !isBotAdmin) {
				await ctx.reply(
					"❌ Bot must be a Group Admin to delete messages sent by other group members.",
				)
				return
			}

			// Delete target quoted message
			await ctx.sock.sendMessage(ctx.jid, {
				delete: {
					remoteJid: ctx.jid,
					fromMe: isFromMe,
					id: targetId,
					participant: targetParticipant,
				},
			})

			// Delete command trigger message if bot has admin rights or sender is bot itself
			if (isBotAdmin || ctx.rawMsg.key.fromMe) {
				await ctx.sock.sendMessage(ctx.jid, {
					delete: ctx.rawMsg.key,
				})
			}
		} catch (error) {
			await ctx.reply(`❌ Failed to delete message: ${error}`)
		}
	},
}

export default command
