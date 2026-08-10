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
 * Initializes the `auth` schema and required tables for Baileys multi-instance authentication.
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

		logger.system(
			"/utils/db.ts",
			"PostgreSQL auth schema and tables initialized successfully",
		)
	} catch (error) {
		logger.error("/utils/db.ts", `Failed to initialize auth schema: ${error}`)
		throw error
	}
}
