import path from "node:path"
import type { WASocket } from "baileys"
import { Browsers, fetchLatestWaWebVersion, makeWASocket } from "baileys"
import type { ServerWebSocket } from "bun"
import NodeCache from "node-cache"
import { pino } from "pino"

import { ImprovedAuth } from "./auth"
import { attachConnectionEvents } from "./handlers/connection-handler"
import { attachGroupEvents } from "./handlers/group-handler"
import { attachMessageEvents } from "./handlers/message-handler"
import { handlePairingCode } from "./handlers/pairing-handler"

export class BaileysManager {
	private runningSockets = new Map<string, WASocket>()
	private qrStore = new Map<string, string>()
	private pairingStore = new Map<string, string>()
	private wsClients = new Map<string, ServerWebSocket<unknown>>()

	onPairingCode?: (userId: string, code: string) => void
	onQRCode?: (userId: string, qr: string) => void
	onConnected?: (userId: string) => void

	/**
	 * Starts a Baileys WhatsApp socket agent.
	 */
	async startAgent(userId: string, phoneNumber: string | null): Promise<void> {
		if (this.runningSockets.has(userId)) {
			logger.warn(`[${userId}] Already running`)
			return
		}

		const groupCache = new NodeCache({
			stdTTL: 300,
			checkperiod: 60,
			useClones: false,
			deleteOnExpire: true,
		})
		const auth = new ImprovedAuth(path.resolve(`./auth/${userId}`))
		const { version } = await fetchLatestWaWebVersion()

		const sock = makeWASocket({
			version,
			auth: auth.state,
			browser: Browsers.appropriate("Chrome"),
			logger: pino({ level: "silent" }),
			printQRInTerminal: false,
			cachedGroupMetadata: async (jid) => groupCache.get(jid) ?? undefined,
		})

		this.runningSockets.set(userId, sock)
		sock.ev.on("creds.update", auth.saveCreds)

		// Attach modular event handlers
		void handlePairingCode(sock, userId, phoneNumber, auth, this)
		attachConnectionEvents(sock, userId, phoneNumber, this)
		attachMessageEvents(sock, userId)
		attachGroupEvents(sock, groupCache)
	}

	// ── State & Store Helper Methods ──────────────────────────────────────────

	getRunningAgents(): string[] {
		return [...this.runningSockets.keys()]
	}

	getAgentStatus(userId: string): boolean {
		return this.runningSockets.has(userId)
	}

	getSocket(userId: string): WASocket | null {
		return this.runningSockets.get(userId) ?? null
	}

	getAllSockets(): Map<string, WASocket> {
		return this.runningSockets
	}

	getQR(userId: string): string | null {
		return this.qrStore.get(userId) ?? null
	}

	setQR(userId: string, qr: string): void {
		this.qrStore.set(userId, qr)
	}

	getPairingCode(userId: string): string | null {
		return this.pairingStore.get(userId) ?? null
	}

	setPairingCode(userId: string, code: string): void {
		this.pairingStore.set(userId, code)
	}

	clearConnectionInfo(userId: string): void {
		this.qrStore.delete(userId)
		this.pairingStore.delete(userId)
	}

	removeRunningSocket(userId: string): void {
		this.runningSockets.delete(userId)
	}

	setWSClient(userId: string, ws: ServerWebSocket<unknown>): void {
		this.wsClients.set(userId, ws)
	}

	removeWSClient(userId: string): void {
		this.wsClients.delete(userId)
	}

	pushToClient(userId: string, event: string, data: unknown): void {
		const ws = this.wsClients.get(userId)
		if (ws && ws.readyState === 1) {
			ws.send(JSON.stringify({ event, data }))
		}
	}
}

export default new BaileysManager()
