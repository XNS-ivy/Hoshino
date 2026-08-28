import type { CommandContext, ICommand } from "@customTypes/command"
import { logger } from "@utils/logger"
import { downloadTwitterVideo, isValidTwitterUrl } from "@utils/twitter"

const command: ICommand = {
	name: ["twitter", "tw", "twdl", "x", "xdl"],
	category: "downloaders",
	description: "Download videos from X (Twitter)",
	usage: ["tw <twitter/x link>", "x <twitter/x link>", "twdl <twitter/x link>"],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const targetUrl = (args[0] || "").trim()

		// 1. Show Help & Usage if no link provided
		if (!targetUrl) {
			await ctx.reply(
				`📥 *Twitter / X Video Downloader*\n\n` +
					`💡 *Usage:*\n` +
					`• *${ctx.prefix}${ctx.commandName} <twitter/x link>* — Download video\n\n` +
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
			"⏳ *Processing Twitter / X video...*\n_Please wait a moment._",
		)

		try {
			// 3. Download video
			const result = await downloadTwitterVideo(targetUrl)

			let caption = `🎬 *Twitter / X Video*\n\n`
			if (result.uploader) caption += `👤 *Author:* ${result.uploader}\n`
			if (result.title && result.title !== "Twitter Video") {
				caption += `💬 *Post:* ${result.title.slice(0, 150)}\n`
			}
			if (result.duration) caption += `⏱️ *Duration:* ${result.duration}\n`
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
				"/commands/downloaders/twitter.ts",
				`Twitter download failed for "${targetUrl}": ${errMsg}`,
			)

			if (errMsg.includes("No video could be found")) {
				await ctx.reply(
					"❌ No video found in this post (tweet might be text-only or photos).",
				)
			} else if (errMsg.includes("Private") || errMsg.includes("protected")) {
				await ctx.reply("❌ This post is private or requires authorization.")
			} else {
				await ctx.reply(
					`❌ Failed to download Twitter / X video: ${errMsg.slice(0, 150)}`,
				)
			}
		}
	},
}

export default command
