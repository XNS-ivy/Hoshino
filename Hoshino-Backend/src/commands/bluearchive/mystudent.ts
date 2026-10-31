import type { CommandContext, ICommand } from "@customTypes/command"
import { ELEPH_CONFIG, gachaRepository } from "@repositories/gacha.repository"
import { momoRepository } from "@repositories/momo.repository"
import { logger } from "@utils/logger"
import {
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
	name: ["mystudent", "students", "pyroxene"],
	category: "bluearchive",
	description:
		"View Sensei's Pyroxene balance, recruited student collection by star grade, or detailed owned student status & MomoTalk bond",
	usage: [
		"mystudent",
		"mystudent 3",
		"mystudent 2",
		"mystudent 1",
		'mystudent "Mari"',
		"mystudent Hoshino",
	],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		try {
			const { canonicalJid: senseiJid } = await resolveCanonicalSensei(ctx)
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

			const queryParam = args.join(" ").trim()
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
							"/commands/bluearchive/mystudent.ts",
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
					"/commands/bluearchive/mystudent.ts",
					`Image fetch failed: ${imgErr}`,
				)
			}

			await ctx.reply(text)
		} catch (error) {
			logger.error(
				"/commands/bluearchive/mystudent.ts",
				`MyStudent error: ${error}`,
			)
			await ctx.reply("⚠️ An error occurred while viewing your student roster.")
		}
	},
}

export default command

