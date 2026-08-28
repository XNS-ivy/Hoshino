import type { CommandContext, ICommand } from "@customTypes/command"
import { logger } from "@utils/logger"
import {
	buildWaifuCaption,
	downloadAndConvertImage,
	getImageUrl,
	getRandomWaifu,
	NSFW_TAGS,
	nekos,
	resolveTag,
	SFW_TAGS,
	type TagNames,
	type WaifuImage,
} from "@utils/waifu"

const command: ICommand = {
	name: ["sfw", "waifuimages", "waifusfw", "waifu", "waifupict"],
	category: "waifuImages",
	description: "Get random SFW anime waifu images from NekosAPI",
	usage: ["sfw", "sfw catgirl", "sfw maid", "sfw tags", "sfw id 8001", "waifu"],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const sub = args[0]?.toLowerCase()

		// 1. Tag List & Help
		if (sub === "tags" || sub === "tag" || sub === "help" || sub === "list") {
			const tagList = SFW_TAGS.map((t) => `• \`${t}\``).join("\n")
			await ctx.reply(
				`🌸 *Available SFW Waifu Tags*\n\n${tagList}\n\n💡 *Example:* *${ctx.prefix}${ctx.commandName} catgirl*\n💡 *By ID:* *${ctx.prefix}${ctx.commandName} id 8001*`,
			)
			return
		}

		// 2. Redirect NSFW requests to nsfw command
		if (sub === "nsfw") {
			const nsfwTarget = args.slice(1).join(" ").trim()
			await ctx.reply(
				`🔞 *Command ini khusus untuk gambar SFW (Safe For Work).*\nUntuk melihat konten NSFW, silakan gunakan command:\n*${ctx.prefix}nsfw${nsfwTarget ? ` ${nsfwTarget}` : ""}*`,
			)
			return
		}

		// 3. Redirect NSFW rating inputs
		if (sub === "borderline" || sub === "suggestive" || sub === "explicit") {
			await ctx.reply(
				`🔞 Rating *${sub.toUpperCase()}* merupakan konten NSFW/Ecchi.\nSilakan gunakan command:\n*${ctx.prefix}nsfw ${sub}*`,
			)
			return
		}

		// 4. Search by ID
		if (sub === "id" && args[1]) {
			const id = Number.parseInt(args[1], 10)
			if (Number.isNaN(id)) {
				await ctx.reply(
					`❌ Invalid Image ID.\nExample: *${ctx.prefix}${ctx.commandName} id 8001*`,
				)
				return
			}

			try {
				const rawImg = await nekos.getImageByID(id)
				const img = rawImg as unknown as WaifuImage
				const imgUrl = getImageUrl(img)

				if (!imgUrl) {
					await ctx.reply(`❌ Image with ID \`${id}\` not found.`)
					return
				}

				if (img.rating && img.rating !== "safe") {
					await ctx.reply(
						`⚠️ Image ID \`${id}\` is rated *${img.rating.toUpperCase()}*.\nPlease use *${ctx.prefix}nsfw id ${id}* to view NSFW content.`,
					)
					return
				}

				const jpegBuffer = await downloadAndConvertImage(imgUrl)
				const caption = buildWaifuCaption(img, "Waifu SFW")

				await ctx.reply({
					image: jpegBuffer,
					caption,
				})
			} catch (error) {
				logger.error(
					"/commands/waifuImages/sfw.ts",
					`Failed getting image by ID ${id}: ${error}`,
				)
				await ctx.reply(`❌ Image with ID \`${id}\` not found or unavailable.`)
			}
			return
		}

		// 5. Random Image (Optional SFW tag filter)
		const tagInput = args.join(" ").trim()
		let targetTag: TagNames | undefined

		if (tagInput) {
			const resolved = resolveTag(tagInput)
			if (!resolved) {
				await ctx.reply(
					`❌ Unknown tag: *${tagInput}*\n\nType *${ctx.prefix}${ctx.commandName} tags* to see all available SFW tags.`,
				)
				return
			}

			if (NSFW_TAGS.includes(resolved)) {
				await ctx.reply(
					`🔞 Tag *${resolved}* termasuk dalam kategori NSFW.\nSilakan gunakan command:\n*${ctx.prefix}nsfw ${resolved.toLowerCase()}*`,
				)
				return
			}

			targetTag = resolved
		}

		try {
			// If targetTag is present -> routes via API URL
			// If targetTag is absent -> routes via nekosAPI package
			const img = await getRandomWaifu({
				tag: targetTag,
				ratings: ["safe"],
			})

			if (!img) {
				await ctx.reply(
					`❌ No SFW image found${targetTag ? ` for tag *${targetTag}*` : ""}.`,
				)
				return
			}

			const imgUrl = getImageUrl(img)
			if (!imgUrl) {
				await ctx.reply("❌ Failed to retrieve image URL.")
				return
			}

			const jpegBuffer = await downloadAndConvertImage(imgUrl)
			const caption = buildWaifuCaption(img, "Waifu SFW")

			await ctx.reply({
				image: jpegBuffer,
				caption,
			})
		} catch (error) {
			logger.error("/commands/waifuImages/sfw.ts", `Error: ${error}`)
			await ctx.reply("❌ Failed to fetch SFW anime image. Try again later.")
		}
	},
}

export default command
