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
				prefix VARCHAR(10) DEFAULT '.',
				welcome_message TEXT,
				goodbye_message TEXT,
				auto_read BOOLEAN DEFAULT false,
				typing_indicator BOOLEAN DEFAULT true,
				created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
			);
		`
		await sql`ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS prefix VARCHAR(10) DEFAULT '.';`
		await sql`ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS welcome_message TEXT;`
		await sql`ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS goodbye_message TEXT;`
		await sql`ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS auto_read BOOLEAN DEFAULT false;`
		await sql`ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS typing_indicator BOOLEAN DEFAULT true;`

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

		// 11. Create public.agent_autodeletes table (scoped per group or global '*')
		await sql`
			CREATE TABLE IF NOT EXISTS public.agent_autodeletes (
				agent_id VARCHAR(255) NOT NULL,
				jid VARCHAR(255) NOT NULL DEFAULT '*',
				user_jid VARCHAR(255) NOT NULL,
				created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (agent_id, jid, user_jid)
			);
		`

		// 11b. Ensure jid column and composite PK exist on public.agent_autodeletes
		await sql`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM information_schema.columns 
					WHERE table_schema = 'public' AND table_name = 'agent_autodeletes' AND column_name = 'jid'
				) THEN
					ALTER TABLE public.agent_autodeletes ADD COLUMN jid VARCHAR(255) NOT NULL DEFAULT '*';
					ALTER TABLE public.agent_autodeletes DROP CONSTRAINT IF EXISTS agent_autodeletes_pkey;
					ALTER TABLE public.agent_autodeletes ADD PRIMARY KEY (agent_id, jid, user_jid);
				END IF;
			END $$;
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

		// 15. Create public.sensei_profiles table (Gacha, Credits, Squad & PvP Economy)
		await sql`
			CREATE TABLE IF NOT EXISTS public.sensei_profiles (
				agent_id VARCHAR(255) NOT NULL,
				user_jid VARCHAR(255) NOT NULL,
				pyroxenes INT DEFAULT 1200,
				credits BIGINT DEFAULT 500000,
				spark_points INT DEFAULT 0,
				total_pulls INT DEFAULT 0,
				last_daily TIMESTAMPTZ,
				raid_tickets INT DEFAULT 3,
				bounty_tickets INT DEFAULT 3,
				last_ticket_reset TIMESTAMPTZ,
				pvp_wins INT DEFAULT 0,
				pvp_losses INT DEFAULT 0,
				squad_strikers INT[] DEFAULT '{}',
				squad_specials INT[] DEFAULT '{}',
				created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (agent_id, user_jid)
			);
		`
		await sql`ALTER TABLE public.sensei_profiles ADD COLUMN IF NOT EXISTS credits BIGINT DEFAULT 500000;`
		await sql`ALTER TABLE public.sensei_profiles ADD COLUMN IF NOT EXISTS raid_tickets INT DEFAULT 3;`
		await sql`ALTER TABLE public.sensei_profiles ADD COLUMN IF NOT EXISTS bounty_tickets INT DEFAULT 3;`
		await sql`ALTER TABLE public.sensei_profiles ADD COLUMN IF NOT EXISTS last_ticket_reset TIMESTAMPTZ;`
		await sql`ALTER TABLE public.sensei_profiles ADD COLUMN IF NOT EXISTS pvp_wins INT DEFAULT 0;`
		await sql`ALTER TABLE public.sensei_profiles ADD COLUMN IF NOT EXISTS pvp_losses INT DEFAULT 0;`
		await sql`ALTER TABLE public.sensei_profiles ADD COLUMN IF NOT EXISTS squad_strikers INT[] DEFAULT '{}';`
		await sql`ALTER TABLE public.sensei_profiles ADD COLUMN IF NOT EXISTS squad_specials INT[] DEFAULT '{}';`

		// 16. Create public.sensei_students table (Sensei Student Collection & Progression)
		await sql`
			CREATE TABLE IF NOT EXISTS public.sensei_students (
				agent_id VARCHAR(255) NOT NULL,
				user_jid VARCHAR(255) NOT NULL,
				student_id INT NOT NULL,
				student_name VARCHAR(255) NOT NULL,
				star_grade INT NOT NULL,
				count INT DEFAULT 1,
				level INT DEFAULT 1,
				exp INT DEFAULT 0,
				ex_skill_level INT DEFAULT 1,
				normal_skill_level INT DEFAULT 1,
				passive_skill_level INT DEFAULT 1,
				sub_skill_level INT DEFAULT 1,
				equip_slot1_tier INT DEFAULT 1,
				equip_slot2_tier INT DEFAULT 1,
				equip_slot3_tier INT DEFAULT 1,
				weapon_star INT DEFAULT 0,
				first_obtained_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (agent_id, user_jid, student_id)
			);
		`
		await sql`ALTER TABLE public.sensei_students ADD COLUMN IF NOT EXISTS level INT DEFAULT 1;`
		await sql`ALTER TABLE public.sensei_students ADD COLUMN IF NOT EXISTS exp INT DEFAULT 0;`
		await sql`ALTER TABLE public.sensei_students ADD COLUMN IF NOT EXISTS ex_skill_level INT DEFAULT 1;`
		await sql`ALTER TABLE public.sensei_students ADD COLUMN IF NOT EXISTS normal_skill_level INT DEFAULT 1;`
		await sql`ALTER TABLE public.sensei_students ADD COLUMN IF NOT EXISTS passive_skill_level INT DEFAULT 1;`
		await sql`ALTER TABLE public.sensei_students ADD COLUMN IF NOT EXISTS sub_skill_level INT DEFAULT 1;`
		await sql`ALTER TABLE public.sensei_students ADD COLUMN IF NOT EXISTS equip_slot1_tier INT DEFAULT 1;`
		await sql`ALTER TABLE public.sensei_students ADD COLUMN IF NOT EXISTS equip_slot2_tier INT DEFAULT 1;`
		await sql`ALTER TABLE public.sensei_students ADD COLUMN IF NOT EXISTS equip_slot3_tier INT DEFAULT 1;`
		await sql`ALTER TABLE public.sensei_students ADD COLUMN IF NOT EXISTS weapon_star INT DEFAULT 0;`

		// 16b. Create public.sensei_inventory table (SchaleDB Upgrade Materials & Blueprints)
		await sql`
			CREATE TABLE IF NOT EXISTS public.sensei_inventory (
				agent_id VARCHAR(255) NOT NULL,
				user_jid VARCHAR(255) NOT NULL,
				item_id INT NOT NULL,
				item_name VARCHAR(255) NOT NULL,
				category VARCHAR(100) NOT NULL DEFAULT 'Material',
				rarity VARCHAR(20) DEFAULT 'N',
				count INT DEFAULT 0,
				updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (agent_id, user_jid, item_id)
			);
		`

		// 16c. Create public.sensei_raid_records table (Total Assault & Weekly Boss Progress)
		await sql`
			CREATE TABLE IF NOT EXISTS public.sensei_raid_records (
				agent_id VARCHAR(255) NOT NULL,
				user_jid VARCHAR(255) NOT NULL,
				boss_id INT NOT NULL,
				boss_name VARCHAR(255) NOT NULL,
				difficulty VARCHAR(50) NOT NULL,
				best_score BIGINT DEFAULT 0,
				total_damage BIGINT DEFAULT 0,
				clears INT DEFAULT 0,
				updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (agent_id, user_jid, boss_id, difficulty)
			);
		`

		// 17. Create public.sensei_bonds table (MomoTalk & Affection System)
		await sql`
			CREATE TABLE IF NOT EXISTS public.sensei_bonds (
				agent_id VARCHAR(255) NOT NULL,
				user_jid VARCHAR(255) NOT NULL,
				student_id INT NOT NULL,
				student_name VARCHAR(255) NOT NULL,
				bond_level INT DEFAULT 1,
				bond_exp INT DEFAULT 0,
				total_talks INT DEFAULT 0,
				last_talk TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
				created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (agent_id, user_jid, student_id)
			);
		`

		// 18. Create public.database_settings table (Storage & Retention Management)
		await sql`
			CREATE TABLE IF NOT EXISTS public.database_settings (
				id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
				auto_prune_enabled BOOLEAN DEFAULT true,
				retention_days INT DEFAULT 7,
				max_messages_per_chat INT DEFAULT 500,
				clean_media_bloat BOOLEAN DEFAULT true,
				last_pruned_at TIMESTAMPTZ,
				updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
			);
		`
		await sql`
			INSERT INTO public.database_settings (id, auto_prune_enabled, retention_days, max_messages_per_chat, clean_media_bloat)
			VALUES ('default', true, 7, 500, true)
			ON CONFLICT (id) DO NOTHING;
		`

		logger.system(
			"/utils/db.ts",
			"PostgreSQL auth schema, agents, chats, messages, gacha, momotalk, and database_settings tables initialized successfully",
		)
	} catch (error) {
		logger.error("/utils/db.ts", `Failed to initialize auth schema: ${error}`)
		throw error
	}
}
