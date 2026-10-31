import type { CommandContext, ICommand } from "@customTypes/command"
import { ELEPH_CONFIG, gachaRepository } from "@repositories/gacha.repository"
import { logger } from "@utils/logger"
import { resolveCanonicalSensei } from "./upgrade"

const command: ICommand = {
	name: ["eleph", "claimeleph", "claim"],
	category: "bluearchive",
	description:
		"View duplicate student Eleph summary and exchange duplicate Elephs for Pyroxenes",
	usage: [
		"eleph",
		"claim eleph",
		"claim eleph 3",
		"claim eleph 2",
		"claim eleph 1",
		"claim eleph <student>",
	],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const cmd = (ctx.commandName || "eleph").toLowerCase()
		const subArg = (args[0] || "").toLowerCase()

		try {
			const { canonicalJid: senseiJid } = await resolveCanonicalSensei(ctx)

			const isClaimElephAction =
				cmd === "claimeleph" ||
				cmd === "claim" ||
				(cmd === "eleph" &&
					(subArg === "claim" ||
						subArg === "convert" ||
						subArg === "tukar" ||
						subArg === "all"))

			if (isClaimElephAction) {
				let filterArg = ""
				if (cmd === "claim" && subArg === "eleph") {
					filterArg = (args[1] || "").toLowerCase()
				} else if (
					cmd === "eleph" &&
					(subArg === "claim" || subArg === "convert" || subArg === "tukar")
				) {
					filterArg = (args[1] || "").toLowerCase()
				} else if (cmd === "claimeleph") {
					filterArg = (args[0] || "").toLowerCase()
				} else if (cmd === "claim" && subArg && subArg !== "eleph") {
					filterArg = subArg
				}

				let starFilter: number | undefined
				let nameOrIdFilter: string | undefined

				if (
					filterArg === "3" ||
					filterArg === "3star" ||
					filterArg === "3stars" ||
					filterArg === "3s"
				) {
					starFilter = 3
				} else if (
					filterArg === "2" ||
					filterArg === "2star" ||
					filterArg === "2stars" ||
					filterArg === "2s"
				) {
					starFilter = 2
				} else if (
					filterArg === "1" ||
					filterArg === "1star" ||
					filterArg === "1stars" ||
					filterArg === "1s"
				) {
					starFilter = 1
				} else if (filterArg && filterArg !== "all") {
					nameOrIdFilter = filterArg
				}

				const res = await gachaRepository.claimElephToPyroxenes(
					ctx.agentId,
					senseiJid,
					{ starGrade: starFilter, studentNameOrId: nameOrIdFilter },
				)

				if (!res.success) {
					const reasonMsg =
						res.reason === "NO_MATCHING_DUPLICATES"
							? `Sensei, no duplicate Elephs matched filter *"${filterArg}"*.\n`
							: `Sensei, you don't have any duplicate student Elephs to convert right now.\n`
					await ctx.reply(
						`❌ *No Duplicate Elephs Available to Convert!*\n\n` +
							reasonMsg +
							`💡 *How to get Elephs:* Pull duplicate students using *${ctx.prefix}gacha 10*!\n` +
							`📋 *Check Roster:* Type *${ctx.prefix}mystudent* to see all your students.`,
					)
					return
				}

				let replyText = `╔══════════════════════════╗\n`
				replyText += `  💠 *SCHALE ELEPH EXCHANGE COMPLETE*\n`
				replyText += `╚══════════════════════════╝\n\n`
				replyText += `👤 *Sensei:* @${senseiJid.split("@")[0]}\n`
				replyText += `♻️ *Duplicate Students Recycled:* ${res.claimedDuplicates} student(s)\n`
				replyText += `💠 *Total Elephs Exchanged:* ${res.claimedEleph} Eleph\n`
				replyText += `💎 *Pyroxenes Claimed:* +${res.pyroxenesGained.toLocaleString("en-US")} Pyroxenes 💎\n\n`

				replyText += `📊 *Exchange Breakdown:*\n`
				if (res.breakdown.threeStar.duplicates > 0) {
					replyText += `  • ⭐⭐⭐ (3★): ${res.breakdown.threeStar.duplicates} dupe(s) (${res.breakdown.threeStar.eleph} Eleph ➔ +${res.breakdown.threeStar.pyroxenes.toLocaleString("en-US")} 💎)\n`
				}
				if (res.breakdown.twoStar.duplicates > 0) {
					replyText += `  • ⭐⭐ (2★): ${res.breakdown.twoStar.duplicates} dupe(s) (${res.breakdown.twoStar.eleph} Eleph ➔ +${res.breakdown.twoStar.pyroxenes.toLocaleString("en-US")} 💎)\n`
				}
				if (res.breakdown.oneStar.duplicates > 0) {
					replyText += `  • ⭐ (1★): ${res.breakdown.oneStar.duplicates} dupe(s) (${res.breakdown.oneStar.eleph} Eleph ➔ +${res.breakdown.oneStar.pyroxenes.toLocaleString("en-US")} 💎)\n`
				}

				replyText += `\n💼 *Current Balance:* ${res.newPyroxenes.toLocaleString("en-US")} Pyroxenes 💎\n`
				replyText += `🛡️ *Protection:* Base student cards remain safely in your roster!\n\n`
				replyText += `💡 *Tip:* Use your Pyroxenes for *${ctx.prefix}gacha 10* to recruit new Kivotos students!`

				await ctx.reply(replyText)
				return
			}

			// Eleph Inventory Overview (.eleph)
			const summary = await gachaRepository.getElephSummary(
				ctx.agentId,
				senseiJid,
			)
			const profile = await gachaRepository.getOrCreateProfile(
				ctx.agentId,
				senseiJid,
			)

			let text = `╔══════════════════════════╗\n`
			text += `  💠 *SCHALE ELEPH RECYCLING CENTER*\n`
			text += `╚══════════════════════════╝\n\n`
			text += `👤 *Sensei:* @${senseiJid.split("@")[0]}\n`
			text += `💎 *Pyroxene Balance:* ${profile.pyroxenes.toLocaleString("en-US")} 💎\n`
			text += `💠 *Available Elephs:* ${summary.totalEleph} Eleph (${summary.totalDuplicates} duplicate copies)\n`
			text += `💰 *Convertible Value:* ${summary.totalPyroxenes.toLocaleString("en-US")} Pyroxenes 💎\n\n`

			text += `⚖️ *Fair Exchange Rates:*\n`
			for (const [star, stars] of [
				[3, "⭐⭐⭐"],
				[2, "⭐⭐"],
				[1, "⭐"],
			] as const) {
				const e = ELEPH_CONFIG.ELEPH_PER_DUPLICATE[star] || 1
				text += `  • ${stars} (${star}★ Dupe): ${e} Eleph ➔ ${e * ELEPH_CONFIG.PYROXENES_PER_ELEPH} Pyroxenes 💎\n`
			}
			text += `\n`

			if (summary.totalDuplicates > 0) {
				text += `📦 *Claimable Inventory Breakdown:*\n`
				if (summary.breakdown.threeStar.duplicates > 0) {
					text += `  • ⭐⭐⭐ 3★ Dupes: ${summary.breakdown.threeStar.duplicates} (${summary.breakdown.threeStar.eleph} Eleph ➔ ${summary.breakdown.threeStar.pyroxenes.toLocaleString("en-US")} 💎)\n`
				}
				if (summary.breakdown.twoStar.duplicates > 0) {
					text += `  • ⭐⭐ 2★ Dupes: ${summary.breakdown.twoStar.duplicates} (${summary.breakdown.twoStar.eleph} Eleph ➔ ${summary.breakdown.twoStar.pyroxenes.toLocaleString("en-US")} 💎)\n`
				}
				if (summary.breakdown.oneStar.duplicates > 0) {
					text += `  • ⭐ 1★ Dupes: ${summary.breakdown.oneStar.duplicates} (${summary.breakdown.oneStar.eleph} Eleph ➔ ${summary.breakdown.oneStar.pyroxenes.toLocaleString("en-US")} 💎)\n`
				}

				text += `\n🚀 *Ready to Convert?*\n`
				text += `• Type *${ctx.prefix}claim eleph* to convert all duplicate Elephs into Pyroxenes!\n`
				text += `• Type *${ctx.prefix}claim eleph 3* to convert only 3★ Elephs.`
			} else {
				text += `_Sensei currently has 0 duplicate Elephs._\n`
				text += `_Recruit duplicate students via *${ctx.prefix}gacha 10* to collect Elephs!_`
			}

			await ctx.reply(text)
		} catch (error) {
			logger.error("/commands/bluearchive/eleph.ts", `Eleph error: ${error}`)
			await ctx.reply("⚠️ An error occurred while processing Eleph exchange.")
		}
	},
}

export default command

