import type { CommandContext, ICommand } from "@customTypes/command"
import { gachaRepository } from "@repositories/gacha.repository"
import { logger } from "@utils/logger"
import { formatArmorType, formatBulletType } from "@utils/schaledb"
import {
	findOwnedStudentByQuery,
	resolveCanonicalSensei,
	resolveSenseiSquad,
} from "./upgrade"

const command: ICommand = {
	name: ["squad", "party"],
	category: "bluearchive",
	description:
		"Manage Sensei's 4 Striker + 2 Special tactical combat squad formation for Raid Bosses, Weekly Bounties, and PvP Duels",
	usage: [
		"squad",
		"squad set <student1>, <student2>...",
		"squad set <student1> <student2>...",
		"squad auto",
	],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const invoked = (ctx.commandName || "squad").toLowerCase()

		try {
			const { canonicalJid } = await resolveCanonicalSensei(ctx)
			const profile = await gachaRepository.refreshTicketsIfNeeded(
				ctx.agentId,
				canonicalJid,
			)

			const sub = args[0]?.toLowerCase()

			if (sub === "auto" || sub === "reset" || sub === "clear") {
				await gachaRepository.setSquad(ctx.agentId, canonicalJid, [], [])
				const squad = await resolveSenseiSquad(ctx.agentId, canonicalJid)
				await ctx.reply(
					`✅ *Squad Reset to Auto-Best Formation!*\n⚡ *Total Combat Power:* ${squad.totalCombatPower.toLocaleString()} CP`,
				)
				return
			}

			const isSetMode =
				sub === "set" ||
				(args.length > 0 &&
					sub !== "view" &&
					sub !== "info" &&
					sub !== "list" &&
					sub !== "status")

			if (isSetMode) {
				const rawList = (sub === "set" ? args.slice(1) : args)
					.join(" ")
					.trim()
				if (!rawList) {
					await ctx.reply(
						`⚠️ Please provide student names!\nExample:\n• *${ctx.prefix}squad set Hoshino, Shiroko, Aru, Mika, Himari, Fuuka*\n• *${ctx.prefix}squad set Suzumi Toki Serina Ayane*`,
					)
					return
				}

				// Parse student queries: support both comma/pipe/slash delimiters AND space-separated student names
				let names: string[] = []
				if (/[,|/;]/.test(rawList)) {
					names = rawList
						.split(/[,|/;]+/)
						.map((s) => s.trim())
						.filter(Boolean)
				} else {
					// Greedy n-gram tokenizer for space-separated names (handles multi-word names like "Toki (Armed)" or "Takanashi Hoshino")
					const words = rawList.split(/\s+/).filter(Boolean)
					let i = 0
					while (i < words.length) {
						let matchedChunk: string | null = null
						let matchedLen = 1
						for (let len = Math.min(4, words.length - i); len >= 2; len--) {
							const phrase = words.slice(i, i + len).join(" ")
							const candidate = await findOwnedStudentByQuery(
								ctx.agentId,
								canonicalJid,
								phrase,
							)
							if (
								candidate &&
								words
									.slice(i, i + len)
									.every((w) =>
										`${candidate.schale.Name} ${candidate.schale.FamilyName || ""} ${candidate.schale.PersonalName || ""}`
											.toLowerCase()
											.includes(w.replace(/[()]/g, "").toLowerCase()),
									)
							) {
								matchedChunk = phrase
								matchedLen = len
								break
							}
						}
						if (matchedChunk) {
							names.push(matchedChunk)
							i += matchedLen
						} else {
							names.push(words[i]!)
							i += 1
						}
					}
				}

				const strikers: number[] = []
				const specials: number[] = []
				const chosenNames: string[] = []
				const notFound: string[] = []

				for (const n of names) {
					const found = await findOwnedStudentByQuery(
						ctx.agentId,
						canonicalJid,
						n,
					)
					if (!found) {
						notFound.push(n)
						continue
					}
					if (found.schale.SquadType === "Main") {
						if (
							strikers.length < 4 &&
							!strikers.includes(found.owned.studentId)
						) {
							strikers.push(found.owned.studentId)
							chosenNames.push(`⚔️ ${found.schale.Name}`)
						}
					} else {
						if (
							specials.length < 2 &&
							!specials.includes(found.owned.studentId)
						) {
							specials.push(found.owned.studentId)
							chosenNames.push(`🛡️ ${found.schale.Name}`)
						}
					}
				}

				if (chosenNames.length === 0) {
					const ownedCollection = await gachaRepository.getCollection(
						ctx.agentId,
						canonicalJid,
					)
					const sampleNames = ownedCollection
						.slice(0, 8)
						.map((c) => c.studentName)
						.join(", ")
					await ctx.reply(
						`❌ Could not find *${notFound.join(", ")}* in your recruited student roster!\n\n` +
							(sampleNames
								? `💡 *Your Owned Students:* ${sampleNames}\nUse *${ctx.prefix}squad set <student1>, <student2>* with students you own.`
								: `💡 You haven't recruited any students yet! Use *${ctx.prefix}gacha 10* first.`),
					)
					return
				}

				// Preserve existing custom slots if user only updated Strikers or only updated Specials
				const finalStrikers =
					strikers.length > 0 ? strikers : profile.squadStrikers
				const finalSpecials =
					specials.length > 0 ? specials : profile.squadSpecials

				await gachaRepository.setSquad(
					ctx.agentId,
					canonicalJid,
					finalStrikers,
					finalSpecials,
				)
				const updatedSquad = await resolveSenseiSquad(
					ctx.agentId,
					canonicalJid,
				)

				let reply = `✅ *TACTICAL SQUAD UPDATED!*\n`
				reply += `───────────────────────────\n`
				reply += `📌 *Assigned:* ${chosenNames.join(", ")}\n`
				if (notFound.length > 0) {
					reply += `⚠️ *Not in roster:* ${notFound.join(", ")}\n`
				}
				reply += `⚡ *Total Squad Combat Power:* *${updatedSquad.totalCombatPower.toLocaleString()} CP*\n\n`
				reply += `⚔️ *Strikers:* ${updatedSquad.strikers.map((s) => `${s.schale.Name} (Lv.${s.owned.level})`).join(", ") || "None"}\n`
				reply += `🛡️ *Specials:* ${updatedSquad.specials.map((s) => `${s.schale.Name} (Lv.${s.owned.level})`).join(", ") || "None"}`
				await ctx.reply(reply)
				return
			}

			const squad = await resolveSenseiSquad(ctx.agentId, canonicalJid)
			if (squad.strikers.length === 0 && squad.specials.length === 0) {
				await ctx.reply(
					`📭 You don't have any students in your squad yet! Use *${ctx.prefix}gacha 10* first.`,
				)
				return
			}

			let text = `🛡️ *SENSEI TACTICAL SQUAD FORMATION*\n`
			text += `───────────────────────────\n`
			text += `👤 *Sensei:* ${ctx.pushName}\n`
			text += `⚡ *Total Combat Power:* *${squad.totalCombatPower.toLocaleString()} CP*\n`
			text += `🏆 *PvP Record:* ${profile.pvpWins}W - ${profile.pvpLosses}L\n`
			text += `───────────────────────────\n\n`

			text += `⚔️ *STRIKER UNIT (Frontline - Max 4):*\n`
			if (squad.strikers.length === 0) {
				text += `  _No Strikers owned_\n`
			} else {
				for (const s of squad.strikers) {
					const stars = "★".repeat(s.owned.starGrade)
					const ue = s.owned.weaponStar > 0 ? ` [UE${s.owned.weaponStar}★]` : ""
					text += `  • *${s.schale.Name}* (${stars}${ue}) — *Lv.${s.owned.level}*\n`
					text += `    ${formatBulletType(s.schale.BulletType)} | ${formatArmorType(s.schale.ArmorType)} | ⚡ ${s.stats.combatPower.toLocaleString()} CP\n`
					text += `    Skills: EX${s.owned.exSkillLevel} / ${s.owned.normalSkillLevel}/${s.owned.passiveSkillLevel}/${s.owned.subSkillLevel} | Gear: T${s.owned.equipSlot1Tier}/T${s.owned.equipSlot2Tier}/T${s.owned.equipSlot3Tier}\n`
				}
			}

			text += `\n🛡️ *SPECIAL UNIT (Backline Support - Max 2):*\n`
			if (squad.specials.length === 0) {
				text += `  _No Specials owned_\n`
			} else {
				for (const s of squad.specials) {
					const stars = "★".repeat(s.owned.starGrade)
					const ue = s.owned.weaponStar > 0 ? ` [UE${s.owned.weaponStar}★]` : ""
					text += `  • *${s.schale.Name}* (${stars}${ue}) — *Lv.${s.owned.level}*\n`
					text += `    ${formatBulletType(s.schale.BulletType)} | ⚡ ${s.stats.combatPower.toLocaleString()} CP | Bond ♥${s.bondLevel}\n`
					text += `    Skills: EX${s.owned.exSkillLevel} / ${s.owned.normalSkillLevel}/${s.owned.passiveSkillLevel}/${s.owned.subSkillLevel} | Gear: T${s.owned.equipSlot1Tier}/T${s.owned.equipSlot2Tier}/T${s.owned.equipSlot3Tier}\n`
				}
			}

			text += `\n───────────────────────────\n`
			text += `💡 *Customize Squad:* *${ctx.prefix}squad set Student1, Student2, Student3...*\n`
			text += `💡 *Auto-Pick Best:* *${ctx.prefix}squad auto*`
			await ctx.reply(text)
		} catch (error) {
			const errMsg = error instanceof Error ? error.message : String(error)
			logger.error(
				"/commands/bluearchive/squad.ts",
				`Command "${invoked}" error: ${errMsg}`,
			)
			await ctx.reply(
				`⚠️ An error occurred while processing *${ctx.prefix}${invoked}*: ${errMsg}`,
			)
		}
	},
}

export default command

