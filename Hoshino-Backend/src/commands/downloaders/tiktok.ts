import type { CommandContext, ICommand } from "@customTypes/command"
import { logger } from "@utils/logger"
import {
	downloadTikTokMedia,
	formatTikTokCount,
	isValidTikTokUrl,
} from "@utils/tiktok"

const command: ICommand = {
	name: ["tiktok", "tt", "ttdl", "ttmp3", "ttaudio", "ttvideo"],
	category: "downloaders",
	description:
		"Download TikTok videos without watermark, audio MP3, or photo slides",
	usage: [
		"tt <tiktok-link>",
		"tiktok <tiktok-link>",
		"ttmp3 <tiktok-link>",
		"ttdl <tiktok-link>",
	],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const cmd = ctx.commandName.toLowerCase()

		// 1. Show Help & Usage if no arguments provided
		if (!args.length) {
			await ctx.reply(
				`📥 *TikTok Downloader*\n\n` +
					`💡 *Usage:*\n` +
					`• *${ctx.prefix}tt <link>* — Download TikTok video (No Watermark)\n` +
					`• *${ctx.prefix}ttmp3 <link>* — Download TikTok audio (MP3)\n` +
					`• *${ctx.prefix}ttdl <link>* — Download video or photo slides\n\n` +
					`📌 *Example:* *${ctx.prefix}tt https://vt.tiktok.com/ZS2xyz/*`,
			)
			return
		}

		// 2. Determine Mode (Video vs Audio)
		let mode: "video" | "audio" = "video"
		const filteredArgs: string[] = []

		if (cmd === "ttmp3" || cmd === "ttaudio") {
			mode = "audio"
		}

		for (const arg of args) {
			const lower = arg.toLowerCase()
			if (
				lower === "--mp3" ||
				lower === "-a" ||
				lower === "mp3" ||
				lower === "audio"
			) {
				mode = "audio"
			} else if (
				lower === "--mp4" ||
				lower === "-v" ||
				lower === "mp4" ||
				lower === "video"
			) {
				mode = "video"
			} else {
				filteredArgs.push(arg)
			}
		}

		const targetUrl = filteredArgs.join(" ").trim()
		if (!targetUrl || !isValidTikTokUrl(targetUrl)) {
			await ctx.reply(
				`❌ Please provide a valid TikTok link.\n\nExample: *${ctx.prefix}${ctx.commandName} https://vt.tiktok.com/ZS2xyz/*`,
			)
			return
		}

		// 3. Send Processing Notice
		await ctx.reply(
			`⏳ *Processing TikTok ${mode === "audio" ? "Audio (MP3)" : "Media"}...*\n_Please wait a moment._`,
		)

		try {
			// 4. Download media
			const result = await downloadTikTokMedia(targetUrl, mode)

			let caption = `🎬 *${result.title}*\n\n`
			caption += `👤 *Creator:* ${result.author.name} (@${result.author.username})\n`
			if (result.durationFormatted) {
				caption += `⏱️ *Duration:* ${result.durationFormatted}\n`
			}
			if (result.likes) {
				caption += `❤️ *Likes:* ${formatTikTokCount(result.likes)}  💬 *Comments:* ${formatTikTokCount(result.comments)}  🔁 *Shares:* ${formatTikTokCount(result.shares)}\n`
			}
			if (result.musicTitle) {
				caption += `🎵 *Music:* ${result.musicTitle}\n`
			}
			caption += `🔗 *Source:* ${result.url}`

			// 5. Send based on type
			if (result.type === "video" && result.buffer) {
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
			} else if (result.type === "audio" && result.buffer) {
				await ctx.sock.sendMessage(
					ctx.jid,
					{
						audio: result.buffer,
						mimetype: "audio/mpeg",
						ptt: false,
						fileName: result.fileName,
					},
					{ quoted: ctx.rawMsg },
				)
				await ctx.reply(caption)
			} else if (result.type === "images" && result.images?.length) {
				// Send photo slide images
				await ctx.reply(
					`📸 *TikTok Photo Slide:* ${result.images.length} photo(s) found.\n\n${caption}`,
				)

				// Send each image (cap to max 10 to avoid spamming)
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
							"/commands/downloaders/tiktok.ts",
							`Failed sending slide image ${i + 1}: ${imgErr}`,
						)
					}
				}
			}
		} catch (error) {
			const errMsg = error instanceof Error ? error.message : String(error)
			logger.error(
				"/commands/downloaders/tiktok.ts",
				`TikTok download failed for "${targetUrl}": ${errMsg}`,
			)

			if (errMsg.includes("privat") || errMsg.includes("private")) {
				await ctx.reply("❌ This TikTok video is private or has been deleted.")
			} else {
				await ctx.reply(
					`❌ Failed to download TikTok media: ${errMsg.slice(0, 150)}`,
				)
			}
		}
	},
}

export default command
