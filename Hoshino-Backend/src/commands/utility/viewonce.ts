import type { CommandContext, ICommand } from "@customTypes/command"
import { logger } from "@utils/logger"
import type { WAMessage } from "baileys"
import { downloadMediaMessage } from "baileys"

const command: ICommand = {
	name: ["rvo", "readviewonce", "viewonce", "vo", "unblur"],
	category: "utility",
	description: "Unwrap and reveal ViewOnce photos, videos, or voice messages",
	usage: [
		"rvo (replying to viewonce message)",
		"viewonce (replying to viewonce message)",
	],
	textOnly: true,
	execute: async (_args: string[], ctx: CommandContext) => {
		const quoted = await ctx.getQuotedMessage()

		if (!quoted) {
			await ctx.reply(
				`❌ Please reply to a ViewOnce (1x view) photo, video, or audio message!\n\nExample: Reply to the ViewOnce message and type *${ctx.prefix}rvo*`,
			)
			return
		}

		// Unwrap ViewOnce container
		const rawQuoted = quoted.message as Record<string, unknown>
		const innerMessage =
			(rawQuoted?.viewOnceMessage as { message?: Record<string, unknown> })
				?.message ||
			(rawQuoted?.viewOnceMessageV2 as { message?: Record<string, unknown> })
				?.message ||
			(
				rawQuoted?.viewOnceMessageV2Extension as {
					message?: Record<string, unknown>
				}
			)?.message ||
			rawQuoted

		const imageMsg = innerMessage?.imageMessage as
			| Record<string, unknown>
			| undefined
		const videoMsg = innerMessage?.videoMessage as
			| Record<string, unknown>
			| undefined
		const audioMsg = innerMessage?.audioMessage as
			| Record<string, unknown>
			| undefined

		const isViewOnceMedia = Boolean(
			rawQuoted?.viewOnceMessage ||
				rawQuoted?.viewOnceMessageV2 ||
				rawQuoted?.viewOnceMessageV2Extension ||
				imageMsg?.viewOnce ||
				videoMsg?.viewOnce ||
				audioMsg?.viewOnce ||
				imageMsg ||
				videoMsg ||
				audioMsg,
		)

		if (!isViewOnceMedia || (!imageMsg && !videoMsg && !audioMsg)) {
			await ctx.reply(
				"❌ The replied message does not contain a valid ViewOnce media file.",
			)
			return
		}

		// Send processing notice
		await ctx.reply(
			"🔓 *Unwrapping ViewOnce message...*\n_Please wait a moment._",
		)

		try {
			// Construct fake WAMessage to download inner media cleanly
			const fakeWAMsg = {
				key: quoted.key,
				message: innerMessage,
			} as WAMessage

			const buffer = (await downloadMediaMessage(
				fakeWAMsg,
				"buffer",
				{},
				{
					logger: { level: "silent" } as unknown as NonNullable<
						Parameters<typeof downloadMediaMessage>[3]
					>["logger"],
					reuploadRequest: ctx.sock.updateMediaMessage,
				},
			)) as Buffer

			if (!buffer || buffer.length === 0) {
				throw new Error(
					"Media stream could not be downloaded (might already be expired).",
				)
			}

			const caption =
				(
					quoted.caption ||
					(imageMsg?.caption as string) ||
					(videoMsg?.caption as string) ||
					""
				).trim() || "🔓 *ViewOnce media successfully revealed.*"

			if (imageMsg) {
				await ctx.sock.sendMessage(
					ctx.jid,
					{
						image: buffer,
						caption,
						mimetype: (imageMsg.mimetype as string) || "image/jpeg",
					},
					{ quoted: ctx.rawMsg },
				)
			} else if (videoMsg) {
				await ctx.sock.sendMessage(
					ctx.jid,
					{
						video: buffer,
						caption,
						mimetype: (videoMsg.mimetype as string) || "video/mp4",
					},
					{ quoted: ctx.rawMsg },
				)
			} else if (audioMsg) {
				await ctx.sock.sendMessage(
					ctx.jid,
					{
						audio: buffer,
						mimetype: (audioMsg.mimetype as string) || "audio/ogg",
						ptt: Boolean(audioMsg.ptt),
					},
					{ quoted: ctx.rawMsg },
				)
				await ctx.reply("🔓 *ViewOnce voice message successfully revealed.*")
			}
		} catch (error) {
			logger.error(
				"/commands/utility/viewonce.ts",
				`Failed to unwrap ViewOnce: ${error}`,
			)
			await ctx.reply(
				"❌ Failed to reveal ViewOnce message. The media stream might already be expired on WhatsApp servers.",
			)
		}
	},
}

export default command
