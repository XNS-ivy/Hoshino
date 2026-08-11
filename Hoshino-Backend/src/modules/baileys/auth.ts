import fs from "node:fs"
import path from "node:path"
import { sql } from "@utils/db"
import type {
	AuthenticationCreds,
	AuthenticationState,
	SignalDataSet,
	SignalDataTypeMap,
} from "baileys"
import { BufferJSON, initAuthCreds } from "baileys"
import NodeCache from "node-cache"

export class ImprovedAuth {
	private baseDir: string
	private credsPath: string
	private keyDirPath: string
	private cache: NodeCache
	private creds: AuthenticationCreds
	private timers: Record<string, ReturnType<typeof setTimeout>> = {}

	constructor(baseDir: `./${string}` | string = "./auth") {
		this.baseDir = baseDir
		this.credsPath = path.join(this.baseDir, "creds.json")
		this.keyDirPath = path.join(this.baseDir, "keys")

		fs.mkdirSync(this.keyDirPath, { recursive: true })
		this.cache = new NodeCache({
			stdTTL: 1800,
			checkperiod: 600,
			useClones: false,
			deleteOnExpire: true,
		})
		this.creds = this.loadAuth(this.credsPath) || initAuthCreds()
	}

	get keysDir() {
		return this.keyDirPath
	}

	private sanitizeFileName(name: string) {
		return name.replace(/[:<>"/\\|?*]/g, "_")
	}

	private loadAuth(file: string) {
		try {
			if (fs.existsSync(file)) {
				const parsed = JSON.parse(
					fs.readFileSync(file, "utf-8"),
					BufferJSON.reviver,
				)
				if (parsed) return parsed
			}
		} catch (e) {
			logger.error("/modules/baileys/auth.ts", `Failed to read ${file}: ${e}`)
		}
		return null
	}

	private saveJSON(file: string, data: unknown) {
		fs.mkdirSync(path.dirname(file), { recursive: true })
		fs.writeFileSync(
			`${file}.tmp`,
			JSON.stringify(data, BufferJSON.replacer, 2),
		)
		fs.renameSync(`${file}.tmp`, file)
	}

	private saveAuth(file: string, data: unknown) {
		try {
			const baseName = this.sanitizeFileName(path.basename(file))
			const safeFile = path.join(path.dirname(file), baseName)
			fs.writeFileSync(
				`${safeFile}.tmp`,
				JSON.stringify(data, BufferJSON.replacer, 2),
			)
			fs.renameSync(`${safeFile}.tmp`, safeFile)
		} catch {
			logger.error("/modules/baileys/auth.ts", "Failed to save file")
		}
	}

	private deleteFile(file: string) {
		try {
			if (fs.existsSync(file)) fs.unlinkSync(file)
		} catch {
			/* ignore */
		}
	}

	private isNullLike(v: unknown) {
		return v === null || v === undefined
	}

	saveCreds = async (): Promise<void> => {
		try {
			this.saveAuth(this.credsPath, this.creds)
		} catch (e) {
			logger.error("/modules/baileys/auth.ts", `Failed to save creds: ${e}`)
		}
	}

	keys: AuthenticationState["keys"] = {
		get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
			const result: Partial<Record<string, SignalDataTypeMap[T]>> = {}

			for (const id of ids) {
				const safeKey = `${String(type)}-${id}`.replace(/[:<>"/\\|?*]/g, "_")
				let value = this.cache.get<SignalDataTypeMap[T]>(safeKey)

				const file = path.join(this.keysDir, `${safeKey}.json`)
				if (!value && fs.existsSync(file)) {
					try {
						value = JSON.parse(
							fs.readFileSync(file, "utf-8"),
							BufferJSON.reviver,
						) as SignalDataTypeMap[T]
					} catch {
						/* ignore */
					}
					if (value) this.cache.set(safeKey, value)
				}

				if (value !== undefined) {
					result[id] = value
				}
			}
			return result as Record<string, SignalDataTypeMap[T]>
		},

		set: async (data: SignalDataSet) => {
			for (const type of Object.keys(data) as (keyof SignalDataSet)[]) {
				const sub = data[type] as SignalDataSet[typeof type]
				if (!sub || typeof sub !== "object") {
					continue
				}

				for (const id of Object.keys(sub)) {
					const value = (sub as Record<string, unknown>)[id]
					const safeKey = `${String(type)}-${id}`.replace(/[:<>"/\\|?*]/g, "_")
					const file = path.join(this.keysDir, `${safeKey}.json`)

					if (this.isNullLike(value)) {
						this.cache.del(safeKey)
						this.deleteFile(file)
						continue
					}

					this.cache.set(safeKey, value)

					const timerKey = `_save_${safeKey}`
					clearTimeout(this.timers[timerKey])
					this.timers[timerKey] = setTimeout(() => {
						try {
							this.saveJSON(file, value)
						} catch {
							logger.error(
								"/modules/baileys/auth.ts",
								`Failed to save key ${safeKey}`,
							)
						}
					}, 0)
				}
			}
		},
	}

	get state(): AuthenticationState {
		return {
			creds: this.creds,
			keys: this.keys,
		}
	}
}

/**
 * PostgreSQL-backed Auth state implementation for Baileys multi-instance support.
 */
export class PostgresAuth {
	public agentId: string
	public creds: AuthenticationCreds
	private cache: NodeCache
	private pendingWrites: Map<string, unknown | null> = new Map()
	private writeTimer: ReturnType<typeof setTimeout> | null = null

	constructor(agentId: string, initialCreds: AuthenticationCreds) {
		this.agentId = agentId
		this.creds = initialCreds
		this.cache = new NodeCache({
			stdTTL: 1800,
			checkperiod: 600,
			useClones: false,
			deleteOnExpire: true,
		})
	}

	static async init(agentId: string): Promise<PostgresAuth> {
		try {
			const rows = await sql`
				SELECT creds FROM auth.credentials WHERE agent_id = ${agentId}
			`

			let creds: AuthenticationCreds
			if (rows.length > 0 && rows[0].creds) {
				const raw = rows[0].creds
				const jsonStr = typeof raw === "string" ? raw : JSON.stringify(raw)
				creds = JSON.parse(jsonStr, BufferJSON.reviver) as AuthenticationCreds
			} else {
				creds = initAuthCreds()
			}

			const instance = new PostgresAuth(agentId, creds)
			if (rows.length === 0) {
				await instance.saveCreds()
			}

			return instance
		} catch (error) {
			logger.error(
				"/modules/baileys/auth.ts",
				`Failed to initialize PostgresAuth for ${agentId}: ${error}`,
			)
			throw error
		}
	}

	saveCreds = async (): Promise<void> => {
		try {
			const jsonStr = JSON.stringify(this.creds, BufferJSON.replacer)
			await sql`
				INSERT INTO auth.credentials (agent_id, creds, updated_at)
				VALUES (${this.agentId}, ${jsonStr}::jsonb, CURRENT_TIMESTAMP)
				ON CONFLICT (agent_id)
				DO UPDATE SET creds = EXCLUDED.creds, updated_at = CURRENT_TIMESTAMP;
			`
		} catch (error) {
			logger.error(
				"/modules/baileys/auth.ts",
				`Failed to save creds to DB for ${this.agentId}: ${error}`,
			)
		}
	}

	keys: AuthenticationState["keys"] = {
		get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
			const result: Partial<Record<string, SignalDataTypeMap[T]>> = {}
			const missingIds: string[] = []
			const keyToIdMap: Record<string, string> = {}

			for (const id of ids) {
				const safeKey = `${String(type)}-${id}`.replace(/[:<>"/\\|?*]/g, "_")
				keyToIdMap[safeKey] = id

				const cachedValue = this.cache.get<SignalDataTypeMap[T]>(safeKey)
				if (cachedValue !== undefined) {
					result[id] = cachedValue
				} else {
					missingIds.push(safeKey)
				}
			}

			if (missingIds.length > 0) {
				try {
					const pgArrayStr = `{${missingIds.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(",")}}`
					const rows = await sql`
						SELECT key_id, value FROM auth.keys
						WHERE agent_id = ${this.agentId} AND key_id = ANY(${pgArrayStr}::text[])
					`

					for (const row of rows) {
						const safeKey = row.key_id as string
						const rawVal = row.value
						const jsonStr =
							typeof rawVal === "string" ? rawVal : JSON.stringify(rawVal)
						const revivedVal = JSON.parse(
							jsonStr,
							BufferJSON.reviver,
						) as SignalDataTypeMap[T]

						const originalId = keyToIdMap[safeKey]
						if (originalId) {
							result[originalId] = revivedVal
							this.cache.set(safeKey, revivedVal)
						}
					}
				} catch (error) {
					logger.error(
						"/modules/baileys/auth.ts",
						`Failed to fetch keys from DB for ${this.agentId}: ${error}`,
					)
				}
			}

			return result as Record<string, SignalDataTypeMap[T]>
		},

		set: async (data: SignalDataSet) => {
			for (const type of Object.keys(data) as (keyof SignalDataSet)[]) {
				const sub = data[type] as SignalDataSet[typeof type]
				if (!sub || typeof sub !== "object") {
					continue
				}

				for (const id of Object.keys(sub)) {
					const value = (sub as Record<string, unknown>)[id]
					const safeKey = `${String(type)}-${id}`.replace(/[:<>"/\\|?*]/g, "_")

					if (value === null || value === undefined) {
						this.cache.del(safeKey)
						this.pendingWrites.set(safeKey, null)
					} else {
						this.cache.set(safeKey, value)
						this.pendingWrites.set(safeKey, value)
					}
				}
			}

			this.scheduleFlushKeys()
		},
	}

	private scheduleFlushKeys() {
		if (this.writeTimer) return

		this.writeTimer = setTimeout(() => {
			this.writeTimer = null
			this.flushKeysToDb().catch((err) => {
				logger.error(
					"/modules/baileys/auth.ts",
					`Error flushing keys to DB for ${this.agentId}: ${err}`,
				)
			})
		}, 50)
	}

	private async flushKeysToDb() {
		if (this.pendingWrites.size === 0) return

		const entries = Array.from(this.pendingWrites.entries())
		this.pendingWrites.clear()

		for (const [safeKey, value] of entries) {
			try {
				if (value === null) {
					await sql`
						DELETE FROM auth.keys
						WHERE agent_id = ${this.agentId} AND key_id = ${safeKey}
					`
				} else {
					const jsonStr = JSON.stringify(value, BufferJSON.replacer)
					await sql`
						INSERT INTO auth.keys (agent_id, key_id, value, updated_at)
						VALUES (${this.agentId}, ${safeKey}, ${jsonStr}::jsonb, CURRENT_TIMESTAMP)
						ON CONFLICT (agent_id, key_id)
						DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;
					`
				}
			} catch (error) {
				logger.error(
					"/modules/baileys/auth.ts",
					`Failed to write key ${safeKey} to DB for ${this.agentId}: ${error}`,
				)
			}
		}
	}

	async clearSession(): Promise<void> {
		try {
			await sql`DELETE FROM auth.credentials WHERE agent_id = ${this.agentId}`
			await sql`DELETE FROM auth.keys WHERE agent_id = ${this.agentId}`
			this.cache.flushAll()
			logger.system(
				"/modules/baileys/auth.ts",
				`Cleared DB auth session for agent ${this.agentId}`,
			)
		} catch (error) {
			logger.error(
				"/modules/baileys/auth.ts",
				`Failed to clear DB session for ${this.agentId}: ${error}`,
			)
		}
	}

	get state(): AuthenticationState {
		return {
			creds: this.creds,
			keys: this.keys,
		}
	}
}

/**
 * Helper function to create PostgreSQL Auth state for a Baileys session.
 */
export async function usePostgresAuthState(agentId: string) {
	const auth = await PostgresAuth.init(agentId)
	return {
		state: auth.state,
		saveCreds: auth.saveCreds,
		clearSession: () => auth.clearSession(),
		authInstance: auth,
	}
}
