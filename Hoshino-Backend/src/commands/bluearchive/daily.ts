import type { CommandContext, ICommand } from "@customTypes/command"
import { gachaRepository } from "@repositories/gacha.repository"
import { logger } from "@utils/logger"
import { resolveCanonicalSensei } from "./upgrade"

const command: ICommand = {
	name: ["daily"],
	category: "bluearchive",
	description:
		"Claim Arona's daily Sensei work bonus (+1,200 Pyroxenes, +250,000 Credits, Activity Reports, and Raid/Bounty ticket refresh)",
	usage: ["daily"],
	textOnly: true,
	execute: async (_args: string[], ctx: CommandContext) => {
		try {
			const { canonicalJid: senseiJid } = await resolveCanonicalSensei(ctx)
			const res = await gachaRepository.claimDaily(ctx.agentId, senseiJid)

			if (res.success) {
				await ctx.reply(
					`💎 *ARONA DAILY WORK BONUS CLAIMED!*\n\n` +
						`🎁 *Reward:* +1,200 Pyroxenes (Free 10-Pull!), +250,000 Credits & Activity Reports\n` +
						`💼 *Current Balance:* ${res.pyroxenes.toLocaleString("en-US")} Pyroxenes 💎 | ${(res.credits ?? 0).toLocaleString("en-US")} Credits 🪙\n\n` +
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
		} catch (error) {
			logger.error("/commands/bluearchive/daily.ts", `Daily error: ${error}`)
			await ctx.reply("⚠️ An error occurred while claiming daily rewards.")
		}
	},
}

export default command
