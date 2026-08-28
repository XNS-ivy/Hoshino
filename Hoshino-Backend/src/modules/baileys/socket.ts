import NodeCache from "@cacheable/node-cache"
import { agentRepository } from "@repositories/agent.repository"
import {
	type MessageRecord,
	messageRepository,
} from "@repositories/message.repository"
import { commandLoader } from "@services/commandLoader"
import { wsManager } from "@services/wsManager"
import { logger } from "@utils/logger"
import makeWASocket, {
	type AnyMessageContent,
	Browsers,
	downloadMediaMessage,
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
import {
	handleConnectionUpdate,
	requestPairingCode,
} from "./handlers/connection.handler"
import {
	handleGroupParticipantsUpdate,
	handleGroupsUpdate,
} from "./handlers/group.handler"
import { handleMessagesUpsert } from "./handlers/message.handler"
import type { AgentSession } from "./types"
import { resolveGroupSubject } from "./utils/groupHelper"
import { parseOutgoingContent } from "./utils/messageParser"

const baileysLogger = P({ level: "silent" })
const msgRetryCounterCache = new NodeCache() as CacheStore
export const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false })

export const messageStore = new Map<string, WAMessage>()

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
			const existingSock = this.sessions.get(safeAgentId)
			const existingSession = this.sessionStates.get(safeAgentId)
			if (existingSock && existingSession) {
				return { sock: existingSock, session: existingSession }
			}
		}

		const { state, saveCreds, clearSession } =
			await usePostgresAuthState(safeAgentId)
		const version = await this.getBaileysVersion()

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
				const raw = messageStore.get(id)
				return (raw?.message || raw) as proto.IMessage | undefined
			},
			cachedGroupMetadata: async (jid) =>
				groupCache.get(jid) as GroupMetadata | undefined,
		})

		sessionInfo.socket = sock
		this.sessions.set(safeAgentId, sock)

		// Handle pairing code flow if phone number provided for unregistered creds
		if (!sock.authState.creds.registered && agentPhoneNumber) {
			setTimeout(async () => {
				await requestPairingCode(
					sock,
					safeAgentId,
					agentName,
					agentPhoneNumber,
					sessionInfo,
					this.isStopping,
				)
			}, 2000)
		}

		// Event dispatching via ev.process
		sock.ev.process(async (events) => {
			if (events["creds.update"]) {
				await saveCreds()
			}

			if (events["connection.update"]) {
				await handleConnectionUpdate(events["connection.update"], {
					sock,
					safeAgentId,
					agentName,
					agentPhoneNumber,
					sessionInfo,
					sessions: this.sessions,
					isStopping: this.isStopping,
					reconnectAttempts: this.reconnectAttempts,
					clearSession,
					onReconnect: async () => {
						await this.startSock(agentName, agentPhoneNumber)
					},
				})
			}

			if (events["messages.upsert"]) {
				await handleMessagesUpsert(events["messages.upsert"], {
					sock,
					safeAgentId,
					groupCache,
					messageStore,
					baileysLogger,
				})
			}

			if (events["groups.update"]) {
				await handleGroupsUpdate(events["groups.update"], sock, groupCache)
			}

			if (events["group-participants.update"]) {
				await handleGroupParticipantsUpdate(
					events["group-participants.update"],
					{
						sock,
						safeAgentId,
						groupCache,
					},
				)
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

		const { messageType, contentData } = parseOutgoingContent(content)
		const groupSubject = await resolveGroupSubject(cleanJid, sock, groupCache)

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
	 * Boots and reconnects all active agent sessions found in database upon server startup.
	 */
	async bootAllAgents(): Promise<void> {
		try {
			const agents = await agentRepository.findAllAgents()
			logger.system(
				"/modules/baileys/socket.ts",
				`Found ${agents.length} agent(s) in database. Booting active sessions...`,
			)

			for (const agent of agents) {
				if (agent.status === "connected" || agent.status === "connecting") {
					logger.info(
						"/modules/baileys/socket.ts",
						`Booting agent [${agent.name}] (status: ${agent.status})...`,
					)
					try {
						await this.startSock(agent.name, agent.phoneNumber || undefined)
					} catch (err) {
						logger.error(
							"/modules/baileys/socket.ts",
							`Failed to boot agent [${agent.name}]: ${err}`,
						)
					}
				}
			}
		} catch (error) {
			logger.error(
				"/modules/baileys/socket.ts",
				`Error booting agents: ${error}`,
			)
		}
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

	/**
	 * Downloads and decrypts media buffer (sticker, photo, video, audio) for a given message ID.
	 */
	async downloadMessageMedia(
		agentName: string,
		msgId: string,
	): Promise<{ buffer: Buffer; mimetype: string } | null> {
		const safeAgentId = this.sanitizeAgentId(agentName)
		const rawMsg = messageStore.get(msgId)
		if (!rawMsg) return null

		try {
			const buffer = await downloadMediaMessage(
				rawMsg,
				"buffer",
				{},
				{
					logger: baileysLogger,
					reuploadRequest: (msg) => {
						const sock = this.getSock(safeAgentId)
						return sock
							? sock.updateMediaMessage(msg)
							: Promise.reject("No sock")
					},
				},
			)
			const m = rawMsg.message
			const mimetype =
				m?.stickerMessage?.mimetype ||
				m?.imageMessage?.mimetype ||
				m?.videoMessage?.mimetype ||
				m?.audioMessage?.mimetype ||
				m?.documentMessage?.mimetype ||
				"image/webp"

			return { buffer, mimetype }
		} catch (err) {
			logger.error(
				"/modules/baileys/socket.ts",
				`Failed to download media for message ${msgId}: ${err}`,
			)
			return null
		}
	}

	/**
	 * Fetches WhatsApp profile picture / avatar URL for a contact or group JID.
	 */
	async getProfilePictureUrl(
		agentName: string,
		jid: string,
	): Promise<string | null> {
		const safeAgentId = this.sanitizeAgentId(agentName)
		const sock = this.getSock(safeAgentId)
		if (!sock) return null
		try {
			const url = await sock.profilePictureUrl(jid, "preview")
			return url || null
		} catch {
			return null
		}
	}
}

export const socketManager = SocketManager.getInstance()
