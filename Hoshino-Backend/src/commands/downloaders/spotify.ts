import type { CommandContext, ICommand } from "@customTypes/command"
import { logger } from "@utils/logger"
import { spotify } from "btch-downloader"

const SPOTIFY_REGEX =
	/^(https?:\/\/)?(open\.spotify\.com\/track\/[a-zA-Z0-9]+|spotify\.link\/[a-zA-Z0-9]+)/i

function sanitizeFileName(name: string): string {
	return name
		.replace(/[\\/:*?"<>|]+/g, "")
		.trim()
		.slice(0, 80)
}

function formatDuration(seconds?: number): string {
	if (!seconds || Number.isNaN(seconds)) return "Unknown"
	const mins = Math.floor(seconds / 60)
	const secs = seconds % 60
	return `${mins}:${secs.toString().padStart(2, "0")}`
}

const command: ICommand = {
	name: ["spotify", "sp", "spdl"],
	category: "downloaders",
	description: "Download music tracks from Spotify into high-quality MP3",
	usage: ["spotify <spotify link>", "sp <spotify link>", "spdl <spotify link>"],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const targetUrl = (args[0] || "").trim()

		// 1. Show Help & Usage if no link provided
		if (!targetUrl) {
			await ctx.reply(
				`🎵 *Spotify Music Downloader*\n\n` +
					`💡 *Usage:*\n` +
					`• *${ctx.prefix}${ctx.commandName} <spotify track link>* — Download track as MP3\n\n` +
					`📌 *Example:*\n` +
					`*${ctx.prefix}sp https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6*`,
			)
			return
		}

		if (!SPOTIFY_REGEX.test(targetUrl)) {
			await ctx.reply(
				`❌ Please provide a valid Spotify track URL.\n\nExample: *${ctx.prefix}${ctx.commandName} https://open.spotify.com/track/...*`,
			)
			return
		}

		// 2. Send Processing Notice
		await ctx.reply(
			"⏳ *Processing Spotify track...*\n_Downloading high-quality audio, please wait a moment._",
		)

		try {
			const res = (await spotify(targetUrl)) as {
				status: boolean
				result?: {
					title: string
					thumbnail?: string
					duration?: number
					formats?: { url: string }[]
				}
			}

			const directUrl = res?.result?.formats?.[0]?.url
			if (!res.status || !res.result || !directUrl) {
				throw new Error(
					"Could not retrieve audio download stream from Spotify.",
				)
			}

			const trackTitle = res.result.title || "Spotify Track"
			const safeName = sanitizeFileName(trackTitle) || "spotify_track"

			// 3. Download MP3 Audio Buffer
			const audioFetch = await fetch(directUrl, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
				},
			})

			if (!audioFetch.ok) {
				throw new Error(
					`Failed to download audio stream (HTTP ${audioFetch.status})`,
				)
			}

			const audioBuf = Buffer.from(await audioFetch.arrayBuffer())

			let caption = `🎵 *${trackTitle}*\n\n`
			if (res.result.duration) {
				caption += `⏱️ *Duration:* ${formatDuration(res.result.duration)}\n`
			}
			caption += `🔗 *Source:* ${targetUrl}`

			// 4. Send MP3 Audio to WhatsApp
			await ctx.sock.sendMessage(
				ctx.jid,
				{
					audio: audioBuf,
					mimetype: "audio/mpeg",
					ptt: false,
					fileName: `${safeName}.mp3`,
				},
				{ quoted: ctx.rawMsg },
			)

			await ctx.reply(caption)
		} catch (error) {
			logger.error(
				"/commands/downloaders/spotify.ts",
				`Spotify error for "${targetUrl}": ${error}`,
			)
			await ctx.reply(
				"❌ Failed to download Spotify track. Track might be unavailable or restricted.",
			)
		}
	},
}

export default command
