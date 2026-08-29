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
	 * Fetches or creates a Sensei profile. New Sensei starts with 1,200 Pyroxenes (10-pull gift!).
	 */
	public async getOrCreateProfile(
		agentId: string,
		userJid: string,
	): Promise<SenseiProfile> {
		const rows = await sql`
			INSERT INTO public.sensei_profiles (agent_id, user_jid, pyroxenes, spark_points, total_pulls)
			VALUES (${agentId}, ${userJid}, 1200, 0, 0)
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
	 * Claims daily Pyroxenes (1,200 Pyroxenes / 24h).
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
		const ONE_DAY_MS = 24 * 60 * 60 * 1000

		if (profile.lastDaily) {
			const lastDailyMs = new Date(profile.lastDaily).getTime()
			const diff = now - lastDailyMs

			if (diff < ONE_DAY_MS) {
				const remainingMs = ONE_DAY_MS - diff
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
			WHERE agent_id = ${agentId} AND user_jid = ${userJid}
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
			WHERE agent_id = ${agentId} AND user_jid = ${userJid}
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
			WHERE agent_id = ${agentId} AND user_jid = ${userJid}
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
		const rows = await sql`
			INSERT INTO public.sensei_students (agent_id, user_jid, student_id, student_name, star_grade, count)
			VALUES (${agentId}, ${userJid}, ${studentId}, ${studentName}, ${starGrade}, 1)
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
			WHERE agent_id = ${agentId} AND user_jid = ${userJid}
			ORDER BY star_grade DESC, count DESC, first_obtained_at ASC
		`
		return rows as unknown as SenseiStudentItem[]
	}

	/**
	 * Fetches all Sensei profiles for an agent.
	 */
	public async getAllProfiles(agentId: string): Promise<SenseiProfile[]> {
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
		const rows = await sql`
			INSERT INTO public.sensei_profiles (agent_id, user_jid, pyroxenes, spark_points, total_pulls)
			VALUES (${agentId}, ${userJid}, ${pyroxenes}, 0, 0)
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
		return this.setPyroxenes(agentId, userJid, newAmount)
	}

	/**
	 * Deletes a Sensei profile, roster, and bonds from database.
	 */
	public async deleteProfile(agentId: string, userJid: string): Promise<void> {
		await sql`DELETE FROM public.sensei_profiles WHERE agent_id = ${agentId} AND user_jid = ${userJid}`
		await sql`DELETE FROM public.sensei_students WHERE agent_id = ${agentId} AND user_jid = ${userJid}`
		await sql`DELETE FROM public.sensei_bonds WHERE agent_id = ${agentId} AND user_jid = ${userJid}`
	}
}

export const gachaRepository = GachaRepository.getInstance()
