import NodeCache from "@cacheable/node-cache"
import type { Boom } from "@hapi/boom"
import makeWASocket, {
	DisconnectReason,
	fetchLatestBaileysVersion,
	type GroupMetadata,
	isJidBroadcast,
	makeCacheableSignalKeyStore,
	type proto,
	type WASocket,
} from "baileys"
import type { CacheStore } from "baileys/lib/Types"
import P from "pino"
import { initAuthDatabase } from "../../utils/db"
import { usePostgresAuthState } from "./auth"

const baileysLogger = P({ level: "silent" })
const msgRetryCounterCache = new NodeCache() as CacheStore
const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false })

export class SocketManager {
	private static instance: SocketManager
	private sessions: Map<string, WASocket> = new Map()
	private cachedVersion: [number, number, number] | null = null
	private isDbInitialized = false

	private constructor() {}

	public static getInstance(): SocketManager {
		if (!SocketManager.instance) {
			SocketManager.instance = new SocketManager()
		}
		return SocketManager.instance
	}

	/**
	 * Ensures database schema and tables are initialized once.
	 */
	public async initDatabase(): Promise<void> {
		if (this.isDbInitialized) return
		await initAuthDatabase()
		this.isDbInitialized = true
	}

	/**
	 * Fetches and caches the latest Baileys version.
	 */
	private async getBaileysVersion(): Promise<[number, number, number]> {
		if (!this.cachedVersion) {
			const { version } = await fetchLatestBaileysVersion()
			this.cachedVersion = version
		}
		return this.cachedVersion
	}

	/**
	 * Sanitizes agent ID to prevent path or key conflicts.
	 */
	private sanitizeAgentId(agentId: string): string {
		return agentId.replace(/[^a-zA-Z0-9_-]/g, "_")
	}

	/**
	 * Starts a new socket instance for the specified agent.
	 */
	async startSock(
		agentName: string,
		agentPhoneNumber?: string,
	): Promise<WASocket> {
		await this.initDatabase()

		const safeAgentId = this.sanitizeAgentId(agentName)

		if (this.sessions.has(safeAgentId)) {
			return this.sessions.get(safeAgentId)!
		}

		const { state, saveCreds, clearSession } =
			await usePostgresAuthState(safeAgentId)
		const version = await this.getBaileysVersion()

		const messageStore = new Map<string, proto.IMessage>()

		const sock = makeWASocket({
			version,
			logger: baileysLogger,
			auth: {
				creds: state.creds,
				keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
			},
			markOnlineOnConnect: false,
			syncFullHistory: false,
			generateHighQualityLinkPreview: true,
			msgRetryCounterCache,
			maxMsgRetryCount: 5,
			connectTimeoutMs: 20_000,
			defaultQueryTimeoutMs: 60_000,
			keepAliveIntervalMs: 30_000,
			shouldIgnoreJid: (jid) => isJidBroadcast(jid),
			getMessage: async (key) => {
				const id = `${key.remoteJid}:${key.id}`
				return messageStore.get(id)
			},
			cachedGroupMetadata: async (jid) =>
				groupCache.get(jid) as GroupMetadata | undefined,
		})

		this.sessions.set(safeAgentId, sock)

		sock.ev.on("creds.update", saveCreds)

		sock.ev.on("connection.update", async (update) => {
			const { connection, lastDisconnect } = update

			if (connection === "close") {
				this.sessions.delete(safeAgentId)
				const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
				const shouldReconnect = statusCode !== DisconnectReason.loggedOut

				if (shouldReconnect) {
					logger.warn(
						"/modules/baileys/socket.ts",
						`Agent [${agentName}] connection closed. Reconnecting...`,
					)
					await this.startSock(agentName, agentPhoneNumber)
				} else {
					logger.system(
						"/modules/baileys/socket.ts",
						`Agent [${agentName}] logged out. Clearing DB session.`,
					)
					await clearSession()
				}
			} else if (connection === "open") {
				logger.system(
					"/modules/baileys/socket.ts",
					`Agent [${agentName}] connection opened successfully`,
				)
			}
		})

		sock.ev.on("messages.upsert", ({ messages }) => {
			for (const msg of messages) {
				if (msg.key.id && msg.message) {
					messageStore.set(`${msg.key.remoteJid}:${msg.key.id}`, msg.message)
				}
			}
		})

		return sock
	}

	/**
	 * Returns active WASocket instance for given agentName if connected.
	 */
	getSock(agentName: string): WASocket | undefined {
		return this.sessions.get(this.sanitizeAgentId(agentName))
	}

	/**
	 * Stops and disconnects a socket instance.
	 */
	async stopSock(agentName: string): Promise<void> {
		const safeAgentId = this.sanitizeAgentId(agentName)
		const sock = this.sessions.get(safeAgentId)
		if (sock) {
			sock.end(undefined)
			this.sessions.delete(safeAgentId)
			logger.system(
				"/modules/baileys/socket.ts",
				`Agent [${agentName}] socket stopped.`,
			)
		}
	}
}

export const socketManager = SocketManager.getInstance()
