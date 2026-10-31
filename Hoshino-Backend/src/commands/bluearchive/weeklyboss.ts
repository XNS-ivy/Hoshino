import type { CommandContext, ICommand } from "@customTypes/command"
import { gachaRepository } from "@repositories/gacha.repository"
import { logger } from "@utils/logger"
import {
	calculateArmorMultiplier,
	calculateTerrainMultiplier,
	fetchSchaleImageBuffer,
	formatArmorType,
	getRaidBossImageUrls,
} from "@utils/schaledb"
import {
	generateSmartMaterialDrops,
	getActiveWeeklyBoss,
	getRaidBosses,
} from "./raid"
import { resolveCanonicalSensei, resolveSenseiSquad } from "./upgrade"

const command: ICommand = {
	name: ["weeklyboss", "bounty"],
	category: "bluearchive",
	description:
		"Challenge Kivotos Weekly Boss Bounty for targeted school upgrade materials, Equipment Blueprints, Credits, and Pyroxenes",
	usage: ["weeklyboss", "weeklyboss [boss]", "bounty"],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		try {
			const bosses = await getRaidBosses()
			const activeBoss = getActiveWeeklyBoss(bosses)
			const { canonicalJid } = await resolveCanonicalSensei(ctx)
			await gachaRepository.refreshTicketsIfNeeded(ctx.agentId, canonicalJid)

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

			const queryArg = args.join(" ").trim().toLowerCase()
			const targetBoss =
				(queryArg &&
					bosses.find(
						(b) =>
							b.Name.toLowerCase().includes(queryArg) ||
							b.DevName.toLowerCase().includes(queryArg) ||
							b.PathName?.toLowerCase().includes(queryArg),
					)) ||
				bosses[(bosses.indexOf(activeBoss) + 1) % Math.max(1, bosses.length)] ||
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

			const bossImgBuf = await fetchSchaleImageBuffer(
				getRaidBossImageUrls(targetBoss),
			)
			if (bossImgBuf) {
				await ctx.sock.sendMessage(
					ctx.jid,
					{ image: bossImgBuf, caption: text },
					{ quoted: ctx.rawMsg },
				)
				return
			}

			await ctx.reply(text)
		} catch (error) {
			logger.error(
				"/commands/bluearchive/weeklyboss.ts",
				`WeeklyBoss error: ${error}`,
			)
			await ctx.reply("⚠️ Failed to process Weekly Boss Bounty command.")
		}
	},
}

export default command

