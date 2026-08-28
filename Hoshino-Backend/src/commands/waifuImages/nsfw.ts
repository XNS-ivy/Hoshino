import type { CommandContext, ICommand } from "@customTypes/command"
import { logger } from "@utils/logger"
import {
	ALL_TAGS,
	buildWaifuCaption,
	downloadAndConvertImage,
	getImageUrl,
	getRandomWaifu,
	NSFW_TAGS,
	nekos,
	type Rating,
	resolveTag,
	type TagNames,
	type WaifuImage,
} from "@utils/waifu"

const VALID_RATINGS: Rating[] = ["explicit", "borderline", "suggestive"]

const command: ICommand = {
	name: ["nsfw", "waifunsfw", "waifu-nsfw"],
	category: "waifuImages",
	description: "Get random NSFW anime waifu images from NekosAPI",
	usage: [
		"nsfw",
		"nsfw anal",
		"nsfw maid",
		"nsfw explicit",
		"nsfw suggestive",
		"nsfw borderline",
		"nsfw maid suggestive",
		"nsfw tags",
		"nsfw id 8001",
	],
	textOnly: true,
	needAdminRegisterThisCommand: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const sub = args[0]?.toLowerCase()

		// 1. Tag List & Help
		if (sub === "tags" || sub === "tag" || sub === "help" || sub === "list") {
			const nsfwList = NSFW_TAGS.map((t) => `• \`${t}\``).join("\n")
			const otherList = ALL_TAGS.filter((t) => !NSFW_TAGS.includes(t))
				.map((t) => `• \`${t}\``)
				.join("\n")

			await ctx.reply(
				`🔞 *Available NSFW Waifu Options*\n\n` +
					`⚙️ *Ratings:* \`explicit\` (default), \`suggestive\`, \`borderline\`\n\n` +
					`*NSFW Tags:*\n${nsfwList}\n\n` +
					`*General Tags (Can be combined with NSFW ratings):*\n${otherList}\n\n` +
					`💡 *Usage Examples:*\n` +
					`• *${ctx.prefix}${ctx.commandName}* (Random explicit image)\n` +
					`• *${ctx.prefix}${ctx.commandName} suggestive* (Rating only)\n` +
					`• *${ctx.prefix}${ctx.commandName} anal* (Tag only)\n` +
					`• *${ctx.prefix}${ctx.commandName} maid suggestive* (Tag + rating)\n` +
					`• *${ctx.prefix}${ctx.commandName} id 8001* (Search by ID)`,
			)
			return
		}

		// 2. Search by ID
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

				const jpegBuffer = await downloadAndConvertImage(imgUrl)
				const caption = buildWaifuCaption(img, "Waifu NSFW")

				await ctx.reply({
					image: jpegBuffer,
					caption,
				})
			} catch (error) {
				logger.error(
					"/commands/waifuImages/nsfw.ts",
					`Failed getting image by ID ${id}: ${error}`,
				)
				await ctx.reply(`❌ Image with ID \`${id}\` not found or unavailable.`)
			}
			return
		}

		// 3. Rating and Tag Extraction
		let selectedRating: Rating = "explicit"
		const remainingArgs: string[] = []

		for (const arg of args) {
			const lower = arg.toLowerCase()
			if (lower === "safe") {
				await ctx.reply(
					`🌸 Rating *SAFE* merupakan konten SFW.\nSilakan gunakan command:\n*${ctx.prefix}sfw*`,
				)
				return
			}

			if (VALID_RATINGS.includes(lower as Rating)) {
				selectedRating = lower as Rating
			} else {
				remainingArgs.push(arg)
			}
		}

		const tagInput = remainingArgs.join(" ").trim()
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
			// If targetTag is present -> routes via API URL (with rating for safety)
			// If targetTag is absent -> routes via nekosAPI package
			const img = await getRandomWaifu({
				tag: targetTag,
				ratings: [selectedRating],
			})

			if (!img) {
				await ctx.reply(
					`❌ No NSFW image found${targetTag ? ` for tag *${targetTag}*` : ""}${selectedRating ? ` with rating *${selectedRating}*` : ""}.`,
				)
				return
			}

			const imgUrl = getImageUrl(img)
			if (!imgUrl) {
				await ctx.reply("❌ Failed to retrieve image URL.")
				return
			}

			const jpegBuffer = await downloadAndConvertImage(imgUrl)
			const caption = buildWaifuCaption(img, "Waifu NSFW")

			await ctx.reply({
				image: jpegBuffer,
				caption,
			})
		} catch (error) {
			logger.error("/commands/waifuImages/nsfw.ts", `Error: ${error}`)
			await ctx.reply("❌ Failed to fetch NSFW anime image. Try again later.")
		}
	},
}

export default command
