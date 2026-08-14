import type { CommandContext, ICommand } from "@customTypes/command"
import {
	makeAnimatedSticker,
	makeSticker,
	parseStickerOptions,
} from "@utils/sticker"
import { downloadMediaMessage, type proto, type WAMessage } from "baileys"

const command: ICommand = {
	name: ["sticker", "s", "stiker"],
	category: "utility",
	description: "Convert photo/image/video/GIF into a WhatsApp sticker",
	usage: [
		"sticker",
		"sticker crop",
		"sticker crop hq",
		"sticker cover",
		"sticker fps15 5s",
		"sticker PackName | AuthorName",
	],
	allowedMediaTypes: ["image", "video", "document", "text"],
	execute: async (args: string[], ctx: CommandContext) => {
		try {
			const quoted = await ctx.getQuotedMessage()
			let targetMsg:
				| WAMessage
				| { key: WAMessage["key"]; message: WAMessage["message"] }
				| null = null
			let isAnimated = false

			if (ctx.messageType === "image") {
				targetMsg = ctx.rawMsg
			} else if (ctx.messageType === "video") {
				targetMsg = ctx.rawMsg
				isAnimated = true
			} else if (ctx.messageType === "document") {
				const doc = ctx.rawMsg.message?.documentMessage
				const mime = doc?.mimetype || ""
				if (mime.startsWith("video/") || mime === "image/gif") {
					isAnimated = true
				}
				targetMsg = ctx.rawMsg
			} else if (quoted?.rawQuoted) {
				targetMsg = {
					key: quoted.key,
					message: quoted.rawQuoted as proto.IMessage,
				}
				if (quoted.message?.videoMessage) {
					isAnimated = true
				}
				if (quoted.message?.documentMessage) {
					const doc = quoted.message.documentMessage
					const mime = doc?.mimetype || ""
					if (mime.startsWith("video/") || mime === "image/gif") {
						isAnimated = true
					}
				}
			}

			if (!targetMsg) {
				await ctx.reply(
					`❌ Send or reply to an image/video/GIF with *${ctx.prefix}sticker* to convert it into a sticker!\n\n💡 *Available Options:*\n• *crop* - Crop into a 1:1 square\n• *hq / lq* - High quality / Low quality\n• *cover / fill / contain* - Image fit mode\n• *fps8 / fps12 / fps15 / fps24* - Animated frame rate\n• *3s / 5s / 8s* - Max animation duration\n• *PackName | AuthorName* - Custom EXIF Metadata`,
				)
				return
			}

			const mediaBuffer = (await downloadMediaMessage(
				targetMsg,
				"buffer",
				{},
				{
					logger: { level: "silent" } as unknown as NonNullable<
						Parameters<typeof downloadMediaMessage>[3]
					>["logger"],
					reuploadRequest: ctx.sock.updateMediaMessage,
				},
			)) as Buffer

			if (!mediaBuffer || mediaBuffer.length === 0) {
				await ctx.reply("❌ Failed to download media buffer from message.")
				return
			}

			const stickerOpt = parseStickerOptions(args)

			const stickerBuffer = isAnimated
				? await makeAnimatedSticker(mediaBuffer, stickerOpt)
				: await makeSticker(mediaBuffer, stickerOpt)

			if (!stickerBuffer || stickerBuffer.length === 0) {
				await ctx.reply("❌ Failed to generate sticker WebP buffer.")
				return
			}

			await ctx.sock.sendMessage(
				ctx.jid,
				{ sticker: stickerBuffer },
				{ quoted: ctx.rawMsg },
			)
		} catch (error) {
			await ctx.reply(`❌ Failed to create sticker: ${error}`)
		}
	},
}

export default command
