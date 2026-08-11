import type { AgentStatus } from "@modules/baileys/types"
import { initAuthDatabase, sql } from "@utils/db"

export interface AgentDbRecord {
	id: string
	name: string
	phoneNumber: string | null
	status: AgentStatus
	createdAt: Date
	updatedAt: Date
}

export class AgentRepository {
	private static instance: AgentRepository
	private isDbInitialized = false
	private initPromise: Promise<void> | null = null

	private constructor() {}

	public static getInstance(): AgentRepository {
		if (!AgentRepository.instance) {
			AgentRepository.instance = new AgentRepository()
		}
		return AgentRepository.instance
	}

	/**
	 * Ensures database schema and tables are initialized once.
	 */
	public async initDatabase(): Promise<void> {
		if (this.isDbInitialized) return
		if (!this.initPromise) {
			this.initPromise = (async () => {
				await initAuthDatabase()
				this.isDbInitialized = true
			})()
		}
		return this.initPromise
	}

	/**
	 * Upserts agent metadata status in PostgreSQL.
	 */
	public async upsertAgentStatus(
		agentId: string,
		agentName: string,
		status: AgentStatus,
		phoneNumber?: string,
	): Promise<void> {
		try {
			await this.initDatabase()
			await sql`
				INSERT INTO public.agents (id, name, phone_number, status, updated_at)
				VALUES (${agentId}, ${agentName}, ${phoneNumber ?? null}, ${status}, CURRENT_TIMESTAMP)
				ON CONFLICT (id)
				DO UPDATE SET
					name = EXCLUDED.name,
					phone_number = COALESCE(EXCLUDED.phone_number, public.agents.phone_number),
					status = EXCLUDED.status,
					updated_at = CURRENT_TIMESTAMP;
			`
		} catch (error) {
			logger.error(
				"/repositories/agent.repository.ts",
				`Failed to update agent status in DB for ${agentId}: ${error}`,
			)
		}
	}

	/**
	 * Deletes agent metadata record from PostgreSQL.
	 */
	public async deleteAgentRecord(agentIdOrName: string): Promise<void> {
		try {
			await this.initDatabase()
			await sql`DELETE FROM public.agents WHERE id = ${agentIdOrName} OR name = ${agentIdOrName}`
		} catch (error) {
			logger.error(
				"/repositories/agent.repository.ts",
				`Failed to delete agent record from DB for ${agentIdOrName}: ${error}`,
			)
		}
	}

	/**
	 * Retrieves all agents from PostgreSQL.
	 */
	public async findAllAgents(): Promise<AgentDbRecord[]> {
		await this.initDatabase()
		const rows = await sql`
			SELECT id, name, phone_number as "phoneNumber", status, created_at as "createdAt", updated_at as "updatedAt"
			FROM public.agents
			ORDER BY created_at DESC
		`
		return rows as unknown as AgentDbRecord[]
	}

	/**
	 * Retrieves single agent by ID from PostgreSQL.
	 */
	public async findAgentById(agentId: string): Promise<AgentDbRecord | null> {
		await this.initDatabase()
		const rows = await sql`
			SELECT id, name, phone_number as "phoneNumber", status, created_at as "createdAt", updated_at as "updatedAt"
			FROM public.agents
			WHERE id = ${agentId}
		`
		if (rows.length === 0) return null
		return rows[0] as unknown as AgentDbRecord
	}
}

export const agentRepository = AgentRepository.getInstance()
