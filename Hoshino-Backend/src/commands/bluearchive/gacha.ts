import type { CommandContext, ICommand } from "@customTypes/command"
import { ELEPH_CONFIG, gachaRepository } from "@repositories/gacha.repository"
import { momoRepository } from "@repositories/momo.repository"
import { logger } from "@utils/logger"
import {
	executeGachaPull,
	fetchSchaleImageBuffer,
	formatArmorType,
	formatBulletType,
	formatSquadType,
	getSchaleStudents,
	getStudentImageUrl,
	getStudentMatchScore,
	searchSchaleStudent,
} from "@utils/schaledb"
import { resolveCanonicalSensei } from "./upgrade"

const command: ICommand = {
	name: [
		"gacha",
		"pull",
		"pyroxene",
		"daily",
		"spark",
		"mystudent",
		"students",
		"eleph",
		"claimeleph",
		"claim",
	],
	category: "bluearchive",
	description:
		"Blue Archive Gacha Simulator with official 3★ rates, daily Pyroxenes, spark pity system, student collection, and fair Eleph recycling",
	usage: [
		"gacha",
		"gacha 10",
		"gacha 1",
		"daily",
		"spark",
		"mystudent",
		"mystudent 3",
		"mystudent 2",
		"mystudent 1",
		'mystudent "Mari"',
		"mystudent Hoshino",
		"eleph",
		"claim eleph",
		"claim eleph 3",
		"claim eleph <student>",
	],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const cmd = ctx.commandName.toLowerCase()
		const subArg = (args[0] || "").toLowerCase()
		const { canonicalJid: senseiJid } = await resolveCanonicalSensei(ctx)

		// ──────────────────────────────────────────
		// 1. DAILY PYROXENE CLAIM (.daily)
		// ──────────────────────────────────────────
		if (cmd === "daily" || (cmd === "gacha" && subArg === "daily")) {
			const res = await gachaRepository.claimDaily(ctx.agentId, senseiJid)
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
		// 1b. ELEPH CLAIM & RECYCLING (.claim eleph / .claimeleph / .eleph)
		// ──────────────────────────────────────────
		const isClaimElephAction =
			cmd === "claimeleph" ||
			(cmd === "claim" &&
				(subArg === "eleph" || subArg === "all" || !subArg)) ||
			(cmd === "eleph" &&
				(subArg === "claim" ||
					subArg === "convert" ||
					subArg === "tukar" ||
					subArg === "all")) ||
			((cmd === "gacha" || cmd === "pull") &&
				subArg === "eleph" &&
				(args[1]?.toLowerCase() === "claim" ||
					args[1]?.toLowerCase() === "convert" ||
					args[1]?.toLowerCase() === "tukar"))

		if (isClaimElephAction) {
			// Determine filter parameter (e.g. .claim eleph 3, .claim eleph shiroko)
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

		// ── Eleph Inventory Overview (.eleph) ──
		if (
			cmd === "eleph" ||
			((cmd === "gacha" || cmd === "pull") && subArg === "eleph")
		) {
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
				senseiJid,
			)
			const collection = await gachaRepository.getCollection(
				ctx.agentId,
				senseiJid,
			)

			const threeStars = collection.filter((s) => s.starGrade === 3)
			const twoStars = collection.filter((s) => s.starGrade === 2)
			const oneStars = collection.filter((s) => s.starGrade === 1)

			// Determine query param if passed: e.g. !mystudent, !mystudent 3, !mystudent "Mari", !mystudent Hoshino
			let queryParam = args.join(" ").trim()
			if (
				(cmd === "gacha" || cmd === "pull") &&
				(subArg === "students" ||
					subArg === "my" ||
					subArg === "profile" ||
					subArg === "mystudent")
			) {
				queryParam = args.slice(1).join(" ").trim()
			}

			// Clean quotes and extra whitespace (e.g. "Mari", 'Mari', “Mari”)
			const cleanQuery = queryParam
				.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
				.trim()
			const normalizedFilter = cleanQuery
				.toLowerCase()
				.replace(/[^a-z0-9]/g, "")

			// ── Case A: Specific Filter for 3★ Students ──
			if (
				normalizedFilter === "3" ||
				normalizedFilter === "3star" ||
				normalizedFilter === "3stars" ||
				normalizedFilter === "3s"
			) {
				let text = `╔══════════════════════════╗\n`
				text += `  🌟 *3★ SENSEI ROSTER (${threeStars.length})*\n`
				text += `╚══════════════════════════╝\n\n`
				text += `👤 *Sensei:* @${senseiJid.split("@")[0]}\n`
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
				text += `• *${ctx.prefix}mystudent <nama>* — Detail status & bond murid (cth: *${ctx.prefix}mystudent "Mari"*)\n`
				text += `• *${ctx.prefix}mystudent 2* — Lihat seluruh murid 2★\n`
				text += `• *${ctx.prefix}mystudent 1* — Lihat seluruh murid 1★\n`
				text += `• *${ctx.prefix}mystudent* — Ringkasan profil & balance`
				await ctx.reply(text)
				return
			}

			// ── Case B: Specific Filter for 2★ Students ──
			if (
				normalizedFilter === "2" ||
				normalizedFilter === "2star" ||
				normalizedFilter === "2stars" ||
				normalizedFilter === "2s"
			) {
				let text = `╔══════════════════════════╗\n`
				text += `  ⭐ *2★ SENSEI ROSTER (${twoStars.length})*\n`
				text += `╚══════════════════════════╝\n\n`
				text += `👤 *Sensei:* @${senseiJid.split("@")[0]}\n`
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
				text += `• *${ctx.prefix}mystudent <nama>* — Detail status & bond murid (cth: *${ctx.prefix}mystudent "Mari"*)\n`
				text += `• *${ctx.prefix}mystudent 3* — Lihat seluruh murid 3★\n`
				text += `• *${ctx.prefix}mystudent 1* — Lihat seluruh murid 1★\n`
				text += `• *${ctx.prefix}mystudent* — Ringkasan profil & balance`
				await ctx.reply(text)
				return
			}

			// ── Case C: Specific Filter for 1★ Students ──
			if (
				normalizedFilter === "1" ||
				normalizedFilter === "1star" ||
				normalizedFilter === "1stars" ||
				normalizedFilter === "1s"
			) {
				let text = `╔══════════════════════════╗\n`
				text += `  ⭐ *1★ SENSEI ROSTER (${oneStars.length})*\n`
				text += `╚══════════════════════════╝\n\n`
				text += `👤 *Sensei:* @${senseiJid.split("@")[0]}\n`
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
				text += `• *${ctx.prefix}mystudent <nama>* — Detail status & bond murid (cth: *${ctx.prefix}mystudent "Mari"*)\n`
				text += `• *${ctx.prefix}mystudent 3* — Lihat seluruh murid 3★\n`
				text += `• *${ctx.prefix}mystudent 2* — Lihat seluruh murid 2★\n`
				text += `• *${ctx.prefix}mystudent* — Ringkasan profil & balance`
				await ctx.reply(text)
				return
			}

			// ── Case D: General Overview (.mystudent, .mystudent all, or .mystudent profile) ──
			if (
				!cleanQuery ||
				cleanQuery.toLowerCase() === "all" ||
				cleanQuery.toLowerCase() === "profile"
			) {
				let text = `╔══════════════════════════╗\n`
				text += `  🎓 *SCHALE SENSEI RECORD*\n`
				text += `╚══════════════════════════╝\n\n`
				text += `👤 *Sensei:* @${senseiJid.split("@")[0]}\n`
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
				text += `• *${ctx.prefix}mystudent <nama_murid>* — Cek detail status & bond murid (cth: *${ctx.prefix}mystudent "Mari"*)\n`
				text += `• *${ctx.prefix}mystudent 1 / 2 / 3* — Lihat daftar lengkap per bintang\n`
				text += `• *${ctx.prefix}eleph* / *${ctx.prefix}claim eleph* — Rincian & klaim duplikat Eleph ke Pyroxenes\n`
				text += `• *${ctx.prefix}daily* — Klaim 1.200 Pyroxenes harian (Reset 06:00 WIB)\n`
				text += `• *${ctx.prefix}gacha 10* — Rekrut 10 Murid Kivotos\n`
				text += `• *${ctx.prefix}spark* — Tukar 200 Poin untuk jaminan murid 3★`

				await ctx.reply(text)
				return
			}

			// ── Case E: Specific Student Status & MomoTalk Bond Details (.mystudent <name>) ──
			const [allSchale, canonicalMatches] = await Promise.all([
				getSchaleStudents(),
				searchSchaleStudent(cleanQuery),
			])
			const schaleMap = new Map(allSchale.map((s) => [s.Id, s]))
			const canonicalStudent = canonicalMatches[0]

			// Score each student owned by Sensei using multi-tier relevance scoring
			const scoredCollection = collection
				.map((s) => {
					const schaleInfo = schaleMap.get(s.studentId)
					const score = getStudentMatchScore(
						s.studentName,
						cleanQuery,
						schaleInfo?.DevName,
						schaleInfo?.FamilyName,
						schaleInfo?.PersonalName,
					)
					return { item: s, schaleInfo, score }
				})
				.filter((s) => s.score > 0)
				.sort((a, b) => {
					if (b.score !== a.score) return b.score - a.score
					return a.item.studentName.localeCompare(b.item.studentName)
				})

			const bestOwned = scoredCollection[0]

			// Guard against student hijacking (e.g. searching "Mari" incorrectly selecting "Himari"):
			// If SchaleDB has a strong canonical match for what Sensei typed (score >= 5000),
			// but Sensei's best owned match is not an exact/word-boundary match (score < 5000),
			// Sensei asked for a student they haven't recruited yet.
			const schaleScore = canonicalStudent
				? getStudentMatchScore(
						canonicalStudent.Name,
						cleanQuery,
						canonicalStudent.DevName,
						canonicalStudent.FamilyName,
						canonicalStudent.PersonalName,
					)
				: 0

			const isNotOwned =
				!bestOwned ||
				(canonicalStudent && schaleScore >= 5000 && bestOwned.score < 5000)

			if (isNotOwned) {
				if (canonicalStudent) {
					const starStr = "⭐".repeat(canonicalStudent.StarGrade)
					let text = `╔══════════════════════════╗\n`
					text += `  ❌ *MURID BELUM DIREKRUT*\n`
					text += `╚══════════════════════════╝\n\n`
					text += `Sensei, kamu belum merekrut *${canonicalStudent.Name}* [${starStr}] ke dalam roster SCHALE milikmu!\n\n`
					text += `🏫 *Sekolah:* ${canonicalStudent.School || "Kivotos"}\n`
					text += `🏛️ *Klub:* ${canonicalStudent.Club || "General"}\n`
					text += `⚔️ *Role:* ${formatSquadType(canonicalStudent.SquadType)}\n`
					text += `🎯 *Attack:* ${formatBulletType(canonicalStudent.BulletType)}\n`
					text += `🛡️ *Armor:* ${formatArmorType(canonicalStudent.ArmorType)}\n\n`
					text += `💡 *Cara Merekrut:*\n`
					text += `• Rekrut melalui gacha banner: *${ctx.prefix}gacha 10*\n`
					text += `• Cek murid yang sudah kamu miliki: *${ctx.prefix}mystudent*`

					// Try to send with student collection artwork
					try {
						const imgBuffer = await fetchSchaleImageBuffer([
							getStudentImageUrl(canonicalStudent.Id, "collection"),
							getStudentImageUrl(canonicalStudent.Id, "portrait"),
						])
						if (imgBuffer) {
							await ctx.reply({ image: imgBuffer, caption: text })
							return
						}
					} catch (imgErr) {
						logger.warn(
							"/commands/bluearchive/gacha.ts",
							`Image fetch failed: ${imgErr}`,
						)
					}

					await ctx.reply(text)
					return
				}

				await ctx.reply(
					`❌ Murid dengan nama *"${cleanQuery}"* tidak ditemukan di database Kivotos (SchaleDB)!\n\n` +
						`💡 *Tips:* Pastikan ejaan nama murid benar, contoh:\n` +
						`• *${ctx.prefix}mystudent "Mari"*\n` +
						`• *${ctx.prefix}mystudent Hoshino*\n` +
						`• *${ctx.prefix}mystudent Shiroko*`,
				)
				return
			}

			// Student IS recruited and owned by Sensei
			const target = bestOwned.item
			const schale = bestOwned.schaleInfo || schaleMap.get(target.studentId)
			const bond = await momoRepository.getBond(
				ctx.agentId,
				senseiJid,
				target.studentId,
				target.studentName,
			)

			const starStr = "⭐".repeat(target.starGrade)
			const reqExp = momoRepository.getRequiredExp(bond.bondLevel)
			const expPercent =
				bond.bondLevel >= 20
					? 100
					: Math.min(100, Math.floor((bond.bondExp / reqExp) * 100))
			const filledBlocks = Math.floor(expPercent / 10)
			const emptyBlocks = 10 - filledBlocks
			const progressBar = "█".repeat(filledBlocks) + "░".repeat(emptyBlocks)

			const dupeCount = Math.max(0, target.count - 1)
			const elephPerDupe =
				ELEPH_CONFIG.ELEPH_PER_DUPLICATE[target.starGrade] || 1
			const totalEleph = dupeCount * elephPerDupe
			const pyroxeneYield = totalEleph * ELEPH_CONFIG.PYROXENES_PER_ELEPH

			let text = `╔══════════════════════════╗\n`
			text += `  📋 *DATA MAHASISWA & BOND*\n`
			text += `╚══════════════════════════╝\n\n`
			text += `🌸 *Nama:* ${target.studentName} [${starStr}]\n`
			if (schale?.School) {
				text += `🏫 *Sekolah:* ${schale.School}  |  🏛️ *Klub:* ${schale.Club || "General"}\n`
			}
			if (schale?.SquadType) {
				text += `⚔️ *Role:* ${formatSquadType(schale.SquadType)}  |  🎯 *Attack:* ${formatBulletType(schale.BulletType)}\n`
				text += `🛡️ *Armor:* ${formatArmorType(schale.ArmorType)}  |  🔫 *Weapon:* ${schale.WeaponType}\n`
			}

			text += `\n📦 *Status Kepemilikan (Roster):*\n`
			text += `• *Total Tarikan:* ${target.count}x didapatkan\n`
			if (dupeCount > 0) {
				text += `• *Eleph Tersedia:* ${totalEleph} Eleph _(${dupeCount} duplikat)_\n`
				text += `• *Nilai Tukar Fair:* +${pyroxeneYield.toLocaleString("en-US")} 💎 Pyroxenes\n`
				text += `  _(Ketik *${ctx.prefix}claim eleph ${target.studentName}* untuk menukar)_\n`
			} else {
				text += `• *Eleph Tersedia:* 0 Eleph _(Murid Utama / Base Student)_\n`
			}
			if (target.firstObtainedAt) {
				const dateStr = new Date(target.firstObtainedAt).toLocaleDateString(
					"id-ID",
					{
						day: "numeric",
						month: "short",
						year: "numeric",
					},
				)
				text += `• *Pertama Kali Direkrut:* ${dateStr}\n`
			}

			text += `\n💖 *Status Hubungan (MomoTalk Bond):*\n`
			text += `• *Bond Level:* Lv. ${bond.bondLevel} / 20\n`
			if (bond.bondLevel >= 20) {
				text += `• *EXP:* [██████████] MAX (Level Maksimal)\n`
			} else {
				text += `• *EXP:* [${progressBar}] ${bond.bondExp}/${reqExp} (${expPercent}%)\n`
			}
			const lobbyUnlocked = bond.bondLevel >= 5
			text += `• *Memorial Lobby:* ${lobbyUnlocked ? "🔓 Unlocked (Live2D Aktif)" : `🔒 Terkunci (Perlu Lv. 5 — sisa ${5 - bond.bondLevel} level)`}\n`
			text += `• *Total Percakapan:* ${bond.totalTalks} kali interaksi\n`
			if (bond.totalTalks > 0 && bond.lastTalk) {
				const lastTalkDate = new Date(bond.lastTalk).toLocaleDateString(
					"id-ID",
					{
						day: "numeric",
						month: "short",
						year: "numeric",
						hour: "2-digit",
						minute: "2-digit",
					},
				)
				text += `• *Interaksi Terakhir:* ${lastTalkDate} WIB\n`
			}

			text += `\n💡 *Aksi Rekomendasi:*\n`
			text += `• *${ctx.prefix}momotalk ${target.studentName}* — Buka obrolan MomoTalk & naikkan Bond\n`
			if (dupeCount > 0) {
				text += `• *${ctx.prefix}claim eleph ${target.studentName}* — Klaim +${pyroxeneYield.toLocaleString("en-US")} 💎 dari ${totalEleph} Eleph\n`
			}
			text += `• *${ctx.prefix}student ${target.studentName}* — Lihat wiki info lengkap & bio`

			// Send with student collection artwork if available
			try {
				const imgBuffer = await fetchSchaleImageBuffer([
					getStudentImageUrl(target.studentId, "collection"),
					getStudentImageUrl(target.studentId, "portrait"),
				])
				if (imgBuffer) {
					await ctx.reply({ image: imgBuffer, caption: text })
					return
				}
			} catch (imgErr) {
				logger.warn(
					"/commands/bluearchive/gacha.ts",
					`Image fetch failed: ${imgErr}`,
				)
			}

			await ctx.reply(text)
			return
		}

		// ──────────────────────────────────────────
		// 3. SPARK 200 PITY REDEMPTION (.spark)
		// ──────────────────────────────────────────
		if (cmd === "spark" || subArg === "spark") {
			const profile = await gachaRepository.getOrCreateProfile(
				ctx.agentId,
				senseiJid,
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
			await gachaRepository.redeemSpark(ctx.agentId, senseiJid)
			const sparkRes = await executeGachaPull(1, true)
			const picked = sparkRes.threeStars[0]!

			const { isNew, count } = await gachaRepository.saveStudent(
				ctx.agentId,
				senseiJid,
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
				const imgBuf = await fetchSchaleImageBuffer([
					getStudentImageUrl(picked.Id, "collection"),
					getStudentImageUrl(picked.Id, "portrait"),
				])
				if (imgBuf) {
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
