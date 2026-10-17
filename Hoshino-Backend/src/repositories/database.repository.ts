import { sql } from "@utils/db"
import { type LogStats, logger } from "@utils/logger"

export interface DatabaseSettings {
	id: string
	autoPruneEnabled: boolean
	retentionDays: number
	maxMessagesPerChat: number
	cleanMediaBloat: boolean
	autoCleanLogsEnabled: boolean
	logRetentionDays: number
	lastPrunedAt: string | null
	updatedAt: string
}

export interface TableStat {
	tableSchema: string
	tableName: string
	totalSize: string
	tableSize: string
	indexSize: string
	rowCount: number
	rawSize: number
}

export interface DatabaseStats {
	databaseName: string
	totalSize: string
	totalSizeBytes: number
	messagesCount: number
	chatsCount: number
	authKeysCount: number
	mediaBloatCount: number
	tables: TableStat[]
	settings: DatabaseSettings
	logsStats: LogStats
}

export interface PruneOptions {
	retentionDays?: number
	maxMessagesPerChat?: number
	purgeMediaOnly?: boolean
}

export interface PruneResult {
	deletedMessages: number
	strippedMedia: number
	remainingMessages: number
	durationMs: number
}

export class DatabaseRepository {
	private static instance: DatabaseRepository

	private constructor() {}

	public static getInstance(): DatabaseRepository {
		if (!DatabaseRepository.instance) {
			DatabaseRepository.instance = new DatabaseRepository()
		}
		return DatabaseRepository.instance
	}

	/**
	 * Ensures public.database_settings table exists.
	 */
	public async ensureTable(): Promise<void> {
		await sql`
			CREATE TABLE IF NOT EXISTS public.database_settings (
				id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
				auto_prune_enabled BOOLEAN DEFAULT true,
				retention_days INT DEFAULT 7,
				max_messages_per_chat INT DEFAULT 500,
				clean_media_bloat BOOLEAN DEFAULT true,
				auto_clean_logs_enabled BOOLEAN DEFAULT true,
				log_retention_days INT DEFAULT 7,
				last_pruned_at TIMESTAMPTZ,
				updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
			);
		`
		await sql`
			ALTER TABLE public.database_settings 
			ADD COLUMN IF NOT EXISTS auto_clean_logs_enabled BOOLEAN DEFAULT true;
		`
		await sql`
			ALTER TABLE public.database_settings 
			ADD COLUMN IF NOT EXISTS log_retention_days INT DEFAULT 7;
		`
		await sql`
			INSERT INTO public.database_settings (
				id,
				auto_prune_enabled,
				retention_days,
				max_messages_per_chat,
				clean_media_bloat,
				auto_clean_logs_enabled,
				log_retention_days
			)
			VALUES ('default', true, 7, 500, true, true, 7)
			ON CONFLICT (id) DO NOTHING;
		`
	}

	/**
	 * Retrieves current database retention settings.
	 */
	public async getSettings(): Promise<DatabaseSettings> {
		await this.ensureTable()
		const rows = await sql`
			SELECT 
				id,
				auto_prune_enabled as "autoPruneEnabled",
				retention_days as "retentionDays",
				max_messages_per_chat as "maxMessagesPerChat",
				clean_media_bloat as "cleanMediaBloat",
				COALESCE(auto_clean_logs_enabled, true) as "autoCleanLogsEnabled",
				COALESCE(log_retention_days, 7) as "logRetentionDays",
				last_pruned_at as "lastPrunedAt",
				updated_at as "updatedAt"
			FROM public.database_settings
			WHERE id = 'default'
			LIMIT 1
		`

		if (rows.length === 0) {
			await sql`
				INSERT INTO public.database_settings (
					id,
					auto_prune_enabled,
					retention_days,
					max_messages_per_chat,
					clean_media_bloat,
					auto_clean_logs_enabled,
					log_retention_days
				)
				VALUES ('default', true, 7, 500, true, true, 7)
				ON CONFLICT (id) DO NOTHING
			`
			return {
				id: "default",
				autoPruneEnabled: true,
				retentionDays: 7,
				maxMessagesPerChat: 500,
				cleanMediaBloat: true,
				autoCleanLogsEnabled: true,
				logRetentionDays: 7,
				lastPrunedAt: null,
				updatedAt: new Date().toISOString(),
			}
		}

		const r = rows[0] as unknown as DatabaseSettings
		return {
			...r,
			autoCleanLogsEnabled: Boolean(r.autoCleanLogsEnabled ?? true),
			logRetentionDays: Number(r.logRetentionDays ?? 7),
			lastPrunedAt: r.lastPrunedAt
				? new Date(r.lastPrunedAt).toISOString()
				: null,
			updatedAt: r.updatedAt
				? new Date(r.updatedAt).toISOString()
				: new Date().toISOString(),
		}
	}

	/**
	 * Updates database retention configuration.
	 */
	public async updateSettings(
		partial: Partial<DatabaseSettings>,
	): Promise<DatabaseSettings> {
		const current = await this.getSettings()
		const autoPrune = partial.autoPruneEnabled ?? current.autoPruneEnabled
		const retentionDays = Math.max(
			1,
			partial.retentionDays ?? current.retentionDays,
		)
		const maxPerChat = Math.max(
			0,
			partial.maxMessagesPerChat ?? current.maxMessagesPerChat,
		)
		const cleanMedia = partial.cleanMediaBloat ?? current.cleanMediaBloat
		const autoCleanLogs =
			partial.autoCleanLogsEnabled ?? current.autoCleanLogsEnabled
		const logRetentionDays = Math.max(
			1,
			partial.logRetentionDays ?? current.logRetentionDays,
		)

		await sql`
			UPDATE public.database_settings
			SET 
				auto_prune_enabled = ${autoPrune},
				retention_days = ${retentionDays},
				max_messages_per_chat = ${maxPerChat},
				clean_media_bloat = ${cleanMedia},
				auto_clean_logs_enabled = ${autoCleanLogs},
				log_retention_days = ${logRetentionDays},
				updated_at = CURRENT_TIMESTAMP
			WHERE id = 'default'
		`

		return this.getSettings()
	}

	/**
	 * Computes detailed database sizing, table storage, and row counts.
	 */
	public async getDatabaseStats(): Promise<DatabaseStats> {
		// 1. Overall database size
		const sizeRows = await sql`
			SELECT 
				current_database() as "dbName",
				pg_size_pretty(pg_database_size(current_database())) as "totalSize",
				pg_database_size(current_database()) as "rawSize"
		`
		const dbName = (sizeRows[0]?.dbName as string) || "hoshino"
		const totalSize = (sizeRows[0]?.totalSize as string) || "0 MB"
		const totalSizeBytes = Number(sizeRows[0]?.rawSize) || 0

		// 2. Table storage breakdown
		const tableRows = await sql`
			SELECT 
				t.table_schema as "tableSchema",
				t.table_name as "tableName",
				pg_size_pretty(pg_total_relation_size('"' || t.table_schema || '"."' || t.table_name || '"')) AS "totalSize",
				pg_size_pretty(pg_relation_size('"' || t.table_schema || '"."' || t.table_name || '"')) AS "tableSize",
				pg_size_pretty(pg_total_relation_size('"' || t.table_schema || '"."' || t.table_name || '"') - pg_relation_size('"' || t.table_schema || '"."' || t.table_name || '"')) AS "indexSize",
				pg_total_relation_size('"' || t.table_schema || '"."' || t.table_name || '"') AS "rawSize",
				COALESCE(c.reltuples::bigint, 0) AS "rowCount"
			FROM information_schema.tables t
			LEFT JOIN pg_class c ON c.relname = t.table_name
			LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
			WHERE t.table_schema IN ('public', 'auth')
			ORDER BY "rawSize" DESC
		`

		const tables: TableStat[] = (tableRows as unknown as TableStat[]).map(
			(row) => ({
				tableSchema: row.tableSchema,
				tableName: row.tableName,
				totalSize: row.totalSize,
				tableSize: row.tableSize,
				indexSize: row.indexSize,
				rowCount: Number(row.rowCount) || 0,
				rawSize: Number(row.rawSize) || 0,
			}),
		)

		// 3. Exact row counts
		const countRows = await sql`
			SELECT 
				(SELECT COUNT(*) FROM public.messages) AS messages_count,
				(SELECT COUNT(*) FROM auth.keys) AS auth_keys_count,
				(SELECT COUNT(*) FROM public.chats) AS chats_count,
				(SELECT COUNT(*) FROM public.messages WHERE content ? 'mediaData') AS media_bloat_count
		`
		const messagesCount = Number(countRows[0]?.messages_count) || 0
		const authKeysCount = Number(countRows[0]?.auth_keys_count) || 0
		const chatsCount = Number(countRows[0]?.chats_count) || 0
		const mediaBloatCount = Number(countRows[0]?.media_bloat_count) || 0

		const settings = await this.getSettings()
		const logsStats = logger.getLogStats()

		return {
			databaseName: dbName,
			totalSize,
			totalSizeBytes,
			messagesCount,
			chatsCount,
			authKeysCount,
			mediaBloatCount,
			tables,
			settings,
			logsStats,
		}
	}

	/**
	 * Prunes old messages, removes base64 media bloat, and enforces per-chat history caps.
	 */
	public async pruneMessages(options: PruneOptions = {}): Promise<PruneResult> {
		const start = Date.now()
		const settings = await this.getSettings()

		const retentionDays =
			options.retentionDays !== undefined
				? options.retentionDays
				: settings.retentionDays
		const maxPerChat =
			options.maxMessagesPerChat !== undefined
				? options.maxMessagesPerChat
				: settings.maxMessagesPerChat
		const purgeMediaOnly = !!options.purgeMediaOnly

		let strippedMedia = 0
		let deletedMessages = 0

		try {
			// 1. Strip base64 media bloat from existing messages
			if (purgeMediaOnly || settings.cleanMediaBloat) {
				const stripResult = await sql`
					WITH stripped AS (
						UPDATE public.messages
						SET content = content - 'mediaData'
						WHERE content ? 'mediaData'
						RETURNING id
					)
					SELECT COUNT(*) as count FROM stripped
				`
				strippedMedia = Number(stripResult[0]?.count) || 0
			}

			// If not media-only, proceed with age and cap pruning
			if (!purgeMediaOnly) {
				// 2. Prune messages older than retentionDays
				if (retentionDays > 0) {
					const ageResult = await sql`
						WITH deleted AS (
							DELETE FROM public.messages
							WHERE timestamp < (NOW() - (${retentionDays} || ' days')::INTERVAL)
							RETURNING id
						)
						SELECT COUNT(*) as count FROM deleted
					`
					deletedMessages += Number(ageResult[0]?.count) || 0
				}

				// 3. Prune per-chat history cap (keep only newest N per chat)
				if (maxPerChat > 0) {
					const capResult = await sql`
						WITH ranked AS (
							SELECT 
								id, 
								agent_id, 
								ROW_NUMBER() OVER (PARTITION BY agent_id, jid ORDER BY timestamp DESC) as rn
							FROM public.messages
						),
						deleted AS (
							DELETE FROM public.messages m
							USING ranked r
							WHERE m.id = r.id AND m.agent_id = r.agent_id AND r.rn > ${maxPerChat}
							RETURNING m.id
						)
						SELECT COUNT(*) as count FROM deleted
					`
					deletedMessages += Number(capResult[0]?.count) || 0
				}
			}

			// 4. Update last_pruned_at timestamp
			await sql`
				UPDATE public.database_settings
				SET last_pruned_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
				WHERE id = 'default'
			`

			// 5. Count remaining messages
			const remainingRows =
				await sql`SELECT COUNT(*) as count FROM public.messages`
			const remainingMessages = Number(remainingRows[0]?.count) || 0

			const durationMs = Date.now() - start
			logger.system(
				"/repositories/database.repository.ts",
				`Prune finished in ${durationMs}ms: deleted ${deletedMessages} messages, stripped ${strippedMedia} media payloads`,
			)

			return {
				deletedMessages,
				strippedMedia,
				remainingMessages,
				durationMs,
			}
		} catch (error) {
			logger.error(
				"/repositories/database.repository.ts",
				`Failed to prune messages: ${error}`,
			)
			throw error
		}
	}

	/**
	 * Executes VACUUM FULL to physically reclaim storage space on disk and reindex tables.
	 */
	public async runVacuum(
		tableName?: string,
	): Promise<{ success: boolean; durationMs: number; message: string }> {
		const start = Date.now()
		try {
			const target = tableName
				? `public.${tableName.replace(/[^a-zA-Z0-9_]/g, "")}`
				: "public.messages"
			logger.system(
				"/repositories/database.repository.ts",
				`Starting VACUUM FULL on ${target}...`,
			)

			await sql.unsafe(`VACUUM FULL ${target};`)
			await sql.unsafe(`REINDEX TABLE ${target};`)

			const durationMs = Date.now() - start
			const msg = `VACUUM FULL and REINDEX completed on ${target} in ${durationMs}ms`
			logger.system("/repositories/database.repository.ts", msg)

			return {
				success: true,
				durationMs,
				message: msg,
			}
		} catch (error) {
			logger.error(
				"/repositories/database.repository.ts",
				`VACUUM FULL failed: ${error}`,
			)
			throw error
		}
	}
}

export const databaseRepository = DatabaseRepository.getInstance()
