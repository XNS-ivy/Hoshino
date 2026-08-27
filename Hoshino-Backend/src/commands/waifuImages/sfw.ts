import type { CommandContext, ICommand } from "@customTypes/command"
import { logger } from "@utils/logger"
import {
	buildWaifuCaption,
	downloadAndConvertImage,
	getImageUrl,
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
	usage: [
		"sfw",
		"sfw catgirl",
		"sfw maid",
		"sfw tags",
		"sfw id 8001",
		"waifuimages",
	],
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

		// 2. NSFW Forwarding (e.g. .waifuimages nsfw [tag])
		if (sub === "nsfw") {
			const nsfwTagInput = args.slice(1).join(" ").trim()
			const nsfwTag = nsfwTagInput ? resolveTag(nsfwTagInput) : undefined

			if (nsfwTagInput && !nsfwTag) {
				await ctx.reply(
					`❌ Unknown tag: *${nsfwTagInput}*\n\nType *${ctx.prefix}nsfw tags* to see available tags.`,
				)
				return
			}

			try {
				const rawImg = await nekos.getRandomImage(
					nsfwTag ? [nsfwTag] : undefined,
					{
						rating: ["explicit", "borderline", "suggestive"],
					},
				)
				const img = rawImg as unknown as WaifuImage
				const imgUrl = getImageUrl(img)

				if (!imgUrl) {
					await ctx.reply("❌ No NSFW image found for the specified criteria.")
					return
				}

				const jpegBuffer = await downloadAndConvertImage(imgUrl)
				const caption = buildWaifuCaption(img, "Waifu NSFW")

				await ctx.reply({
					image: jpegBuffer,
					caption,
				})
			} catch (error) {
				logger.error("/commands/waifuImages/sfw.ts", `Error: ${error}`)
				await ctx.reply("❌ Failed to fetch NSFW anime image. Try again later.")
			}
			return
		}

		// 3. Search by ID
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

		// 4. Random Image (Optional tag filter)
		const tagInput = args.join(" ").trim()
		let targetTag: TagNames | undefined

		if (tagInput) {
			const resolved = resolveTag(tagInput)
			if (!resolved) {
				await ctx.reply(
					`❌ Unknown tag: *${tagInput}*\n\nType *${ctx.prefix}${ctx.commandName} tags* to see all available tags.`,
				)
				return
			}
			targetTag = resolved
		}

		try {
			const rawImg = await nekos.getRandomImage(
				targetTag ? [targetTag] : undefined,
				{ rating: ["safe"] },
			)
			const img = rawImg as unknown as WaifuImage
			const imgUrl = getImageUrl(img)

			if (!imgUrl) {
				await ctx.reply(
					`❌ No SFW image found${targetTag ? ` for tag *${targetTag}*` : ""}.`,
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
			logger.error("/commands/waifuImages/sfw.ts", `Error: ${error}`)
			await ctx.reply("❌ Failed to fetch SFW anime image. Try again later.")
		}
	},
}

export default command
