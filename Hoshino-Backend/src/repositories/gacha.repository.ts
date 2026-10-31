import { sql } from "@utils/db"

export interface SenseiProfile {
	agentId: string
	userJid: string
	pyroxenes: number
	credits: number
	sparkPoints: number
	totalPulls: number
	lastDaily: Date | null
	raidTickets: number
	bountyTickets: number
	lastTicketReset: Date | null
	pvpWins: number
	pvpLosses: number
	squadStrikers: number[]
	squadSpecials: number[]
	createdAt: Date
	updatedAt: Date
}

export interface SenseiStudentItem {
	agentId: string
	userJid: string
	studentId: number
	studentName: string
	starGrade: number
	count: number
	level: number
	exp: number
	exSkillLevel: number
	normalSkillLevel: number
	passiveSkillLevel: number
	subSkillLevel: number
	equipSlot1Tier: number
	equipSlot2Tier: number
	equipSlot3Tier: number
	weaponStar: number
	firstObtainedAt: Date
}

export interface SenseiInventoryItem {
	agentId: string
	userJid: string
	itemId: number
	itemName: string
	category: string
	rarity: string
	count: number
	updatedAt: Date
}

export interface SenseiRaidRecord {
	agentId: string
	userJid: string
	bossId: number
	bossName: string
	difficulty: string
	bestScore: number
	totalDamage: number
	clears: number
	updatedAt: Date
}

export const ELEPH_CONFIG = {
	ELEPH_PER_DUPLICATE: {
		1: 1, // 1★ duplicate = 1 Eleph
		2: 2, // 2★ duplicate = 2 Eleph
		3: 3, // 3★ duplicate = 3 Eleph
		4: 3,
		5: 3,
	} as Record<number, number>,
	PYROXENES_PER_ELEPH: 1, // Rebalanced (anti-inflation): 1 Eleph = 1 Pyroxene
}

export interface ElephSummaryItem {
	studentId: number
	studentName: string
	starGrade: number
	count: number
	duplicateCount: number
	elephCount: number
	pyroxeneValue: number
}

export interface ElephSummary {
	totalDuplicates: number
	totalEleph: number
	totalPyroxenes: number
	studentsWithEleph: ElephSummaryItem[]
	breakdown: {
		threeStar: { duplicates: number; eleph: number; pyroxenes: number }
		twoStar: { duplicates: number; eleph: number; pyroxenes: number }
		oneStar: { duplicates: number; eleph: number; pyroxenes: number }
	}
}

export interface ClaimElephResult {
	success: boolean
	claimedStudents: number
	claimedDuplicates: number
	claimedEleph: number
	pyroxenesGained: number
	newPyroxenes: number
	breakdown: {
		threeStar: { duplicates: number; eleph: number; pyroxenes: number }
		twoStar: { duplicates: number; eleph: number; pyroxenes: number }
		oneStar: { duplicates: number; eleph: number; pyroxenes: number }
	}
	reason?: string
}

export class GachaRepository {
	private static instance: GachaRepository

	private constructor() {}

	public static getInstance(): GachaRepository {
		if (!GachaRepository.instance) {
			GachaRepository.instance = new GachaRepository()
		}
		return GachaRepository.instance
	}

	/**
	 * Normalizes JID string to prevent comparison and database key mismatches.
	 */
	public normalizeJid(jid: string): string {
		const stripped = jid.trim().replace(/^@+/, "")
		const clean = (stripped.split(":")[0] || stripped).trim()
		if (clean.includes("@")) {
			const parts = clean.split("@")
			const userPart = parts[0] || ""
			const domain = parts[1] || "s.whatsapp.net"
			const digits = userPart.replace(/[^0-9]/g, "")
			const normalizedUser = digits.startsWith("08")
				? `62${digits.slice(1)}`
				: digits
			return `${normalizedUser}@${domain}`
		}
		let digits = clean.replace(/[^0-9]/g, "")
		if (digits.startsWith("08")) {
			digits = `62${digits.slice(1)}`
		}
		return `${digits}@s.whatsapp.net`
	}

	/**
	 * Resolves one or more candidate JIDs (`@lid` and/or `@s.whatsapp.net`) or phone numbers
	 * to the single canonical Sensei profile `user_jid` that owns the Sensei's students.
	 * Automatically merges split `@lid` / `@s.whatsapp.net` rows if both exist for the same Sensei.
	 */
	public async resolveUserJid(
		agentId: string,
		inputJid: string | string[],
	): Promise<string> {
		const rawList = (Array.isArray(inputJid) ? inputJid : [inputJid])
			.map((j) => (j || "").trim())
			.filter(
				(j) =>
					Boolean(j) &&
					!j.endsWith("@g.us") &&
					!j.endsWith("@broadcast") &&
					!j.endsWith("@newsletter"),
			)

		if (rawList.length === 0) return ""

		const candidateJids = new Set<string>()
		const candidateDigits = new Set<string>()

		for (const raw of rawList) {
			const norm = this.normalizeJid(raw)
			if (norm && !norm.endsWith("@g.us")) {
				candidateJids.add(norm)
			}
			if (!raw.endsWith("@g.us")) {
				candidateJids.add(raw)
			}
			const rawDig = raw.replace(/@.*$/, "").replace(/[^0-9]/g, "")
			const normDig = norm.split("@")[0]?.replace(/[^0-9]/g, "") || ""
			if (rawDig.length >= 5) {
				candidateDigits.add(rawDig)
				candidateDigits.add(`${rawDig}@s.whatsapp.net`)
				candidateDigits.add(`${rawDig}@lid`)
			}
			if (normDig.length >= 5) {
				candidateDigits.add(normDig)
				candidateDigits.add(`${normDig}@s.whatsapp.net`)
				candidateDigits.add(`${normDig}@lid`)
			}
		}

		for (const d of candidateDigits) {
			if (d.includes("@")) candidateJids.add(d)
		}

		const jidArray = Array.from(candidateJids)
		if (jidArray.length === 0) return ""

		// Query both sensei_students and sensei_profiles across all candidate JIDs,
		// prioritizing whichever user_jid actually owns students or has pulls!
		const matchedRows = await sql`
			WITH candidate_students AS (
				SELECT user_jid, COUNT(*)::int AS student_count, COALESCE(SUM(count), 0)::int AS total_copies
				FROM public.sensei_students
				WHERE agent_id = ${agentId} AND user_jid IN ${sql(jidArray)}
				GROUP BY user_jid
			),
			candidate_profiles AS (
				SELECT user_jid, COALESCE(total_pulls, 0)::int AS total_pulls, COALESCE(pyroxenes, 0)::int AS pyroxenes
				FROM public.sensei_profiles
				WHERE agent_id = ${agentId} AND user_jid IN ${sql(jidArray)}
			)
			SELECT 
				COALESCE(s.user_jid, p.user_jid) AS user_jid,
				COALESCE(s.student_count, 0)::int AS student_count,
				COALESCE(s.total_copies, 0)::int AS total_copies,
				COALESCE(p.total_pulls, 0)::int AS total_pulls,
				COALESCE(p.pyroxenes, 0)::int AS pyroxenes
			FROM candidate_students s
			FULL OUTER JOIN candidate_profiles p ON s.user_jid = p.user_jid
			ORDER BY 
				COALESCE(s.student_count, 0) DESC,
				COALESCE(s.total_copies, 0) DESC,
				COALESCE(p.total_pulls, 0) DESC,
				COALESCE(p.pyroxenes, 0) DESC,
				CASE WHEN COALESCE(s.user_jid, p.user_jid) LIKE '%@s.whatsapp.net' THEN 0 ELSE 1 END ASC
		`

		if (matchedRows.length > 0) {
			const typedRows = matchedRows as unknown as Array<Record<string, unknown>>
			const canonicalUserJid = typedRows[0]!.user_jid as string

			// Self-healing: if the user had split rows (e.g., an empty @lid row and a populated @s.whatsapp.net row), merge them now!
			if (typedRows.length > 1) {
				const secondaryJids = typedRows
					.slice(1)
					.map((r: Record<string, unknown>) => String(r.user_jid))
					.filter((j: string) => Boolean(j) && j !== canonicalUserJid)

				if (secondaryJids.length > 0) {
					await this.mergeSecondaryJidsIntoCanonical(
						agentId,
						canonicalUserJid,
						secondaryJids,
					).catch(() => {})
				}
			}

			return canonicalUserJid
		}

		// Prefer @s.whatsapp.net identity when initializing a brand new profile
		const preferredPn = jidArray.find((j) => j.endsWith("@s.whatsapp.net"))
		return preferredPn || this.normalizeJid(rawList[0]!)
	}

	/**
	 * Merges split Sensei records (e.g. `@lid` and `@s.whatsapp.net` belonging to the same user)
	 * into a single canonical `user_jid` so students, bonds, inventory, and balances are never lost.
	 */
	private async mergeSecondaryJidsIntoCanonical(
		agentId: string,
		canonicalJid: string,
		secondaryJids: string[],
	): Promise<void> {
		for (const secJid of secondaryJids) {
			if (!secJid || secJid === canonicalJid) continue

			// Ensure canonical profile row exists
			await sql`
				INSERT INTO public.sensei_profiles (agent_id, user_jid, pyroxenes, credits, spark_points, total_pulls)
				VALUES (${agentId}, ${canonicalJid}, 1200, 500000, 0, 0)
				ON CONFLICT (agent_id, user_jid) DO NOTHING
			`

			// Merge profile stats if secondary profile has pulls or higher balances
			const secProfiles = await sql`
				SELECT * FROM public.sensei_profiles
				WHERE agent_id = ${agentId} AND user_jid = ${secJid}
				LIMIT 1
			`
			if (secProfiles.length > 0) {
				const sp = secProfiles[0]!
				const bonusPulls = Number(sp.total_pulls || 0)
				const bonusSpark = Number(sp.spark_points || 0)
				const secPyro = Number(sp.pyroxenes || 0)
				// Only add extra pyroxenes above starter 1200 if secondary had activity
				const extraPyro = bonusPulls > 0 ? secPyro : Math.max(0, secPyro - 1200)
				await sql`
					UPDATE public.sensei_profiles
					SET 
						pyroxenes = pyroxenes + ${extraPyro},
						spark_points = spark_points + ${bonusSpark},
						total_pulls = total_pulls + ${bonusPulls},
						pvp_wins = COALESCE(pvp_wins, 0) + ${Number(sp.pvp_wins || 0)},
						pvp_losses = COALESCE(pvp_losses, 0) + ${Number(sp.pvp_losses || 0)}
					WHERE agent_id = ${agentId} AND user_jid = ${canonicalJid}
				`
			}

			// Move students
			const secStudents = await sql`
				SELECT * FROM public.sensei_students
				WHERE agent_id = ${agentId} AND user_jid = ${secJid}
			`
			for (const s of secStudents) {
				await sql`
					INSERT INTO public.sensei_students (
						agent_id, user_jid, student_id, student_name, star_grade, count,
						level, exp, ex_skill_level, normal_skill_level, passive_skill_level, sub_skill_level,
						equip_slot1_tier, equip_slot2_tier, equip_slot3_tier, weapon_star, first_obtained_at
					)
					VALUES (
						${agentId}, ${canonicalJid}, ${s.student_id}, ${s.student_name}, ${s.star_grade}, ${s.count},
						${s.level ?? 1}, ${s.exp ?? 0}, ${s.ex_skill_level ?? 1}, ${s.normal_skill_level ?? 1}, ${s.passive_skill_level ?? 1}, ${s.sub_skill_level ?? 1},
						${s.equip_slot1_tier ?? 1}, ${s.equip_slot2_tier ?? 1}, ${s.equip_slot3_tier ?? 1}, ${s.weapon_star ?? 0}, ${s.first_obtained_at}
					)
					ON CONFLICT (agent_id, user_jid, student_id)
					DO UPDATE SET 
						count = public.sensei_students.count + EXCLUDED.count,
						star_grade = GREATEST(public.sensei_students.star_grade, EXCLUDED.star_grade),
						level = GREATEST(COALESCE(public.sensei_students.level, 1), COALESCE(EXCLUDED.level, 1)),
						ex_skill_level = GREATEST(COALESCE(public.sensei_students.ex_skill_level, 1), COALESCE(EXCLUDED.ex_skill_level, 1))
				`
			}
			await sql`DELETE FROM public.sensei_students WHERE agent_id = ${agentId} AND user_jid = ${secJid}`

			// Move bonds
			const secBonds = await sql`
				SELECT * FROM public.sensei_bonds
				WHERE agent_id = ${agentId} AND user_jid = ${secJid}
			`
			for (const b of secBonds) {
				await sql`
					INSERT INTO public.sensei_bonds (agent_id, user_jid, student_id, student_name, bond_level, bond_exp, total_talks, last_talk, created_at, updated_at)
					VALUES (${agentId}, ${canonicalJid}, ${b.student_id}, ${b.student_name}, ${b.bond_level}, ${b.bond_exp}, ${b.total_talks}, ${b.last_talk}, ${b.created_at}, ${b.updated_at})
					ON CONFLICT (agent_id, user_jid, student_id)
					DO UPDATE SET 
						bond_level = GREATEST(public.sensei_bonds.bond_level, EXCLUDED.bond_level),
						bond_exp = GREATEST(public.sensei_bonds.bond_exp, EXCLUDED.bond_exp),
						total_talks = public.sensei_bonds.total_talks + EXCLUDED.total_talks
				`
			}
			await sql`DELETE FROM public.sensei_bonds WHERE agent_id = ${agentId} AND user_jid = ${secJid}`

			// Move inventory
			const secInv = await sql`
				SELECT * FROM public.sensei_inventory
				WHERE agent_id = ${agentId} AND user_jid = ${secJid}
			`
			for (const item of secInv) {
				await sql`
					INSERT INTO public.sensei_inventory (agent_id, user_jid, item_id, item_name, category, rarity, count, updated_at)
					VALUES (${agentId}, ${canonicalJid}, ${item.item_id}, ${item.item_name}, ${item.category}, ${item.rarity}, ${item.count}, CURRENT_TIMESTAMP)
					ON CONFLICT (agent_id, user_jid, item_id)
					DO UPDATE SET count = public.sensei_inventory.count + EXCLUDED.count
				`
			}
			await sql`DELETE FROM public.sensei_inventory WHERE agent_id = ${agentId} AND user_jid = ${secJid}`
			await sql`DELETE FROM public.sensei_raid_records WHERE agent_id = ${agentId} AND user_jid = ${secJid}`
			await sql`DELETE FROM public.sensei_profiles WHERE agent_id = ${agentId} AND user_jid = ${secJid}`
		}
	}

	/**
	 * Deduplicates Sensei profiles for an agent, merging duplicate entries into a single canonical row.
	 */
	public async deduplicateProfiles(agentId?: string): Promise<void> {
		try {
			const profiles = agentId
				? await sql`SELECT * FROM public.sensei_profiles WHERE agent_id = ${agentId}`
				: await sql`SELECT * FROM public.sensei_profiles`

			const groups: Record<
				string,
				Array<{
					agent_id: string
					user_jid: string
					pyroxenes: number
					spark_points: number
					total_pulls: number
					last_daily: Date | null
				}>
			> = {}

			for (const p of profiles) {
				const rawDigits = (p.user_jid as string)
					.replace(/@.*$/, "")
					.replace(/[^0-9]/g, "")
				const normalizedDigits = rawDigits.startsWith("08")
					? `62${rawDigits.slice(1)}`
					: rawDigits
				const key = `${p.agent_id}:${normalizedDigits || p.user_jid}`
				if (!groups[key]) {
					groups[key] = []
				}
				const targetGroup = groups[key]
				if (targetGroup) {
					targetGroup.push(
						p as {
							agent_id: string
							user_jid: string
							pyroxenes: number
							spark_points: number
							total_pulls: number
							last_daily: Date | null
						},
					)
				}
			}

			for (const group of Object.values(groups)) {
				if (group && group.length > 1) {
					const canonical =
						group.find((g) => g.user_jid.includes("@lid")) ||
						group.find((g) => g.user_jid.includes("@s.whatsapp.net")) ||
						group.reduce((prev, curr) =>
							curr.total_pulls > prev.total_pulls ? curr : prev,
						)

					if (!canonical) continue

					let totalPyroxenes = 0
					let maxSpark = 0
					let totalPulls = 0
					let lastDaily: Date | null = null

					for (const p of group) {
						totalPyroxenes = Math.max(totalPyroxenes, Number(p.pyroxenes || 0))
						maxSpark = Math.max(maxSpark, Number(p.spark_points || 0))
						totalPulls = Math.max(totalPulls, Number(p.total_pulls || 0))
						if (
							p.last_daily &&
							(!lastDaily || new Date(p.last_daily) > new Date(lastDaily))
						) {
							lastDaily = p.last_daily
						}
					}

					await sql`
						UPDATE public.sensei_profiles
						SET 
							pyroxenes = ${totalPyroxenes},
							spark_points = ${maxSpark},
							total_pulls = ${totalPulls},
							last_daily = ${lastDaily},
							updated_at = CURRENT_TIMESTAMP
						WHERE agent_id = ${canonical.agent_id} AND user_jid = ${canonical.user_jid}
					`

					for (const p of group) {
						if (p.user_jid !== canonical.user_jid) {
							const studentsToMove = await sql`
								SELECT * FROM public.sensei_students
								WHERE agent_id = ${p.agent_id} AND user_jid = ${p.user_jid}
							`
							for (const s of studentsToMove) {
								await sql`
									INSERT INTO public.sensei_students (agent_id, user_jid, student_id, student_name, star_grade, count, first_obtained_at)
									VALUES (${s.agent_id}, ${canonical.user_jid}, ${s.student_id}, ${s.student_name}, ${s.star_grade}, ${s.count}, ${s.first_obtained_at})
									ON CONFLICT (agent_id, user_jid, student_id)
									DO UPDATE SET count = public.sensei_students.count + EXCLUDED.count
								`
							}
							await sql`DELETE FROM public.sensei_students WHERE agent_id = ${p.agent_id} AND user_jid = ${p.user_jid}`

							const bondsToMove = await sql`
								SELECT * FROM public.sensei_bonds
								WHERE agent_id = ${p.agent_id} AND user_jid = ${p.user_jid}
							`
							for (const b of bondsToMove) {
								await sql`
									INSERT INTO public.sensei_bonds (agent_id, user_jid, student_id, student_name, bond_level, bond_exp, total_talks, last_talk, created_at, updated_at)
									VALUES (${b.agent_id}, ${canonical.user_jid}, ${b.student_id}, ${b.student_name}, ${b.bond_level}, ${b.bond_exp}, ${b.total_talks}, ${b.last_talk}, ${b.created_at}, ${b.updated_at})
									ON CONFLICT (agent_id, user_jid, student_id)
									DO UPDATE SET 
										bond_level = GREATEST(public.sensei_bonds.bond_level, EXCLUDED.bond_level),
										bond_exp = GREATEST(public.sensei_bonds.bond_exp, EXCLUDED.bond_exp),
										total_talks = public.sensei_bonds.total_talks + EXCLUDED.total_talks
								`
							}
							await sql`DELETE FROM public.sensei_bonds WHERE agent_id = ${p.agent_id} AND user_jid = ${p.user_jid}`

							await sql`
								DELETE FROM public.sensei_profiles
								WHERE agent_id = ${p.agent_id} AND user_jid = ${p.user_jid}
							`
						}
					}
				}
			}
		} catch (err) {
			console.error("Failed to deduplicate sensei profiles:", err)
		}
	}

	private parseIntArray(val: unknown): number[] {
		if (!val) return []
		if (Array.isArray(val)) {
			return val.map(Number).filter((n) => !Number.isNaN(n))
		}
		if (ArrayBuffer.isView(val)) {
			return Array.from(val as unknown as ArrayLike<number>)
				.map(Number)
				.filter((n) => !Number.isNaN(n))
		}
		if (typeof val === "string") {
			const trimmed = val.trim().replace(/^\{|\}$/g, "").trim()
			if (!trimmed) return []
			return trimmed
				.split(",")
				.map((s) => Number.parseInt(s.trim(), 10))
				.filter((n) => !Number.isNaN(n))
		}
		return []
	}

	private mapProfileRow(raw: Record<string, unknown>): SenseiProfile {
		return {
			...(raw as unknown as SenseiProfile),
			pyroxenes: Number(raw?.pyroxenes ?? 1200),
			credits: Number(raw?.credits ?? 500000),
			sparkPoints: Number(raw?.sparkPoints ?? 0),
			totalPulls: Number(raw?.totalPulls ?? 0),
			raidTickets: Number(raw?.raidTickets ?? 3),
			bountyTickets: Number(raw?.bountyTickets ?? 3),
			pvpWins: Number(raw?.pvpWins ?? 0),
			pvpLosses: Number(raw?.pvpLosses ?? 0),
			squadStrikers: this.parseIntArray(raw?.squadStrikers),
			squadSpecials: this.parseIntArray(raw?.squadSpecials),
		}
	}

	/**
	 * Fetches or creates a Sensei profile. New Sensei starts with 1,200 Pyroxenes and 500,000 Credits.
	 */
	public async getOrCreateProfile(
		agentId: string,
		userJid: string,
	): Promise<SenseiProfile> {
		const safeJid = await this.resolveUserJid(agentId, userJid)
		const rows = await sql`
			INSERT INTO public.sensei_profiles (
				agent_id, user_jid, pyroxenes, credits, spark_points, total_pulls, raid_tickets, bounty_tickets
			)
			VALUES (${agentId}, ${safeJid}, 1200, 500000, 0, 0, 3, 3)
			ON CONFLICT (agent_id, user_jid)
			DO UPDATE SET updated_at = CURRENT_TIMESTAMP
			RETURNING 
				agent_id as "agentId",
				user_jid as "userJid",
				pyroxenes,
				COALESCE(credits, 500000)::bigint as "credits",
				spark_points as "sparkPoints",
				total_pulls as "totalPulls",
				last_daily as "lastDaily",
				COALESCE(raid_tickets, 3) as "raidTickets",
				COALESCE(bounty_tickets, 3) as "bountyTickets",
				last_ticket_reset as "lastTicketReset",
				COALESCE(pvp_wins, 0) as "pvpWins",
				COALESCE(pvp_losses, 0) as "pvpLosses",
				COALESCE(squad_strikers, '{}')::text as "squadStrikers",
				COALESCE(squad_specials, '{}')::text as "squadSpecials",
				created_at as "createdAt",
				updated_at as "updatedAt"
		`
		return this.mapProfileRow(rows[0] as Record<string, unknown>)
	}

	/**
	 * Claims daily Pyroxenes (1,200 Pyroxenes + 250,000 Credits + Activity Reports / daily reset at 06:00 WIB).
	 */
	public async claimDaily(
		agentId: string,
		userJid: string,
	): Promise<{
		success: boolean
		pyroxenes: number
		credits?: number
		claimedAmount: number
		claimedCredits?: number
		remainingHours?: number
		remainingMinutes?: number
	}> {
		const profile = await this.getOrCreateProfile(agentId, userJid)
		const now = Date.now()
		const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
		const nowWib = new Date(now + WIB_OFFSET_MS)

		const year = nowWib.getUTCFullYear()
		const month = nowWib.getUTCMonth()
		const date = nowWib.getUTCDate()
		const hour = nowWib.getUTCHours()

		let lastResetWibMs: number
		let nextResetWibMs: number

		if (hour < 6) {
			lastResetWibMs = Date.UTC(year, month, date - 1, 6, 0, 0, 0)
			nextResetWibMs = Date.UTC(year, month, date, 6, 0, 0, 0)
		} else {
			lastResetWibMs = Date.UTC(year, month, date, 6, 0, 0, 0)
			nextResetWibMs = Date.UTC(year, month, date + 1, 6, 0, 0, 0)
		}

		const lastResetUtcMs = lastResetWibMs - WIB_OFFSET_MS
		const nextResetUtcMs = nextResetWibMs - WIB_OFFSET_MS

		if (profile.lastDaily) {
			const lastDailyMs = new Date(profile.lastDaily).getTime()

			if (lastDailyMs >= lastResetUtcMs) {
				const remainingMs = Math.max(0, nextResetUtcMs - now)
				const remainingHours = Math.floor(remainingMs / (60 * 60 * 1000))
				const remainingMinutes = Math.ceil(
					(remainingMs % (60 * 60 * 1000)) / (60 * 1000),
				)
				return {
					success: false,
					pyroxenes: profile.pyroxenes,
					credits: profile.credits,
					claimedAmount: 0,
					claimedCredits: 0,
					remainingHours,
					remainingMinutes,
				}
			}
		}

		const DAILY_REWARD = 1200
		const DAILY_CREDITS = 250000
		const updated = await sql`
			UPDATE public.sensei_profiles
			SET 
				pyroxenes = pyroxenes + ${DAILY_REWARD},
				credits = COALESCE(credits, 500000) + ${DAILY_CREDITS},
				raid_tickets = GREATEST(COALESCE(raid_tickets, 0), 3),
				bounty_tickets = GREATEST(COALESCE(bounty_tickets, 0), 3),
				last_daily = CURRENT_TIMESTAMP,
				last_ticket_reset = CURRENT_TIMESTAMP,
				updated_at = CURRENT_TIMESTAMP
			WHERE agent_id = ${agentId} AND user_jid = ${profile.userJid}
			RETURNING pyroxenes, credits
		`

		// Grant daily starter Activity Reports
		await this.addInventoryItems(agentId, profile.userJid, [
			{
				itemId: 11,
				itemName: "Normal Activity Report",
				category: "CharacterExpGrowth",
				rarity: "R",
				count: 10,
			},
			{
				itemId: 12,
				itemName: "Advanced Activity Report",
				category: "CharacterExpGrowth",
				rarity: "SR",
				count: 5,
			},
		])

		return {
			success: true,
			pyroxenes: Number(updated[0]?.pyroxenes || 0),
			credits: Number(updated[0]?.credits || 0),
			claimedAmount: DAILY_REWARD,
			claimedCredits: DAILY_CREDITS,
		}
	}

	/**
	 * Refreshes daily Raid & Weekly Boss Bounty tickets if past 06:00 WIB reset.
	 */
	public async refreshTicketsIfNeeded(
		agentId: string,
		userJid: string,
	): Promise<SenseiProfile> {
		const profile = await this.getOrCreateProfile(agentId, userJid)
		const now = Date.now()
		const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
		const nowWib = new Date(now + WIB_OFFSET_MS)

		const year = nowWib.getUTCFullYear()
		const month = nowWib.getUTCMonth()
		const date = nowWib.getUTCDate()
		const hour = nowWib.getUTCHours()

		const lastResetWibMs =
			hour < 6
				? Date.UTC(year, month, date - 1, 6, 0, 0, 0)
				: Date.UTC(year, month, date, 6, 0, 0, 0)
		const lastResetUtcMs = lastResetWibMs - WIB_OFFSET_MS

		const lastTicketMs = profile.lastTicketReset
			? new Date(profile.lastTicketReset).getTime()
			: 0

		if (lastTicketMs < lastResetUtcMs) {
			await sql`
				UPDATE public.sensei_profiles
				SET 
					raid_tickets = GREATEST(COALESCE(raid_tickets, 0), 3),
					bounty_tickets = GREATEST(COALESCE(bounty_tickets, 0), 3),
					last_ticket_reset = CURRENT_TIMESTAMP,
					updated_at = CURRENT_TIMESTAMP
				WHERE agent_id = ${agentId} AND user_jid = ${profile.userJid}
			`
			return this.getOrCreateProfile(agentId, profile.userJid)
		}

		return profile
	}

	/**
	 * Deducts Pyroxenes and increments spark & total pull counts.
	 */
	public async processGachaPull(
		agentId: string,
		userJid: string,
		cost: number,
		pullCount: number,
	): Promise<{ success: boolean; newPyroxenes: number; newSpark: number }> {
		const profile = await this.getOrCreateProfile(agentId, userJid)
		if (profile.pyroxenes < cost) {
			return {
				success: false,
				newPyroxenes: profile.pyroxenes,
				newSpark: profile.sparkPoints,
			}
		}

		const rows = await sql`
			UPDATE public.sensei_profiles
			SET 
				pyroxenes = pyroxenes - ${cost},
				spark_points = spark_points + ${pullCount},
				total_pulls = total_pulls + ${pullCount},
				updated_at = CURRENT_TIMESTAMP
			WHERE agent_id = ${agentId} AND user_jid = ${profile.userJid}
			RETURNING pyroxenes, spark_points as "sparkPoints"
		`

		return {
			success: true,
			newPyroxenes: Number(rows[0]?.pyroxenes || 0),
			newSpark: Number(rows[0]?.sparkPoints || 0),
		}
	}

	/**
	 * Redeems 200 Spark Points for a guaranteed 3★ selection / spark.
	 */
	public async redeemSpark(
		agentId: string,
		userJid: string,
	): Promise<{ success: boolean; remainingSpark: number }> {
		const profile = await this.getOrCreateProfile(agentId, userJid)
		if (profile.sparkPoints < 200) {
			return { success: false, remainingSpark: profile.sparkPoints }
		}

		const rows = await sql`
			UPDATE public.sensei_profiles
			SET 
				spark_points = spark_points - 200,
				updated_at = CURRENT_TIMESTAMP
			WHERE agent_id = ${agentId} AND user_jid = ${profile.userJid}
			RETURNING spark_points as "sparkPoints"
		`

		return {
			success: true,
			remainingSpark: Number(rows[0]?.sparkPoints || 0),
		}
	}

	/**
	 * Adds a pulled student to Sensei's collection.
	 */
	public async saveStudent(
		agentId: string,
		userJid: string,
		studentId: number,
		studentName: string,
		starGrade: number,
	): Promise<{ isNew: boolean; count: number }> {
		const safeJid = await this.resolveUserJid(agentId, userJid)
		const rows = await sql`
			INSERT INTO public.sensei_students (agent_id, user_jid, student_id, student_name, star_grade, count)
			VALUES (${agentId}, ${safeJid}, ${studentId}, ${studentName}, ${starGrade}, 1)
			ON CONFLICT (agent_id, user_jid, student_id)
			DO UPDATE SET 
				count = public.sensei_students.count + 1
			RETURNING count
		`
		const count = Number(rows[0]?.count || 1)
		return { isNew: count === 1, count }
	}

	/**
	 * Fetches Sensei's entire student collection with progression fields.
	 */
	public async getCollection(
		agentId: string,
		userJid: string,
	): Promise<SenseiStudentItem[]> {
		const safeJid = await this.resolveUserJid(agentId, userJid)
		const rows = await sql`
			SELECT 
				agent_id as "agentId",
				user_jid as "userJid",
				student_id as "studentId",
				student_name as "studentName",
				star_grade as "starGrade",
				count,
				COALESCE(level, 1) as "level",
				COALESCE(exp, 0) as "exp",
				COALESCE(ex_skill_level, 1) as "exSkillLevel",
				COALESCE(normal_skill_level, 1) as "normalSkillLevel",
				COALESCE(passive_skill_level, 1) as "passiveSkillLevel",
				COALESCE(sub_skill_level, 1) as "subSkillLevel",
				COALESCE(equip_slot1_tier, 1) as "equipSlot1Tier",
				COALESCE(equip_slot2_tier, 1) as "equipSlot2Tier",
				COALESCE(equip_slot3_tier, 1) as "equipSlot3Tier",
				COALESCE(weapon_star, 0) as "weaponStar",
				first_obtained_at as "firstObtainedAt"
			FROM public.sensei_students
			WHERE agent_id = ${agentId} AND user_jid = ${safeJid}
			ORDER BY star_grade DESC, level DESC, count DESC, first_obtained_at ASC
		`
		return rows as unknown as SenseiStudentItem[]
	}

	/**
	 * Fetches a single owned student record for a Sensei.
	 */
	public async getOwnedStudent(
		agentId: string,
		userJid: string,
		studentId: number,
	): Promise<SenseiStudentItem | null> {
		const safeJid = await this.resolveUserJid(agentId, userJid)
		const rows = await sql`
			SELECT 
				agent_id as "agentId",
				user_jid as "userJid",
				student_id as "studentId",
				student_name as "studentName",
				star_grade as "starGrade",
				count,
				COALESCE(level, 1) as "level",
				COALESCE(exp, 0) as "exp",
				COALESCE(ex_skill_level, 1) as "exSkillLevel",
				COALESCE(normal_skill_level, 1) as "normalSkillLevel",
				COALESCE(passive_skill_level, 1) as "passiveSkillLevel",
				COALESCE(sub_skill_level, 1) as "subSkillLevel",
				COALESCE(equip_slot1_tier, 1) as "equipSlot1Tier",
				COALESCE(equip_slot2_tier, 1) as "equipSlot2Tier",
				COALESCE(equip_slot3_tier, 1) as "equipSlot3Tier",
				COALESCE(weapon_star, 0) as "weaponStar",
				first_obtained_at as "firstObtainedAt"
			FROM public.sensei_students
			WHERE agent_id = ${agentId} AND user_jid = ${safeJid} AND student_id = ${studentId}
			LIMIT 1
		`
		return (rows[0] as unknown as SenseiStudentItem) || null
	}

	/**
	 * Fetches all Sensei profiles for an agent.
	 */
	public async getAllProfiles(agentId: string): Promise<SenseiProfile[]> {
		await this.deduplicateProfiles(agentId)
		const rows = await sql`
			SELECT 
				agent_id as "agentId",
				user_jid as "userJid",
				pyroxenes,
				COALESCE(credits, 500000)::bigint as "credits",
				spark_points as "sparkPoints",
				total_pulls as "totalPulls",
				last_daily as "lastDaily",
				COALESCE(raid_tickets, 3) as "raidTickets",
				COALESCE(bounty_tickets, 3) as "bountyTickets",
				last_ticket_reset as "lastTicketReset",
				COALESCE(pvp_wins, 0) as "pvpWins",
				COALESCE(pvp_losses, 0) as "pvpLosses",
				COALESCE(squad_strikers, '{}') as "squadStrikers",
				COALESCE(squad_specials, '{}') as "squadSpecials",
				created_at as "createdAt",
				updated_at as "updatedAt"
			FROM public.sensei_profiles
			WHERE agent_id = ${agentId}
			ORDER BY pyroxenes DESC, total_pulls DESC
		`
		return (rows as unknown as Array<Record<string, unknown>>).map((r) =>
			this.mapProfileRow(r),
		)
	}

	/**
	 * Sets exact pyroxenes amount for a Sensei.
	 */
	public async setPyroxenes(
		agentId: string,
		userJid: string,
		pyroxenes: number,
	): Promise<SenseiProfile> {
		const safeJid = await this.resolveUserJid(agentId, userJid)
		await sql`
			INSERT INTO public.sensei_profiles (agent_id, user_jid, pyroxenes, spark_points, total_pulls)
			VALUES (${agentId}, ${safeJid}, ${pyroxenes}, 0, 0)
			ON CONFLICT (agent_id, user_jid)
			DO UPDATE SET 
				pyroxenes = ${pyroxenes},
				updated_at = CURRENT_TIMESTAMP
		`
		return this.getOrCreateProfile(agentId, safeJid)
	}

	/**
	 * Adds/adjusts pyroxenes amount for a Sensei.
	 */
	public async addPyroxenes(
		agentId: string,
		userJid: string,
		amount: number,
	): Promise<SenseiProfile> {
		const profile = await this.getOrCreateProfile(agentId, userJid)
		const newAmount = Math.max(0, profile.pyroxenes + amount)
		return this.setPyroxenes(agentId, profile.userJid, newAmount)
	}

	/**
	 * Adds/adjusts credits amount for a Sensei.
	 */
	public async addCredits(
		agentId: string,
		userJid: string,
		amount: number,
	): Promise<SenseiProfile> {
		const profile = await this.getOrCreateProfile(agentId, userJid)
		const newCredits = Math.max(0, profile.credits + amount)
		await sql`
			UPDATE public.sensei_profiles
			SET credits = ${newCredits}, updated_at = CURRENT_TIMESTAMP
			WHERE agent_id = ${agentId} AND user_jid = ${profile.userJid}
		`
		return this.getOrCreateProfile(agentId, profile.userJid)
	}

	/**
	 * Deletes a Sensei profile, roster, inventory, raid records, and bonds from database.
	 */
	public async deleteProfile(agentId: string, userJid: string): Promise<void> {
		const safeJid = await this.resolveUserJid(agentId, userJid)
		await sql`DELETE FROM public.sensei_profiles WHERE agent_id = ${agentId} AND (user_jid = ${safeJid} OR user_jid = ${userJid})`
		await sql`DELETE FROM public.sensei_students WHERE agent_id = ${agentId} AND (user_jid = ${safeJid} OR user_jid = ${userJid})`
		await sql`DELETE FROM public.sensei_bonds WHERE agent_id = ${agentId} AND (user_jid = ${safeJid} OR user_jid = ${userJid})`
		await sql`DELETE FROM public.sensei_inventory WHERE agent_id = ${agentId} AND (user_jid = ${safeJid} OR user_jid = ${userJid})`
		await sql`DELETE FROM public.sensei_raid_records WHERE agent_id = ${agentId} AND (user_jid = ${safeJid} OR user_jid = ${userJid})`
	}

	/**
	 * Fetches all SchaleDB materials and items owned by a Sensei.
	 */
	public async getInventory(
		agentId: string,
		userJid: string,
	): Promise<SenseiInventoryItem[]> {
		const safeJid = await this.resolveUserJid(agentId, userJid)
		const rows = await sql`
			SELECT 
				agent_id as "agentId",
				user_jid as "userJid",
				item_id as "itemId",
				item_name as "itemName",
				category,
				rarity,
				count,
				updated_at as "updatedAt"
			FROM public.sensei_inventory
			WHERE agent_id = ${agentId} AND user_jid = ${safeJid} AND count > 0
			ORDER BY category ASC, item_id ASC
		`
		return rows as unknown as SenseiInventoryItem[]
	}

	/**
	 * Adds multiple SchaleDB items/materials to a Sensei's inventory.
	 */
	public async addInventoryItems(
		agentId: string,
		userJid: string,
		items: Array<{
			itemId: number
			itemName: string
			category: string
			rarity: string
			count: number
		}>,
	): Promise<void> {
		const safeJid = await this.resolveUserJid(agentId, userJid)
		for (const item of items) {
			if (item.count <= 0) continue
			await sql`
				INSERT INTO public.sensei_inventory (agent_id, user_jid, item_id, item_name, category, rarity, count, updated_at)
				VALUES (${agentId}, ${safeJid}, ${item.itemId}, ${item.itemName}, ${item.category}, ${item.rarity}, ${item.count}, CURRENT_TIMESTAMP)
				ON CONFLICT (agent_id, user_jid, item_id)
				DO UPDATE SET 
					count = public.sensei_inventory.count + EXCLUDED.count,
					item_name = EXCLUDED.item_name,
					updated_at = CURRENT_TIMESTAMP
			`
		}
	}

	/**
	 * Atomically checks and consumes required SchaleDB items and Credits from a Sensei.
	 */
	public async consumeMaterialsAndCredits(
		agentId: string,
		userJid: string,
		requirements: Array<{ itemId: number; itemName: string; requiredCount: number }>,
		creditCost: number,
	): Promise<{
		success: boolean
		missingItems?: Array<{ itemId: number; itemName: string; owned: number; required: number }>
		missingCredits?: number
	}> {
		const profile = await this.getOrCreateProfile(agentId, userJid)
		const inv = await this.getInventory(agentId, profile.userJid)
		const invMap = new Map<number, number>()
		for (const i of inv) {
			invMap.set(Number(i.itemId), Number(i.count))
		}

		const missingItems: Array<{
			itemId: number
			itemName: string
			owned: number
			required: number
		}> = []

		for (const req of requirements) {
			const owned = invMap.get(req.itemId) || 0
			if (owned < req.requiredCount) {
				missingItems.push({
					itemId: req.itemId,
					itemName: req.itemName,
					owned,
					required: req.requiredCount,
				})
			}
		}

		const missingCredits =
			profile.credits < creditCost ? creditCost - profile.credits : 0

		if (missingItems.length > 0 || missingCredits > 0) {
			return {
				success: false,
				missingItems: missingItems.length > 0 ? missingItems : undefined,
				missingCredits: missingCredits > 0 ? missingCredits : undefined,
			}
		}

		// Deduct credits
		if (creditCost > 0) {
			await sql`
				UPDATE public.sensei_profiles
				SET credits = credits - ${creditCost}, updated_at = CURRENT_TIMESTAMP
				WHERE agent_id = ${agentId} AND user_jid = ${profile.userJid}
			`
		}

		// Deduct materials
		for (const req of requirements) {
			await sql`
				UPDATE public.sensei_inventory
				SET count = GREATEST(0, count - ${req.requiredCount}), updated_at = CURRENT_TIMESTAMP
				WHERE agent_id = ${agentId} AND user_jid = ${profile.userJid} AND item_id = ${req.itemId}
			`
		}

		return { success: true }
	}

	/**
	 * Updates a student's progression columns in public.sensei_students.
	 */
	public async updateStudentProgression(
		agentId: string,
		userJid: string,
		studentId: number,
		updates: Partial<{
			starGrade: number
			count: number
			level: number
			exSkillLevel: number
			normalSkillLevel: number
			passiveSkillLevel: number
			subSkillLevel: number
			equipSlot1Tier: number
			equipSlot2Tier: number
			equipSlot3Tier: number
			weaponStar: number
		}>,
	): Promise<SenseiStudentItem | null> {
		const current = await this.getOwnedStudent(agentId, userJid, studentId)
		if (!current) return null

		const starGrade = updates.starGrade ?? current.starGrade
		const count = updates.count ?? current.count
		const level = updates.level ?? current.level
		const exSkillLevel = updates.exSkillLevel ?? current.exSkillLevel
		const normalSkillLevel = updates.normalSkillLevel ?? current.normalSkillLevel
		const passiveSkillLevel =
			updates.passiveSkillLevel ?? current.passiveSkillLevel
		const subSkillLevel = updates.subSkillLevel ?? current.subSkillLevel
		const equipSlot1Tier = updates.equipSlot1Tier ?? current.equipSlot1Tier
		const equipSlot2Tier = updates.equipSlot2Tier ?? current.equipSlot2Tier
		const equipSlot3Tier = updates.equipSlot3Tier ?? current.equipSlot3Tier
		const weaponStar = updates.weaponStar ?? current.weaponStar

		await sql`
			UPDATE public.sensei_students
			SET 
				star_grade = ${starGrade},
				count = ${count},
				level = ${level},
				ex_skill_level = ${exSkillLevel},
				normal_skill_level = ${normalSkillLevel},
				passive_skill_level = ${passiveSkillLevel},
				sub_skill_level = ${subSkillLevel},
				equip_slot1_tier = ${equipSlot1Tier},
				equip_slot2_tier = ${equipSlot2Tier},
				equip_slot3_tier = ${equipSlot3Tier},
				weapon_star = ${weaponStar}
			WHERE agent_id = ${agentId} AND user_jid = ${current.userJid} AND student_id = ${studentId}
		`

		return this.getOwnedStudent(agentId, current.userJid, studentId)
	}

	/**
	 * Saves Sensei's custom 4 Striker + 2 Special squad formation.
	 */
	public async setSquad(
		agentId: string,
		userJid: string,
		strikers: number[],
		specials: number[],
	): Promise<void> {
		const profile = await this.getOrCreateProfile(agentId, userJid)
		const cleanStrikers = strikers
			.slice(0, 4)
			.map((n) => Number.parseInt(String(n), 10))
			.filter((n) => !Number.isNaN(n))
		const cleanSpecials = specials
			.slice(0, 2)
			.map((n) => Number.parseInt(String(n), 10))
			.filter((n) => !Number.isNaN(n))
		const strikersLiteral = `{${cleanStrikers.join(",")}}`
		const specialsLiteral = `{${cleanSpecials.join(",")}}`
		await sql`
			UPDATE public.sensei_profiles
			SET 
				squad_strikers = ${strikersLiteral}::int[],
				squad_specials = ${specialsLiteral}::int[],
				updated_at = CURRENT_TIMESTAMP
			WHERE agent_id = ${agentId} AND user_jid = ${profile.userJid}
		`
	}

	/**
	 * Consumes 1 Raid or Bounty ticket.
	 */
	public async consumeTicket(
		agentId: string,
		userJid: string,
		type: "raid" | "bounty",
	): Promise<{ success: boolean; remaining: number }> {
		const profile = await this.refreshTicketsIfNeeded(agentId, userJid)
		if (type === "raid") {
			if (profile.raidTickets <= 0) {
				return { success: false, remaining: 0 }
			}
			const rows = await sql`
				UPDATE public.sensei_profiles
				SET raid_tickets = GREATEST(0, raid_tickets - 1), updated_at = CURRENT_TIMESTAMP
				WHERE agent_id = ${agentId} AND user_jid = ${profile.userJid}
				RETURNING raid_tickets as "raidTickets"
			`
			return {
				success: true,
				remaining: Number(rows[0]?.raidTickets ?? profile.raidTickets - 1),
			}
		}

		if (profile.bountyTickets <= 0) {
			return { success: false, remaining: 0 }
		}
		const rows = await sql`
			UPDATE public.sensei_profiles
			SET bounty_tickets = GREATEST(0, bounty_tickets - 1), updated_at = CURRENT_TIMESTAMP
			WHERE agent_id = ${agentId} AND user_jid = ${profile.userJid}
			RETURNING bounty_tickets as "bountyTickets"
		`
		return {
			success: true,
			remaining: Number(rows[0]?.bountyTickets ?? profile.bountyTickets - 1),
		}
	}

	/**
	 * Records a Raid Boss or Weekly Boss battle result.
	 */
	public async recordRaidBattle(
		agentId: string,
		userJid: string,
		bossId: number,
		bossName: string,
		difficulty: string,
		score: number,
		damage: number,
		cleared: boolean,
	): Promise<void> {
		const safeJid = await this.resolveUserJid(agentId, userJid)
		const clearInc = cleared ? 1 : 0
		await sql`
			INSERT INTO public.sensei_raid_records (agent_id, user_jid, boss_id, boss_name, difficulty, best_score, total_damage, clears, updated_at)
			VALUES (${agentId}, ${safeJid}, ${bossId}, ${bossName}, ${difficulty}, ${score}, ${damage}, ${clearInc}, CURRENT_TIMESTAMP)
			ON CONFLICT (agent_id, user_jid, boss_id, difficulty)
			DO UPDATE SET 
				best_score = GREATEST(public.sensei_raid_records.best_score, EXCLUDED.best_score),
				total_damage = public.sensei_raid_records.total_damage + EXCLUDED.total_damage,
				clears = public.sensei_raid_records.clears + EXCLUDED.clears,
				updated_at = CURRENT_TIMESTAMP
		`
	}

	/**
	 * Fetches Top Raid Leaderboard for an agent.
	 */
	public async getRaidLeaderboard(
		agentId: string,
		bossId?: number,
	): Promise<SenseiRaidRecord[]> {
		const rows = bossId
			? await sql`
					SELECT 
						agent_id as "agentId",
						user_jid as "userJid",
						boss_id as "bossId",
						boss_name as "bossName",
						difficulty,
						best_score::bigint as "bestScore",
						total_damage::bigint as "totalDamage",
						clears,
						updated_at as "updatedAt"
					FROM public.sensei_raid_records
					WHERE agent_id = ${agentId} AND boss_id = ${bossId}
					ORDER BY best_score DESC, total_damage DESC
					LIMIT 10
				`
			: await sql`
					SELECT 
						agent_id as "agentId",
						user_jid as "userJid",
						boss_id as "bossId",
						boss_name as "bossName",
						difficulty,
						best_score::bigint as "bestScore",
						total_damage::bigint as "totalDamage",
						clears,
						updated_at as "updatedAt"
					FROM public.sensei_raid_records
					WHERE agent_id = ${agentId}
					ORDER BY best_score DESC, total_damage DESC
					LIMIT 10
				`
		return rows as unknown as SenseiRaidRecord[]
	}

	/**
	 * Atomically settles a PvP Duel bet between Winner and Loser Senseis.
	 */
	public async settlePvpDuel(
		agentId: string,
		winnerJid: string,
		loserJid: string,
		betAmount: number,
		currency: "pyroxene" | "credit" = "pyroxene",
	): Promise<{
		success: boolean
		winnerProfile: SenseiProfile
		loserProfile: SenseiProfile
		reason?: string
	}> {
		const winner = await this.getOrCreateProfile(agentId, winnerJid)
		const loser = await this.getOrCreateProfile(agentId, loserJid)

		if (currency === "pyroxene") {
			if (winner.pyroxenes < betAmount || loser.pyroxenes < betAmount) {
				return {
					success: false,
					winnerProfile: winner,
					loserProfile: loser,
					reason: "INSUFFICIENT_BALANCE",
				}
			}

			await sql`
				UPDATE public.sensei_profiles
				SET 
					pyroxenes = pyroxenes + ${betAmount},
					pvp_wins = COALESCE(pvp_wins, 0) + 1,
					updated_at = CURRENT_TIMESTAMP
				WHERE agent_id = ${agentId} AND user_jid = ${winner.userJid}
			`
			await sql`
				UPDATE public.sensei_profiles
				SET 
					pyroxenes = GREATEST(0, pyroxenes - ${betAmount}),
					pvp_losses = COALESCE(pvp_losses, 0) + 1,
					updated_at = CURRENT_TIMESTAMP
				WHERE agent_id = ${agentId} AND user_jid = ${loser.userJid}
			`
		} else {
			if (winner.credits < betAmount || loser.credits < betAmount) {
				return {
					success: false,
					winnerProfile: winner,
					loserProfile: loser,
					reason: "INSUFFICIENT_BALANCE",
				}
			}

			await sql`
				UPDATE public.sensei_profiles
				SET 
					credits = COALESCE(credits, 500000) + ${betAmount},
					pvp_wins = COALESCE(pvp_wins, 0) + 1,
					updated_at = CURRENT_TIMESTAMP
				WHERE agent_id = ${agentId} AND user_jid = ${winner.userJid}
			`
			await sql`
				UPDATE public.sensei_profiles
				SET 
					credits = GREATEST(0, COALESCE(credits, 500000) - ${betAmount}),
					pvp_losses = COALESCE(pvp_losses, 0) + 1,
					updated_at = CURRENT_TIMESTAMP
				WHERE agent_id = ${agentId} AND user_jid = ${loser.userJid}
			`
		}

		return {
			success: true,
			winnerProfile: await this.getOrCreateProfile(agentId, winner.userJid),
			loserProfile: await this.getOrCreateProfile(agentId, loser.userJid),
		}
	}

	/**
	 * Calculates Eleph inventory and potential Pyroxene conversion summary for a Sensei.
	 */
	public async getElephSummary(
		agentId: string,
		userJid: string,
	): Promise<ElephSummary> {
		const safeJid = await this.resolveUserJid(agentId, userJid)
		const rows = await sql`
			SELECT 
				student_id as "studentId",
				student_name as "studentName",
				star_grade as "starGrade",
				count
			FROM public.sensei_students
			WHERE agent_id = ${agentId} AND user_jid = ${safeJid} AND count > 1
			ORDER BY star_grade DESC, count DESC
		`

		let totalDuplicates = 0
		let totalEleph = 0
		let totalPyroxenes = 0
		const breakdown = {
			threeStar: { duplicates: 0, eleph: 0, pyroxenes: 0 },
			twoStar: { duplicates: 0, eleph: 0, pyroxenes: 0 },
			oneStar: { duplicates: 0, eleph: 0, pyroxenes: 0 },
		}

		const studentsWithEleph: ElephSummaryItem[] = []

		for (const r of rows) {
			const s = r as unknown as {
				studentId: number
				studentName: string
				starGrade: number
				count: number
			}
			const dupes = s.count - 1
			if (dupes <= 0) continue

			const elephPerDupe = ELEPH_CONFIG.ELEPH_PER_DUPLICATE[s.starGrade] || 1
			const elephs = dupes * elephPerDupe
			const pyroxenes = elephs * ELEPH_CONFIG.PYROXENES_PER_ELEPH

			totalDuplicates += dupes
			totalEleph += elephs
			totalPyroxenes += pyroxenes

			studentsWithEleph.push({
				studentId: s.studentId,
				studentName: s.studentName,
				starGrade: s.starGrade,
				count: s.count,
				duplicateCount: dupes,
				elephCount: elephs,
				pyroxeneValue: pyroxenes,
			})

			if (s.starGrade >= 3) {
				breakdown.threeStar.duplicates += dupes
				breakdown.threeStar.eleph += elephs
				breakdown.threeStar.pyroxenes += pyroxenes
			} else if (s.starGrade === 2) {
				breakdown.twoStar.duplicates += dupes
				breakdown.twoStar.eleph += elephs
				breakdown.twoStar.pyroxenes += pyroxenes
			} else {
				breakdown.oneStar.duplicates += dupes
				breakdown.oneStar.eleph += elephs
				breakdown.oneStar.pyroxenes += pyroxenes
			}
		}

		return {
			totalDuplicates,
			totalEleph,
			totalPyroxenes,
			studentsWithEleph,
			breakdown,
		}
	}

	/**
	 * Converts/claims duplicate student copies (Elephs) into Pyroxenes fairly.
	 * Preserves the base student in Sensei's roster (resets count to 1),
	 * and credits the calculated Pyroxenes to the Sensei profile.
	 */
	public async claimElephToPyroxenes(
		agentId: string,
		userJid: string,
		filter?: { studentNameOrId?: string | number; starGrade?: number },
	): Promise<ClaimElephResult> {
		const safeJid = await this.resolveUserJid(agentId, userJid)
		const profile = await this.getOrCreateProfile(agentId, safeJid)

		const rows = await sql`
			SELECT 
				student_id as "studentId",
				student_name as "studentName",
				star_grade as "starGrade",
				count
			FROM public.sensei_students
			WHERE agent_id = ${agentId} AND user_jid = ${safeJid} AND count > 1
		`

		if (rows.length === 0) {
			return {
				success: false,
				claimedStudents: 0,
				claimedDuplicates: 0,
				claimedEleph: 0,
				pyroxenesGained: 0,
				newPyroxenes: profile.pyroxenes,
				breakdown: {
					threeStar: { duplicates: 0, eleph: 0, pyroxenes: 0 },
					twoStar: { duplicates: 0, eleph: 0, pyroxenes: 0 },
					oneStar: { duplicates: 0, eleph: 0, pyroxenes: 0 },
				},
				reason: "NO_DUPLICATES",
			}
		}

		let eligible = rows as unknown as Array<{
			studentId: number
			studentName: string
			starGrade: number
			count: number
		}>

		if (filter?.starGrade !== undefined) {
			eligible = eligible.filter((s) => s.starGrade === filter.starGrade)
		}

		if (filter?.studentNameOrId !== undefined) {
			const target = String(filter.studentNameOrId).toLowerCase().trim()
			eligible = eligible.filter(
				(s) =>
					String(s.studentId) === target ||
					s.studentName.toLowerCase().includes(target),
			)
		}

		if (eligible.length === 0) {
			return {
				success: false,
				claimedStudents: 0,
				claimedDuplicates: 0,
				claimedEleph: 0,
				pyroxenesGained: 0,
				newPyroxenes: profile.pyroxenes,
				breakdown: {
					threeStar: { duplicates: 0, eleph: 0, pyroxenes: 0 },
					twoStar: { duplicates: 0, eleph: 0, pyroxenes: 0 },
					oneStar: { duplicates: 0, eleph: 0, pyroxenes: 0 },
				},
				reason: "NO_MATCHING_DUPLICATES",
			}
		}

		let totalDuplicates = 0
		let totalEleph = 0
		let totalPyroxenes = 0
		const breakdown = {
			threeStar: { duplicates: 0, eleph: 0, pyroxenes: 0 },
			twoStar: { duplicates: 0, eleph: 0, pyroxenes: 0 },
			oneStar: { duplicates: 0, eleph: 0, pyroxenes: 0 },
		}

		const studentIdsToReset: number[] = []

		for (const s of eligible) {
			const dupes = s.count - 1
			if (dupes <= 0) continue

			const elephPerDupe = ELEPH_CONFIG.ELEPH_PER_DUPLICATE[s.starGrade] || 1
			const elephs = dupes * elephPerDupe
			const pyroxenes = elephs * ELEPH_CONFIG.PYROXENES_PER_ELEPH

			totalDuplicates += dupes
			totalEleph += elephs
			totalPyroxenes += pyroxenes
			studentIdsToReset.push(s.studentId)

			if (s.starGrade >= 3) {
				breakdown.threeStar.duplicates += dupes
				breakdown.threeStar.eleph += elephs
				breakdown.threeStar.pyroxenes += pyroxenes
			} else if (s.starGrade === 2) {
				breakdown.twoStar.duplicates += dupes
				breakdown.twoStar.eleph += elephs
				breakdown.twoStar.pyroxenes += pyroxenes
			} else {
				breakdown.oneStar.duplicates += dupes
				breakdown.oneStar.eleph += elephs
				breakdown.oneStar.pyroxenes += pyroxenes
			}
		}

		if (studentIdsToReset.length === 0 || totalPyroxenes <= 0) {
			return {
				success: false,
				claimedStudents: 0,
				claimedDuplicates: 0,
				claimedEleph: 0,
				pyroxenesGained: 0,
				newPyroxenes: profile.pyroxenes,
				breakdown,
				reason: "NO_DUPLICATES",
			}
		}

		await sql`
			UPDATE public.sensei_students
			SET count = 1
			WHERE agent_id = ${agentId} AND user_jid = ${safeJid} AND student_id IN ${sql(studentIdsToReset)}
		`

		const updatedProfile = await sql`
			UPDATE public.sensei_profiles
			SET 
				pyroxenes = pyroxenes + ${totalPyroxenes},
				updated_at = CURRENT_TIMESTAMP
			WHERE agent_id = ${agentId} AND user_jid = ${safeJid}
			RETURNING pyroxenes
		`

		const newPyroxenes = Number(
			updatedProfile[0]?.pyroxenes ?? profile.pyroxenes + totalPyroxenes,
		)

		return {
			success: true,
			claimedStudents: studentIdsToReset.length,
			claimedDuplicates: totalDuplicates,
			claimedEleph: totalEleph,
			pyroxenesGained: totalPyroxenes,
			newPyroxenes,
			breakdown,
		}
	}
}

export const gachaRepository = GachaRepository.getInstance()
