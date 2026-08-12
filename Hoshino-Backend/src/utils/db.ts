import { SQL } from "bun"

const host = process.env.POSTGRES_HOST || "localhost"
const port = process.env.POSTGRES_PORT || "5432"
const db = process.env.POSTGRES_DB || "hoshino"
const user = process.env.POSTGRES_SQL_USERNAME || "hoshino"
const password = process.env.POSTGRES_SQL_PASSWORD || "12345678"

export const sql = new SQL({
	url: `postgres://${user}:${password}@${host}:${port}/${db}`,
})

/**
 * Initializes the `auth` schema and required tables for Baileys multi-instance authentication and command management.
 */
export async function initAuthDatabase(): Promise<void> {
	try {
		// 1. Create schema 'auth' if it doesn't exist
		await sql`CREATE SCHEMA IF NOT EXISTS auth;`

		// 2. Create credentials table
		await sql`
			CREATE TABLE IF NOT EXISTS auth.credentials (
				agent_id VARCHAR(255) PRIMARY KEY,
				creds JSONB NOT NULL,
				created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
			);
		`

		// 3. Create signal keys table
		await sql`
			CREATE TABLE IF NOT EXISTS auth.keys (
				agent_id VARCHAR(255) NOT NULL,
				key_id VARCHAR(255) NOT NULL,
				value JSONB NOT NULL,
				created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (agent_id, key_id)
			);
		`

		// 4. Create index for fast key queries per agent
		await sql`CREATE INDEX IF NOT EXISTS idx_auth_keys_agent_id ON auth.keys(agent_id);`

		// 5. Create public.agents metadata table
		await sql`
			CREATE TABLE IF NOT EXISTS public.agents (
				id VARCHAR(255) PRIMARY KEY,
				name VARCHAR(255) NOT NULL,
				phone_number VARCHAR(50),
				status VARCHAR(50) DEFAULT 'disconnected',
				created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
			);
		`

		// 6. Create public.chats table
		await sql`
			CREATE TABLE IF NOT EXISTS public.chats (
				agent_id VARCHAR(255) NOT NULL,
				jid VARCHAR(255) NOT NULL,
				name VARCHAR(255),
				unread_count INT DEFAULT 0,
				last_message_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
				created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (agent_id, jid)
			);
		`

		// 7. Create public.messages table
		await sql`
			CREATE TABLE IF NOT EXISTS public.messages (
				id VARCHAR(255) NOT NULL,
				agent_id VARCHAR(255) NOT NULL,
				jid VARCHAR(255) NOT NULL,
				from_me BOOLEAN DEFAULT false,
				sender VARCHAR(255),
				push_name VARCHAR(255),
				message_type VARCHAR(50) NOT NULL,
				content JSONB NOT NULL,
				status VARCHAR(50) DEFAULT 'received',
				timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (agent_id, id)
			);
		`

		// 8. Create index for fast message querying per chat
		await sql`CREATE INDEX IF NOT EXISTS idx_messages_agent_jid ON public.messages(agent_id, jid, timestamp DESC);`

		// 9. Create public.agent_owners table
		await sql`
			CREATE TABLE IF NOT EXISTS public.agent_owners (
				agent_id VARCHAR(255) NOT NULL,
				user_jid VARCHAR(255) NOT NULL,
				role VARCHAR(50) DEFAULT 'owner',
				created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (agent_id, user_jid)
			);
		`

		// 10. Create public.agent_blacklists table
		await sql`
			CREATE TABLE IF NOT EXISTS public.agent_blacklists (
				agent_id VARCHAR(255) NOT NULL,
				user_jid VARCHAR(255) NOT NULL,
				reason TEXT,
				created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (agent_id, user_jid)
			);
		`

		// 11. Create public.agent_autodeletes table
		await sql`
			CREATE TABLE IF NOT EXISTS public.agent_autodeletes (
				agent_id VARCHAR(255) NOT NULL,
				user_jid VARCHAR(255) NOT NULL,
				created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (agent_id, user_jid)
			);
		`

		// 12. Create public.agent_group_settings table
		await sql`
			CREATE TABLE IF NOT EXISTS public.agent_group_settings (
				agent_id VARCHAR(255) NOT NULL,
				jid VARCHAR(255) NOT NULL,
				bot_enabled BOOLEAN DEFAULT true,
				welcome_enabled BOOLEAN DEFAULT false,
				goodbye_enabled BOOLEAN DEFAULT false,
				custom_prefix VARCHAR(10),
				updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (agent_id, jid)
			);
		`

		// 13. Create public.agent_command_toggles table
		await sql`
			CREATE TABLE IF NOT EXISTS public.agent_command_toggles (
				agent_id VARCHAR(255) NOT NULL,
				command_name VARCHAR(100) NOT NULL,
				status VARCHAR(50) DEFAULT 'enabled',
				updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (agent_id, command_name)
			);
		`

		// 14. Create public.agent_group_commands table
		await sql`
			CREATE TABLE IF NOT EXISTS public.agent_group_commands (
				agent_id VARCHAR(255) NOT NULL,
				jid VARCHAR(255) NOT NULL,
				command_name VARCHAR(100) NOT NULL,
				status VARCHAR(50) DEFAULT 'enabled',
				updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (agent_id, jid, command_name)
			);
		`

		logger.system(
			"/utils/db.ts",
			"PostgreSQL auth schema, agents, chats, messages, and command tables initialized successfully",
		)
	} catch (error) {
		logger.error("/utils/db.ts", `Failed to initialize auth schema: ${error}`)
		throw error
	}
}
