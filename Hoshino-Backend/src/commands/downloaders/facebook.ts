import type { CommandContext, ICommand } from "@customTypes/command"
import { downloadFacebookMedia, isValidFacebookUrl } from "@utils/facebook"
import { logger } from "@utils/logger"

const command: ICommand = {
	name: ["facebook", "fb", "fbdl", "fbdown"],
	category: "downloaders",
	description: "Download public videos, reels, and photos from Facebook",
	usage: [
		"fb <facebook link>",
		"facebook <facebook link>",
		"fbdl <facebook link>",
	],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const targetUrl = (args[0] || "").trim()

		// 1. Show Help & Usage if no link provided
		if (!targetUrl) {
			await ctx.reply(
				`📥 *Facebook Media Downloader*\n\n` +
					`💡 *Usage:*\n` +
					`• *${ctx.prefix}${ctx.commandName} <facebook link>* — Download Video, Reel, or Photo\n\n` +
					`📌 *Example:* *${ctx.prefix}fb https://www.facebook.com/watch/?v=123456789*`,
			)
			return
		}

		if (!isValidFacebookUrl(targetUrl)) {
			await ctx.reply(
				`❌ Invalid Facebook URL format.\n\nExample: *${ctx.prefix}${ctx.commandName} https://www.facebook.com/watch/?v=123456789*`,
			)
			return
		}

		// 2. Send Processing Notice
		await ctx.reply(
			"⏳ *Processing Facebook media...*\n_Please wait a moment._",
		)

		try {
			// 3. Download Facebook media (auto routed)
			const result = await downloadFacebookMedia(targetUrl)

			let caption = `🎬 *Facebook Post*\n\n`
			if (result.uploader && result.uploader !== "Facebook User") {
				caption += `👤 *Page / User:* ${result.uploader}\n`
			}
			if (result.title && result.title !== "Facebook Video") {
				caption += `💬 *Content:* ${result.title.slice(0, 150)}\n`
			}
			if (result.duration) {
				caption += `⏱️ *Duration:* ${result.duration}\n`
			}
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
					`📸 *Facebook Photos:* ${result.images.length} photo(s) found.\n\n${caption}`,
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
							"/commands/downloaders/facebook.ts",
							`Failed sending Facebook photo ${i + 1}: ${imgErr}`,
						)
					}
				}
			} else if (result.type === "video" && result.buffer) {
				// Video (MP4)
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
				"/commands/downloaders/facebook.ts",
				`Facebook download failed for "${targetUrl}": ${errMsg}`,
			)

			if (errMsg.includes("Private") || errMsg.includes("login")) {
				await ctx.reply(
					"❌ This Facebook media is private or restricted to group members.",
				)
			} else if (
				errMsg.includes("not found") ||
				errMsg.includes("does not exist")
			) {
				await ctx.reply("❌ Facebook media not found or has been removed.")
			} else {
				await ctx.reply(
					`❌ Failed to download Facebook media: ${errMsg.slice(0, 150)}`,
				)
			}
		}
	},
}

export default command
