import type { CommandContext, ICommand } from "@customTypes/command"
import QRCode from "qrcode"

const command: ICommand = {
	name: ["qrcode", "qr"],
	category: "utility",
	description: "Generate a QR Code image from text or URL",
	usage: ["qr https://google.com", "qrcode Hello World"],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const text = args.join(" ").trim()
		if (!text) {
			await ctx.reply(
				`❌ Provide text or a URL to generate QR Code!\nExample: *${ctx.prefix}qr https://google.com*`,
			)
			return
		}

		if (text.length > 500) {
			await ctx.reply("❌ Input text is too long (Max 500 characters).")
			return
		}

		try {
			const qrBuffer = await QRCode.toBuffer(text, {
				width: 512,
				margin: 2,
				color: { dark: "#000000", light: "#ffffff" },
			})

			await ctx.sock.sendMessage(
				ctx.jid,
				{
					image: qrBuffer,
					caption: `🔳 *QR Code Generated*\n📝 *Content:* ${text.length > 60 ? `${text.slice(0, 60)}...` : text}`,
				},
				{ quoted: ctx.rawMsg },
			)
		} catch (error) {
			await ctx.reply(`❌ Failed to generate QR Code: ${error}`)
		}
	},
}

export default command
