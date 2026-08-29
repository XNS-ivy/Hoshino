import type { CommandContext, ICommand } from "@customTypes/command"
import { logger } from "@utils/logger"
import sharp from "sharp"

const command: ICommand = {
	name: ["toimg", "tovideo", "tomp4", "togif"],
	category: "utility",
	description: "Convert a WhatsApp sticker into a regular JPG/PNG image file",
	usage: ["toimg (replying to sticker)", "tovideo (replying to sticker)"],
	textOnly: true,
	execute: async (_args: string[], ctx: CommandContext) => {
		const quoted = await ctx.getQuotedMessage()

		if (!quoted) {
			await ctx.reply(
				`❌ Please reply to a sticker that you want to convert to an image!\n\nExample: Reply to a sticker and type *${ctx.prefix}toimg*`,
			)
			return
		}

		const quotedMsg = quoted.message as Record<string, unknown>
		const isSticker = Boolean(
			quotedMsg?.stickerMessage ||
				(
					quotedMsg?.extendedTextMessage as {
						contextInfo?: { quotedMessage?: { stickerMessage?: unknown } }
					}
				)?.contextInfo?.quotedMessage?.stickerMessage,
		)

		if (!isSticker) {
			await ctx.reply(
				"❌ The replied message is not a sticker. Please reply to a WhatsApp sticker.",
			)
			return
		}

		// Download sticker media buffer
		const stickerBuffer = quoted.getMediaBuffer
			? await quoted.getMediaBuffer()
			: null
		if (!stickerBuffer || stickerBuffer.length === 0) {
			await ctx.reply("❌ Failed to download sticker file. Please try again.")
			return
		}

		await ctx.reply("⏳ *Converting sticker to image...*")

		try {
			// Convert WebP sticker to high-res PNG image
			const pngBuffer = await sharp(stickerBuffer).png().toBuffer()

			await ctx.sock.sendMessage(
				ctx.jid,
				{
					image: pngBuffer,
					caption: "🖼️ *Sticker converted to image successfully.*",
					mimetype: "image/png",
				},
				{ quoted: ctx.rawMsg },
			)
		} catch (error) {
			logger.error(
				"/commands/utility/toimg.ts",
				`Sticker conversion error: ${error}`,
			)
			await ctx.reply(
				"❌ Failed to convert sticker. The sticker format might be unsupported.",
			)
		}
	},
}

export default command
