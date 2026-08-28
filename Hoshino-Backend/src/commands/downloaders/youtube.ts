import type { CommandContext, ICommand } from "@customTypes/command"
import { logger } from "@utils/logger"
import {
	downloadYoutubeMedia,
	formatViews,
	isValidYoutubeUrl,
} from "@utils/youtube"

const command: ICommand = {
	name: ["youtube", "yt", "ytdl", "ytmp4", "ytmp3", "play"],
	category: "downloaders",
	description: "Download YouTube videos (MP4) or audio/music (MP3)",
	usage: [
		"yt <youtube-link>",
		"ytmp4 <youtube-link>",
		"ytmp3 <youtube-link>",
		"play <song title / video>",
		"yt <song title / video>",
	],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const cmd = ctx.commandName.toLowerCase()

		// 1. Show Help & Usage if no arguments provided
		if (!args.length) {
			await ctx.reply(
				`📥 *YouTube Downloader*\n\n` +
					`💡 *Usage:*\n` +
					`• *${ctx.prefix}yt <link / query>* — Download MP4 video\n` +
					`• *${ctx.prefix}ytmp4 <link / query>* — Download MP4 video\n` +
					`• *${ctx.prefix}ytmp3 <link / query>* — Download MP3 audio\n` +
					`• *${ctx.prefix}play <song title>* — Search & download MP3 audio\n\n` +
					`📌 *Example:* *${ctx.prefix}yt https://youtu.be/dQw4w9WgXcQ*\n` +
					`📌 *Example:* *${ctx.prefix}play never gonna give you up*`,
			)
			return
		}

		// 2. Determine Media Type (Video vs Audio)
		let type: "video" | "audio" = "video"
		const filteredArgs: string[] = []

		if (cmd === "ytmp3" || cmd === "play") {
			type = "audio"
		} else if (cmd === "ytmp4") {
			type = "video"
		}

		for (const arg of args) {
			const lower = arg.toLowerCase()
			if (
				lower === "--mp3" ||
				lower === "-a" ||
				lower === "mp3" ||
				lower === "audio"
			) {
				type = "audio"
			} else if (
				lower === "--mp4" ||
				lower === "-v" ||
				lower === "mp4" ||
				lower === "video"
			) {
				type = "video"
			} else {
				filteredArgs.push(arg)
			}
		}

		const query = filteredArgs.join(" ").trim()
		if (!query) {
			await ctx.reply(
				`❌ Please provide a valid YouTube link or search query.\n\nExample: *${ctx.prefix}${ctx.commandName} never gonna give you up*`,
			)
			return
		}

		const isUrl = isValidYoutubeUrl(query)
		const targetLabel = isUrl ? "URL" : `search "${query}"`

		// 3. Send Processing Notice
		await ctx.reply(
			`⏳ *Processing ${type === "video" ? "Video (MP4)" : "Audio (MP3)"} from ${targetLabel}...*\n_Please wait a moment._`,
		)

		try {
			// 4. Download media
			const result = await downloadYoutubeMedia(query, type)

			const caption =
				`🎬 *${result.meta.title}*\n\n` +
				`📺 *Channel:* ${result.meta.uploader}\n` +
				`⏱️ *Duration:* ${result.meta.duration}\n` +
				`👁️ *Views:* ${formatViews(result.meta.views)}\n` +
				`🔗 *Link:* ${result.meta.url}`

			// 5. Send via WhatsApp
			if (type === "video") {
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
			} else {
				// Send audio file
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

				// Send metadata caption info
				await ctx.reply(caption)
			}
		} catch (error) {
			const errMsg = error instanceof Error ? error.message : String(error)
			logger.error(
				"/commands/downloaders/youtube.ts",
				`YouTube download failed for "${query}": ${errMsg}`,
			)

			if (errMsg.includes("Video duration too long")) {
				await ctx.reply(`⚠️ ${errMsg}`)
			} else if (errMsg.includes("Video not found")) {
				await ctx.reply(
					"❌ YouTube video not found or is age-restricted/private.",
				)
			} else {
				await ctx.reply(
					`❌ Failed to download YouTube media: ${errMsg.slice(0, 150)}`,
				)
			}
		}
	},
}

export default command
