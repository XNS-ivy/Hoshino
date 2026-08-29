import { sql } from "@utils/db"
import NodeCache from "node-cache"

export interface SenseiBond {
	agentId: string
	userJid: string
	studentId: number
	studentName: string
	bondLevel: number
	bondExp: number
	totalTalks: number
	lastTalk: Date
	createdAt: Date
	updatedAt: Date
}

export interface MomoDialogueChoice {
	text: string
	reply: string
	exp: number
}

export interface MomoDialogue {
	id: string
	speaker: string
	studentId: number
	message: string
	choices: [MomoDialogueChoice, MomoDialogueChoice, MomoDialogueChoice]
}

export interface MomoSession {
	studentId: number
	studentName: string
	dialogue: MomoDialogue
	startedAt: number
}

const sessionCache = new NodeCache({ stdTTL: 300, checkperiod: 60 })

export class MomoRepository {
	private static instance: MomoRepository

	private constructor() {}

	public static getInstance(): MomoRepository {
		if (!MomoRepository.instance) {
			MomoRepository.instance = new MomoRepository()
		}
		return MomoRepository.instance
	}

	/**
	 * Calculates required EXP to reach the next bond level.
	 */
	public getRequiredExp(level: number): number {
		if (level >= 20) return 999999
		return 100 * level
	}

	/**
	 * Fetches or creates a Sensei bond record for a specific student.
	 */
	public async getBond(
		agentId: string,
		userJid: string,
		studentId: number,
		studentName: string,
	): Promise<SenseiBond> {
		const rows = await sql`
			INSERT INTO public.sensei_bonds (agent_id, user_jid, student_id, student_name, bond_level, bond_exp, total_talks)
			VALUES (${agentId}, ${userJid}, ${studentId}, ${studentName}, 1, 0, 0)
			ON CONFLICT (agent_id, user_jid, student_id)
			DO UPDATE SET updated_at = CURRENT_TIMESTAMP
			RETURNING
				agent_id as "agentId",
				user_jid as "userJid",
				student_id as "studentId",
				student_name as "studentName",
				bond_level as "bondLevel",
				bond_exp as "bondExp",
				total_talks as "totalTalks",
				last_talk as "lastTalk",
				created_at as "createdAt",
				updated_at as "updatedAt"
		`
		return rows[0] as unknown as SenseiBond
	}

	/**
	 * Adds EXP and calculates level ups, Pyroxene rewards, and Memorial Lobby unlocks.
	 */
	public async addBondExp(
		agentId: string,
		userJid: string,
		studentId: number,
		studentName: string,
		expGain: number,
	): Promise<{
		oldLevel: number
		newLevel: number
		currentExp: number
		requiredExp: number
		leveledUp: boolean
		pyroxeneReward: number
		unlockedMemorialLobby: boolean
	}> {
		const bond = await this.getBond(agentId, userJid, studentId, studentName)
		let level = bond.bondLevel
		let exp = bond.bondExp + expGain
		const oldLevel = level
		let pyroxeneReward = 0

		while (level < 20) {
			const req = this.getRequiredExp(level)
			if (exp >= req) {
				exp -= req
				level++
				pyroxeneReward += 50 // 50 Pyroxenes per level up!
			} else {
				break
			}
		}

		await sql`
			UPDATE public.sensei_bonds
			SET 
				bond_level = ${level},
				bond_exp = ${exp},
				total_talks = total_talks + 1,
				last_talk = CURRENT_TIMESTAMP,
				updated_at = CURRENT_TIMESTAMP
			WHERE agent_id = ${agentId} AND user_jid = ${userJid} AND student_id = ${studentId}
		`

		if (pyroxeneReward > 0) {
			await sql`
				UPDATE public.sensei_profiles
				SET 
					pyroxenes = pyroxenes + ${pyroxeneReward},
					updated_at = CURRENT_TIMESTAMP
				WHERE agent_id = ${agentId} AND user_jid = ${userJid}
			`
		}

		const leveledUp = level > oldLevel
		const unlockedMemorialLobby = oldLevel < 5 && level >= 5

		return {
			oldLevel,
			newLevel: level,
			currentExp: exp,
			requiredExp: this.getRequiredExp(level),
			leveledUp,
			pyroxeneReward,
			unlockedMemorialLobby,
		}
	}

	/**
	 * Gets all bond relationships for a Sensei.
	 */
	public async getAllBonds(
		agentId: string,
		userJid: string,
	): Promise<SenseiBond[]> {
		const rows = await sql`
			SELECT 
				agent_id as "agentId",
				user_jid as "userJid",
				student_id as "studentId",
				student_name as "studentName",
				bond_level as "bondLevel",
				bond_exp as "bondExp",
				total_talks as "totalTalks",
				last_talk as "lastTalk",
				created_at as "createdAt",
				updated_at as "updatedAt"
			FROM public.sensei_bonds
			WHERE agent_id = ${agentId} AND user_jid = ${userJid}
			ORDER BY bond_level DESC, bond_exp DESC
		`
		return rows as unknown as SenseiBond[]
	}

	/**
	 * Session Cache for active MomoTalk choice prompts (5 min TTL).
	 */
	public setSession(
		agentId: string,
		userJid: string,
		session: MomoSession,
	): void {
		sessionCache.set(`${agentId}:${userJid}`, session)
	}

	public getSession(agentId: string, userJid: string): MomoSession | null {
		return sessionCache.get<MomoSession>(`${agentId}:${userJid}`) || null
	}

	public clearSession(agentId: string, userJid: string): void {
		sessionCache.del(`${agentId}:${userJid}`)
	}
}

export const momoRepository = MomoRepository.getInstance()
