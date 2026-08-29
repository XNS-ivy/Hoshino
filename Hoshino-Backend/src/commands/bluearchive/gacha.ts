import type { CommandContext, ICommand } from "@customTypes/command"
import { gachaRepository } from "@repositories/gacha.repository"
import { logger } from "@utils/logger"
import { executeGachaPull, getStudentImageUrl } from "@utils/schaledb"

const command: ICommand = {
	name: [
		"gacha",
		"pull",
		"pyroxene",
		"daily",
		"spark",
		"mystudent",
		"students",
	],
	category: "bluearchive",
	description:
		"Blue Archive Gacha Simulator with official 3★ rates, daily Pyroxenes, spark pity system, and personal student collection",
	usage: [
		"gacha",
		"gacha 10",
		"gacha 1",
		"daily",
		"spark",
		"mystudent",
		"students",
	],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const cmd = ctx.commandName.toLowerCase()
		const subArg = (args[0] || "").toLowerCase()

		// ──────────────────────────────────────────
		// 1. DAILY PYROXENE CLAIM (.daily)
		// ──────────────────────────────────────────
		if (cmd === "daily" || subArg === "daily") {
			const res = await gachaRepository.claimDaily(ctx.agentId, ctx.senderJid)
			if (res.success) {
				await ctx.reply(
					`💎 *ARONA DAILY WORK BONUS CLAIMED!*\n\n` +
						`🎁 *Reward:* +1,200 Pyroxenes (Free 10-Pull!)\n` +
						`💼 *Current Balance:* ${res.pyroxenes.toLocaleString("en-US")} Pyroxenes 💎\n\n` +
						`💡 *Tip:* Use *${ctx.prefix}gacha 10* to recruit students or *${ctx.prefix}mystudent* to check your collection!`,
				)
			} else {
				await ctx.reply(
					`⏳ *Daily Pyroxenes Already Claimed!*\n\n` +
						`Sensei, Arona is still preparing tomorrow's work reward.\n` +
						`⏱️ *Time Remaining:* ${res.remainingHours} hour(s) ${res.remainingMinutes} minute(s)\n` +
						`💎 *Current Balance:* ${res.pyroxenes.toLocaleString("en-US")} Pyroxenes`,
				)
			}
			return
		}

		// ──────────────────────────────────────────
		// 2. SENSEI COLLECTION & PROFILE (.mystudent)
		// ──────────────────────────────────────────
		if (
			cmd === "mystudent" ||
			cmd === "students" ||
			cmd === "pyroxene" ||
			subArg === "profile" ||
			subArg === "my"
		) {
			const profile = await gachaRepository.getOrCreateProfile(
				ctx.agentId,
				ctx.senderJid,
			)
			const collection = await gachaRepository.getCollection(
				ctx.agentId,
				ctx.senderJid,
			)

			const threeStars = collection.filter((s) => s.starGrade === 3)
			const twoStars = collection.filter((s) => s.starGrade === 2)
			const oneStars = collection.filter((s) => s.starGrade === 1)

			let text = `╔══════════════════════════╗\n`
			text += `  🎓 *SCHALE SENSEI RECORD*\n`
			text += `╚══════════════════════════╝\n\n`
			text += `👤 *Sensei:* @${ctx.senderJid.split("@")[0]}\n`
			text += `💎 *Pyroxenes:* ${profile.pyroxenes.toLocaleString("en-US")} 💎\n`
			text += `✨ *Recruitment Points (Spark):* ${profile.sparkPoints}/200\n`
			text += `📊 *Total Recruited:* ${profile.totalPulls} pulls\n`
			text += `👥 *Roster:* ${collection.length}/274 unique students\n\n`
			text += `⭐ *Grade Breakdown:*\n`
			text += `  • ⭐⭐⭐ (3★): ${threeStars.length} students\n`
			text += `  • ⭐⭐ (2★): ${twoStars.length} students\n`
			text += `  • ⭐ (1★): ${oneStars.length} students\n\n`

			if (threeStars.length > 0) {
				text += `🌟 *Your 3★ Students (${threeStars.length}):*\n`
				for (const s of threeStars.slice(0, 15)) {
					const dupeText = s.count > 1 ? ` (Eleph x${s.count - 1})` : ""
					text += `  • ⭐⭐⭐ *${s.studentName}*${dupeText}\n`
				}
				if (threeStars.length > 15) {
					text += `  _...and ${threeStars.length - 15} more 3★ students._\n`
				}
			} else {
				text += `_No 3★ students yet. Try your luck with *${ctx.prefix}gacha 10*!_\n`
			}

			text += `\n📌 *Commands:*\n`
			text += `• *${ctx.prefix}daily* — Claim 1,200 daily Pyroxenes\n`
			text += `• *${ctx.prefix}gacha 10* — 10x Student Recruitment\n`
			text += `• *${ctx.prefix}spark* — Redeem 200 Points for guaranteed 3★`

			await ctx.reply(text)
			return
		}

		// ──────────────────────────────────────────
		// 3. SPARK 200 PITY REDEMPTION (.spark)
		// ──────────────────────────────────────────
		if (cmd === "spark" || subArg === "spark") {
			const profile = await gachaRepository.getOrCreateProfile(
				ctx.agentId,
				ctx.senderJid,
			)
			if (profile.sparkPoints < 200) {
				await ctx.reply(
					`✨ *Spark Pity System*\n\n` +
						`Sensei, you currently have *${profile.sparkPoints}/200* Recruitment Points.\n` +
						`You need *${200 - profile.sparkPoints}* more pulls to guarantee a 3★ student selection!\n\n` +
						`💡 *Tip:* Use *${ctx.prefix}gacha 10* to build up your recruitment points.`,
				)
				return
			}

			// Redeem Spark
			await gachaRepository.redeemSpark(ctx.agentId, ctx.senderJid)
			const sparkRes = await executeGachaPull(1, true)
			const picked = sparkRes.threeStars[0]!

			const { isNew, count } = await gachaRepository.saveStudent(
				ctx.agentId,
				ctx.senderJid,
				picked.Id,
				picked.Name,
				3,
			)

			const caption =
				`✨ *200 SPARK GUARANTEED RECRUITMENT COMPLETE!*\n\n` +
				`🎉 *Recruited:* ⭐⭐⭐ *${picked.Name}* (${picked.School})\n` +
				`🎯 *Status:* ${isNew ? "🆕 NEW STUDENT RECRUITED!" : `⚡ DUPLICATE (Eleph x${count - 1})`}\n\n` +
				`Arona has safely processed your recruitment ticket, Sensei!`

			// Send with 3★ artwork
			try {
				const imgUrl = getStudentImageUrl(picked.Id, "collection")
				const imgRes = await fetch(imgUrl)
				if (imgRes.ok) {
					const imgBuf = Buffer.from(await imgRes.arrayBuffer())
					await ctx.sock.sendMessage(
						ctx.jid,
						{ image: imgBuf, caption },
						{ quoted: ctx.rawMsg },
					)
					return
				}
			} catch {}

			await ctx.reply(caption)
			return
		}

		// ──────────────────────────────────────────
		// 4. GACHA RECRUITMENT PULL (.gacha / .gacha 10 / .gacha 1)
		// ──────────────────────────────────────────
		const isSingle = subArg === "1" || subArg === "single" || subArg === "one"
		const pullCount: 1 | 10 = isSingle ? 1 : 10
		const cost = pullCount === 10 ? 1200 : 120

		// Check Balance & Deduct
		const gachaTx = await gachaRepository.processGachaPull(
			ctx.agentId,
			ctx.senderJid,
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
					ctx.senderJid,
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
				const imgUrl = getStudentImageUrl(top3Star.Id, "collection")
				try {
					const imgRes = await fetch(imgUrl)
					if (imgRes.ok) {
						const imgBuf = Buffer.from(await imgRes.arrayBuffer())
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
						"/commands/general/gacha.ts",
						`Failed fetching 3★ art: ${err}`,
					)
				}
			}

			// Send text report
			await ctx.reply(text)
		} catch (error) {
			logger.error("/commands/general/gacha.ts", `Gacha error: ${error}`)
			await ctx.reply("⚠️ An error occurred during student recruitment.")
		}
	},
}

export default command
