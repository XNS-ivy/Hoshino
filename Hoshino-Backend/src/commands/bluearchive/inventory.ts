import type { CommandContext, ICommand } from "@customTypes/command"
import { gachaRepository } from "@repositories/gacha.repository"
import { logger } from "@utils/logger"
import { resolveCanonicalSensei } from "./upgrade"

const command: ICommand = {
	name: ["inventory", "bag", "materials"],
	category: "bluearchive",
	description:
		"View Sensei's SchaleDB upgrade material inventory (Activity Reports, Blu-rays, Tech Notes, Oopart Artifacts, Equipment Blueprints, Credits & Tickets)",
	usage: ["inventory", "bag", "materials"],
	textOnly: true,
	execute: async (_args: string[], ctx: CommandContext) => {
		const invoked = (ctx.commandName || "inventory").toLowerCase()

		try {
			const { canonicalJid } = await resolveCanonicalSensei(ctx)
			const profile = await gachaRepository.refreshTicketsIfNeeded(
				ctx.agentId,
				canonicalJid,
			)
			const inv = await gachaRepository.getInventory(ctx.agentId, canonicalJid)

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
		} catch (error) {
			const errMsg = error instanceof Error ? error.message : String(error)
			logger.error(
				"/commands/bluearchive/inventory.ts",
				`Command "${invoked}" error: ${errMsg}`,
			)
			await ctx.reply(
				`⚠️ An error occurred while processing *${ctx.prefix}${invoked}*: ${errMsg}`,
			)
		}
	},
}

export default command

