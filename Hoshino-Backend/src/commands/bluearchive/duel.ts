import type { CommandContext, ICommand } from "@customTypes/command"
import { gachaRepository } from "@repositories/gacha.repository"
import {
	findGroupParticipant,
	getParticipantIdentities,
} from "@services/contextBuilder"
import { logger } from "@utils/logger"
import {
	calculateArmorMultiplier,
	calculateTerrainMultiplier,
} from "@utils/schaledb"
import NodeCache from "node-cache"
import { resolveCanonicalSensei, resolveSenseiSquad } from "./upgrade"

interface PendingDuelChallenge {
	id: string
	agentId: string
	chatJid: string
	challengerJid: string
	challengerIdentities: string[]
	challengerName: string
	opponentJid: string
	opponentIdentities: string[]
	opponentMentionJid: string
	opponentTag: string
	betAmount: number
	currency: "pyroxene" | "credit"
	cacheKeys: string[]
	createdAt: number
}

const duelCache = new NodeCache({ stdTTL: 120, checkperiod: 30 })

function findPendingChallengeForSensei(
	agentId: string,
	chatJid: string,
	senseiIdentities: string[],
): PendingDuelChallenge | undefined {
	for (const id of senseiIdentities) {
		const hit = duelCache.get<PendingDuelChallenge>(`${agentId}:${id}`)
		if (hit) return hit
	}
	// Also check chat-scoped challenge if the sender's identities overlap with opponentIdentities
	const chatHit = duelCache.get<PendingDuelChallenge>(
		`chat:${agentId}:${chatJid}`,
	)
	if (chatHit) {
		const idSet = new Set(senseiIdentities.map((x) => x.split("@")[0]))
		const oppMatch = chatHit.opponentIdentities.some(
			(oid) =>
				senseiIdentities.includes(oid) || idSet.has(oid.split("@")[0]),
		)
		if (oppMatch) return chatHit
	}
	return undefined
}

function clearPendingChallenge(challenge: PendingDuelChallenge): void {
	for (const k of challenge.cacheKeys) {
		duelCache.del(k)
	}
}

/**
 * Extracts all candidate target JIDs from mentions, quoted message, raw contextInfo, or group participant matching.
 */
async function extractTargetCandidateJids(
	args: string[],
	ctx: CommandContext,
): Promise<string[]> {
	const candidates = new Set<string>()

	// 1. Standard lazy mentions
	const mentions = await ctx.getMentions()
	for (const m of mentions) {
		if (m && !m.endsWith("@g.us")) candidates.add(m)
	}

	// 2. Standard lazy quoted message
	const quoted = await ctx.getQuotedMessage()
	if (quoted?.senderJid && !quoted.senderJid.endsWith("@g.us")) {
		candidates.add(quoted.senderJid)
	}
	if (quoted?.key?.participant && !quoted.key.participant.endsWith("@g.us")) {
		candidates.add(quoted.key.participant)
	}

	// 3. Direct raw message envelope inspection (handles ephemeral/viewOnce/nested contextInfo)
	const m = ctx.rawMsg.message
	const unwrapped =
		m?.ephemeralMessage?.message ||
		m?.viewOnceMessage?.message ||
		m?.viewOnceMessageV2?.message ||
		m
	const rawContextInfo =
		unwrapped?.extendedTextMessage?.contextInfo ||
		unwrapped?.imageMessage?.contextInfo ||
		unwrapped?.videoMessage?.contextInfo ||
		m?.extendedTextMessage?.contextInfo ||
		m?.imageMessage?.contextInfo ||
		m?.videoMessage?.contextInfo

	if (rawContextInfo) {
		const extCtx = rawContextInfo as typeof rawContextInfo & {
			participantAlt?: string
		}
		if (extCtx.participantAlt && !extCtx.participantAlt.endsWith("@g.us")) {
			candidates.add(extCtx.participantAlt)
		}
		if (
			rawContextInfo.participant &&
			!rawContextInfo.participant.endsWith("@g.us")
		) {
			candidates.add(rawContextInfo.participant)
		}
		if (Array.isArray(rawContextInfo.mentionedJid)) {
			for (const mj of rawContextInfo.mentionedJid) {
				if (mj && !mj.endsWith("@g.us")) candidates.add(mj)
			}
		}
	}

	// 4. Check @number or phone digits in args and match against group participants if in a group
	const groupMeta = ctx.isGroup ? await ctx.getGroupMetadata() : null
	for (const arg of args) {
		if (arg.startsWith("@")) {
			const cleanDigits = arg.slice(1).replace(/[^0-9]/g, "")
			if (cleanDigits.length >= 6) {
				candidates.add(`${cleanDigits}@s.whatsapp.net`)
				candidates.add(`${cleanDigits}@lid`)
				if (groupMeta?.participants?.length) {
					const matched = findGroupParticipant(groupMeta.participants, [
						`${cleanDigits}@s.whatsapp.net`,
						`${cleanDigits}@lid`,
					])
					if (matched) {
						for (const pid of getParticipantIdentities(matched)) {
							if (!pid.endsWith("@g.us")) candidates.add(pid)
						}
					}
				}
			}
		}
	}

	return Array.from(candidates)
}

const command: ICommand = {
	name: ["duel", "pvp", "tactical", "bet", "taruhan"],
	category: "bluearchive",
	description:
		"Challenge another Sensei to a Blue Archive Tactical PvP Duel (4 Strikers + 2 Specials) with Pyroxene or Credit betting",
	usage: [
		"duel @sensei 500",
		"duel @sensei 100000 credit",
		"duel 500 (replying to a Sensei's message)",
		"duel accept",
		"duel decline",
		"duel rank",
	],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const sub = (args[0] || "").toLowerCase()

		try {
			const {
				canonicalJid: senderCanonical,
				allIdentities: senderIdentities,
			} = await resolveCanonicalSensei(ctx)

			// =========================================================================
			// 1. PVP LEADERBOARD (.duel rank / .duel leaderboard / .duel top)
			// =========================================================================
			if (
				sub === "rank" ||
				sub === "leaderboard" ||
				sub === "top" ||
				sub === "stats"
			) {
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
				const pending = findPendingChallengeForSensei(
					ctx.agentId,
					ctx.jid,
					senderIdentities,
				)
				if (!pending) {
					await ctx.reply(
						`ℹ️ You don't have any active PvP Duel invitation to decline.`,
					)
					return
				}
				clearPendingChallenge(pending)
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
				const challenge = findPendingChallengeForSensei(
					ctx.agentId,
					ctx.jid,
					senderIdentities,
				)

				if (!challenge) {
					await ctx.reply(
						`⚠️ You don't have any pending PvP Duel invitation!\n` +
							`💡 Have another Sensei challenge you using *${ctx.prefix}duel @you <bet_amount>*`,
					)
					return
				}

				clearPendingChallenge(challenge)

				// Re-resolve canonical JIDs across all identities to ensure student rosters are unified
				const challengerCanonical = await gachaRepository.resolveUserJid(
					ctx.agentId,
					challenge.challengerIdentities,
				)
				const opponentCanonical = await gachaRepository.resolveUserJid(
					ctx.agentId,
					[...challenge.opponentIdentities, ...senderIdentities],
				)

				const [challengerProfile, opponentProfile, squadA, squadB] =
					await Promise.all([
						gachaRepository.getOrCreateProfile(
							ctx.agentId,
							challengerCanonical,
						),
						gachaRepository.getOrCreateProfile(ctx.agentId, opponentCanonical),
						resolveSenseiSquad(ctx.agentId, challengerCanonical),
						resolveSenseiSquad(ctx.agentId, opponentCanonical),
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
					let bestUnitEx = attackers[0]?.schale.Skills?.Ex?.Name || "EX Skill"
					let bestUnitScore = 0
					let weakHitsCount = 0

					for (const unit of attackers) {
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
					? challengerCanonical
					: opponentCanonical
				const loserJid = challengerWins
					? opponentCanonical
					: challengerCanonical
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
			const targetSeeds = await extractTargetCandidateJids(args, ctx)

			if (targetSeeds.length === 0) {
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

			// Resolve ALL @lid and @s.whatsapp.net identities for the target Sensei in the group!
			const {
				canonicalJid: opponentCanonical,
				allIdentities: opponentIdentities,
			} = await resolveCanonicalSensei(ctx, targetSeeds)

			const isSelfChallenge =
				opponentCanonical === senderCanonical ||
				opponentIdentities.some((id) => senderIdentities.includes(id))

			if (isSelfChallenge) {
				await ctx.reply(
					`❌ Sensei, you cannot challenge yourself to a PvP duel!`,
				)
				return
			}

			// Parse currency and bet amount from non-mention args
			let currency: "pyroxene" | "credit" = "pyroxene"
			let betAmount = 200

			const targetDigitSet = new Set(
				opponentIdentities.map((id) => id.split("@")[0]?.replace(/[^0-9]/g, "")),
			)

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
					const cleanNum = arg.replace(/[^0-9]/g, "")
					// Skip if this token is actually the opponent's phone/LID number
					if (cleanNum.length >= 9 && targetDigitSet.has(cleanNum)) {
						continue
					}
					const parsed = Number.parseInt(cleanNum, 10)
					if (!Number.isNaN(parsed) && parsed > 0 && parsed < 1000000000) {
						betAmount = parsed
					}
				}
			}

			if (betAmount < 10) {
				await ctx.reply(
					`⚠️ Minimum PvP duel bet is *10 ${currency === "pyroxene" ? "Pyroxenes" : "Credits"}*!`,
				)
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

			// Choose best JID for WhatsApp @mention tag in group
			const groupMeta = ctx.isGroup ? await ctx.getGroupMetadata() : null
			const matchedParticipant = findGroupParticipant(
				groupMeta?.participants,
				opponentIdentities,
			)
			const opponentMentionJid =
				targetSeeds[0] || matchedParticipant?.id || opponentCanonical
			const opponentTag =
				opponentMentionJid.split("@")[0] ||
				opponentCanonical.split("@")[0] ||
				"Sensei"

			const cacheKeys = [
				`chat:${ctx.agentId}:${ctx.jid}`,
				...opponentIdentities.map((id) => `${ctx.agentId}:${id}`),
			]

			const challengeObj: PendingDuelChallenge = {
				id: `${Date.now()}`,
				agentId: ctx.agentId,
				chatJid: ctx.jid,
				challengerJid: senderCanonical,
				challengerIdentities: senderIdentities,
				challengerName: ctx.pushName || `@${senderCanonical.split("@")[0]}`,
				opponentJid: opponentCanonical,
				opponentIdentities,
				opponentMentionJid,
				opponentTag,
				betAmount,
				currency,
				cacheKeys,
				createdAt: Date.now(),
			}

			for (const k of cacheKeys) {
				duelCache.set(k, challengeObj)
			}

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
					mentions: Array.from(
						new Set([opponentMentionJid, ...opponentIdentities]),
					),
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
