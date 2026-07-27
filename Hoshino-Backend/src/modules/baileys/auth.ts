import fs from "node:fs"
import path from "node:path"
import {
	type AuthenticationState,
	BufferJSON,
	initAuthCreds,
	type SignalDataSet,
	type SignalDataTypeMap,
} from "baileys"
import NodeCache from "node-cache"

export class ImprovedAuth {
	private baseDir: string
	private credsPath: string
	private keyDirPath: string
	private cache: NodeCache
	private creds: AuthenticationState["creds"]
	private timers: Record<string, ReturnType<typeof setTimeout>> = {}

	constructor(baseDir: string = "./auth") {
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
		this.creds = this.loadAuth(this.credsPath) ?? initAuthCreds()
	}

	get keysDir(): string {
		return this.keyDirPath
	}

	private sanitizeFileName(name: string): string {
		return name.replace(/[:<>"/\\|?*]/g, "_")
	}

	private loadAuth(file: string): AuthenticationState["creds"] | null {
		if (!fs.existsSync(file)) return null
		try {
			const content = fs.readFileSync(file, "utf-8")
			const parsed = JSON.parse(content, BufferJSON.reviver)
			return parsed ?? null
		} catch (e) {
			logger.error(`Failed to read ${file}: ${e}`)
			return null
		}
	}

	private saveJSON(file: string, data: unknown): void {
		fs.mkdirSync(path.dirname(file), { recursive: true })
		const tmp = `${file}.tmp`
		fs.writeFileSync(tmp, JSON.stringify(data, BufferJSON.replacer, 2))
		fs.renameSync(tmp, file)
	}

	private saveAuth(file: string, data: unknown): void {
		try {
			const baseName = this.sanitizeFileName(path.basename(file))
			const safeFile = path.join(path.dirname(file), baseName)
			const tmp = `${safeFile}.tmp`
			fs.writeFileSync(tmp, JSON.stringify(data, BufferJSON.replacer, 2))
			fs.renameSync(tmp, safeFile)
		} catch {
			logger.error("Failed to save auth file")
		}
	}

	private deleteFile(file: string): void {
		try {
			if (fs.existsSync(file)) fs.unlinkSync(file)
		} catch {
			// ignore
		}
	}

	private isNullLike(v: unknown): boolean {
		return v === null || v === undefined
	}

	saveCreds = async (): Promise<void> => {
		try {
			this.saveAuth(this.credsPath, this.creds)
		} catch (e) {
			logger.error(`Failed to save creds: ${e}`)
		}
	}

	keys: AuthenticationState["keys"] = {
		get: async <T extends keyof SignalDataTypeMap>(
			type: T,
			ids: string[],
		): Promise<Record<string, SignalDataTypeMap[T]>> => {
			const result: Partial<Record<string, SignalDataTypeMap[T]>> = {}

			for (const id of ids) {
				const safeKey = `${String(type)}-${id}`.replace(/[:<>"/\\|?*]/g, "_")
				let value = this.cache.get<SignalDataTypeMap[T]>(safeKey)

				const file = path.join(this.keysDir, `${safeKey}.json`)
				if (!value && fs.existsSync(file)) {
					try {
						const content = fs.readFileSync(file, "utf-8")
						value = JSON.parse(
							content,
							BufferJSON.reviver,
						) as SignalDataTypeMap[T]
					} catch {
						// ignore
					}
					if (value) this.cache.set(safeKey, value)
				}

				if (value !== undefined) {
					result[id] = value
				}
			}
			return result as Record<string, SignalDataTypeMap[T]>
		},

		set: async (data: SignalDataSet): Promise<void> => {
			for (const type of Object.keys(data) as (keyof SignalDataSet)[]) {
				const sub = data[type]
				if (!sub || typeof sub !== "object") continue

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
					if (this.timers[timerKey]) {
						clearTimeout(this.timers[timerKey])
					}

					this.timers[timerKey] = setTimeout(() => {
						try {
							this.saveJSON(file, value)
						} catch {
							logger.error(`Failed to save key ${safeKey}`)
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
