import type { CommandContext, ICommand } from "@customTypes/command"
import { logger } from "@utils/logger"
import { pinterest } from "btch-downloader"

interface PinterestItem {
	id: string
	title?: string
	description?: string
	pin_url?: string
	image_url: string
}

const command: ICommand = {
	name: ["pinterest", "pin", "pindl"],
	category: "downloaders",
	description:
		"Search wallpapers, fanart, or download HD images from Pinterest",
	usage: [
		"pin <keyword>",
		"pin hoshino blue archive",
		"pinterest <pinterest link>",
	],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const query = args.join(" ").trim()

		// 1. Show Help & Usage if no query provided
		if (!query) {
			await ctx.reply(
				`📌 *Pinterest Search & Downloader*\n\n` +
					`💡 *Usage:*\n` +
					`• *${ctx.prefix}pin <keyword>* — Search Pinterest wallpapers & art\n` +
					`• *${ctx.prefix}pinterest <link>* — Download image from Pinterest URL\n\n` +
					`📌 *Examples:*\n` +
					`• *${ctx.prefix}pin blue archive hoshino*\n` +
					`• *${ctx.prefix}pin anime wallpaper 4k*`,
			)
			return
		}

		// 2. Send Processing Notice
		await ctx.reply("⏳ *Searching Pinterest...*\n_Please wait a moment._")

		try {
			const res = (await pinterest(query)) as {
				status: boolean
				result?: {
					result?: {
						result?: PinterestItem[]
					}
				}
			}

			const items = res?.result?.result?.result || []
			if (!items.length) {
				await ctx.reply(`❌ No Pinterest images found for query: *"${query}"*`)
				return
			}

			// Pick top result or random from top 5 for variety on repeated searches
			const topItems = items.slice(0, 5)
			const selected =
				topItems[Math.floor(Math.random() * topItems.length)] || items[0]!

			// 3. Download Image Buffer
			const imgRes = await fetch(selected.image_url, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
				},
			})

			if (!imgRes.ok) {
				throw new Error(`Failed to download image (HTTP ${imgRes.status})`)
			}

			const imgBuf = Buffer.from(await imgRes.arrayBuffer())

			let caption = `📌 *PINTEREST IMAGE*\n\n`
			if (selected.title?.trim()) {
				caption += `💬 *Title:* ${selected.title.trim()}\n`
			}
			if (
				selected.description?.trim() &&
				selected.description !== selected.title
			) {
				caption += `📝 *Description:* ${selected.description.trim().slice(0, 100)}\n`
			}
			if (selected.pin_url) {
				caption += `🔗 *Source:* ${selected.pin_url}\n`
			}
			caption += `🔍 *Query:* ${query}`

			// 4. Send Image to WhatsApp
			await ctx.sock.sendMessage(
				ctx.jid,
				{
					image: imgBuf,
					caption,
				},
				{ quoted: ctx.rawMsg },
			)
		} catch (error) {
			logger.error(
				"/commands/downloaders/pinterest.ts",
				`Pinterest error for query "${query}": ${error}`,
			)
			await ctx.reply("❌ Failed to fetch Pinterest image. Please try again.")
		}
	},
}

export default command
