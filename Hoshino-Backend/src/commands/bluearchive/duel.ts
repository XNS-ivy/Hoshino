import type { CommandContext, ICommand } from "@customTypes/command"
import { gachaRepository } from "@repositories/gacha.repository"
import { logger } from "@utils/logger"
import {
	calculateArmorMultiplier,
	calculateTerrainMultiplier,
	formatArmorType,
	formatBulletType,
} from "@utils/schaledb"
import NodeCache from "node-cache"
import { resolveSenseiSquad } from "./upgrade"

interface PendingDuelChallenge {
	id: string
	agentId: string
	chatJid: string
	challengerJid: string
	challengerName: string
	opponentJid: string
	opponentTag: string
	betAmount: number
	currency: "pyroxene" | "credit"
	createdAt: number
}

const duelCache = new NodeCache({ stdTTL: 120, checkperiod: 30 })

const command: ICommand = {
	name: ["duel", "pvp", "tactical", "bet", "taruhan"],
	category: "bluearchive",
	description:
		"Challenge another Sensei to a Blue Archive Tactical PvP Duel (4 Strikers + 2 Specials) with Pyroxene or Credit betting",
	usage: [
		"duel @sensei 500",
		"duel @sensei 100000 credit",
		"duel accept",
		"duel decline",
		"duel rank",
	],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const sub = (args[0] || "").toLowerCase()

		try {
			const senderCanonical = await gachaRepository.resolveUserJid(
				ctx.agentId,
				ctx.senderJid,
			)

			// =========================================================================
			// 1. PVP LEADERBOARD (.duel rank / .duel leaderboard / .duel top)
			// =========================================================================
			if (sub === "rank" || sub === "leaderboard" || sub === "top" || sub === "stats") {
				const profiles = await gachaRepository.getAllProfiles(ctx.agentId)
				const ranked = profiles
					.filter((p) => p.pvpWins > 0 || p.pvpLosses > 0)
					.sort((a, b) => {
						if (b.pvpWins !== a.pvpWins) return b.pvpWins - a.pvpWins
						return a.pvpLosses - b.pvpLosses
					})
					.slice(0, 10)

				let text = `⚔️ *KIVOTOS TACTICAL PVP LEADERBOARD*\n`
				text += `───────────────────────────\n\n`

				if (ranked.length === 0) {
					text += `_No Sensei PvP duels recorded yet!_\n`
					text += `💡 Challenge another Sensei with *${ctx.prefix}duel @sensei 500*!`
					await ctx.reply(text)
					return
				}

				const medals = ["🥇", "🥈", "🥉"]
				for (let i = 0; i < ranked.length; i++) {
					const p = ranked[i]!
					const total = p.pvpWins + p.pvpLosses
					const winRate = total > 0 ? Math.round((p.pvpWins / total) * 100) : 0
					const badge = medals[i] || `*#${i + 1}*`
					const tag = p.userJid.split("@")[0]
					text += `${badge} *Sensei ${tag}*\n`
					text += `  • 🏆 *Record:* ${p.pvpWins}W - ${p.pvpLosses}L (${winRate}% WR)\n`
					text += `  • 💎 *Pyroxenes:* ${p.pyroxenes.toLocaleString()} | 🪙 *Credits:* ${p.credits.toLocaleString()}\n\n`
				}

				await ctx.reply(text)
				return
			}

			// =========================================================================
			// 2. DECLINE / CANCEL PENDING DUEL (.duel decline / .duel cancel)
			// =========================================================================
			if (
				sub === "decline" ||
				sub === "reject" ||
				sub === "tolak" ||
				sub === "cancel" ||
				sub === "batal"
			) {
				const keyByOpponent = `${ctx.agentId}:${senderCanonical}`
				const pending = duelCache.get<PendingDuelChallenge>(keyByOpponent)
				if (!pending) {
					await ctx.reply(`ℹ️ You don't have any active PvP Duel invitation to decline.`)
					return
				}
				duelCache.del(keyByOpponent)
				await ctx.reply(
					`🏳️ *Tactical Challenge Declined!*\nThe duel invitation between *${pending.challengerName}* and *@${pending.opponentTag}* has been cancelled.`,
				)
				return
			}

			// =========================================================================
			// 3. ACCEPT PENDING DUEL & EXECUTE 3-PHASE PVP SIMULATION (.duel accept)
			// =========================================================================
			if (
				sub === "accept" ||
				sub === "terima" ||
				sub === "gas" ||
				sub === "yes" ||
				sub === "start"
			) {
				const keyByOpponent = `${ctx.agentId}:${senderCanonical}`
				const challenge = duelCache.get<PendingDuelChallenge>(keyByOpponent)

				if (!challenge) {
					await ctx.reply(
						`⚠️ You don't have any pending PvP Duel invitation!\n` +
							`💡 Have another Sensei challenge you using *${ctx.prefix}duel @you <bet_amount>*`,
					)
					return
				}

				duelCache.del(keyByOpponent)

				const [challengerProfile, opponentProfile, squadA, squadB] =
					await Promise.all([
						gachaRepository.getOrCreateProfile(
							ctx.agentId,
							challenge.challengerJid,
						),
						gachaRepository.getOrCreateProfile(
							ctx.agentId,
							challenge.opponentJid,
						),
						resolveSenseiSquad(ctx.agentId, challenge.challengerJid),
						resolveSenseiSquad(ctx.agentId, challenge.opponentJid),
					])

				const unitsA = [...squadA.strikers, ...squadA.specials]
				const unitsB = [...squadB.strikers, ...squadB.specials]

				if (unitsA.length === 0 || unitsB.length === 0) {
					await ctx.reply(
						`❌ Both Senseis must own at least 1 recruited student to fight in Tactical Challenge!`,
					)
					return
				}

				// Check balance before simulation
				if (challenge.currency === "pyroxene") {
					if (
						challengerProfile.pyroxenes < challenge.betAmount ||
						opponentProfile.pyroxenes < challenge.betAmount
					) {
						await ctx.reply(
							`❌ Duel cancelled: One of the Senseis no longer has *${challenge.betAmount.toLocaleString()} Pyroxenes* to cover the bet!`,
						)
						return
					}
				} else {
					if (
						challengerProfile.credits < challenge.betAmount ||
						opponentProfile.credits < challenge.betAmount
					) {
						await ctx.reply(
							`❌ Duel cancelled: One of the Senseis no longer has *${challenge.betAmount.toLocaleString()} Credits* to cover the bet!`,
						)
						return
					}
				}

				// ---------------------------------------------------------------------
				// 3-PHASE BLUE ARCHIVE TACTICAL CHALLENGE SIMULATION ENGINE
				// ---------------------------------------------------------------------
				const terrains = ["Street", "Outdoor", "Indoor"] as const
				const arenaTerrain =
					terrains[Math.floor(Math.random() * terrains.length)] || "Outdoor"

				// Helper to evaluate a team's offensive & defensive performance against the opposing team
				const evaluateTeamScore = (
					attackers: typeof unitsA,
					defenders: typeof unitsB,
				) => {
					const defenderStrikers =
						defenders.filter((d) => d.schale.SquadType === "Main").length > 0
							? defenders.filter((d) => d.schale.SquadType === "Main")
							: defenders

					const specialAtkBonus = Math.round(
						attackers
							.filter((a) => a.schale.SquadType !== "Main")
							.reduce((s, u) => s + u.stats.atk, 0) * 0.2,
					)
					const specialHealBonus = Math.round(
						attackers.reduce((s, u) => s + u.stats.heal, 0) * 0.45,
					)

					let totalTacticalOutput = 0
					let bestUnitName = attackers[0]?.schale.Name || "Student"
					let bestUnitEx =
						attackers[0]?.schale.Skills?.Ex?.Name || "EX Skill"
					let bestUnitScore = 0
					let weakHitsCount = 0

					for (const unit of attackers) {
						// Pick opposing target to check Bullet vs Armor affinity
						const target =
							defenderStrikers[
								Math.floor(Math.random() * defenderStrikers.length)
							]!
						const armorAffinity = calculateArmorMultiplier(
							unit.schale.BulletType,
							target.schale.ArmorType,
						)
						if (armorAffinity.multiplier >= 2.0) weakHitsCount++

						const terrainAffinity = calculateTerrainMultiplier(
							unit.schale,
							arenaTerrain,
						)

						// Critical & Accuracy/Evasion check
						const hitChance = Math.min(
							0.98,
							Math.max(
								0.65,
								unit.stats.accuracy /
									(unit.stats.accuracy + target.stats.dodge * 0.55),
							),
						)
						const critChance = Math.min(0.65, unit.stats.crit / 950)
						const isCrit = Math.random() < critChance
						const critMult = isCrit ? 1.5 : 1.0

						const effectiveAtk = unit.stats.atk + specialAtkBonus
						const offenseScore =
							effectiveAtk *
							3.8 *
							unit.stats.exMultiplier *
							unit.stats.skillMultiplier *
							armorAffinity.multiplier *
							terrainAffinity.multiplier *
							hitChance *
							critMult

						const survivabilityScore =
							unit.stats.maxHp * 0.22 + unit.stats.def * 4.2

						// Small tactical RNG variance (93% - 107%)
						const rng = 0.93 + Math.random() * 0.14
						const unitTotal = Math.round(
							(offenseScore + survivabilityScore) * rng,
						)

						totalTacticalOutput += unitTotal
						if (unitTotal > bestUnitScore) {
							bestUnitScore = unitTotal
							bestUnitName = unit.schale.Name
							bestUnitEx = unit.schale.Skills?.Ex?.Name || "EX Skill"
						}
					}

					totalTacticalOutput += specialHealBonus
					return {
						totalTacticalOutput: Math.round(totalTacticalOutput),
						bestUnitName,
						bestUnitEx,
						bestUnitScore: Math.round(bestUnitScore),
						weakHitsCount,
					}
				}

				const simA = evaluateTeamScore(unitsA, unitsB)
				const simB = evaluateTeamScore(unitsB, unitsA)

				const challengerWins =
					simA.totalTacticalOutput >= simB.totalTacticalOutput
				const winnerJid = challengerWins
					? challenge.challengerJid
					: challenge.opponentJid
				const loserJid = challengerWins
					? challenge.opponentJid
					: challenge.challengerJid
				const winnerName = challengerWins
					? challenge.challengerName
					: ctx.pushName || `@${challenge.opponentTag}`
				const loserName = challengerWins
					? ctx.pushName || `@${challenge.opponentTag}`
					: challenge.challengerName
				const winnerSim = challengerWins ? simA : simB

				const settlement = await gachaRepository.settlePvpDuel(
					ctx.agentId,
					winnerJid,
					loserJid,
					challenge.betAmount,
					challenge.currency,
				)

				if (!settlement.success) {
					await ctx.reply(
						`⚠️ Failed to settle PvP bet: ${settlement.reason || "Insufficient balance"}.`,
					)
					return
				}

				const totalPot = challenge.betAmount * 2
				const currencyLabel =
					challenge.currency === "pyroxene" ? "Pyroxenes 💎" : "Credits 🪙"

				const namesA = unitsA
					.map((u) => `${u.schale.Name} (Lv.${u.owned.level})`)
					.join(", ")
				const namesB = unitsB
					.map((u) => `${u.schale.Name} (Lv.${u.owned.level})`)
					.join(", ")

				let report = `⚔️ *KIVOTOS TACTICAL CHALLENGE — PVP RESULT*\n`
				report += `═══════════════════════════\n`
				report += `🏞️ *Arena Terrain:* ${arenaTerrain}\n`
				report += `💰 *Total Bet Pot:* *${totalPot.toLocaleString()} ${currencyLabel}*\n`
				report += `═══════════════════════════\n\n`

				report += `🔵 *CHALLENGER:* *${challenge.challengerName}*\n`
				report += `  • ⚡ Squad CP: *${squadA.totalCombatPower.toLocaleString()} CP*\n`
				report += `  • 👧 Roster: ${namesA}\n`
				report += `  • 💥 Tactical Output: *${simA.totalTacticalOutput.toLocaleString()} pts* (${simA.weakHitsCount} Weak Counter Hits)\n\n`

				report += `🔴 *DEFENDER:* *${ctx.pushName || `@${challenge.opponentTag}`}*\n`
				report += `  • ⚡ Squad CP: *${squadB.totalCombatPower.toLocaleString()} CP*\n`
				report += `  • 👧 Roster: ${namesB}\n`
				report += `  • 💥 Tactical Output: *${simB.totalTacticalOutput.toLocaleString()} pts* (${simB.weakHitsCount} Weak Counter Hits)\n\n`

				report += `───────────────────────────\n`
				report += `🎬 *BATTLE HIGHLIGHTS:*\n`
				report += `• *Phase 1 (Opening Volley):* ${simA.bestUnitName} clashes head-on with ${simB.bestUnitName} in the ${arenaTerrain} arena!\n`
				report += `• *Phase 2 (EX Skill Clash):* *${simA.bestUnitName}* unleashes _"${simA.bestUnitEx}"_ while *${simB.bestUnitName}* counters with _"${simB.bestUnitEx}"_!\n`
				report += `• *Phase 3 (Decisive Finisher):* *${winnerSim.bestUnitName}* breaks through the frontline defense and secures victory!\n`
				report += `───────────────────────────\n\n`

				report += `🏆 *WINNER:* *${winnerName}* 🎉\n`
				report += `👑 *Match MVP:* *${winnerSim.bestUnitName}* (_${winnerSim.bestUnitEx}_)\n`
				report += `🎁 *Net Winnings:* *+${challenge.betAmount.toLocaleString()} ${currencyLabel}* (Total Pot: ${totalPot.toLocaleString()})\n`
				report += `📉 *${loserName}:* -${challenge.betAmount.toLocaleString()} ${currencyLabel}\n\n`

				if (challenge.currency === "pyroxene") {
					report += `💼 *Updated Balances:*\n`
					report += `  • 🏆 ${winnerName}: *${settlement.winnerProfile.pyroxenes.toLocaleString()} Pyroxenes*\n`
					report += `  • 💀 ${loserName}: *${settlement.loserProfile.pyroxenes.toLocaleString()} Pyroxenes*`
				} else {
					report += `💼 *Updated Balances:*\n`
					report += `  • 🏆 ${winnerName}: *${settlement.winnerProfile.credits.toLocaleString()} Credits*\n`
					report += `  • 💀 ${loserName}: *${settlement.loserProfile.credits.toLocaleString()} Credits*`
				}

				await ctx.reply(report)
				return
			}

			// =========================================================================
			// 4. CREATE A NEW PVP DUEL CHALLENGE (.duel @target <bet_amount> [currency])
			// =========================================================================
			const mentions = await ctx.getMentions()
			const quoted = await ctx.getQuotedMessage()

			let targetRawJid = mentions[0] || quoted?.senderJid || ""

			// Also allow phone number or @number in args
			if (!targetRawJid) {
				const phoneArg = args.find((a) =>
					/^@?\d{7,16}$/.test(a.replace(/[^0-9@]/g, "")),
				)
				if (phoneArg) {
					targetRawJid = `${phoneArg.replace(/[^0-9]/g, "")}@s.whatsapp.net`
				}
			}

			if (!targetRawJid) {
				await ctx.reply(
					`⚔️ *BLUE ARCHIVE TACTICAL PVP DUEL (BETTING)*\n` +
						`───────────────────────────\n` +
						`Challenge another Sensei's *4 Striker + 2 Special* squad with Pyroxene or Credit wagering!\n\n` +
						`📌 *How to Challenge:*\n` +
						`• *${ctx.prefix}duel @sensei 500* — Bet 500 Pyroxenes\n` +
						`• *${ctx.prefix}duel @sensei 200000 credit* — Bet 200,000 Credits\n` +
						`• _Or reply to a Sensei's message with_ *${ctx.prefix}duel 500*\n\n` +
						`📌 *Respond to Challenge:*\n` +
						`• *${ctx.prefix}duel accept* — Accept & start battle\n` +
						`• *${ctx.prefix}duel decline* — Decline challenge\n` +
						`• *${ctx.prefix}duel rank* — View PvP Leaderboard`,
				)
				return
			}

			const opponentCanonical = await gachaRepository.resolveUserJid(
				ctx.agentId,
				targetRawJid,
			)

			if (
				opponentCanonical === senderCanonical ||
				opponentCanonical.split("@")[0] === senderCanonical.split("@")[0]
			) {
				await ctx.reply(`❌ Sensei, you cannot challenge yourself to a PvP duel!`)
				return
			}

			// Parse currency and bet amount from args (excluding @mention token)
			let currency: "pyroxene" | "credit" = "pyroxene"
			let betAmount = 200

			for (const arg of args) {
				const lower = arg.toLowerCase()
				if (
					lower === "credit" ||
					lower === "credits" ||
					lower === "koin" ||
					lower === "coin"
				) {
					currency = "credit"
				} else if (
					lower === "pyroxene" ||
					lower === "pyroxenes" ||
					lower === "pyro" ||
					lower === "gem"
				) {
					currency = "pyroxene"
				} else if (!arg.startsWith("@")) {
					const cleanNum = Number.parseInt(arg.replace(/[^0-9]/g, ""), 10)
					if (!Number.isNaN(cleanNum) && cleanNum > 0 && cleanNum < 1000000000) {
						betAmount = cleanNum
					}
				}
			}

			if (betAmount < 10) {
				await ctx.reply(`⚠️ Minimum PvP duel bet is *10 ${currency === "pyroxene" ? "Pyroxenes" : "Credits"}*!`)
				return
			}

			const [challengerProfile, opponentProfile, squadA, squadB] =
				await Promise.all([
					gachaRepository.getOrCreateProfile(ctx.agentId, senderCanonical),
					gachaRepository.getOrCreateProfile(ctx.agentId, opponentCanonical),
					resolveSenseiSquad(ctx.agentId, senderCanonical),
					resolveSenseiSquad(ctx.agentId, opponentCanonical),
				])

			if (squadA.strikers.length + squadA.specials.length === 0) {
				await ctx.reply(
					`❌ You don't have any students in your squad yet! Recruit students with *${ctx.prefix}gacha 10* first.`,
				)
				return
			}

			if (squadB.strikers.length + squadB.specials.length === 0) {
				await ctx.reply(
					`❌ Target Sensei doesn't have any recruited students yet! Tell them to pull with *${ctx.prefix}gacha 10* first.`,
				)
				return
			}

			const currencyLabel =
				currency === "pyroxene" ? "Pyroxenes 💎" : "Credits 🪙"

			if (currency === "pyroxene") {
				if (challengerProfile.pyroxenes < betAmount) {
					await ctx.reply(
						`❌ You don't have enough Pyroxenes! Your balance: *${challengerProfile.pyroxenes.toLocaleString()} Pyroxenes* (Bet: ${betAmount.toLocaleString()}).`,
					)
					return
				}
				if (opponentProfile.pyroxenes < betAmount) {
					await ctx.reply(
						`❌ Target Sensei only has *${opponentProfile.pyroxenes.toLocaleString()} Pyroxenes* and cannot cover a *${betAmount.toLocaleString()} Pyroxene* bet!`,
					)
					return
				}
			} else {
				if (challengerProfile.credits < betAmount) {
					await ctx.reply(
						`❌ You don't have enough Credits! Your balance: *${challengerProfile.credits.toLocaleString()} Credits* (Bet: ${betAmount.toLocaleString()}).`,
					)
					return
				}
				if (opponentProfile.credits < betAmount) {
					await ctx.reply(
						`❌ Target Sensei only has *${opponentProfile.credits.toLocaleString()} Credits* and cannot cover a *${betAmount.toLocaleString()} Credit* bet!`,
					)
					return
				}
			}

			const opponentTag = opponentCanonical.split("@")[0] || "Sensei"
			const challengeObj: PendingDuelChallenge = {
				id: `${Date.now()}`,
				agentId: ctx.agentId,
				chatJid: ctx.jid,
				challengerJid: senderCanonical,
				challengerName: ctx.pushName || `@${senderCanonical.split("@")[0]}`,
				opponentJid: opponentCanonical,
				opponentTag,
				betAmount,
				currency,
				createdAt: Date.now(),
			}

			duelCache.set(`${ctx.agentId}:${opponentCanonical}`, challengeObj)

			let inviteMsg = `⚔️ *TACTICAL PVP DUEL CHALLENGE!* ⚔️\n`
			inviteMsg += `───────────────────────────\n`
			inviteMsg += `🔵 *Challenger:* *${challengeObj.challengerName}* (⚡ ${squadA.totalCombatPower.toLocaleString()} CP)\n`
			inviteMsg += `🔴 *Opponent:* *@${opponentTag}* (⚡ ${squadB.totalCombatPower.toLocaleString()} CP)\n`
			inviteMsg += `💰 *Wager Bet:* *${betAmount.toLocaleString()} ${currencyLabel}* each\n`
			inviteMsg += `🏆 *Winner Takes Pot:* *${(betAmount * 2).toLocaleString()} ${currencyLabel}*\n`
			inviteMsg += `───────────────────────────\n\n`
			inviteMsg += `👉 *@${opponentTag}*, type *${ctx.prefix}duel accept* within 2 minutes to start the battle, or *${ctx.prefix}duel decline* to refuse!`

			await ctx.sock.sendMessage(
				ctx.jid,
				{
					text: inviteMsg,
					mentions: [targetRawJid, opponentCanonical],
				},
				{ quoted: ctx.rawMsg },
			)
		} catch (error) {
			logger.error("/commands/bluearchive/duel.ts", `PvP Duel error: ${error}`)
			await ctx.reply("⚠️ An error occurred while processing the PvP Duel.")
		}
	},
}

export default command

