import type { CommandContext, ICommand } from "@customTypes/command"
import { gachaRepository } from "@repositories/gacha.repository"
import { logger } from "@utils/logger"
import {
	executeGachaPull,
	fetchSchaleImageBuffer,
	getStudentImageUrl,
} from "@utils/schaledb"
import { resolveCanonicalSensei } from "./upgrade"

const command: ICommand = {
	name: ["spark"],
	category: "bluearchive",
	description:
		"Exchange 200 Recruitment Spark Points for a guaranteed 3★ Blue Archive student",
	usage: ["spark"],
	textOnly: true,
	execute: async (_args: string[], ctx: CommandContext) => {
		try {
			const { canonicalJid: senseiJid } = await resolveCanonicalSensei(ctx)
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
		} catch (error) {
			logger.error("/commands/bluearchive/spark.ts", `Spark error: ${error}`)
			await ctx.reply("⚠️ An error occurred while redeeming Spark points.")
		}
	},
}

export default command

