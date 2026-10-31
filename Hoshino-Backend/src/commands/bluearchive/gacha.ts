import type { CommandContext, ICommand } from "@customTypes/command"
import { gachaRepository } from "@repositories/gacha.repository"
import { logger } from "@utils/logger"
import {
	executeGachaPull,
	fetchSchaleImageBuffer,
	getStudentImageUrl,
} from "@utils/schaledb"
import { resolveCanonicalSensei } from "./upgrade"

const command: ICommand = {
	name: ["gacha", "pull"],
	category: "bluearchive",
	description:
		"Blue Archive Gacha Simulator with official 3★ rates (3% 3★, 18.5% 2★, 78.5% 1★, and 2★+ 10-Pull Guarantee)",
	usage: ["gacha", "gacha 10", "gacha 1"],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const subArg = (args[0] || "").toLowerCase()
		const { canonicalJid: senseiJid } = await resolveCanonicalSensei(ctx)

		const isSingle = subArg === "1" || subArg === "single" || subArg === "one"
		const pullCount: 1 | 10 = isSingle ? 1 : 10
		const cost = pullCount === 10 ? 1200 : 120

		// Check Balance & Deduct
		const gachaTx = await gachaRepository.processGachaPull(
			ctx.agentId,
			senseiJid,
			cost,
			pullCount,
		)

		if (!gachaTx.success) {
			await ctx.reply(
				`❌ *Insufficient Pyroxenes!*\n\n` +
					`Sensei, you need *${cost} Pyroxenes* for a ${pullCount}x pull, but only have *${gachaTx.newPyroxenes} Pyroxenes* 💎.\n\n` +
					`🎁 *Claim free 1,200 Pyroxenes:* Type *${ctx.prefix}daily* to collect today's reward!`,
			)
			return
		}

		try {
			// Execute Pull with official rates
			const pullResult = await executeGachaPull(pullCount)

			// Save all pulled students to DB collection
			const savedDetails: { name: string; star: number; isNew: boolean }[] = []
			for (const item of pullResult.results) {
				const { isNew } = await gachaRepository.saveStudent(
					ctx.agentId,
					senseiJid,
					item.student.Id,
					item.student.Name,
					item.starGrade,
				)
				savedDetails.push({
					name: item.student.Name,
					star: item.starGrade,
					isNew,
				})
			}

			// Format Arona Envelope & Result Text
			const has3Star = pullResult.threeStars.length > 0
			const envelopeIcon = has3Star
				? "🟪 *[RAINBOW 3★ ENVELOPE]*"
				: "🟨 *[GOLD 2★ ENVELOPE]*"

			let text = `╔══════════════════════════╗\n`
			text += `  📄 *SCHALE RECRUITMENT REPORT*\n`
			text += `╚══════════════════════════╝\n\n`
			text += `${envelopeIcon}\n\n`

			for (let i = 0; i < savedDetails.length; i++) {
				const d = savedDetails[i]!
				const stars = "⭐".repeat(d.star)
				const newTag = d.isNew ? " 🆕 *NEW!*" : ""

				if (d.star === 3) {
					text += `${(i + 1).toString().padStart(2, "0")}. 🌟 [${stars}] *${d.name}*${newTag}\n`
				} else if (d.star === 2) {
					text += `${(i + 1).toString().padStart(2, "0")}. 🟡 [${stars}] ${d.name}${newTag}\n`
				} else {
					text += `${(i + 1).toString().padStart(2, "0")}. ⚪ [${stars}] ${d.name}${newTag}\n`
				}
			}

			text += `\n───────────────────\n`
			text += `💎 *Balance:* ${gachaTx.newPyroxenes.toLocaleString("en-US")} Pyroxenes\n`
			text += `✨ *Spark Progress:* ${gachaTx.newSpark}/200 Points\n`
			text += `💡 *Check Roster:* Type *${ctx.prefix}mystudent*`

			// If a 3★ was pulled, fetch and send the top 3★ student's HD artwork!
			if (has3Star) {
				const top3Star = pullResult.threeStars[0]!
				try {
					const imgBuf = await fetchSchaleImageBuffer([
						getStudentImageUrl(top3Star.Id, "collection"),
						getStudentImageUrl(top3Star.Id, "portrait"),
					])
					if (imgBuf) {
						await ctx.sock.sendMessage(
							ctx.jid,
							{
								image: imgBuf,
								caption: text,
							},
							{ quoted: ctx.rawMsg },
						)
						return
					}
				} catch (err) {
					logger.warn(
						"/commands/bluearchive/gacha.ts",
						`Failed fetching 3★ art: ${err}`,
					)
				}
			}

			await ctx.reply(text)
		} catch (error) {
			logger.error("/commands/bluearchive/gacha.ts", `Gacha error: ${error}`)
			await ctx.reply("⚠️ An error occurred during student recruitment.")
		}
	},
}

export default command
