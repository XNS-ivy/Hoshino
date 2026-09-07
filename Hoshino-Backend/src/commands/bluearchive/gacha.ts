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
						`⏱️ *Reset In:* ${res.remainingHours} hour(s) ${res.remainingMinutes} minute(s) _(Daily reset at 06:00 WIB)_\n` +
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
			subArg === "my" ||
			subArg === "students" ||
			subArg === "mystudent"
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

			// Determine filter arg if passed: e.g. !mystudent 1, !mystudent 2, !mystudent 3
			let filterArg = (args[0] || "").toLowerCase().replace(/[^a-z0-9]/g, "")
			if (
				(cmd === "gacha" || cmd === "pull") &&
				(subArg === "students" || subArg === "my" || subArg === "profile")
			) {
				filterArg = (args[1] || "").toLowerCase().replace(/[^a-z0-9]/g, "")
			}

			// ── Case A: Specific Filter for 3★ Students ──
			if (
				filterArg === "3" ||
				filterArg === "3star" ||
				filterArg === "3stars" ||
				filterArg === "3s"
			) {
				let text = `╔══════════════════════════╗\n`
				text += `  🌟 *3★ SENSEI ROSTER (${threeStars.length})*\n`
				text += `╚══════════════════════════╝\n\n`
				text += `👤 *Sensei:* @${ctx.senderJid.split("@")[0]}\n`
				text += `⭐ *Total 3★ Murid:* ${threeStars.length} murid\n\n`

				if (threeStars.length === 0) {
					text += `_Belum ada murid 3★. Coba keberuntunganmu di *${ctx.prefix}gacha 10*!_\n`
				} else {
					for (let i = 0; i < threeStars.length; i++) {
						const s = threeStars[i]!
						const dupeText = s.count > 1 ? ` _(Eleph x${s.count - 1})_` : ""
						text += `${i + 1}. ⭐⭐⭐ *${s.studentName}*${dupeText}\n`
					}
				}

				text += `\n💡 *Navigasi Roster:*\n`
				text += `• *${ctx.prefix}mystudent 2* — Lihat seluruh murid 2★\n`
				text += `• *${ctx.prefix}mystudent 1* — Lihat seluruh murid 1★\n`
				text += `• *${ctx.prefix}mystudent* — Ringkasan profil & balance`
				await ctx.reply(text)
				return
			}

			// ── Case B: Specific Filter for 2★ Students ──
			if (
				filterArg === "2" ||
				filterArg === "2star" ||
				filterArg === "2stars" ||
				filterArg === "2s"
			) {
				let text = `╔══════════════════════════╗\n`
				text += `  ⭐ *2★ SENSEI ROSTER (${twoStars.length})*\n`
				text += `╚══════════════════════════╝\n\n`
				text += `👤 *Sensei:* @${ctx.senderJid.split("@")[0]}\n`
				text += `⭐ *Total 2★ Murid:* ${twoStars.length} murid\n\n`

				if (twoStars.length === 0) {
					text += `_Belum ada murid 2★ yang direkrut._\n`
				} else {
					for (let i = 0; i < twoStars.length; i++) {
						const s = twoStars[i]!
						const dupeText = s.count > 1 ? ` _(Eleph x${s.count - 1})_` : ""
						text += `${i + 1}. ⭐⭐ *${s.studentName}*${dupeText}\n`
					}
				}

				text += `\n💡 *Navigasi Roster:*\n`
				text += `• *${ctx.prefix}mystudent 3* — Lihat seluruh murid 3★\n`
				text += `• *${ctx.prefix}mystudent 1* — Lihat seluruh murid 1★\n`
				text += `• *${ctx.prefix}mystudent* — Ringkasan profil & balance`
				await ctx.reply(text)
				return
			}

			// ── Case C: Specific Filter for 1★ Students ──
			if (
				filterArg === "1" ||
				filterArg === "1star" ||
				filterArg === "1stars" ||
				filterArg === "1s"
			) {
				let text = `╔══════════════════════════╗\n`
				text += `  ⭐ *1★ SENSEI ROSTER (${oneStars.length})*\n`
				text += `╚══════════════════════════╝\n\n`
				text += `👤 *Sensei:* @${ctx.senderJid.split("@")[0]}\n`
				text += `⭐ *Total 1★ Murid:* ${oneStars.length} murid\n\n`

				if (oneStars.length === 0) {
					text += `_Belum ada murid 1★ yang direkrut._\n`
				} else {
					for (let i = 0; i < oneStars.length; i++) {
						const s = oneStars[i]!
						const dupeText = s.count > 1 ? ` _(Eleph x${s.count - 1})_` : ""
						text += `${i + 1}. ⭐ *${s.studentName}*${dupeText}\n`
					}
				}

				text += `\n💡 *Navigasi Roster:*\n`
				text += `• *${ctx.prefix}mystudent 3* — Lihat seluruh murid 3★\n`
				text += `• *${ctx.prefix}mystudent 2* — Lihat seluruh murid 2★\n`
				text += `• *${ctx.prefix}mystudent* — Ringkasan profil & balance`
				await ctx.reply(text)
				return
			}

			// ── Case D: General Overview (.mystudent or .mystudent all) ──
			let text = `╔══════════════════════════╗\n`
			text += `  🎓 *SCHALE SENSEI RECORD*\n`
			text += `╚══════════════════════════╝\n\n`
			text += `👤 *Sensei:* @${ctx.senderJid.split("@")[0]}\n`
			text += `💎 *Pyroxenes:* ${profile.pyroxenes.toLocaleString("en-US")} 💎\n`
			text += `✨ *Recruitment Points (Spark):* ${profile.sparkPoints}/200\n`
			text += `📊 *Total Recruited:* ${profile.totalPulls} pulls\n`
			text += `👥 *Roster:* ${collection.length}/274 unique students\n\n`
			text += `⭐ *Grade Breakdown:*\n`
			text += `  • ⭐⭐⭐ (3★): ${threeStars.length} murid\n`
			text += `  • ⭐⭐ (2★): ${twoStars.length} murid\n`
			text += `  • ⭐ (1★): ${oneStars.length} murid\n\n`

			if (threeStars.length > 0) {
				text += `🌟 *Murid 3★ (${threeStars.length}):*\n`
				const limit = Math.min(threeStars.length, 12)
				for (let i = 0; i < limit; i++) {
					const s = threeStars[i]!
					const dupeText = s.count > 1 ? ` _(Eleph x${s.count - 1})_` : ""
					text += `  • ⭐⭐⭐ *${s.studentName}*${dupeText}\n`
				}
				if (threeStars.length > limit) {
					text += `  _...dan ${threeStars.length - limit} murid 3★ lainnya. (Ketik *${ctx.prefix}mystudent 3* untuk lihat semua)_\n`
				}
			} else {
				text += `_Belum ada murid 3★. Gunakan *${ctx.prefix}gacha 10* untuk merekrut!_\n`
			}

			if (twoStars.length > 0) {
				text += `\n⭐ *Murid 2★ (${twoStars.length}):*\n`
				const names = twoStars
					.slice(0, 8)
					.map((s) => s.studentName)
					.join(", ")
				text += `  ${names}`
				if (twoStars.length > 8) {
					text += ` _...dan ${twoStars.length - 8} lainnya. (Ketik *${ctx.prefix}mystudent 2* untuk lihat semua)_`
				}
				text += `\n`
			}

			if (oneStars.length > 0) {
				text += `\n⭐ *Murid 1★ (${oneStars.length}):*\n`
				const names = oneStars
					.slice(0, 8)
					.map((s) => s.studentName)
					.join(", ")
				text += `  ${names}`
				if (oneStars.length > 8) {
					text += ` _...dan ${oneStars.length - 8} lainnya. (Ketik *${ctx.prefix}mystudent 1* untuk lihat semua)_`
				}
				text += `\n`
			}

			text += `\n📌 *Navigasi Perintah:*\n`
			text += `• *${ctx.prefix}mystudent 1 / 2 / 3* — Lihat daftar lengkap per bintang\n`
			text += `• *${ctx.prefix}daily* — Klaim 1.200 Pyroxenes harian (Reset 06:00 WIB)\n`
			text += `• *${ctx.prefix}gacha 10* — Rekrut 10 Murid Kivotos\n`
			text += `• *${ctx.prefix}spark* — Tukar 200 Poin untuk jaminan murid 3★`

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
