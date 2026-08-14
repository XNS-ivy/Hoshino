import type { CommandContext, ICommand } from "@customTypes/command"

const command: ICommand = {
	name: ["delete", "del"],
	category: "admin",
	description: "Delete a message by replying to it",
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

			const isFromMe = quoted.senderJid === ctx.sock.user?.id

			// Delete target quoted message
			await ctx.sock.sendMessage(ctx.jid, {
				delete: {
					remoteJid: ctx.jid,
					fromMe: isFromMe,
					id: targetId,
					participant: targetParticipant,
				},
			})

			// Delete command trigger message
			await ctx.sock.sendMessage(ctx.jid, {
				delete: ctx.rawMsg.key,
			})
		} catch (error) {
			await ctx.reply(`❌ Failed to delete message: ${error}`)
		}
	},
}

export default command
