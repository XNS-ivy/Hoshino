import type { CommandContext, ICommand } from "@customTypes/command"
import { logger } from "@utils/logger"

const command: ICommand = {
	name: ["ping", "p"],
	category: "general",
	description: "Check bot response speed and status",
	textOnly: true,
	execute: async (_args: string[], ctx: CommandContext) => {
		logger.info(
			"/commands/general/ping.ts",
			`[CMD-EXEC] Executing ping command for ${ctx.senderJid} in ${ctx.jid}`,
		)
		const start = Date.now()
		const msg = await ctx.reply("🏓 Pong!")
		const latency = Date.now() - start
		if (msg.key) {
			await ctx.sock.sendMessage(ctx.jid, {
				text: `🏓 Pong!\n⚡ Response Time: *${latency} ms*`,
				edit: msg.key,
			})
		}
	},
}

export default command
