import type { CommandContext, ICommand } from "@customTypes/command"
import {
	gachaRepository,
	type SenseiStudentItem,
} from "@repositories/gacha.repository"
import { momoRepository } from "@repositories/momo.repository"
import {
	extractSenderIdentities,
	findGroupParticipants,
	getParticipantIdentities,
	resolveUserIdentities,
} from "@services/contextBuilder"
import { logger } from "@utils/logger"
import {
	calculateStudentCombatStats,
	fetchSchaleImageBuffer,
	formatArmorType,
	formatBulletType,
	formatSquadType,
	getEquipmentByCategoryAndTier,
	getSchaleStudents,
	getSkillUpgradeRecipe,
	getStudentImageUrl,
	getStudentMatchScore,
	type SchaleStudent,
} from "@utils/schaledb"

/**
 * Resolves all known `@lid` and `@s.whatsapp.net` identities for a Sensei in a group or DM,
 * and returns the canonical `user_jid` that owns their students in PostgreSQL.
 */
export async function resolveCanonicalSensei(
	ctx: CommandContext,
	rawTargetJids?: (string | undefined | null)[],
): Promise<{ canonicalJid: string; allIdentities: string[] }> {
	const groupMeta = ctx.isGroup ? await ctx.getGroupMetadata() : null

	let seeds: (string | undefined | null)[]
	if (rawTargetJids && rawTargetJids.length > 0) {
		seeds = rawTargetJids
	} else {
		const { senderIdentities } = extractSenderIdentities(ctx.sock, ctx.rawMsg)
		seeds = [ctx.senderJid, ...senderIdentities]
	}

	const cleanSeeds = seeds.filter(
		(s): s is string =>
			typeof s === "string" && s.length > 0 && !s.endsWith("@g.us"),
	)

	const resolved = await resolveUserIdentities(
		ctx.sock,
		cleanSeeds,
		groupMeta,
		true,
	)

	const identitySet = new Set<string>([...cleanSeeds, ...resolved])

	if (groupMeta?.participants?.length) {
		const matchedParticipants = findGroupParticipants(
			groupMeta.participants,
			Array.from(identitySet),
		)
		for (const p of matchedParticipants) {
			for (const pid of getParticipantIdentities(p)) {
				if (!pid.endsWith("@g.us")) identitySet.add(pid)
			}
		}
	}

	const allIdentities = Array.from(identitySet).filter(
		(id) => Boolean(id) && !id.endsWith("@g.us"),
	)
	const canonicalJid = await gachaRepository.resolveUserJid(
		ctx.agentId,
		allIdentities,
	)
	if (canonicalJid && !allIdentities.includes(canonicalJid)) {
		allIdentities.unshift(canonicalJid)
	}

	return { canonicalJid, allIdentities }
}

/**
 * Resolves the best matching owned student from Sensei's roster using deterministic scoring.
 */
export async function findOwnedStudentByQuery(
	agentId: string,
	userJid: string,
	query: string,
): Promise<{
	owned: SenseiStudentItem
	schale: SchaleStudent
} | null> {
	const [collection, allSchale] = await Promise.all([
		gachaRepository.getCollection(agentId, userJid),
		getSchaleStudents(),
	])
	if (collection.length === 0) return null

	const schaleMap = new Map<number, SchaleStudent>()
	for (const s of allSchale) {
		schaleMap.set(s.Id, s)
	}

	const q = query
		.replace(/["'“”‘’`]/g, "")
		.trim()
		.toLowerCase()
	if (!q) return null

	// Direct ID match
	const numId = Number.parseInt(q, 10)
	if (!Number.isNaN(numId) && String(numId) === q) {
		const exactOwned = collection.find((c) => c.studentId === numId)
		const schale = schaleMap.get(numId)
		if (exactOwned && schale) {
			return { owned: exactOwned, schale }
		}
	}

	let bestMatch: {
		owned: SenseiStudentItem
		schale: SchaleStudent
		score: number
	} | null = null

	for (const item of collection) {
		const schale = schaleMap.get(item.studentId)
		if (!schale) continue
		const score = getStudentMatchScore(
			schale.Name,
			q,
			schale.DevName,
			schale.FamilyName,
			schale.PersonalName,
		)
		if (score > 0 && (!bestMatch || score > bestMatch.score)) {
			bestMatch = { owned: item, schale, score }
		}
	}

	return bestMatch ? { owned: bestMatch.owned, schale: bestMatch.schale } : null
}

/**
 * Resolves Sensei's active 4 Strikers + 2 Specials squad (custom or auto-picked highest CP).
 */
export async function resolveSenseiSquad(
	agentId: string,
	userJid: string,
): Promise<{
	strikers: Array<{
		owned: SenseiStudentItem
		schale: SchaleStudent
		bondLevel: number
		stats: ReturnType<typeof calculateStudentCombatStats>
	}>
	specials: Array<{
		owned: SenseiStudentItem
		schale: SchaleStudent
		bondLevel: number
		stats: ReturnType<typeof calculateStudentCombatStats>
	}>
	totalCombatPower: number
}> {
	const [profile, collection, bonds, allSchale] = await Promise.all([
		gachaRepository.getOrCreateProfile(agentId, userJid),
		gachaRepository.getCollection(agentId, userJid),
		momoRepository.getAllBonds(agentId, userJid),
		getSchaleStudents(),
	])

	const schaleMap = new Map<number, SchaleStudent>()
	for (const s of allSchale) schaleMap.set(s.Id, s)

	const bondMap = new Map<number, number>()
	for (const b of bonds) bondMap.set(b.studentId, b.bondLevel)

	const enriched = collection
		.map((owned) => {
			const schale = schaleMap.get(owned.studentId)
			if (!schale) return null
			const bondLevel = bondMap.get(owned.studentId) || 1
			const stats = calculateStudentCombatStats(schale, {
				...owned,
				bondLevel,
			})
			return { owned, schale, bondLevel, stats }
		})
		.filter((x): x is NonNullable<typeof x> => x !== null)

	const allStrikers = enriched
		.filter((e) => e.schale.SquadType === "Main")
		.sort((a, b) => b.stats.combatPower - a.stats.combatPower)
	const allSpecials = enriched
		.filter((e) => e.schale.SquadType !== "Main")
		.sort((a, b) => b.stats.combatPower - a.stats.combatPower)

	let strikers = profile.squadStrikers
		.map((id) => allStrikers.find((s) => s.owned.studentId === id))
		.filter((x): x is NonNullable<typeof x> => Boolean(x))

	for (const candidate of allStrikers) {
		if (strikers.length >= 4) break
		if (!strikers.some((s) => s.owned.studentId === candidate.owned.studentId)) {
			strikers.push(candidate)
		}
	}

	let specials = profile.squadSpecials
		.map((id) => allSpecials.find((s) => s.owned.studentId === id))
		.filter((x): x is NonNullable<typeof x> => Boolean(x))

	for (const candidate of allSpecials) {
		if (specials.length >= 2) break
		if (!specials.some((s) => s.owned.studentId === candidate.owned.studentId)) {
			specials.push(candidate)
		}
	}

	const totalCombatPower =
		strikers.reduce((sum, s) => sum + s.stats.combatPower, 0) +
		specials.reduce((sum, s) => sum + s.stats.combatPower, 0)

	return { strikers, specials, totalCombatPower }
}

const command: ICommand = {
	name: [
		"upgrade",
		"levelup",
		"skillup",
		"gearup",
		"mystic",
		"inventory",
		"bag",
		"materials",
		"squad",
		"party",
	],
	category: "bluearchive",
	description:
		"Upgrade Blue Archive students (Level, EX/Sub Skills, Equipment T1-T9, Mystic Star/UE) using authentic SchaleDB materials, manage Inventory, and configure your 4 Striker + 2 Special Squad",
	usage: [
		"upgrade <student>",
		"upgrade <student> level [levels]",
		"upgrade <student> ex",
		"upgrade <student> skill [normal|passive|sub]",
		"upgrade <student> gear [1|2|3]",
		"upgrade <student> star",
		"inventory",
		"squad",
		"squad set <student1>, <student2>...",
	],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const invoked = (ctx.commandName || "upgrade").toLowerCase()

		try {
			const { canonicalJid } = await resolveCanonicalSensei(ctx)
			const profile = await gachaRepository.refreshTicketsIfNeeded(
				ctx.agentId,
				canonicalJid,
			)

			// =========================================================================
			// 1. INVENTORY / MATERIALS VIEW (.inventory, .bag, .materials)
			// =========================================================================
			if (
				invoked === "inventory" ||
				invoked === "bag" ||
				invoked === "materials"
			) {
				const inv = await gachaRepository.getInventory(
					ctx.agentId,
					canonicalJid,
				)

				let text = `🎒 *SCHALE MATERIAL INVENTORY*\n`
				text += `───────────────────────────\n`
				text += `👤 *Sensei:* ${ctx.pushName}\n`
				text += `💎 *Pyroxenes:* ${profile.pyroxenes.toLocaleString()}\n`
				text += `🪙 *Credits:* ${profile.credits.toLocaleString()}\n`
				text += `🎫 *Raid Tickets:* ${profile.raidTickets}/3 | *Bounty:* ${profile.bountyTickets}/3\n`
				text += `───────────────────────────\n\n`

				if (inv.length === 0) {
					text += `📭 *Your material bag is currently empty!*\n\n`
					text += `💡 *How to get SchaleDB Upgrade Materials:*\n`
					text += `• *${ctx.prefix}daily* — Claim 1,200 Pyroxenes, 250,000 Credits & Activity Reports\n`
					text += `• *${ctx.prefix}raid attack* — Fight Total Assault Raid Bosses for Blu-rays, Tech Notes & Oopart Artifacts\n`
					text += `• *${ctx.prefix}weeklyboss* — Clear Weekly Bounty Bosses for targeted school materials & Equipment Blueprints`
					await ctx.reply(text)
					return
				}

				const reports = inv.filter((i) => i.category === "CharacterExpGrowth")
				const blurays = inv.filter((i) => i.category === "CDItem")
				const technotes = inv.filter((i) => i.category === "BookItem")
				const artifacts = inv.filter((i) => i.category === "Artifact")
				const blueprints = inv.filter(
					(i) =>
						i.category === "Equipment" ||
						(i.category !== "CharacterExpGrowth" &&
							i.category !== "CDItem" &&
							i.category !== "BookItem" &&
							i.category !== "Artifact"),
				)

				if (reports.length > 0) {
					text += `📘 *Activity Reports (Level EXP):*\n`
					for (const item of reports) {
						text += `  • [${item.rarity}] ${item.itemName}: *×${item.count}*\n`
					}
					text += `\n`
				}
				if (blurays.length > 0) {
					text += `💿 *Tactical Training Blu-rays (EX Skill):*\n`
					for (const item of blurays) {
						text += `  • [${item.rarity}] ${item.itemName}: *×${item.count}*\n`
					}
					text += `\n`
				}
				if (technotes.length > 0) {
					text += `📓 *Tech Notes (Basic/Passive/Sub Skill):*\n`
					for (const item of technotes) {
						text += `  • [${item.rarity}] ${item.itemName}: *×${item.count}*\n`
					}
					text += `\n`
				}
				if (artifacts.length > 0) {
					text += `🏺 *Oopart Artifacts (SchaleDB Relics):*\n`
					for (const item of artifacts) {
						text += `  • [${item.rarity}] ${item.itemName}: *×${item.count}*\n`
					}
					text += `\n`
				}
				if (blueprints.length > 0) {
					text += `🛠️ *Equipment Blueprints & Gear:*\n`
					for (const item of blueprints) {
						text += `  • [${item.rarity}] ${item.itemName}: *×${item.count}*\n`
					}
					text += `\n`
				}

				text += `───────────────────────────\n`
				text += `💡 Upgrade a student with *${ctx.prefix}upgrade <student name>*`
				await ctx.reply(text)
				return
			}

			// =========================================================================
			// 2. SQUAD / PARTY FORMATION (.squad, .party)
			// =========================================================================
			if (invoked === "squad" || invoked === "party") {
				const sub = args[0]?.toLowerCase()

				if (sub === "auto") {
					await gachaRepository.setSquad(ctx.agentId, canonicalJid, [], [])
					const squad = await resolveSenseiSquad(ctx.agentId, canonicalJid)
					await ctx.reply(
						`✅ *Squad Reset to Auto-Best Formation!*\n⚡ *Total Combat Power:* ${squad.totalCombatPower.toLocaleString()} CP`,
					)
					return
				}

				if (sub === "set") {
					const rawList = args.slice(1).join(" ")
					const names = rawList
						.split(/[,|/]/)
						.map((s) => s.trim())
						.filter(Boolean)

					if (names.length === 0) {
						await ctx.reply(
							`⚠️ Please provide student names separated by commas!\nExample: *${ctx.prefix}squad set Hoshino, Shiroko, Aru, Mika, Himari, Fuuka*`,
						)
						return
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

					await gachaRepository.setSquad(
						ctx.agentId,
						canonicalJid,
						strikers,
						specials,
					)
					const updatedSquad = await resolveSenseiSquad(
						ctx.agentId,
						canonicalJid,
					)

					let reply = `✅ *TACTICAL SQUAD UPDATED!*\n`
					reply += `───────────────────────────\n`
					reply += `Assigned: ${chosenNames.join(", ") || "Auto-filled"}\n`
					if (notFound.length > 0) {
						reply += `⚠️ Not in roster: ${notFound.join(", ")}\n`
					}
					reply += `⚡ *Total Squad Combat Power:* ${updatedSquad.totalCombatPower.toLocaleString()} CP`
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
				return
			}

			// =========================================================================
			// 3. STUDENT UPGRADE & PROGRESSION (.upgrade, .levelup, .skillup, .gearup, .mystic)
			// =========================================================================
			if (args.length === 0) {
				await ctx.reply(
					`⬆️ *SCHALE STUDENT UPGRADE CENTER*\n` +
						`───────────────────────────\n` +
						`• *${ctx.prefix}upgrade <student>* — View student stats & required SchaleDB materials\n` +
						`• *${ctx.prefix}upgrade <student> level [amount]* — Level up student (Lv.1 ➔ 90)\n` +
						`• *${ctx.prefix}upgrade <student> ex* — Upgrade EX Skill (Lv.1 ➔ 5) using School Blu-rays & Ooparts\n` +
						`• *${ctx.prefix}upgrade <student> skill [normal|passive|sub]* — Upgrade Basic/Passive/Sub Skill (Lv.1 ➔ 10) using Tech Notes & Ooparts\n` +
						`• *${ctx.prefix}upgrade <student> gear [1|2|3]* — Upgrade Equipment Slot (T1 ➔ T9)\n` +
						`• *${ctx.prefix}upgrade <student> star* — Mystic Liberation (1★ ➔ 5★ & Unique Weapon UE)\n` +
						`• *${ctx.prefix}inventory* — Check owned SchaleDB materials & Credits`,
				)
				return
			}

			// Parse action keyword at the end or beginning
			const actionKeywords = ["level", "lv", "ex", "skill", "gear", "equip", "star", "mystic", "ue"]
			let action = ""
			let actionParam = ""
			let studentQueryParts = [...args]

			if (invoked === "levelup") action = "level"
			else if (invoked === "skillup") action = "ex"
			else if (invoked === "gearup") action = "gear"
			else if (invoked === "mystic") action = "star"

			// Check if last or second-to-last token is an action keyword
			const lastArg = args[args.length - 1]?.toLowerCase() || ""
			const secondLastArg = args.length >= 2 ? args[args.length - 2]?.toLowerCase() || "" : ""

			if (actionKeywords.includes(lastArg) && args.length >= 2) {
				action = lastArg
				studentQueryParts = args.slice(0, -1)
			} else if (actionKeywords.includes(secondLastArg) && args.length >= 3) {
				action = secondLastArg
				actionParam = lastArg
				studentQueryParts = args.slice(0, -2)
			} else if (
				action === "level" &&
				/^\d+$/.test(lastArg) &&
				args.length >= 2
			) {
				actionParam = lastArg
				studentQueryParts = args.slice(0, -1)
			}

			const studentQuery = studentQueryParts.join(" ").trim()
			const found = await findOwnedStudentByQuery(
				ctx.agentId,
				canonicalJid,
				studentQuery,
			)

			if (!found) {
				await ctx.reply(
					`❌ Student *"${studentQuery}"* was not found in your Sensei roster!\n` +
						`💡 Pull students via *${ctx.prefix}gacha 10* or check your collection with *${ctx.prefix}mystudent*.`,
				)
				return
			}

			let { owned, schale } = found
			const bond = await momoRepository.getBond(
				ctx.agentId,
				canonicalJid,
				owned.studentId,
				schale.Name,
			)
			const inv = await gachaRepository.getInventory(ctx.agentId, canonicalJid)
			const invMap = new Map<number, number>()
			for (const i of inv) invMap.set(Number(i.itemId), Number(i.count))

			// -------------------------------------------------------------------------
			// ACTION A: LEVEL UP (.upgrade <student> level [levels])
			// -------------------------------------------------------------------------
			if (action === "level" || action === "lv") {
				if (owned.level >= 90) {
					await ctx.reply(
						`🌟 *${schale.Name}* has already reached the maximum Level Cap (*Lv.90*)!`,
					)
					return
				}

				const levelsToGain = Math.max(
					1,
					Math.min(90 - owned.level, Number.parseInt(actionParam || "1", 10) || 1),
				)
				const targetLevel = owned.level + levelsToGain

				// Calculate required EXP reports & Credit cost
				// Each level step requires 1 Report unit (scales gently) + Credits
				const reportsNeeded = levelsToGain
				const creditCost = levelsToGain * (8000 + owned.level * 600)

				// Check total Activity Reports owned (#10 Novice=1, #11 Normal=2, #12 Advanced=5, #13 Superior=10 report points)
				const r10 = invMap.get(10) || 0
				const r11 = invMap.get(11) || 0
				const r12 = invMap.get(12) || 0
				const r13 = invMap.get(13) || 0
				const totalReportPoints = r10 * 1 + r11 * 2 + r12 * 5 + r13 * 10

				if (totalReportPoints < reportsNeeded || profile.credits < creditCost) {
					await ctx.reply(
						`⚠️ *Insufficient Resources for Level Up (Lv.${owned.level} ➔ Lv.${targetLevel})*\n` +
							`───────────────────────────\n` +
							`📘 *Activity Report Points:* ${totalReportPoints} / ${reportsNeeded} ${totalReportPoints >= reportsNeeded ? "✅" : "❌"}\n` +
							`🪙 *Credits:* ${profile.credits.toLocaleString()} / ${creditCost.toLocaleString()} ${profile.credits >= creditCost ? "✅" : "❌"}\n\n` +
							`💡 Earn Activity Reports & Credits via *${ctx.prefix}raid attack*, *${ctx.prefix}weeklyboss*, or *${ctx.prefix}daily*!`,
					)
					return
				}

				// Consume reports greedily from #10 -> #11 -> #12 -> #13
				let rem = reportsNeeded
				const toConsume: Array<{ itemId: number; itemName: string; requiredCount: number }> = []
				const reportTiers = [
					{ id: 10, name: "Novice Activity Report", val: 1, owned: r10 },
					{ id: 11, name: "Normal Activity Report", val: 2, owned: r11 },
					{ id: 12, name: "Advanced Activity Report", val: 5, owned: r12 },
					{ id: 13, name: "Superior Activity Report", val: 10, owned: r13 },
				]

				for (const tier of reportTiers) {
					if (rem <= 0 || tier.owned <= 0) continue
					const useCount = Math.min(tier.owned, Math.ceil(rem / tier.val))
					if (useCount > 0) {
						toConsume.push({
							itemId: tier.id,
							itemName: tier.name,
							requiredCount: useCount,
						})
						rem -= useCount * tier.val
					}
				}

				const consumed = await gachaRepository.consumeMaterialsAndCredits(
					ctx.agentId,
					canonicalJid,
					toConsume,
					creditCost,
				)
				if (!consumed.success) {
					await ctx.reply(`⚠️ Failed to consume Level Up materials.`)
					return
				}

				const oldStats = calculateStudentCombatStats(schale, {
					...owned,
					bondLevel: bond.bondLevel,
				})
				const updated = await gachaRepository.updateStudentProgression(
					ctx.agentId,
					canonicalJid,
					owned.studentId,
					{ level: targetLevel },
				)
				if (updated) owned = updated
				const newStats = calculateStudentCombatStats(schale, {
					...owned,
					bondLevel: bond.bondLevel,
				})

				let msg = `⬆️ *STUDENT LEVEL UP SUCCESS!*\n`
				msg += `───────────────────────────\n`
				msg += `👧 *Student:* ${schale.Name}\n`
				msg += `📈 *Level:* Lv.${oldStats.level} ➔ *Lv.${newStats.level}*\n`
				msg += `⚔️ *ATK:* ${oldStats.atk.toLocaleString()} ➔ *${newStats.atk.toLocaleString()}*\n`
				msg += `❤️ *Max HP:* ${oldStats.maxHp.toLocaleString()} ➔ *${newStats.maxHp.toLocaleString()}*\n`
				msg += `🛡️ *DEF:* ${oldStats.def.toLocaleString()} ➔ *${newStats.def.toLocaleString()}*\n`
				msg += `⚡ *Combat Power:* ${oldStats.combatPower.toLocaleString()} ➔ *${newStats.combatPower.toLocaleString()} CP*\n`
				msg += `───────────────────────────\n`
				msg += `🪙 *Credits Used:* ${creditCost.toLocaleString()}\n`
				msg += `📘 *Reports Used:* ${toConsume.map((c) => `${c.requiredCount}× ${c.itemName}`).join(", ")}`
				await ctx.reply(msg)
				return
			}

			// -------------------------------------------------------------------------
			// ACTION B: EX SKILL OR SUB SKILL UPGRADE (.upgrade <student> ex | skill)
			// -------------------------------------------------------------------------
			if (action === "ex" || action === "skill") {
				const skillSlot: "ex" | "normal" | "passive" | "sub" =
					action === "ex"
						? "ex"
						: actionParam === "passive"
							? "passive"
							: actionParam === "sub"
								? "sub"
								: "normal"

				const currentLv =
					skillSlot === "ex"
						? owned.exSkillLevel
						: skillSlot === "normal"
							? owned.normalSkillLevel
							: skillSlot === "passive"
								? owned.passiveSkillLevel
								: owned.subSkillLevel

				const recipe = await getSkillUpgradeRecipe(schale, skillSlot, currentLv)
				if (!recipe.canUpgrade) {
					await ctx.reply(
						`🌟 *${schale.Name}*'s *${skillSlot.toUpperCase()} Skill* is already at Maximum Level (*Lv.${currentLv}*)!`,
					)
					return
				}

				const consumeRes = await gachaRepository.consumeMaterialsAndCredits(
					ctx.agentId,
					canonicalJid,
					recipe.materials,
					recipe.creditCost,
				)

				if (!consumeRes.success) {
					let errText = `⚠️ *Missing SchaleDB Materials for ${schale.Name} (${skillSlot.toUpperCase()} Skill Lv.${currentLv} ➔ Lv.${recipe.targetLevel})*\n`
					errText += `───────────────────────────\n`
					for (const m of recipe.materials) {
						const have = invMap.get(m.itemId) || 0
						const ok = have >= m.requiredCount ? "✅" : "❌"
						errText += `${ok} *${m.itemName}*: ${have} / ${m.requiredCount}\n`
					}
					const credOk = profile.credits >= recipe.creditCost ? "✅" : "❌"
					errText += `${credOk} *Credits*: ${profile.credits.toLocaleString()} / ${recipe.creditCost.toLocaleString()}\n\n`
					errText += `💡 Farm these exact SchaleDB materials in *${ctx.prefix}raid attack* and *${ctx.prefix}weeklyboss*!`
					await ctx.reply(errText)
					return
				}

				const oldStats = calculateStudentCombatStats(schale, {
					...owned,
					bondLevel: bond.bondLevel,
				})
				const updatePayload =
					skillSlot === "ex"
						? { exSkillLevel: recipe.targetLevel }
						: skillSlot === "normal"
							? { normalSkillLevel: recipe.targetLevel }
							: skillSlot === "passive"
								? { passiveSkillLevel: recipe.targetLevel }
								: { subSkillLevel: recipe.targetLevel }

				const updated = await gachaRepository.updateStudentProgression(
					ctx.agentId,
					canonicalJid,
					owned.studentId,
					updatePayload,
				)
				if (updated) owned = updated
				const newStats = calculateStudentCombatStats(schale, {
					...owned,
					bondLevel: bond.bondLevel,
				})

				const skillDisplayName =
					skillSlot === "ex"
						? schale.Skills?.Ex?.Name || "EX Skill"
						: skillSlot === "normal"
							? schale.Skills?.Public?.Name || "Basic Skill"
							: skillSlot === "passive"
								? schale.Skills?.Passive?.Name || "Enhanced Skill"
								: schale.Skills?.ExtraPassive?.Name || "Sub Skill"

				let msg = `✨ *SKILL UPGRADE COMPLETE!*\n`
				msg += `───────────────────────────\n`
				msg += `👧 *Student:* ${schale.Name}\n`
				msg += `🎯 *Skill:* ${skillDisplayName} (${skillSlot.toUpperCase()})\n`
				msg += `📈 *Skill Level:* Lv.${currentLv} ➔ *Lv.${recipe.targetLevel}*\n`
				msg += `⚡ *Combat Power:* ${oldStats.combatPower.toLocaleString()} ➔ *${newStats.combatPower.toLocaleString()} CP*\n`
				msg += `───────────────────────────\n`
				msg += `📦 *SchaleDB Materials Consumed:*\n`
				for (const m of recipe.materials) {
					msg += `  • ${m.requiredCount}× ${m.itemName}\n`
				}
				msg += `  • 🪙 ${recipe.creditCost.toLocaleString()} Credits`
				await ctx.reply(msg)
				return
			}

			// -------------------------------------------------------------------------
			// ACTION C: EQUIPMENT UPGRADE (.upgrade <student> gear [1|2|3])
			// -------------------------------------------------------------------------
			if (action === "gear" || action === "equip") {
				const slotNum = (Number.parseInt(actionParam || "1", 10) || 1) as 1 | 2 | 3
				const validSlot: 1 | 2 | 3 =
					slotNum === 2 ? 2 : slotNum === 3 ? 3 : 1

				const currentTier =
					validSlot === 1
						? owned.equipSlot1Tier
						: validSlot === 2
							? owned.equipSlot2Tier
							: owned.equipSlot3Tier

				if (currentTier >= 9) {
					await ctx.reply(
						`🌟 *${schale.Name}*'s Equipment Slot ${validSlot} is already at Maximum Tier (*T9*)!`,
					)
					return
				}

				const targetTier = currentTier + 1
				const eqCategory =
					schale.Equipment?.[validSlot - 1] ||
					(validSlot === 1 ? "Hat" : validSlot === 2 ? "Hairpin" : "Watch")

				const nextEq = await getEquipmentByCategoryAndTier(
					eqCategory,
					targetTier,
				)
				const blueprintId = 9000 + validSlot * 100 + targetTier
				const blueprintName = `${eqCategory} Blueprint (T${targetTier})`
				// Require either specific blueprint OR universal Equipment Blueprint (#9000) + Credits
				const creditCost = targetTier * 45000
				const reqBlueprints = Math.max(2, targetTier * 2)

				const universalOwned = invMap.get(9000) || 0
				const specificOwned = invMap.get(blueprintId) || 0

				const reqList =
					specificOwned >= reqBlueprints
						? [
								{
									itemId: blueprintId,
									itemName: blueprintName,
									requiredCount: reqBlueprints,
								},
							]
						: [
								{
									itemId: 9000,
									itemName: "Schale Equipment Blueprint Box",
									requiredCount: reqBlueprints,
								},
							]

				const consumeRes = await gachaRepository.consumeMaterialsAndCredits(
					ctx.agentId,
					canonicalJid,
					reqList,
					creditCost,
				)

				if (!consumeRes.success) {
					await ctx.reply(
						`⚠️ *Insufficient Blueprints for ${schale.Name} — Slot ${validSlot} (${eqCategory} T${currentTier} ➔ T${targetTier})*\n` +
							`───────────────────────────\n` +
							`🛠️ *Schale Equipment Blueprint Box:* ${universalOwned} / ${reqBlueprints} ${universalOwned >= reqBlueprints ? "✅" : "❌"}\n` +
							`🪙 *Credits:* ${profile.credits.toLocaleString()} / ${creditCost.toLocaleString()} ${profile.credits >= creditCost ? "✅" : "❌"}\n\n` +
							`💡 Farm Equipment Blueprints in *${ctx.prefix}weeklyboss* or *${ctx.prefix}raid attack*!`,
					)
					return
				}

				const oldStats = calculateStudentCombatStats(schale, {
					...owned,
					bondLevel: bond.bondLevel,
				})
				const updated = await gachaRepository.updateStudentProgression(
					ctx.agentId,
					canonicalJid,
					owned.studentId,
					validSlot === 1
						? { equipSlot1Tier: targetTier }
						: validSlot === 2
							? { equipSlot2Tier: targetTier }
							: { equipSlot3Tier: targetTier },
				)
				if (updated) owned = updated
				const newStats = calculateStudentCombatStats(schale, {
					...owned,
					bondLevel: bond.bondLevel,
				})

				await ctx.reply(
					`🛠️ *EQUIPMENT TIER UPGRADE COMPLETE!*\n` +
						`───────────────────────────\n` +
						`👧 *Student:* ${schale.Name}\n` +
						`🎽 *Slot ${validSlot} (${eqCategory}):* T${currentTier} ➔ *T${targetTier}* (${nextEq?.Name || eqCategory})\n` +
						`⚡ *Combat Power:* ${oldStats.combatPower.toLocaleString()} ➔ *${newStats.combatPower.toLocaleString()} CP*\n` +
						`🪙 *Credits Used:* ${creditCost.toLocaleString()}`,
				)
				return
			}

			// -------------------------------------------------------------------------
			// ACTION D: MYSTIC LIBERATION / STAR & UE UPGRADE (.upgrade <student> star)
			// -------------------------------------------------------------------------
			if (action === "star" || action === "mystic" || action === "ue") {
				const availableDupes = Math.max(0, owned.count - 1)

				if (owned.starGrade < 5) {
					const targetStar = owned.starGrade + 1
					const dupesRequired =
						targetStar === 2 ? 1 : targetStar === 3 ? 2 : targetStar === 4 ? 3 : 4
					const creditCost = targetStar * 150000

					if (availableDupes < dupesRequired || profile.credits < creditCost) {
						await ctx.reply(
							`⚠️ *Insufficient Duplicates/Eleph for Mystic Liberation (${owned.starGrade}★ ➔ ${targetStar}★)*\n` +
								`───────────────────────────\n` +
								`🧩 *${schale.Name} Duplicates:* ${availableDupes} / ${dupesRequired} ${availableDupes >= dupesRequired ? "✅" : "❌"}\n` +
								`🪙 *Credits:* ${profile.credits.toLocaleString()} / ${creditCost.toLocaleString()} ${profile.credits >= creditCost ? "✅" : "❌"}\n\n` +
								`💡 Obtain duplicate copies of *${schale.Name}* via *${ctx.prefix}gacha 10* or *${ctx.prefix}spark*!`,
						)
						return
					}

					await gachaRepository.consumeMaterialsAndCredits(
						ctx.agentId,
						canonicalJid,
						[],
						creditCost,
					)
					const oldStats = calculateStudentCombatStats(schale, {
						...owned,
						bondLevel: bond.bondLevel,
					})
					const updated = await gachaRepository.updateStudentProgression(
						ctx.agentId,
						canonicalJid,
						owned.studentId,
						{
							starGrade: targetStar,
							count: owned.count - dupesRequired,
							weaponStar: targetStar === 5 ? Math.max(1, owned.weaponStar) : owned.weaponStar,
						},
					)
					if (updated) owned = updated
					const newStats = calculateStudentCombatStats(schale, {
						...owned,
						bondLevel: bond.bondLevel,
					})

					let msg = `🌟 *MYSTIC LIBERATION SUCCESSFUL!*\n`
					msg += `───────────────────────────\n`
					msg += `👧 *Student:* ${schale.Name}\n`
					msg += `⭐ *Rarity:* ${"★".repeat(targetStar - 1)} ➔ *${"★".repeat(targetStar)}*\n`
					if (targetStar === 5 && schale.Weapon?.Name) {
						msg += `🔫 *Unique Weapon Unlocked:* *${schale.Weapon.Name} (UE 1★)*!\n`
					}
					msg += `⚔️ *ATK:* ${oldStats.atk.toLocaleString()} ➔ *${newStats.atk.toLocaleString()}*\n`
					msg += `❤️ *Max HP:* ${oldStats.maxHp.toLocaleString()} ➔ *${newStats.maxHp.toLocaleString()}*\n`
					msg += `⚡ *Combat Power:* ${oldStats.combatPower.toLocaleString()} ➔ *${newStats.combatPower.toLocaleString()} CP*`
					await ctx.reply(msg)
					return
				}

				// Already 5★ -> Upgrade Unique Weapon (UE 1★ -> 2★ -> 3★)
				if (owned.weaponStar >= 3) {
					await ctx.reply(
						`👑 *${schale.Name}* has already reached *5★ + Unique Weapon UE 3★ (MAX)*!`,
					)
					return
				}

				const targetUe = owned.weaponStar + 1
				const dupesRequired = targetUe * 2
				const creditCost = targetUe * 500000

				if (availableDupes < dupesRequired || profile.credits < creditCost) {
					await ctx.reply(
						`⚠️ *Insufficient Duplicates for Unique Weapon Limit Break (UE ${owned.weaponStar}★ ➔ UE ${targetUe}★)*\n` +
							`───────────────────────────\n` +
							`🔫 *Weapon:* ${schale.Weapon?.Name || "Unique Weapon"}\n` +
							`🧩 *${schale.Name} Duplicates:* ${availableDupes} / ${dupesRequired}\n` +
							`🪙 *Credits:* ${profile.credits.toLocaleString()} / ${creditCost.toLocaleString()}`,
					)
					return
				}

				await gachaRepository.consumeMaterialsAndCredits(
					ctx.agentId,
					canonicalJid,
					[],
					creditCost,
				)
				const updated = await gachaRepository.updateStudentProgression(
					ctx.agentId,
					canonicalJid,
					owned.studentId,
					{
						weaponStar: targetUe,
						count: owned.count - dupesRequired,
					},
				)
				if (updated) owned = updated
				const newStats = calculateStudentCombatStats(schale, {
					...owned,
					bondLevel: bond.bondLevel,
				})

				await ctx.reply(
					`🔫 *UNIQUE WEAPON LIMIT BREAK!*\n` +
						`───────────────────────────\n` +
						`👧 *Student:* ${schale.Name} (★★★★★)\n` +
						`🔫 *Weapon:* ${schale.Weapon?.Name || "Unique Weapon"} — *UE ${targetUe}★*\n` +
						`⚡ *New Combat Power:* *${newStats.combatPower.toLocaleString()} CP*`,
				)
				return
			}

			// -------------------------------------------------------------------------
			// DEFAULT VIEW: STUDENT PROGRESSION & SCHALEDB MATERIAL RECIPE CARD
			// -------------------------------------------------------------------------
			const stats = calculateStudentCombatStats(schale, {
				...owned,
				bondLevel: bond.bondLevel,
			})
			const exRecipe = await getSkillUpgradeRecipe(
				schale,
				"ex",
				owned.exSkillLevel,
			)
			const normalRecipe = await getSkillUpgradeRecipe(
				schale,
				"normal",
				owned.normalSkillLevel,
			)

			const eqSlots = [
				{
					slot: 1,
					cat: schale.Equipment?.[0] || "Hat",
					tier: owned.equipSlot1Tier,
				},
				{
					slot: 2,
					cat: schale.Equipment?.[1] || "Hairpin",
					tier: owned.equipSlot2Tier,
				},
				{
					slot: 3,
					cat: schale.Equipment?.[2] || "Watch",
					tier: owned.equipSlot3Tier,
				},
			]

			const starsStr = "★".repeat(owned.starGrade)
			const ueStr = owned.weaponStar > 0 ? ` | 🔫 UE ${owned.weaponStar}★` : ""

			let caption = `📋 *SCHALE STUDENT UPGRADE & BUILD*\n`
			caption += `───────────────────────────\n`
			caption += `👧 *${schale.Name}* (${starsStr}${ueStr})\n`
			caption += `🏫 *Academy:* ${schale.School} (${schale.Club})\n`
			caption += `🎖️ *Role:* ${formatSquadType(schale.SquadType)} | ${schale.TacticRole || "Combatant"}\n`
			caption += `🔫 *Type:* ${formatBulletType(schale.BulletType)} / ${formatArmorType(schale.ArmorType)}\n`
			caption += `💗 *MomoTalk Bond:* Rank ♥${bond.bondLevel}\n`
			caption += `───────────────────────────\n`
			caption += `📊 *COMBAT STATS (Lv.${owned.level}/90 — ⚡ ${stats.combatPower.toLocaleString()} CP):*\n`
			caption += `  • ⚔️ *ATK:* ${stats.atk.toLocaleString()} | ❤️ *HP:* ${stats.maxHp.toLocaleString()}\n`
			caption += `  • 🛡️ *DEF:* ${stats.def.toLocaleString()} | 💚 *HEAL:* ${stats.heal.toLocaleString()}\n`
			caption += `  • 🎯 *ACC:* ${stats.accuracy} | 💥 *CRIT:* ${stats.crit} | 💨 *EVA:* ${stats.dodge}\n\n`

			caption += `✨ *SKILLS & EQUIPMENT:*\n`
			caption += `  • 💥 *EX Skill:* ${schale.Skills?.Ex?.Name || "EX"} (*Lv.${owned.exSkillLevel}/5*)\n`
			caption += `  • 🔹 *Basic:* Lv.${owned.normalSkillLevel}/10 | *Passive:* Lv.${owned.passiveSkillLevel}/10 | *Sub:* Lv.${owned.subSkillLevel}/10\n`
			caption += `  • 🎽 *Gear:* ${eqSlots.map((e) => `${e.cat} T${e.tier}`).join(" | ")}\n`
			caption += `  • 🧩 *Extra Duplicates Owned:* ×${Math.max(0, owned.count - 1)}\n\n`

			caption += `📦 *NEXT SCHALEDB EX SKILL RECIPE (Lv.${owned.exSkillLevel} ➔ Lv.${exRecipe.targetLevel}):*\n`
			if (!exRecipe.canUpgrade) {
				caption += `  • 🌟 *MAX EX SKILL LEVEL REACHED!*\n`
			} else {
				for (const m of exRecipe.materials) {
					const have = invMap.get(m.itemId) || 0
					const badge = have >= m.requiredCount ? "✅" : "❌"
					caption += `  • ${badge} ${m.itemName}: *${have}/${m.requiredCount}*\n`
				}
				caption += `  • 🪙 Credits: *${exRecipe.creditCost.toLocaleString()}*\n`
			}

			caption += `\n📦 *NEXT SUB SKILL RECIPE (Lv.${owned.normalSkillLevel} ➔ Lv.${normalRecipe.targetLevel}):*\n`
			if (!normalRecipe.canUpgrade) {
				caption += `  • 🌟 *MAX SKILL LEVEL REACHED!*\n`
			} else {
				for (const m of normalRecipe.materials) {
					const have = invMap.get(m.itemId) || 0
					const badge = have >= m.requiredCount ? "✅" : "❌"
					caption += `  • ${badge} ${m.itemName}: *${have}/${m.requiredCount}*\n`
				}
			}

			caption += `\n───────────────────────────\n`
			caption += `💡 *Quick Upgrade Commands:*\n`
			caption += `• *${ctx.prefix}upgrade ${schale.Name} level 5*\n`
			caption += `• *${ctx.prefix}upgrade ${schale.Name} ex*\n`
			caption += `• *${ctx.prefix}upgrade ${schale.Name} skill [normal|passive|sub]*\n`
			caption += `• *${ctx.prefix}upgrade ${schale.Name} gear [1|2|3]*\n`
			caption += `• *${ctx.prefix}upgrade ${schale.Name} star*`

			const portraitUrl = getStudentImageUrl(schale.Id, "collection")
			const imgBuf = await fetchSchaleImageBuffer(portraitUrl)
			if (imgBuf) {
				await ctx.sock.sendMessage(
					ctx.jid,
					{ image: imgBuf, caption },
					{ quoted: ctx.rawMsg },
				)
				return
			}

			await ctx.reply(caption)
		} catch (error) {
			logger.error(
				"/commands/bluearchive/upgrade.ts",
				`Student upgrade error: ${error}`,
			)
			await ctx.reply("⚠️ An error occurred while processing student upgrade.")
		}
	},
}

export default command
