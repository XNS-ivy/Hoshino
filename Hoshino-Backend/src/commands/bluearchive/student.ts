import type { CommandContext, ICommand } from "@customTypes/command"
import { logger } from "@utils/logger"
import {
	formatArmorType,
	formatBulletType,
	formatSquadType,
	getStudentImageUrl,
	searchSchaleStudent,
} from "@utils/schaledb"

const command: ICommand = {
	name: ["student", "ba", "murid", "schale"],
	category: "bluearchive",
	description:
		"Search and view complete Blue Archive student profile and artwork from SchaleDB",
	usage: [
		"student hoshino",
		"ba shiroko",
		"student mika",
		"student aru",
		"ba hoshino swimsuit",
	],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const query = args.join(" ").trim()

		// 1. Show Help & Usage if query is empty
		if (!query) {
			await ctx.reply(
				`🎓 *Kivotos Student Database (SchaleDB)*\n\n` +
					`💡 *Usage:*\n` +
					`• *${ctx.prefix}${ctx.commandName} <student name>* — View student stats & artwork\n\n` +
					`📌 *Examples:*\n` +
					`• *${ctx.prefix}student hoshino*\n` +
					`• *${ctx.prefix}ba shiroko terror*\n` +
					`• *${ctx.prefix}student mika*`,
			)
			return
		}

		try {
			// 2. Search student in SchaleDB
			const matches = await searchSchaleStudent(query)

			if (!matches.length) {
				await ctx.reply(
					`❌ Student *"${query}"* not found in SchaleDB.\nPlease check the spelling or try searching another name.`,
				)
				return
			}

			const student = matches[0]!
			const starStr = "⭐".repeat(student.StarGrade)

			// 3. Build Rich Student Profile
			let caption = `🌸 *${student.Name.toUpperCase()}* [${starStr}]\n`
			caption += `───────────────────\n`
			caption += `🏫 *School:* ${student.School}\n`
			caption += `🏛️ *Club:* ${student.Club || "General"}\n`
			caption += `⚔️ *Role:* ${formatSquadType(student.SquadType)}\n`
			caption += `🎯 *Attack:* ${formatBulletType(student.BulletType)}\n`
			caption += `🛡️ *Armor:* ${formatArmorType(student.ArmorType)}\n`
			caption += `🔫 *Weapon:* ${student.WeaponType}  |  🎙️ *CV:* ${student.CharacterVoice || "Unknown"}\n`

			if (student.BirthDay) {
				caption += `🎂 *Birthday:* ${student.BirthDay}  |  📏 *Age:* ${student.CharacterAge || "-"}\n`
			}

			if (student.ProfileIntroduction) {
				caption += `\n💬 *Bio:*\n_${student.ProfileIntroduction.trim()}_\n`
			}

			// Mention other matching variants if any
			if (matches.length > 1) {
				caption += `\n💡 *Other Variants:* ${matches
					.slice(1, 4)
					.map((m) => `*${ctx.prefix}student ${m.Name}*`)
					.join(", ")}`
			}

			// 4. Fetch HD Collection Artwork from SchaleDB
			const collectionUrl = getStudentImageUrl(student.Id, "collection")
			const portraitUrl = getStudentImageUrl(student.Id, "portrait")

			let imageBuffer: Buffer | null = null
			try {
				const imgRes = await fetch(collectionUrl)
				if (imgRes.ok) {
					imageBuffer = Buffer.from(await imgRes.arrayBuffer())
				} else {
					const portraitRes = await fetch(portraitUrl)
					if (portraitRes.ok) {
						imageBuffer = Buffer.from(await portraitRes.arrayBuffer())
					}
				}
			} catch (imgErr) {
				logger.warn(
					"/commands/general/student.ts",
					`Failed fetching artwork for ${student.Name}: ${imgErr}`,
				)
			}

			// 5. Send with image or fallback to text
			if (imageBuffer) {
				await ctx.sock.sendMessage(
					ctx.jid,
					{
						image: imageBuffer,
						caption,
					},
					{ quoted: ctx.rawMsg },
				)
			} else {
				await ctx.reply(caption)
			}
		} catch (error) {
			logger.error(
				"/commands/general/student.ts",
				`Student search error: ${error}`,
			)
			await ctx.reply("⚠️ An error occurred while searching SchaleDB database.")
		}
	},
}

export default command
