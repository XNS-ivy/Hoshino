import { sql } from "@utils/db"

export interface SenseiProfile {
	agentId: string
	userJid: string
	pyroxenes: number
	sparkPoints: number
	totalPulls: number
	lastDaily: Date | null
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
	firstObtainedAt: Date
}

export const ELEPH_CONFIG = {
	ELEPH_PER_DUPLICATE: {
		1: 1, // 1★ duplicate = 1 Eleph
		2: 2, // 2★ duplicate = 2 Eleph
		3: 3, // 3★ duplicate = 3 Eleph
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
		const clean = jid.trim().split(":")[0] || jid.trim()
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
	 * Resolves an input JID or phone number to the single matching canonical Sensei profile user_jid.
	 */
	public async resolveUserJid(
		agentId: string,
		inputJid: string,
	): Promise<string> {
		if (!inputJid) return ""
		const normalized = this.normalizeJid(inputJid)
		const rawDigits = inputJid.replace(/@.*$/, "").replace(/[^0-9]/g, "")
		const normalizedDigits = normalized.split("@")[0]

		// 1. Exact match with normalized JID or exact input
		const exactMatch = await sql`
			SELECT user_jid FROM public.sensei_profiles
			WHERE agent_id = ${agentId} AND (user_jid = ${normalized} OR user_jid = ${inputJid})
			LIMIT 1
		`
		if (exactMatch.length > 0) {
			return exactMatch[0].user_jid as string
		}

		// 2. Match by phone digits (handles @lid vs @s.whatsapp.net vs legacy unnormalized rows)
		if (normalizedDigits || rawDigits) {
			const digitMatches = await sql`
				SELECT user_jid FROM public.sensei_profiles
				WHERE agent_id = ${agentId} AND (
					user_jid LIKE ${`${normalizedDigits}@%`}
					OR user_jid LIKE ${`${rawDigits}@%`}
					OR user_jid = ${normalizedDigits}
					OR user_jid = ${rawDigits}
					OR user_jid = ${`+${rawDigits}`}
				)
				ORDER BY total_pulls DESC, pyroxenes DESC
				LIMIT 1
			`
			if (digitMatches.length > 0) {
				return digitMatches[0].user_jid as string
			}
		}

		return normalized
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
					// Choose canonical profile: prefer JID ending with @lid or @s.whatsapp.net, or highest total pulls
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
							// Migrate student records
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

							// Migrate bonds
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

							// Delete duplicate profile
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

	/**
	 * Fetches or creates a Sensei profile. New Sensei starts with 1,200 Pyroxenes (10-pull gift!).
	 */
	public async getOrCreateProfile(
		agentId: string,
		userJid: string,
	): Promise<SenseiProfile> {
		const safeJid = await this.resolveUserJid(agentId, userJid)
		const rows = await sql`
			INSERT INTO public.sensei_profiles (agent_id, user_jid, pyroxenes, spark_points, total_pulls)
			VALUES (${agentId}, ${safeJid}, 1200, 0, 0)
			ON CONFLICT (agent_id, user_jid)
			DO UPDATE SET updated_at = CURRENT_TIMESTAMP
			RETURNING 
				agent_id as "agentId",
				user_jid as "userJid",
				pyroxenes,
				spark_points as "sparkPoints",
				total_pulls as "totalPulls",
				last_daily as "lastDaily",
				created_at as "createdAt",
				updated_at as "updatedAt"
		`
		return rows[0] as unknown as SenseiProfile
	}

	/**
	 * Claims daily Pyroxenes (1,200 Pyroxenes / daily reset at 06:00 WIB).
	 */
	public async claimDaily(
		agentId: string,
		userJid: string,
	): Promise<{
		success: boolean
		pyroxenes: number
		claimedAmount: number
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

			// If claimed at or after the last 06:00 WIB reset boundary, it's already claimed for today
			if (lastDailyMs >= lastResetUtcMs) {
				const remainingMs = Math.max(0, nextResetUtcMs - now)
				const remainingHours = Math.floor(remainingMs / (60 * 60 * 1000))
				const remainingMinutes = Math.ceil(
					(remainingMs % (60 * 60 * 1000)) / (60 * 1000),
				)
				return {
					success: false,
					pyroxenes: profile.pyroxenes,
					claimedAmount: 0,
					remainingHours,
					remainingMinutes,
				}
			}
		}

		const DAILY_REWARD = 1200
		const updated = await sql`
			UPDATE public.sensei_profiles
			SET 
				pyroxenes = pyroxenes + ${DAILY_REWARD},
				last_daily = CURRENT_TIMESTAMP,
				updated_at = CURRENT_TIMESTAMP
			WHERE agent_id = ${agentId} AND user_jid = ${profile.userJid}
			RETURNING pyroxenes
		`

		return {
			success: true,
			pyroxenes: Number(updated[0]?.pyroxenes || 0),
			claimedAmount: DAILY_REWARD,
		}
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
	 * Fetches Sensei's entire student collection.
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
				first_obtained_at as "firstObtainedAt"
			FROM public.sensei_students
			WHERE agent_id = ${agentId} AND user_jid = ${safeJid}
			ORDER BY star_grade DESC, count DESC, first_obtained_at ASC
		`
		return rows as unknown as SenseiStudentItem[]
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
				spark_points as "sparkPoints",
				total_pulls as "totalPulls",
				last_daily as "lastDaily",
				created_at as "createdAt",
				updated_at as "updatedAt"
			FROM public.sensei_profiles
			WHERE agent_id = ${agentId}
			ORDER BY pyroxenes DESC, total_pulls DESC
		`
		return rows as unknown as SenseiProfile[]
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
		const rows = await sql`
			INSERT INTO public.sensei_profiles (agent_id, user_jid, pyroxenes, spark_points, total_pulls)
			VALUES (${agentId}, ${safeJid}, ${pyroxenes}, 0, 0)
			ON CONFLICT (agent_id, user_jid)
			DO UPDATE SET 
				pyroxenes = ${pyroxenes},
				updated_at = CURRENT_TIMESTAMP
			RETURNING 
				agent_id as "agentId",
				user_jid as "userJid",
				pyroxenes,
				spark_points as "sparkPoints",
				total_pulls as "totalPulls",
				last_daily as "lastDaily",
				created_at as "createdAt",
				updated_at as "updatedAt"
		`
		return rows[0] as unknown as SenseiProfile
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
	 * Deletes a Sensei profile, roster, and bonds from database.
	 */
	public async deleteProfile(agentId: string, userJid: string): Promise<void> {
		const safeJid = await this.resolveUserJid(agentId, userJid)
		await sql`DELETE FROM public.sensei_profiles WHERE agent_id = ${agentId} AND (user_jid = ${safeJid} OR user_jid = ${userJid})`
		await sql`DELETE FROM public.sensei_students WHERE agent_id = ${agentId} AND (user_jid = ${safeJid} OR user_jid = ${userJid})`
		await sql`DELETE FROM public.sensei_bonds WHERE agent_id = ${agentId} AND (user_jid = ${safeJid} OR user_jid = ${userJid})`
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

			if (s.starGrade === 3) {
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

		// Fetch all students with duplicates (count > 1)
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

			if (s.starGrade === 3) {
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

		// Reset count to 1 for all converted students (retaining base student in collection)
		await sql`
			UPDATE public.sensei_students
			SET count = 1
			WHERE agent_id = ${agentId} AND user_jid = ${safeJid} AND student_id IN ${sql(studentIdsToReset)}
		`

		// Credit pyroxenes to Sensei profile
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
