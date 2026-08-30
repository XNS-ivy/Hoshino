import type { CommandContext, ICommand } from "@customTypes/command"
import { logger } from "@utils/logger"
import { downloadTwitterMedia, isValidTwitterUrl } from "@utils/twitter"

const command: ICommand = {
	name: ["twitter", "tw", "twdl", "x", "xdl"],
	category: "downloaders",
	description: "Download videos, photos, and GIFs from X (Twitter)",
	usage: ["tw <twitter/x link>", "x <twitter/x link>", "twdl <twitter/x link>"],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const targetUrl = (args[0] || "").trim()

		// 1. Show Help & Usage if no link provided
		if (!targetUrl) {
			await ctx.reply(
				`📥 *Twitter / X Media Downloader*\n\n` +
					`💡 *Usage:*\n` +
					`• *${ctx.prefix}${ctx.commandName} <link>* — Download Video, Photo, or GIF\n\n` +
					`📌 *Example:* *${ctx.prefix}tw https://x.com/username/status/1234567890*`,
			)
			return
		}

		if (!isValidTwitterUrl(targetUrl)) {
			await ctx.reply(
				`❌ Invalid Twitter / X URL format.\n\nExample: *${ctx.prefix}${ctx.commandName} https://x.com/user/status/1234567890*`,
			)
			return
		}

		// 2. Send Processing Notice
		await ctx.reply(
			"⏳ *Processing Twitter / X media...*\n_Please wait a moment._",
		)

		try {
			// 3. Download media (auto routed)
			const result = await downloadTwitterMedia(targetUrl)

			let caption = `🐦 *Twitter / X Post*\n\n`
			if (result.uploader) caption += `👤 *Author:* ${result.uploader}\n`
			if (result.title) {
				caption += `💬 *Content:* ${result.title.slice(0, 150)}\n`
			}
			if (result.duration) caption += `⏱️ *Duration:* ${result.duration}\n`
			caption += `🔗 *Source:* ${result.url}`

			// 4. Send based on type
			if (result.type === "image" && result.buffer) {
				// Single Photo
				await ctx.sock.sendMessage(
					ctx.jid,
					{
						image: result.buffer,
						caption,
					},
					{ quoted: ctx.rawMsg },
				)
			} else if (result.type === "images" && result.images?.length) {
				// Multi-photo album
				await ctx.reply(
					`📸 *Twitter Photos:* ${result.images.length} photo(s) found.\n\n${caption}`,
				)

				const maxImages = Math.min(result.images.length, 10)
				for (let i = 0; i < maxImages; i++) {
					const imgUrl = result.images[i]
					if (!imgUrl) continue

					try {
						const imgRes = await fetch(imgUrl)
						if (imgRes.ok) {
							const imgBuf = Buffer.from(await imgRes.arrayBuffer())
							await ctx.sock.sendMessage(ctx.jid, {
								image: imgBuf,
								caption: `Photo ${i + 1}/${result.images.length}`,
							})
						}
					} catch (imgErr) {
						logger.warn(
							"/commands/downloaders/twitter.ts",
							`Failed sending photo ${i + 1}: ${imgErr}`,
						)
					}
				}
			} else if (result.type === "gif" && result.buffer) {
				// Looping GIF
				await ctx.sock.sendMessage(
					ctx.jid,
					{
						video: result.buffer,
						caption,
						gifPlayback: true,
						mimetype: "video/mp4",
					},
					{ quoted: ctx.rawMsg },
				)
			} else if (result.type === "video" && result.buffer) {
				// Video (H.264 MP4)
				const isLarge = (result.sizeBytes || 0) > 60 * 1024 * 1024

				if (isLarge) {
					// Fallback to document mode for large video
					await ctx.sock.sendMessage(
						ctx.jid,
						{
							document: result.buffer,
							caption: `${caption}\n\n📁 _Sent as document due to large file size._`,
							mimetype: "video/mp4",
							fileName: result.fileName,
						},
						{ quoted: ctx.rawMsg },
					)
				} else {
					await ctx.sock.sendMessage(
						ctx.jid,
						{
							video: result.buffer,
							caption,
							mimetype: "video/mp4",
							fileName: result.fileName,
						},
						{ quoted: ctx.rawMsg },
					)
				}
			}
		} catch (error) {
			const errMsg = error instanceof Error ? error.message : String(error)
			logger.error(
				"/commands/downloaders/twitter.ts",
				`Twitter download failed for "${targetUrl}": ${errMsg}`,
			)

			if (errMsg.includes("Private") || errMsg.includes("protected")) {
				await ctx.reply("❌ This post is from a private/restricted account.")
			} else {
				await ctx.reply(
					`❌ Failed to download Twitter / X media: ${errMsg.slice(0, 150)}`,
				)
			}
		}
	},
}

export default command
