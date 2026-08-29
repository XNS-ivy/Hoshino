import type { CommandContext, ICommand } from "@customTypes/command"
import { logger } from "@utils/logger"
import sharp from "sharp"

interface TraceMoeResult {
	anilist: {
		id: number
		idMal?: number
		title: {
			native?: string
			romaji?: string
			english?: string
		}
		isAdult?: boolean
	}
	filename: string
	episode?: number | string
	from: number
	to: number
	similarity: number
	video: string
	image: string
}

function formatSeconds(sec: number): string {
	const mins = Math.floor(sec / 60)
	const secs = Math.floor(sec % 60)
	return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
}

const command: ICommand = {
	name: ["whatanime", "sauce", "traceanime", "animename"],
	category: "utility",
	description:
		"Identify anime title, episode, and timestamp from a photo or sticker",
	usage: [
		"sauce (replying to anime image/sticker)",
		"whatanime (replying to anime image/sticker)",
	],
	textOnly: true,
	execute: async (_args: string[], ctx: CommandContext) => {
		const quoted = await ctx.getQuotedMessage()
		const quotedBuffer = quoted?.getMediaBuffer
			? await quoted.getMediaBuffer()
			: null
		const rawBuffer = (await ctx.getMediaBuffer()) || quotedBuffer

		if (!rawBuffer) {
			await ctx.reply(
				`🔍 *Anime Scene Finder (Trace.moe)*\n\n` +
					`💡 *Usage:*\n` +
					`Send or reply to an anime screenshot/sticker and type *${ctx.prefix}${ctx.commandName}*\n\n` +
					`Bot will identify the Anime Title, Episode, and exact Timestamp!`,
			)
			return
		}

		await ctx.reply(
			"🔍 *Searching anime database...*\n_Analyzing frame with Trace.moe, please wait a moment._",
		)

		try {
			// Convert image/sticker to standard JPEG for Trace.moe
			const jpegBuffer = await sharp(rawBuffer)
				.resize({ width: 640, fit: "inside", withoutEnlargement: true })
				.jpeg({ quality: 85 })
				.toBuffer()

			const traceRes = await fetch(
				"https://api.trace.moe/search?anilistInfo&cutBorders",
				{
					method: "POST",
					headers: {
						"Content-Type": "image/jpeg",
					},
					body: jpegBuffer,
				},
			)

			if (!traceRes.ok) {
				throw new Error(`Trace.moe API error: ${traceRes.status}`)
			}

			const json = (await traceRes.json()) as {
				frameCount: number
				error: string
				result?: TraceMoeResult[]
			}

			const results = json.result || []
			if (!results.length) {
				await ctx.reply("❌ No matching anime scene found in database.")
				return
			}

			const best = results[0]!
			const similarityPct = (best.similarity * 100).toFixed(1)
			const romajiTitle =
				best.anilist?.title?.romaji ||
				best.anilist?.title?.english ||
				"Unknown Title"
			const nativeTitle = best.anilist?.title?.native

			let caption = `🎬 *ANIME SCENE MATCH (${similarityPct}%)*\n`
			caption += `───────────────────────────\n`
			caption += `📺 *Title:* ${romajiTitle}\n`
			if (nativeTitle && nativeTitle !== romajiTitle) {
				caption += `🇯🇵 *Japanese:* ${nativeTitle}\n`
			}
			if (best.episode !== undefined && best.episode !== null) {
				caption += `🎞️ *Episode:* ${best.episode}\n`
			}
			caption += `⏱️ *Timestamp:* ${formatSeconds(best.from)} - ${formatSeconds(best.to)}\n`
			if (best.anilist?.isAdult) {
				caption += `🔞 *Rating:* 18+ (Adult / R18)\n`
			}
			if (best.anilist?.idMal) {
				caption += `🔗 *MyAnimeList:* https://myanimelist.net/anime/${best.anilist.idMal}\n`
			}

			// Send with preview image from Trace.moe
			if (best.image) {
				try {
					const previewFetch = await fetch(best.image)
					if (previewFetch.ok) {
						const previewBuf = Buffer.from(await previewFetch.arrayBuffer())
						await ctx.sock.sendMessage(
							ctx.jid,
							{
								image: previewBuf,
								caption,
							},
							{ quoted: ctx.rawMsg },
						)
						return
					}
				} catch {}
			}

			await ctx.reply(caption)
		} catch (error) {
			logger.error(
				"/commands/utility/whatanime.ts",
				`Anime trace error: ${error}`,
			)
			await ctx.reply(
				"❌ Failed to trace anime scene. The image might be too blurry, heavily cropped, or not from an anime.",
			)
		}
	},
}

export default command
