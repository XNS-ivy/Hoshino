import NodeCache from "@cacheable/node-cache"
import type { Boom } from "@hapi/boom"
import { agentRepository } from "@repositories/agent.repository"
import { commandRepository } from "@repositories/command.repository"
import {
	type MessageRecord,
	type MessageType,
	messageRepository,
} from "@repositories/message.repository"
import { commandLoader } from "@services/commandLoader"
import { wsManager } from "@services/wsManager"
import { logger } from "@utils/logger"
import makeWASocket, {
	type AnyMessageContent,
	Browsers,
	DisconnectReason,
	fetchLatestBaileysVersion,
	type GroupMetadata,
	isJidBroadcast,
	type MiscMessageGenerationOptions,
	makeCacheableSignalKeyStore,
	type proto,
	type WAMessage,
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
		await agentRepository.initDatabase()
		await commandLoader.init()
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
		wsManager.broadcast({
			type: "status_change",
			agentId: safeAgentId,
			payload: { status: "connecting" },
		})

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
						wsManager.broadcast({
							type: "pairing_code",
							agentId: safeAgentId,
							payload: { pairingCode },
						})
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
					wsManager.broadcast({
						type: "qr_code",
						agentId: safeAgentId,
						payload: { qrCode: qr },
					})
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
						wsManager.broadcast({
							type: "status_change",
							agentId: safeAgentId,
							payload: { status: "connecting" },
						})
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
						wsManager.broadcast({
							type: "status_change",
							agentId: safeAgentId,
							payload: { status: "disconnected" },
						})
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
					wsManager.broadcast({
						type: "status_change",
						agentId: safeAgentId,
						payload: { status: "connected" },
					})
					logger.system(
						"/modules/baileys/socket.ts",
						`Agent [${agentName}] connection opened successfully`,
					)

					const rawOwnerJid = sock.user?.id || sock.user?.lid
					if (rawOwnerJid) {
						const ownerJid = commandRepository.normalizeJid(rawOwnerJid)
						await commandRepository.addOwner(safeAgentId, ownerJid, "master")
					}
				}
			}

			if (events["messages.upsert"]) {
				const { messages } = events["messages.upsert"]
				for (const msg of messages) {
					if (!msg.key.id || !msg.message) continue
					messageStore.set(`${msg.key.remoteJid}:${msg.key.id}`, msg.message)

					const jid = msg.key.remoteJid
					if (!jid) continue

					let messageType: MessageType = "other"
					const contentData: Record<string, unknown> = {}

					if (msg.message.conversation) {
						messageType = "text"
						contentData.text = msg.message.conversation
					} else if (msg.message.extendedTextMessage?.text) {
						messageType = "text"
						contentData.text = msg.message.extendedTextMessage.text
					} else if (msg.message.imageMessage) {
						messageType = "image"
						contentData.caption = msg.message.imageMessage.caption
						contentData.mimetype = msg.message.imageMessage.mimetype
					} else if (msg.message.videoMessage) {
						messageType = "video"
						contentData.caption = msg.message.videoMessage.caption
						contentData.mimetype = msg.message.videoMessage.mimetype
					} else if (msg.message.audioMessage) {
						messageType = "audio"
						contentData.mimetype = msg.message.audioMessage.mimetype
					} else if (msg.message.documentMessage) {
						messageType = "document"
						contentData.fileName = msg.message.documentMessage.fileName
						contentData.mimetype = msg.message.documentMessage.mimetype
					} else if (msg.message.locationMessage) {
						messageType = "location"
						contentData.degreesLatitude =
							msg.message.locationMessage.degreesLatitude
						contentData.degreesLongitude =
							msg.message.locationMessage.degreesLongitude
						contentData.name = msg.message.locationMessage.name
						contentData.address = msg.message.locationMessage.address
					} else if (msg.message.contactMessage) {
						messageType = "contact"
						contentData.displayName = msg.message.contactMessage.displayName
						contentData.vcard = msg.message.contactMessage.vcard
					} else if (msg.message.reactionMessage) {
						messageType = "reaction"
						contentData.text = msg.message.reactionMessage.text
					}

					let displayName = msg.pushName
					if (jid.endsWith("@g.us")) {
						let gMeta = groupCache.get(jid) as GroupMetadata | undefined
						if (!gMeta) {
							try {
								gMeta = await sock.groupMetadata(jid)
								if (gMeta) groupCache.set(jid, gMeta)
							} catch {
								/* ignore group metadata error */
							}
						}
						if (gMeta?.subject) {
							displayName = gMeta.subject
						}
					}

					const record: MessageRecord = {
						id: msg.key.id,
						agentId: safeAgentId,
						jid,
						fromMe: !!msg.key.fromMe,
						sender: msg.key.participant || msg.key.remoteJid,
						pushName: displayName || msg.pushName || jid,
						messageType,
						content: contentData,
						status: msg.key.fromMe ? "sent" : "received",
						timestamp: new Date(
							(msg.messageTimestamp as number) * 1000 || Date.now(),
						),
					}

					await messageRepository.saveMessage(record)
					wsManager.broadcast({
						type: "message_new",
						agentId: safeAgentId,
						payload: record,
					})

					// Execute command processing pipeline asynchronously for non-self messages
					if (!msg.key.fromMe) {
						void commandLoader.executeMessage(safeAgentId, sock, msg)
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
				const { id, participants, action } = events["group-participants.update"]
				if (id) {
					try {
						const meta = await sock.groupMetadata(id)
						groupCache.set(id, meta)
					} catch {
						/* ignore cache refresh error */
					}

					if (action === "add" || action === "remove") {
						try {
							const groupSettings = await commandRepository.getGroupSettings(
								safeAgentId,
								id,
							)
							if (groupSettings.botEnabled) {
								if (action === "add" && groupSettings.welcomeEnabled) {
									const mentions = participants.map((p) =>
										commandRepository.normalizeJid(
											typeof p === "string" ? p : p.id,
										),
									)
									const welcomeText = `👋 Selamat datang @${mentions.map((m) => m.split("@")[0]).join(", @")} di grup *${(groupCache.get(id) as GroupMetadata | undefined)?.subject || "kami"}*!`
									await sock.sendMessage(id, {
										text: welcomeText,
										mentions,
									})
								} else if (
									action === "remove" &&
									groupSettings.goodbyeEnabled
								) {
									const mentions = participants.map((p) =>
										commandRepository.normalizeJid(
											typeof p === "string" ? p : p.id,
										),
									)
									const goodbyeText = `👋 Selamat tinggal @${mentions.map((m) => m.split("@")[0]).join(", @")}!`
									await sock.sendMessage(id, {
										text: goodbyeText,
										mentions,
									})
								}
							}
						} catch (err) {
							logger.error(
								"/modules/baileys/socket.ts",
								`Welcome/Goodbye event processing error: ${err}`,
							)
						}
					}
				}
			}
		})

		return { sock, session: sessionInfo }
	}

	/**
	 * Sends a message (text, media, location, contact, reply) via active socket instance.
	 */
	async sendMessage(
		agentName: string,
		recipientJid: string,
		content: AnyMessageContent,
		options?: MiscMessageGenerationOptions,
	): Promise<WAMessage> {
		const safeAgentId = this.sanitizeAgentId(agentName)
		const sock = this.getSock(safeAgentId)

		if (!sock) {
			throw new Error(`Agent '${agentName}' is not connected`)
		}

		let cleanJid = recipientJid.trim()
		if (!cleanJid.includes("@")) {
			const digits = cleanJid.replace(/[^0-9]/g, "")
			cleanJid = `${digits}@s.whatsapp.net`
		}

		const sentMsg = await sock.sendMessage(cleanJid, content, options)
		if (!sentMsg) {
			throw new Error("Failed to send message via Baileys")
		}

		let messageType: MessageType = "text"
		const contentData: Record<string, unknown> = {}

		if ("text" in content && typeof content.text === "string") {
			messageType = "text"
			contentData.text = content.text
		} else if ("image" in content) {
			messageType = "image"
			if ("caption" in content && typeof content.caption === "string") {
				contentData.caption = content.caption
			}
		} else if ("document" in content) {
			messageType = "document"
			if ("fileName" in content && typeof content.fileName === "string") {
				contentData.fileName = content.fileName
			}
		} else if ("location" in content && content.location) {
			messageType = "location"
			contentData.degreesLatitude = content.location.degreesLatitude
			contentData.degreesLongitude = content.location.degreesLongitude
		} else if ("contacts" in content && content.contacts) {
			messageType = "contact"
			contentData.displayName = content.contacts.displayName
		}

		let groupSubject: string | undefined
		if (cleanJid.endsWith("@g.us")) {
			let gMeta = groupCache.get(cleanJid) as GroupMetadata | undefined
			if (!gMeta) {
				try {
					gMeta = await sock.groupMetadata(cleanJid)
					if (gMeta) groupCache.set(cleanJid, gMeta)
				} catch {
					/* ignore */
				}
			}
			if (gMeta?.subject) {
				groupSubject = gMeta.subject
			}
		}

		const record: MessageRecord = {
			id: sentMsg.key.id || `sent_${Date.now()}`,
			agentId: safeAgentId,
			jid: cleanJid,
			fromMe: true,
			sender: sock.user?.id,
			pushName: groupSubject || sock.user?.name || cleanJid,
			messageType,
			content: contentData,
			status: "sent",
			timestamp: new Date(),
		}

		await messageRepository.saveMessage(record)
		wsManager.broadcast({
			type: "message_new",
			agentId: safeAgentId,
			payload: record,
		})

		return sentMsg
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
		wsManager.broadcast({
			type: "status_change",
			agentId: safeAgentId,
			payload: { status: "disconnected" },
		})
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
