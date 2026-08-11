import NodeCache from "@cacheable/node-cache"
import type { Boom } from "@hapi/boom"
import { agentRepository } from "@repositories/agent.repository"
import makeWASocket, {
	Browsers,
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
import { usePostgresAuthState } from "./auth"
import type { AgentSession } from "./types"

const baileysLogger = P({ level: "silent" })
const msgRetryCounterCache = new NodeCache() as CacheStore
const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false })

export class SocketManager {
	private static instance: SocketManager
	private sessions: Map<string, WASocket> = new Map()
	private sessionStates: Map<string, AgentSession> = new Map()
	private isStopping: Set<string> = new Set()
	private reconnectAttempts: Map<string, number> = new Map()
	private cachedVersion: [number, number, number] | null = null

	private constructor() { }

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
		await agentRepository.initDatabase()
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
	public sanitizeAgentId(agentId: string): string {
		return agentId.replace(/[^a-zA-Z0-9_-]/g, "_")
	}

	/**
	 * Starts a new socket instance for the specified agent.
	 */
	async startSock(
		agentName: string,
		agentPhoneNumber?: string,
	): Promise<{ sock: WASocket; session: AgentSession }> {
		await this.initDatabase()

		const safeAgentId = this.sanitizeAgentId(agentName)
		this.isStopping.delete(safeAgentId)

		if (this.sessions.has(safeAgentId)) {
			const existingSock = this.sessions.get(safeAgentId)!
			const existingSession = this.sessionStates.get(safeAgentId)!
			return { sock: existingSock, session: existingSession }
		}

		const { state, saveCreds, clearSession } =
			await usePostgresAuthState(safeAgentId)
		const version = await this.getBaileysVersion()
		const messageStore = new Map<string, proto.IMessage>()

		const sessionInfo: AgentSession = {
			agentId: safeAgentId,
			agentName,
			phoneNumber: agentPhoneNumber,
			status: "connecting",
			updatedAt: new Date(),
		}
		this.sessionStates.set(safeAgentId, sessionInfo)
		await agentRepository.upsertAgentStatus(
			safeAgentId,
			agentName,
			"connecting",
			agentPhoneNumber,
		)

		const sock = makeWASocket({
			version,
			logger: baileysLogger,
			auth: {
				creds: state.creds,
				keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
			},
			browser: Browsers.ubuntu("Chrome"),
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

		sessionInfo.socket = sock
		this.sessions.set(safeAgentId, sock)

		// Handle QR Code vs Pairing Code Flow for unregistered creds
		if (!sock.authState.creds.registered) {
			if (agentPhoneNumber) {
				const cleanPhone = agentPhoneNumber.replace(/[^0-9]/g, "")
				setTimeout(async () => {
					try {
						if (this.isStopping.has(safeAgentId)) return
						const pairingCode = await sock.requestPairingCode(cleanPhone)
						sessionInfo.pairingCode = pairingCode
						sessionInfo.status = "pairing_code"
						sessionInfo.updatedAt = new Date()
						await agentRepository.upsertAgentStatus(
							safeAgentId,
							agentName,
							"pairing_code",
							agentPhoneNumber,
						)
						logger.system(
							"/modules/baileys/socket.ts",
							`Pairing code generated for Agent [${agentName}]: ${pairingCode}`,
						)
					} catch (error) {
						const errMsg =
							error instanceof Error ? error.message : String(error)
						if (
							errMsg.includes("Cancelled") ||
							errMsg.includes("Connection Closed")
						) {
							logger.warn(
								"/modules/baileys/socket.ts",
								`Pairing code request cancelled for Agent [${agentName}]`,
							)
						} else {
							logger.error(
								"/modules/baileys/socket.ts",
								`Failed to request pairing code for Agent [${agentName}]: ${error}`,
							)
						}
					}
				}, 2000)
			}
		}

		// Production event handling using ev.process
		sock.ev.process(async (events) => {
			if (events["creds.update"]) {
				await saveCreds()
			}

			if (events["connection.update"]) {
				const update = events["connection.update"]
				const { connection, lastDisconnect, qr } = update

				if (qr && !agentPhoneNumber && !sock.authState.creds.registered) {
					sessionInfo.qrCode = qr
					sessionInfo.status = "qr_code"
					sessionInfo.updatedAt = new Date()
					await agentRepository.upsertAgentStatus(
						safeAgentId,
						agentName,
						"qr_code",
						agentPhoneNumber,
					)
					logger.system(
						"/modules/baileys/socket.ts",
						`QR code generated for Agent [${agentName}]`,
					)
				}

				if (connection === "close") {
					this.sessions.delete(safeAgentId)

					if (this.isStopping.has(safeAgentId)) {
						this.isStopping.delete(safeAgentId)
						this.reconnectAttempts.delete(safeAgentId)
						logger.system(
							"/modules/baileys/socket.ts",
							`Agent [${agentName}] connection closed manually. Reconnect skipped.`,
						)
						return
					}

					const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
					const shouldReconnect = statusCode !== DisconnectReason.loggedOut

					if (shouldReconnect) {
						const attempts = (this.reconnectAttempts.get(safeAgentId) ?? 0) + 1
						this.reconnectAttempts.set(safeAgentId, attempts)
						const delay = Math.min(1000 * 2 ** (attempts - 1), 30000)

						sessionInfo.status = "connecting"
						sessionInfo.updatedAt = new Date()
						await agentRepository.upsertAgentStatus(
							safeAgentId,
							agentName,
							"connecting",
							agentPhoneNumber,
						)
						logger.warn(
							"/modules/baileys/socket.ts",
							`Agent [${agentName}] connection closed. Reconnecting in ${delay / 1000}s (attempt ${attempts})...`,
						)

						setTimeout(async () => {
							if (!this.isStopping.has(safeAgentId)) {
								await this.startSock(agentName, agentPhoneNumber)
							}
						}, delay)
					} else {
						this.reconnectAttempts.delete(safeAgentId)
						sessionInfo.status = "disconnected"
						sessionInfo.socket = undefined
						sessionInfo.qrCode = undefined
						sessionInfo.pairingCode = undefined
						sessionInfo.updatedAt = new Date()
						await agentRepository.upsertAgentStatus(
							safeAgentId,
							agentName,
							"disconnected",
							agentPhoneNumber,
						)
						await clearSession()
						logger.system(
							"/modules/baileys/socket.ts",
							`Agent [${agentName}] logged out. Cleared DB session.`,
						)
					}
				} else if (connection === "open") {
					this.reconnectAttempts.delete(safeAgentId)
					sessionInfo.status = "connected"
					sessionInfo.qrCode = undefined
					sessionInfo.pairingCode = undefined
					sessionInfo.updatedAt = new Date()
					await agentRepository.upsertAgentStatus(
						safeAgentId,
						agentName,
						"connected",
						agentPhoneNumber,
					)
					logger.system(
						"/modules/baileys/socket.ts",
						`Agent [${agentName}] connection opened successfully`,
					)
				}
			}

			if (events["messages.upsert"]) {
				const { messages } = events["messages.upsert"]
				for (const msg of messages) {
					if (msg.key.id && msg.message) {
						messageStore.set(`${msg.key.remoteJid}:${msg.key.id}`, msg.message)
					}
				}
			}

			if (events["groups.update"]) {
				for (const group of events["groups.update"]) {
					if (group.id) {
						try {
							const meta = await sock.groupMetadata(group.id)
							groupCache.set(group.id, meta)
						} catch {
							/* ignore cache refresh error */
						}
					}
				}
			}

			if (events["group-participants.update"]) {
				const { id } = events["group-participants.update"]
				if (id) {
					try {
						const meta = await sock.groupMetadata(id)
						groupCache.set(id, meta)
					} catch {
						/* ignore cache refresh error */
					}
				}
			}
		})

		return { sock, session: sessionInfo }
	}

	/**
	 * Returns active WASocket instance for given agentName if connected.
	 */
	getSock(agentName: string): WASocket | undefined {
		return this.sessions.get(this.sanitizeAgentId(agentName))
	}

	/**
	 * Returns the AgentSession state for given agentName.
	 */
	getAgentSession(agentName: string): AgentSession | undefined {
		return this.sessionStates.get(this.sanitizeAgentId(agentName))
	}

	/**
	 * Returns all active agent session states.
	 */
	getAllAgentSessions(): AgentSession[] {
		return Array.from(this.sessionStates.values())
	}

	/**
	 * Stops and disconnects a socket instance gracefully.
	 */
	async stopSock(agentName: string): Promise<void> {
		const safeAgentId = this.sanitizeAgentId(agentName)
		this.isStopping.add(safeAgentId)
		this.reconnectAttempts.delete(safeAgentId)

		const sock = this.sessions.get(safeAgentId)
		const sessionInfo = this.sessionStates.get(safeAgentId)

		if (sock) {
			this.sessions.delete(safeAgentId)
			try {
				sock.end(undefined)
			} catch {
				/* ignore */
			}
		}

		if (sessionInfo) {
			sessionInfo.status = "disconnected"
			sessionInfo.socket = undefined
			sessionInfo.qrCode = undefined
			sessionInfo.pairingCode = undefined
			sessionInfo.updatedAt = new Date()
		}

		await agentRepository.upsertAgentStatus(
			safeAgentId,
			agentName,
			"disconnected",
			sessionInfo?.phoneNumber,
		)
		logger.system(
			"/modules/baileys/socket.ts",
			`Agent [${agentName}] socket stopped.`,
		)
	}

	/**
	 * Reconnects an agent socket safely.
	 */
	async reconnectAgent(
		agentName: string,
		phoneNumber?: string,
	): Promise<{ sock: WASocket; session: AgentSession }> {
		await this.stopSock(agentName)
		await new Promise((resolve) => setTimeout(resolve, 500))

		const safeAgentId = this.sanitizeAgentId(agentName)
		this.isStopping.delete(safeAgentId)

		return await this.startSock(agentName, phoneNumber)
	}

	/**
	 * Completely deletes an agent session, clearing DB auth keys and agent metadata.
	 */
	async deleteAgent(agentName: string): Promise<void> {
		const safeAgentId = this.sanitizeAgentId(agentName)

		await this.stopSock(agentName)
		await new Promise((resolve) => setTimeout(resolve, 300))

		const { clearSession } = await usePostgresAuthState(safeAgentId)
		await clearSession()

		await agentRepository.deleteAgentRecord(agentName)
		this.sessionStates.delete(safeAgentId)

		logger.system(
			"/modules/baileys/socket.ts",
			`Agent [${agentName}] deleted permanently from database.`,
		)
	}
}

export const socketManager = SocketManager.getInstance()
