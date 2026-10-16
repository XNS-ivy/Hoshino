import { sql } from "@utils/db"

export interface GroupSettings {
	agentId: string
	jid: string
	subject?: string | null
	botEnabled: boolean
	welcomeEnabled: boolean
	goodbyeEnabled: boolean
	customPrefix?: string | null
	customizedCommandsCount?: number
}

export interface GroupCommandRecord {
	commandName: string
	status: "enabled" | "disabled"
	updatedAt: Date
}

export interface OwnerRecord {
	agentId: string
	userJid: string
	role: string
	createdAt: Date
}

export interface BlacklistRecord {
	agentId: string
	userJid: string
	reason: string | null
	createdAt: Date
}

export interface AutoDeleteRecord {
	agentId: string
	userJid: string
	createdAt: Date
}

export interface CommandToggleRecord {
	commandName: string
	status: "enabled" | "disabled"
}

export class CommandRepository {
	private static instance: CommandRepository

	private constructor() {}

	public static getInstance(): CommandRepository {
		if (!CommandRepository.instance) {
			CommandRepository.instance = new CommandRepository()
		}
		return CommandRepository.instance
	}

	/**
	 * Normalizes JID string to prevent comparison mismatches (removes device IDs / port suffixes).
	 */
	public normalizeJid(jid: string): string {
		const clean = jid.trim().split(":")[0] || jid.trim()
		if (!clean.includes("@")) {
			return `${clean.replace(/[^0-9]/g, "")}@s.whatsapp.net`
		}
		return clean
	}

	/**
	 * Checks if a user JID has owner or master role for an agent.
	 */
	public async isOwner(agentId: string, userJid: string): Promise<boolean> {
		const cleanJid = this.normalizeJid(userJid)
		const rows = await sql`
			SELECT role FROM public.agent_owners
			WHERE agent_id = ${agentId} AND user_jid = ${cleanJid}
		`
		return rows.length > 0
	}

	/**
	 * Fetches all owners for an agent.
	 */
	public async getOwners(agentId: string): Promise<OwnerRecord[]> {
		const rows = await sql`
			SELECT agent_id as "agentId", user_jid as "userJid", role, created_at as "createdAt"
			FROM public.agent_owners
			WHERE agent_id = ${agentId}
			ORDER BY created_at ASC
		`
		return rows as unknown as OwnerRecord[]
	}

	/**
	 * Adds an owner for an agent.
	 */
	public async addOwner(
		agentId: string,
		userJid: string,
		role = "owner",
	): Promise<void> {
		const cleanJid = this.normalizeJid(userJid)
		await sql`
			INSERT INTO public.agent_owners (agent_id, user_jid, role)
			VALUES (${agentId}, ${cleanJid}, ${role})
			ON CONFLICT (agent_id, user_jid) DO UPDATE SET role = EXCLUDED.role;
		`
	}

	/**
	 * Removes an owner for an agent.
	 */
	public async removeOwner(agentId: string, userJid: string): Promise<void> {
		const cleanJid = this.normalizeJid(userJid)
		await sql`
			DELETE FROM public.agent_owners
			WHERE agent_id = ${agentId} AND user_jid = ${cleanJid};
		`
	}

	/**
	 * Checks if a user JID is blacklisted for an agent.
	 */
	public async isBlacklisted(
		agentId: string,
		userJid: string,
	): Promise<boolean> {
		const cleanJid = this.normalizeJid(userJid)
		const rows = await sql`
			SELECT user_jid FROM public.agent_blacklists
			WHERE agent_id = ${agentId} AND user_jid = ${cleanJid}
		`
		return rows.length > 0
	}

	/**
	 * Fetches all blacklisted users for an agent.
	 */
	public async getBlacklist(agentId: string): Promise<BlacklistRecord[]> {
		const rows = await sql`
			SELECT agent_id as "agentId", user_jid as "userJid", reason, created_at as "createdAt"
			FROM public.agent_blacklists
			WHERE agent_id = ${agentId}
			ORDER BY created_at DESC
		`
		return rows as unknown as BlacklistRecord[]
	}

	/**
	 * Adds a user to the blacklist for an agent.
	 */
	public async addBlacklist(
		agentId: string,
		userJid: string,
		reason?: string,
	): Promise<void> {
		const cleanJid = this.normalizeJid(userJid)
		await sql`
			INSERT INTO public.agent_blacklists (agent_id, user_jid, reason)
			VALUES (${agentId}, ${cleanJid}, ${reason || null})
			ON CONFLICT (agent_id, user_jid) DO UPDATE SET reason = EXCLUDED.reason;
		`
	}

	/**
	 * Removes a user from the blacklist for an agent.
	 */
	public async removeBlacklist(
		agentId: string,
		userJid: string,
	): Promise<void> {
		const cleanJid = this.normalizeJid(userJid)
		await sql`
			DELETE FROM public.agent_blacklists
			WHERE agent_id = ${agentId} AND user_jid = ${cleanJid};
		`
	}

	/**
	 * Checks if a user JID is marked for auto-delete in group chats for an agent.
	 */
	public async isAutoDelete(
		agentId: string,
		userJid: string,
	): Promise<boolean> {
		const cleanJid = this.normalizeJid(userJid)
		const rows = await sql`
			SELECT user_jid FROM public.agent_autodeletes
			WHERE agent_id = ${agentId} AND user_jid = ${cleanJid}
		`
		return rows.length > 0
	}

	/**
	 * Fetches all auto-delete users for an agent.
	 */
	public async getAutoDeleteList(agentId: string): Promise<AutoDeleteRecord[]> {
		const rows = await sql`
			SELECT agent_id as "agentId", user_jid as "userJid", created_at as "createdAt"
			FROM public.agent_autodeletes
			WHERE agent_id = ${agentId}
			ORDER BY created_at DESC
		`
		return rows as unknown as AutoDeleteRecord[]
	}

	/**
	 * Adds a user to auto-delete list for an agent.
	 */
	public async addAutoDelete(agentId: string, userJid: string): Promise<void> {
		const cleanJid = this.normalizeJid(userJid)
		await sql`
			INSERT INTO public.agent_autodeletes (agent_id, user_jid)
			VALUES (${agentId}, ${cleanJid})
			ON CONFLICT (agent_id, user_jid) DO NOTHING;
		`
	}

	/**
	 * Removes a user from auto-delete list for an agent.
	 */
	public async removeAutoDelete(
		agentId: string,
		userJid: string,
	): Promise<void> {
		const cleanJid = this.normalizeJid(userJid)
		await sql`
			DELETE FROM public.agent_autodeletes
			WHERE agent_id = ${agentId} AND user_jid = ${cleanJid};
		`
	}

	/**
	 * Fetches group settings per agent and group JID.
	 */
	public async getGroupSettings(
		agentId: string,
		groupJid: string,
	): Promise<GroupSettings> {
		const rows = await sql`
			SELECT agent_id as "agentId", jid, bot_enabled as "botEnabled", welcome_enabled as "welcomeEnabled", goodbye_enabled as "goodbyeEnabled", custom_prefix as "customPrefix"
			FROM public.agent_group_settings
			WHERE agent_id = ${agentId} AND jid = ${groupJid}
		`
		if (rows.length === 0) {
			return {
				agentId,
				jid: groupJid,
				botEnabled: false,
				welcomeEnabled: false,
				goodbyeEnabled: false,
				customPrefix: null,
			}
		}
		return rows[0] as unknown as GroupSettings
	}

	/**
	 * Fetches all group settings and known group chats for an agent.
	 */
	public async getAllGroupSettings(agentId: string): Promise<GroupSettings[]> {
		const rows = await sql`
			WITH group_jids AS (
				SELECT jid, name as subject, updated_at FROM public.chats WHERE agent_id = ${agentId} AND jid LIKE '%@g.us'
				UNION
				SELECT jid, NULL as subject, updated_at FROM public.agent_group_settings WHERE agent_id = ${agentId} AND jid LIKE '%@g.us'
				UNION
				SELECT jid, NULL as subject, updated_at FROM public.agent_group_commands WHERE agent_id = ${agentId} AND jid LIKE '%@g.us'
			)
			SELECT DISTINCT ON (gj.jid)
				${agentId} as "agentId",
				gj.jid as "jid",
				COALESCE(c.name, gj.subject) as "subject",
				COALESCE(s.bot_enabled, false) as "botEnabled",
				COALESCE(s.welcome_enabled, false) as "welcomeEnabled",
				COALESCE(s.goodbye_enabled, false) as "goodbyeEnabled",
				s.custom_prefix as "customPrefix",
				COALESCE((
					SELECT COUNT(*)::int
					FROM public.agent_group_commands gc
					WHERE gc.agent_id = ${agentId} AND gc.jid = gj.jid
				), 0) as "customizedCommandsCount"
			FROM group_jids gj
			LEFT JOIN public.chats c ON c.agent_id = ${agentId} AND c.jid = gj.jid
			LEFT JOIN public.agent_group_settings s ON s.agent_id = ${agentId} AND s.jid = gj.jid
			ORDER BY gj.jid ASC, gj.updated_at DESC
		`
		return rows as unknown as GroupSettings[]
	}

	/**
	 * Updates group settings per agent and group JID.
	 */
	public async updateGroupSettings(
		agentId: string,
		groupJid: string,
		settings: Partial<GroupSettings>,
	): Promise<GroupSettings> {
		const current = await this.getGroupSettings(agentId, groupJid)
		const botEnabled = settings.botEnabled ?? current.botEnabled
		const welcomeEnabled = settings.welcomeEnabled ?? current.welcomeEnabled
		const goodbyeEnabled = settings.goodbyeEnabled ?? current.goodbyeEnabled
		const customPrefix =
			settings.customPrefix !== undefined
				? settings.customPrefix
				: current.customPrefix

		await sql`
			INSERT INTO public.agent_group_settings (agent_id, jid, bot_enabled, welcome_enabled, goodbye_enabled, custom_prefix, updated_at)
			VALUES (${agentId}, ${groupJid}, ${botEnabled}, ${welcomeEnabled}, ${goodbyeEnabled}, ${customPrefix}, CURRENT_TIMESTAMP)
			ON CONFLICT (agent_id, jid)
			DO UPDATE SET
				bot_enabled = EXCLUDED.bot_enabled,
				welcome_enabled = EXCLUDED.welcome_enabled,
				goodbye_enabled = EXCLUDED.goodbye_enabled,
				custom_prefix = EXCLUDED.custom_prefix,
				updated_at = CURRENT_TIMESTAMP;
		`

		return {
			agentId,
			jid: groupJid,
			botEnabled,
			welcomeEnabled,
			goodbyeEnabled,
			customPrefix,
		}
	}

	/**
	 * Fetches all global command toggles for an agent.
	 */
	public async getAllCommandToggles(
		agentId: string,
	): Promise<CommandToggleRecord[]> {
		const rows = await sql`
			SELECT command_name as "commandName", status
			FROM public.agent_command_toggles
			WHERE agent_id = ${agentId}
		`
		return rows as unknown as CommandToggleRecord[]
	}

	/**
	 * Checks if a command is globally enabled for an agent instance.
	 */
	public async isCommandEnabledGlobally(
		agentId: string,
		commandName: string,
	): Promise<boolean> {
		const rows = await sql`
			SELECT status FROM public.agent_command_toggles
			WHERE agent_id = ${agentId} AND command_name = ${commandName}
		`
		if (rows.length === 0) return true
		return (rows[0] as { status: string }).status !== "disabled"
	}

	/**
	 * Sets global command status for an agent instance.
	 */
	public async setGlobalCommandStatus(
		agentId: string,
		commandName: string,
		status: "enabled" | "disabled",
	): Promise<void> {
		await sql`
			INSERT INTO public.agent_command_toggles (agent_id, command_name, status, updated_at)
			VALUES (${agentId}, ${commandName}, ${status}, CURRENT_TIMESTAMP)
			ON CONFLICT (agent_id, command_name)
			DO UPDATE SET status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP;
		`
	}

	/**
	 * Checks if a command is enabled inside a specific group for an agent instance.
	 */
	public async isCommandEnabledInGroup(
		agentId: string,
		groupJid: string,
		commandName: string,
	): Promise<boolean> {
		const rows = await sql`
			SELECT status FROM public.agent_group_commands
			WHERE agent_id = ${agentId} AND jid = ${groupJid} AND command_name = ${commandName}
		`
		if (rows.length === 0) return false
		return (rows[0] as { status: string }).status === "enabled"
	}

	/**
	 * Checks if a command is allowed inside a specific group for an agent instance,
	 * taking into account whether the command requires explicit admin registration.
	 */
	public async isCommandAllowedInGroup(
		agentId: string,
		groupJid: string,
		commandName: string,
		needAdminRegisterThisCommand = false,
	): Promise<boolean> {
		const rows = await sql`
			SELECT status FROM public.agent_group_commands
			WHERE agent_id = ${agentId} AND jid = ${groupJid} AND command_name = ${commandName}
		`
		if (rows.length === 0) {
			return !needAdminRegisterThisCommand
		}
		return (rows[0] as { status: string }).status === "enabled"
	}

	/**
	 * Retrieves all command overrides for a specific group.
	 */
	public async getGroupCommands(
		agentId: string,
		groupJid: string,
	): Promise<GroupCommandRecord[]> {
		const rows = await sql`
			SELECT command_name as "commandName", status, updated_at as "updatedAt"
			FROM public.agent_group_commands
			WHERE agent_id = ${agentId} AND jid = ${groupJid}
		`
		return rows as unknown as GroupCommandRecord[]
	}

	/**
	 * Registers/enables or disables a command inside a specific group.
	 */
	public async setGroupCommandStatus(
		agentId: string,
		groupJid: string,
		commandName: string,
		status: "enabled" | "disabled",
	): Promise<void> {
		await sql`
			INSERT INTO public.agent_group_commands (agent_id, jid, command_name, status, updated_at)
			VALUES (${agentId}, ${groupJid}, ${commandName}, ${status}, CURRENT_TIMESTAMP)
			ON CONFLICT (agent_id, jid, command_name)
			DO UPDATE SET status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP;
		`
	}

	/**
	 * Resets/removes a specific command override for a group (falls back to default policy).
	 */
	public async resetGroupCommandStatus(
		agentId: string,
		groupJid: string,
		commandName: string,
	): Promise<void> {
		await sql`
			DELETE FROM public.agent_group_commands
			WHERE agent_id = ${agentId} AND jid = ${groupJid} AND command_name = ${commandName}
		`
	}

	/**
	 * Resets all command overrides for a specific group back to defaults.
	 */
	public async resetAllGroupCommands(
		agentId: string,
		groupJid: string,
	): Promise<void> {
		await sql`
			DELETE FROM public.agent_group_commands
			WHERE agent_id = ${agentId} AND jid = ${groupJid}
		`
	}
}

export const commandRepository = CommandRepository.getInstance()
