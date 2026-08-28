import type { CommandContext, ICommand } from "@customTypes/command"
import { downloadFacebookVideo, isValidFacebookUrl } from "@utils/facebook"
import { logger } from "@utils/logger"

const command: ICommand = {
	name: ["facebook", "fb", "fbdl", "fbdown"],
	category: "downloaders",
	description: "Download public videos and reels from Facebook",
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
				`📥 *Facebook Video Downloader*\n\n` +
					`💡 *Usage:*\n` +
					`• *${ctx.prefix}${ctx.commandName} <facebook link>* — Download public video / reel\n\n` +
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
			"⏳ *Processing Facebook video...*\n_Please wait a moment._",
		)

		try {
			// 3. Download Facebook video
			const result = await downloadFacebookVideo(targetUrl)

			let caption = `🎬 *Facebook Video*\n\n`
			if (result.uploader && result.uploader !== "Facebook User") {
				caption += `👤 *Page / User:* ${result.uploader}\n`
			}
			if (result.title && result.title !== "Facebook Video") {
				caption += `💬 *Title:* ${result.title.slice(0, 150)}\n`
			}
			if (result.duration) {
				caption += `⏱️ *Duration:* ${result.duration}\n`
			}
			caption += `🔗 *Source:* ${result.url}`

			// 4. Send via WhatsApp
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
		} catch (error) {
			const errMsg = error instanceof Error ? error.message : String(error)
			logger.error(
				"/commands/downloaders/facebook.ts",
				`Facebook download failed for "${targetUrl}": ${errMsg}`,
			)

			if (errMsg.includes("Private") || errMsg.includes("login")) {
				await ctx.reply(
					"❌ This Facebook video is private or restricted to group members.",
				)
			} else if (
				errMsg.includes("not found") ||
				errMsg.includes("does not exist")
			) {
				await ctx.reply("❌ Facebook video not found or has been removed.")
			} else {
				await ctx.reply(
					`❌ Failed to download Facebook video: ${errMsg.slice(0, 150)}`,
				)
			}
		}
	},
}

export default command
