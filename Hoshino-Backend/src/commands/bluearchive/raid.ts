import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { CommandContext, ICommand } from "@customTypes/command"
import { gachaRepository } from "@repositories/gacha.repository"
import { logger } from "@utils/logger"
import {
	calculateArmorMultiplier,
	calculateTerrainMultiplier,
	formatArmorType,
	formatBulletType,
	getSchaleItems,
	getSkillUpgradeRecipe,
	type SchaleStudent,
} from "@utils/schaledb"
import { resolveSenseiSquad } from "./upgrade"

interface SchaleRaidBoss {
	Id: number
	Name: string
	DevName: string
	PathName?: string
	ArmorType: string
	BulletType?: string
	BulletTypeInsane?: string
	Terrain?: string[]
}

interface RaidDifficultyConfig {
	key: string
	name: string
	recLevel: number
	maxHp: number
	baseScore: number
	creditReward: number
	pyroxeneReward: number
	materialMultiplier: number
}

const RAID_DIFFICULTIES: Record<string, RaidDifficultyConfig> = {
	normal: {
		key: "Normal",
		name: "Normal",
		recLevel: 10,
		maxHp: 35000,
		baseScore: 1500000,
		creditReward: 120000,
		pyroxeneReward: 100,
		materialMultiplier: 1,
	},
	hard: {
		key: "Hard",
		name: "Hard",
		recLevel: 25,
		maxHp: 85000,
		baseScore: 3000000,
		creditReward: 220000,
		pyroxeneReward: 150,
		materialMultiplier: 2,
	},
	veryhard: {
		key: "VeryHard",
		name: "Very Hard",
		recLevel: 40,
		maxHp: 190000,
		baseScore: 6000000,
		creditReward: 380000,
		pyroxeneReward: 200,
		materialMultiplier: 3,
	},
	hardcore: {
		key: "Hardcore",
		name: "Hardcore",
		recLevel: 55,
		maxHp: 420000,
		baseScore: 12000000,
		creditReward: 650000,
		pyroxeneReward: 300,
		materialMultiplier: 4,
	},
	extreme: {
		key: "Extreme",
		name: "Extreme",
		recLevel: 70,
		maxHp: 900000,
		baseScore: 15000000,
		creditReward: 1100000,
		pyroxeneReward: 450,
		materialMultiplier: 6,
	},
	insane: {
		key: "Insane",
		name: "Insane",
		recLevel: 80,
		maxHp: 1750000,
		baseScore: 26000000,
		creditReward: 2000000,
		pyroxeneReward: 650,
		materialMultiplier: 9,
	},
	torment: {
		key: "Torment",
		name: "Torment",
		recLevel: 90,
		maxHp: 3200000,
		baseScore: 39000000,
		creditReward: 3500000,
		pyroxeneReward: 1000,
		materialMultiplier: 14,
	},
}

const CACHE_DIR = join(process.cwd(), "data", "schaledb")
const RAIDS_FILE = join(CACHE_DIR, "raids.json")

let cachedRaids: SchaleRaidBoss[] | null = null
let lastRaidFetch = 0

async function getRaidBosses(): Promise<SchaleRaidBoss[]> {
	const now = Date.now()
	if (cachedRaids && now - lastRaidFetch < 7 * 24 * 60 * 60 * 1000) {
		return cachedRaids
	}

	if (!existsSync(CACHE_DIR)) {
		mkdirSync(CACHE_DIR, { recursive: true })
	}

	if (existsSync(RAIDS_FILE)) {
		try {
			const localData = readFileSync(RAIDS_FILE, "utf-8")
			const parsed = JSON.parse(localData) as SchaleRaidBoss[]
			if (Array.isArray(parsed) && parsed.length > 0) {
				cachedRaids = parsed
				lastRaidFetch = now
				return cachedRaids
			}
		} catch {}
	}

	try {
		const res = await fetch("https://schaledb.com/data/en/raids.json")
		if (!res.ok) throw new Error(`HTTP ${res.status}`)
		const data = (await res.json()) as { Raid?: SchaleRaidBoss[] }
		cachedRaids = data.Raid || []
		lastRaidFetch = now

		try {
			writeFileSync(RAIDS_FILE, JSON.stringify(cachedRaids, null, 2), "utf-8")
		} catch {}

		return cachedRaids
	} catch (e) {
		if (cachedRaids) return cachedRaids
		throw e
	}
}

function getRecommendedCounter(armorType: string): string {
	switch (armorType) {
		case "LightArmor":
			return "🔴 Explosive (Red) Strikers"
		case "HeavyArmor":
			return "🟡 Piercing (Yellow) Strikers"
		case "Unarmed":
			return "🔵 Mystic (Blue) Strikers"
		case "ElasticArmor":
			return "🟣 Sonic (Purple) Strikers"
		default:
			return "General Strikers"
	}
}

function getActiveWeeklyBoss(bosses: SchaleRaidBoss[]): SchaleRaidBoss {
	if (bosses.length === 0) {
		return {
			Id: 1,
			Name: "Binah",
			DevName: "Binah",
			PathName: "binah",
			ArmorType: "HeavyArmor",
			BulletType: "Normal",
			BulletTypeInsane: "Pierce",
			Terrain: ["Outdoor", "Street"],
		}
	}
	const weekIndex = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000))
	return bosses[weekIndex % bosses.length]!
}

/**
 * Generates smart, relevant SchaleDB material drops tailored to the students in Sensei's squad!
 */
async function generateSmartMaterialDrops(
	squadStudents: Array<{
		schale: SchaleStudent
		owned: { exSkillLevel: number; normalSkillLevel: number }
	}>,
	multiplier: number,
): Promise<
	Array<{
		itemId: number
		itemName: string
		category: string
		rarity: string
		count: number
	}>
> {
	const itemsMap = await getSchaleItems()
	const dropsMap = new Map<
		number,
		{
			itemId: number
			itemName: string
			category: string
			rarity: string
			count: number
		}
	>()

	const addDrop = (
		itemId: number,
		fallbackName: string,
		fallbackCategory: string,
		fallbackRarity: string,
		count: number,
	) => {
		const info = itemsMap[itemId]
		const existing = dropsMap.get(itemId)
		if (existing) {
			existing.count += count
		} else {
			dropsMap.set(itemId, {
				itemId,
				itemName: info?.Name || fallbackName,
				category: info?.SubCategory || info?.Category || fallbackCategory,
				rarity: info?.Rarity || fallbackRarity,
				count,
			})
		}
	}

	// 1. Always drop Activity Reports (#11 Normal, #12 Advanced, #13 Superior on higher tiers)
	addDrop(
		11,
		"Normal Activity Report",
		"CharacterExpGrowth",
		"R",
		4 * multiplier,
	)
	addDrop(
		12,
		"Advanced Activity Report",
		"CharacterExpGrowth",
		"SR",
		2 * multiplier,
	)
	if (multiplier >= 3) {
		addDrop(
			13,
			"Superior Activity Report",
			"CharacterExpGrowth",
			"SSR",
			Math.max(1, Math.floor(multiplier / 2)),
		)
	}

	// 2. Always drop Schale Equipment Blueprint Boxes (#9000)
	addDrop(9000, "Schale Equipment Blueprint Box", "Equipment", "SR", 3 * multiplier)

	// 3. Inspect Sensei's deployed squad to drop the EXACT SchaleDB Blu-rays, Tech Notes, and Oopart Artifacts they need!
	for (const member of squadStudents) {
		const exRecipe = await getSkillUpgradeRecipe(
			member.schale,
			"ex",
			Math.min(4, member.owned.exSkillLevel),
		)
		for (const mat of exRecipe.materials) {
			const dropAmt = Math.max(2, Math.ceil((mat.requiredCount * 0.35) * Math.min(4, multiplier)))
			addDrop(mat.itemId, mat.itemName, mat.category, mat.rarity, dropAmt)
		}

		const subRecipe = await getSkillUpgradeRecipe(
			member.schale,
			"normal",
			Math.min(9, member.owned.normalSkillLevel),
		)
		for (const mat of subRecipe.materials) {
			const dropAmt = Math.max(2, Math.ceil((mat.requiredCount * 0.4) * Math.min(4, multiplier)))
			addDrop(mat.itemId, mat.itemName, mat.category, mat.rarity, dropAmt)
		}
	}

	return Array.from(dropsMap.values())
}

const command: ICommand = {
	name: [
		"raid",
		"boss",
		"totalassault",
		"weeklyboss",
		"bounty",
		"grandassault",
	],
	category: "bluearchive",
	description:
		"Playable Blue Archive Total Assault Raid Boss & Weekly Boss combat with SchaleDB material drops, armor/terrain damage simulation, and leaderboards",
	usage: [
		"raid",
		"raid attack [boss] [normal|hard|veryhard|hardcore|extreme|insane|torment]",
		"weeklyboss [boss/school]",
		"raid rank",
		"raid list",
		"raid binah",
	],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const invoked = (ctx.commandName || "raid").toLowerCase()
		const sub = (args[0] || "").toLowerCase()

		try {
			const bosses = await getRaidBosses()
			const activeBoss = getActiveWeeklyBoss(bosses)
			const canonicalJid = await gachaRepository.resolveUserJid(
				ctx.agentId,
				ctx.senderJid,
			)
			const profile = await gachaRepository.refreshTicketsIfNeeded(
				ctx.agentId,
				canonicalJid,
			)

			// =========================================================================
			// 1. WEEKLY BOSS / BOUNTY RAID (.weeklyboss / .bounty / .raid weekly)
			// =========================================================================
			if (
				invoked === "weeklyboss" ||
				invoked === "bounty" ||
				sub === "weekly" ||
				sub === "bounty"
			) {
				const squad = await resolveSenseiSquad(ctx.agentId, canonicalJid)
				if (squad.strikers.length === 0 && squad.specials.length === 0) {
					await ctx.reply(
						`❌ You need at least 1 student in your roster to challenge the Weekly Boss!\nUse *${ctx.prefix}gacha 10* first.`,
					)
					return
				}

				const ticketRes = await gachaRepository.consumeTicket(
					ctx.agentId,
					canonicalJid,
					"bounty",
				)
				if (!ticketRes.success) {
					await ctx.reply(
						`🎫 *Out of Weekly Boss Bounty Tickets (0/3)!*\n` +
							`Tickets reset daily at 06:00 WIB or when you claim *${ctx.prefix}daily*.`,
					)
					return
				}

				const queryArg =
					invoked === "weeklyboss" || invoked === "bounty"
						? args.join(" ").trim().toLowerCase()
						: args.slice(1).join(" ").trim().toLowerCase()

				const targetBoss =
					(queryArg &&
						bosses.find(
							(b) =>
								b.Name.toLowerCase().includes(queryArg) ||
								b.DevName.toLowerCase().includes(queryArg) ||
								b.PathName?.toLowerCase().includes(queryArg),
						)) ||
					bosses[( bosses.indexOf(activeBoss) + 1 ) % Math.max(1, bosses.length)] ||
					activeBoss

				const allDeployed = [...squad.strikers, ...squad.specials]
				const terrain = targetBoss.Terrain?.[0] || "Outdoor"

				let totalSquadDamage = 0
				const combatLines: string[] = []

				for (const unit of allDeployed) {
					const armorCheck = calculateArmorMultiplier(
						unit.schale.BulletType,
						targetBoss.ArmorType,
					)
					const terrainCheck = calculateTerrainMultiplier(unit.schale, terrain)
					const rawDmg =
						unit.stats.atk *
						4.5 *
						unit.stats.exMultiplier *
						unit.stats.skillMultiplier
					const finalDmg = Math.round(
						rawDmg * armorCheck.multiplier * terrainCheck.multiplier,
					)
					totalSquadDamage += finalDmg
					combatLines.push(
						`  • *${unit.schale.Name}* (Lv.${unit.owned.level}): *${finalDmg.toLocaleString()} DMG* [${armorCheck.label}]`,
					)
				}

				const tierMult = Math.max(
					2,
					Math.min(8, Math.floor(squad.totalCombatPower / 8000) + 2),
				)
				const creditsEarned = 180000 * tierMult
				const pyroxenesEarned = 150
				const drops = await generateSmartMaterialDrops(allDeployed, tierMult)

				await gachaRepository.addCredits(
					ctx.agentId,
					canonicalJid,
					creditsEarned,
				)
				await gachaRepository.addPyroxenes(
					ctx.agentId,
					canonicalJid,
					pyroxenesEarned,
				)
				await gachaRepository.addInventoryItems(
					ctx.agentId,
					canonicalJid,
					drops,
				)

				let text = `👑 *WEEKLY BOSS BOUNTY CLEARED!*\n`
				text += `───────────────────────────\n`
				text += `👾 *Weekly Boss:* ${targetBoss.Name} (${formatArmorType(targetBoss.ArmorType)})\n`
				text += `🏞️ *Battlefield:* ${terrain}\n`
				text += `🎫 *Bounty Tickets Left:* ${ticketRes.remaining}/3\n`
				text += `───────────────────────────\n`
				text += `⚔️ *SQUAD DAMAGE BREAKDOWN (${totalSquadDamage.toLocaleString()} Total DMG):*\n`
				text += `${combatLines.join("\n")}\n\n`
				text += `🎁 *SCHALEDB MATERIAL & BOUNTY DROPS:*\n`
				text += `  • 💎 *+${pyroxenesEarned} Pyroxenes*\n`
				text += `  • 🪙 *+${creditsEarned.toLocaleString()} Credits*\n`
				for (const d of drops.slice(0, 10)) {
					text += `  • 📦 *[${d.rarity}] ${d.itemName}* ×${d.count}\n`
				}
				if (drops.length > 10) {
					text += `  • _...and ${drops.length - 10} more SchaleDB materials added to ${ctx.prefix}inventory!_\n`
				}
				text += `\n💡 Use *${ctx.prefix}upgrade <student>* to spend your new materials!`

				await ctx.reply(text)
				return
			}

			// =========================================================================
			// 2. RAID LEADERBOARD (.raid rank / .raid leaderboard)
			// =========================================================================
			if (sub === "rank" || sub === "leaderboard" || sub === "top") {
				const records = await gachaRepository.getRaidLeaderboard(ctx.agentId)
				if (records.length === 0) {
					await ctx.reply(
						`🏆 *TOTAL ASSAULT LEADERBOARD*\n\nNo Raid Boss records yet! Be the first Sensei to clear a raid with *${ctx.prefix}raid attack*!`,
					)
					return
				}

				let text = `🏆 *KIVOTOS TOTAL ASSAULT LEADERBOARD*\n`
				text += `───────────────────────────\n\n`
				const medals = ["🥇", "🥈", "🥉"]
				for (let i = 0; i < records.length; i++) {
					const r = records[i]!
					const badge = medals[i] || `*#${i + 1}*`
					const userTag = r.userJid.split("@")[0]
					text += `${badge} *Sensei ${userTag}*\n`
					text += `  • 👾 Boss: *${r.bossName}* [${r.difficulty}]\n`
					text += `  • 🎯 Best Score: *${Number(r.bestScore).toLocaleString()} pts*\n`
					text += `  • 💥 Total Damage: *${Number(r.totalDamage).toLocaleString()}* (${r.clears} Clears)\n\n`
				}
				await ctx.reply(text)
				return
			}

			// =========================================================================
			// 3. LIST ALL BOSSES (.raid list / .raid bosses)
			// =========================================================================
			if (sub === "list" || sub === "bosses" || sub === "all") {
				let text = `⚔️ *KIVOTOS TOTAL ASSAULT BOSSES (SchaleDB)*\n`
				text += `───────────────────────────\n\n`

				for (const b of bosses) {
					const armorStr = formatArmorType(b.ArmorType)
					const counterStr = getRecommendedCounter(b.ArmorType)
					text += `👾 *${b.Name}*\n`
					text += `  • 🛡️ *Armor:* ${armorStr}\n`
					text += `  • ⚔️ *Best Counter:* ${counterStr}\n`
					text += `  • 🏞️ *Terrain:* ${b.Terrain?.join(", ") || "General"}\n\n`
				}

				text += `───────────────────────────\n`
				text += `💡 *Fight Boss:* *${ctx.prefix}raid attack <boss> [difficulty]*\n`
				text += `💡 *Boss Guide:* *${ctx.prefix}raid <boss>*`
				await ctx.reply(text)
				return
			}

			// =========================================================================
			// 4. INTERACTIVE TOTAL ASSAULT RAID BATTLE (.raid attack [boss] [difficulty])
			// =========================================================================
			if (sub === "attack" || sub === "fight" || sub === "battle" || sub === "start") {
				const squad = await resolveSenseiSquad(ctx.agentId, canonicalJid)
				if (squad.strikers.length === 0 && squad.specials.length === 0) {
					await ctx.reply(
						`❌ You have no students to deploy! Recruit students with *${ctx.prefix}gacha 10* first.`,
					)
					return
				}

				// Parse optional boss name and difficulty from remaining args
				const remArgs = args.slice(1).map((a) => a.toLowerCase())
				let chosenDiff: RaidDifficultyConfig = RAID_DIFFICULTIES.normal!
				const bossTokens: string[] = []

				for (const token of remArgs) {
					const cleanToken = token.replace(/[^a-z]/g, "")
					if (RAID_DIFFICULTIES[cleanToken]) {
						chosenDiff = RAID_DIFFICULTIES[cleanToken]!
					} else {
						bossTokens.push(token)
					}
				}

				const bossQuery = bossTokens.join(" ").trim()
				const targetBoss = bossQuery
					? bosses.find(
							(b) =>
								b.Name.toLowerCase().includes(bossQuery) ||
								b.DevName.toLowerCase().includes(bossQuery) ||
								b.PathName?.toLowerCase().includes(bossQuery),
						) || activeBoss
					: activeBoss

				const ticketRes = await gachaRepository.consumeTicket(
					ctx.agentId,
					canonicalJid,
					"raid",
				)
				if (!ticketRes.success) {
					await ctx.reply(
						`🎫 *Out of Total Assault Raid Tickets (0/3)!*\n` +
							`Use *${ctx.prefix}weeklyboss* if you still have Bounty tickets, or wait for the 06:00 WIB daily reset!`,
					)
					return
				}

				const terrain = targetBoss.Terrain?.[0] || "Outdoor"
				const allUnits = [...squad.strikers, ...squad.specials]

				// Backline Special support buff (+15% of Specials' ATK/HEAL added to Strikers)
				const specialAtkSupport = Math.round(
					squad.specials.reduce((sum, s) => sum + s.stats.atk, 0) * 0.18,
				)
				const specialHealSupport = Math.round(
					squad.specials.reduce((sum, s) => sum + s.stats.heal, 0) * 0.35,
				)

				let totalDamageDealt = 0
				let mvpName = ""
				let mvpDamage = 0
				const unitLogs: string[] = []

				for (const unit of allUnits) {
					const armorMatch = calculateArmorMultiplier(
						unit.schale.BulletType,
						targetBoss.ArmorType,
					)
					const terrainMatch = calculateTerrainMultiplier(unit.schale, terrain)

					const effectiveAtk =
						unit.schale.SquadType === "Main"
							? unit.stats.atk + specialAtkSupport
							: Math.round(unit.stats.atk * 0.85)

					// Insane / Torment Boss Counter-Attack Survivability factor
					let survivabilityFactor = 1.0
					if (
						(chosenDiff.key === "Insane" || chosenDiff.key === "Torment") &&
						targetBoss.BulletTypeInsane
					) {
						const bossVsStudent = calculateArmorMultiplier(
							targetBoss.BulletTypeInsane,
							unit.schale.ArmorType,
						)
						if (bossVsStudent.multiplier >= 2.0) {
							survivabilityFactor =
								unit.owned.level >= chosenDiff.recLevel ? 0.85 : 0.65
						}
					}

					// 3-Minute (180s) Raid Window Simulation: Auto-attacks + Normal Skills + 3 EX Skill rotations
					const rawRotationDmg =
						effectiveAtk *
						12.5 *
						unit.stats.exMultiplier *
						unit.stats.skillMultiplier
					const unitDmg = Math.round(
						rawDmgWithVariance(
							rawRotationDmg *
								armorMatch.multiplier *
								terrainMatch.multiplier *
								survivabilityFactor,
						),
					)

					totalDamageDealt += unitDmg
					if (unitDmg > mvpDamage) {
						mvpDamage = unitDmg
						mvpName = unit.schale.Name
					}

					const exName = unit.schale.Skills?.Ex?.Name || "EX Skill"
					unitLogs.push(
						`  • *${unit.schale.Name}* (Lv.${unit.owned.level} ${"★".repeat(unit.owned.starGrade)})\n` +
							`    ↳ _${exName}_: *${unitDmg.toLocaleString()} DMG* [${armorMatch.label} | ${terrainMatch.grade}]`,
					)
				}

				// Add team sustain bonus damage if healers are present
				if (specialHealSupport > 0) {
					totalDamageDealt += specialHealSupport * 8
				}

				const cleared = totalDamageDealt >= chosenDiff.maxHp
				const hpRemaining = Math.max(0, chosenDiff.maxHp - totalDamageDealt)
				const damageRatio = Math.min(1.35, totalDamageDealt / chosenDiff.maxHp)
				const finalScore = cleared
					? Math.round(
							chosenDiff.baseScore +
								(totalDamageDealt - chosenDiff.maxHp) * 1.2 +
								squad.totalCombatPower * 15,
						)
					: Math.round(chosenDiff.baseScore * damageRatio * 0.6)

				// Even on partial clear (wipe), Sensei earns proportional consolation rewards & materials!
				const rewardRatio = cleared ? 1.0 : Math.max(0.4, damageRatio)
				const earnedCredits = Math.round(chosenDiff.creditReward * rewardRatio)
				const earnedPyroxenes = cleared
					? chosenDiff.pyroxeneReward
					: Math.round(chosenDiff.pyroxeneReward * 0.4)
				const matMult = cleared
					? chosenDiff.materialMultiplier
					: Math.max(1, Math.floor(chosenDiff.materialMultiplier * 0.5))

				const drops = await generateSmartMaterialDrops(allUnits, matMult)

				await gachaRepository.addCredits(
					ctx.agentId,
					canonicalJid,
					earnedCredits,
				)
				await gachaRepository.addPyroxenes(
					ctx.agentId,
					canonicalJid,
					earnedPyroxenes,
				)
				await gachaRepository.addInventoryItems(
					ctx.agentId,
					canonicalJid,
					drops,
				)
				await gachaRepository.recordRaidBattle(
					ctx.agentId,
					canonicalJid,
					targetBoss.Id,
					targetBoss.Name,
					chosenDiff.key,
					finalScore,
					totalDamageDealt,
					cleared,
				)

				let caption = `${cleared ? "🏆 *TOTAL ASSAULT VICTORY!*" : "⚔️ *TOTAL ASSAULT BATTLE REPORT*"}\n`
				caption += `───────────────────────────\n`
				caption += `👾 *Raid Boss:* ${targetBoss.Name} [*${chosenDiff.name}*]\n`
				caption += `🛡️ *Boss Armor:* ${formatArmorType(targetBoss.ArmorType)} | 🏞️ *Terrain:* ${terrain}\n`
				caption += `❤️ *Boss HP:* ${hpRemaining.toLocaleString()} / ${chosenDiff.maxHp.toLocaleString()} (${cleared ? "100% DEFEATED 💥" : `${Math.round((totalDamageDealt / chosenDiff.maxHp) * 100)}% Dealt`})\n`
				caption += `🎯 *Raid Score:* *${finalScore.toLocaleString()} pts*\n`
				caption += `👑 *MVP Student:* *${mvpName}* (${mvpDamage.toLocaleString()} DMG)\n`
				caption += `🎫 *Raid Tickets Left:* ${ticketRes.remaining}/3\n`
				caption += `───────────────────────────\n`
				caption += `📊 *SQUAD COMBAT LOG (Total: ${totalDamageDealt.toLocaleString()} DMG):*\n`
				caption += `${unitLogs.join("\n")}\n\n`
				caption += `🎁 *SCHALEDB RAID REWARDS & DROPS:*\n`
				caption += `  • 💎 *+${earnedPyroxenes.toLocaleString()} Pyroxenes*\n`
				caption += `  • 🪙 *+${earnedCredits.toLocaleString()} Credits*\n`
				for (const d of drops.slice(0, 8)) {
					caption += `  • 📦 *[${d.rarity}] ${d.itemName}* ×${d.count}\n`
				}
				if (drops.length > 8) {
					caption += `  • _+${drops.length - 8} more materials stored in ${ctx.prefix}inventory_\n`
				}
				if (!cleared) {
					caption += `\n💡 *Tip:* Upgrade your students with *${ctx.prefix}upgrade <student>* or deploy ${getRecommendedCounter(targetBoss.ArmorType)} to one-shot *${chosenDiff.name}*!`
				}

				const imgName =
					targetBoss.PathName || targetBoss.DevName || targetBoss.Name
				const imgUrl = `https://schaledb.com/images/raid/Boss_Portrait_${imgName}.png`
				try {
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

			// =========================================================================
			// 5. DASHBOARD OVERVIEW (.raid with no args)
			// =========================================================================
			if (!sub) {
				const squad = await resolveSenseiSquad(ctx.agentId, canonicalJid)
				let text = `⚔️ *SCHALE TOTAL ASSAULT & WEEKLY BOSS HQ*\n`
				text += `───────────────────────────\n`
				text += `👾 *Active Season Boss:* *${activeBoss.Name}*\n`
				text += `🛡️ *Boss Armor:* ${formatArmorType(activeBoss.ArmorType)}\n`
				text += `🎯 *Weakness:* ${getRecommendedCounter(activeBoss.ArmorType)}\n`
				if (activeBoss.BulletTypeInsane) {
					text += `💥 *Insane Attack:* ${formatBulletType(activeBoss.BulletTypeInsane)}\n`
				}
				text += `🏞️ *Terrain:* ${activeBoss.Terrain?.join(", ") || "Outdoor"}\n`
				text += `───────────────────────────\n`
				text += `👤 *Sensei:* ${ctx.pushName}\n`
				text += `⚡ *Squad Combat Power:* *${squad.totalCombatPower.toLocaleString()} CP* (${squad.strikers.length} Strikers / ${squad.specials.length} Specials)\n`
				text += `🎫 *Raid Tickets:* ${profile.raidTickets}/3 | 👑 *Weekly Bounty:* ${profile.bountyTickets}/3\n`
				text += `───────────────────────────\n`
				text += `🎚️ *DIFFICULTY TIERS:*\n`
				for (const d of Object.values(RAID_DIFFICULTIES)) {
					text += `  • *${d.name}* (Rec. Lv.${d.recLevel}) — ❤️ ${d.maxHp.toLocaleString()} HP | 🪙 +${(d.creditReward / 1000).toFixed(0)}K | 💎 +${d.pyroxeneReward}\n`
				}
				text += `\n💡 *Commands:*\n`
				text += `• *${ctx.prefix}raid attack [difficulty]* — Fight the active Total Assault Raid Boss!\n`
				text += `• *${ctx.prefix}raid attack <boss> <difficulty>* — Challenge a specific Boss (e.g. *${ctx.prefix}raid attack binah extreme*)\n`
				text += `• *${ctx.prefix}weeklyboss* — Challenge Weekly Boss Bounty for huge material drops!\n`
				text += `• *${ctx.prefix}raid rank* — View Total Assault Leaderboard\n`
				text += `• *${ctx.prefix}raid list* — List all SchaleDB Raid Bosses`

				await ctx.reply(text)
				return
			}

			// =========================================================================
			// 6. SPECIFIC BOSS DETAIL GUIDE (.raid <boss name>)
			// =========================================================================
			const targetName = args.join(" ").trim().toLowerCase()
			const match = bosses.find(
				(b) =>
					b.Name.toLowerCase().includes(targetName) ||
					b.DevName.toLowerCase().includes(targetName) ||
					b.PathName?.toLowerCase().includes(targetName),
			)

			if (!match) {
				await ctx.reply(
					`❌ Boss *"${targetName}"* not found in Total Assault database.\n\n` +
						`💡 *Available Bosses:* ${bosses.map((b) => b.Name).join(", ")}`,
				)
				return
			}

			let caption = `👾 *TOTAL ASSAULT: ${match.Name.toUpperCase()}*\n`
			caption += `───────────────────────────\n`
			caption += `🛡️ *Defense Armor:* ${formatArmorType(match.ArmorType)}\n`
			caption += `🎯 *Recommended Attack:* ${getRecommendedCounter(match.ArmorType)}\n`

			if (match.BulletTypeInsane) {
				caption += `💥 *Insane/Torment Attack:* ${formatBulletType(match.BulletTypeInsane)}\n`
			}

			if (match.Terrain && match.Terrain.length > 0) {
				caption += `🏞️ *Combat Terrain:* ${match.Terrain.join(", ")}\n`
			}

			caption += `\n⚔️ *Challenge Now:*\n`
			caption += `Type *${ctx.prefix}raid attack ${match.Name.toLowerCase()} normal* (or *hard / extreme / insane / torment*) to deploy your squad against *${match.Name}*!`

			const imgName = match.PathName || match.DevName || match.Name
			const imgUrl = `https://schaledb.com/images/raid/Boss_Portrait_${imgName}.png`

			try {
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
		} catch (error) {
			logger.error("/commands/bluearchive/raid.ts", `Raid error: ${error}`)
			await ctx.reply("⚠️ Failed to process Total Assault raid command.")
		}
	},
}

function rawDmgWithVariance(base: number): number {
	const variance = 0.96 + Math.random() * 0.08
	return Math.max(100, base * variance)
}

export default command
