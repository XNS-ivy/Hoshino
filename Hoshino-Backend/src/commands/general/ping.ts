import type { CommandContext, ICommand } from "@customTypes/command"

const command: ICommand = {
	name: ["ping", "p"],
	category: "general",
	description: "Cek status respon dan kecepatan bot",
	execute: async (_args: string[], ctx: CommandContext) => {
		const start = Date.now()
		const msg = await ctx.reply("🏓 Pong!")
		const latency = Date.now() - start
		if (msg.key) {
			await ctx.sock.sendMessage(ctx.jid, {
				text: `🏓 Pong!\n⚡ Respon: *${latency} ms*`,
				edit: msg.key,
			})
		}
	},
}

export default command
