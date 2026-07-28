import type { Boom } from "@hapi/boom"
import { type ConnectionState, DisconnectReason, type WASocket } from "baileys"
import QRCode from "qrcode"
import {
	cleanAgentAuth,
	getAgent,
	updateAgentPhone,
	updateAgentStatus,
} from "../agent"
import type { BaileysManager } from "../socket"

// Optional command loader placeholder if available
let commandLoader: {
	initOwner?: (sock: WASocket, userId: string) => Promise<void>
} = {}
try {
	commandLoader = require("@modules/handlers/commands-loader")?.default ?? {}
} catch {
	// Optional module fallback
}

/**
 * Attaches connection.update event listener using clean guard clauses.
 */
export function attachConnectionEvents(
	sock: WASocket,
	userId: string,
	phoneNumber: string | null,
	manager: BaileysManager,
): void {
	sock.ev.on("connection.update", async (update: Partial<ConnectionState>) => {
		const { connection, lastDisconnect, qr } = update

		if (qr) {
			await handleQrUpdate(userId, qr, manager)
		}

		if (connection === "open") {
			await handleOpenConnection(sock, userId, phoneNumber, manager)
			return
		}

		if (connection === "close") {
			await handleCloseConnection(userId, lastDisconnect, manager)
		}
	})
}

async function handleQrUpdate(
	userId: string,
	qr: string,
	manager: BaileysManager,
): Promise<void> {
	// Guard clause: Skip QR dispatch if agent is in pairing code mode
	if (manager.getAgentMode(userId) === "pairing-code") return

	const agent = getAgent(userId)
	const isFromTerminal = agent?.isFromTerminal ?? false

	let base64Url = ""
	try {
		base64Url = await QRCode.toDataURL(qr)
	} catch (err) {
		logger.error(`[${userId}] Failed to generate base64 QR: ${err}`)
	}

	logger.info(
		`[${userId}] QR received from Baileys (terminal: ${isFromTerminal}, base64 len: ${base64Url.length})`,
	)

	manager.setQR(userId, qr)
	manager.onQRCode?.(userId, qr, isFromTerminal)
	manager.pushToClient(userId, "qr", { qr, url: base64Url })
}

async function handleOpenConnection(
	sock: WASocket,
	userId: string,
	_phoneNumber: string | null,
	manager: BaileysManager,
): Promise<void> {
	manager.clearConnectionInfo(userId)
	manager.onConnected?.(userId)
	manager.pushToClient(userId, "connected", { name: sock.user?.name })

	// Extract phone number from sock.user.id (e.g. 6283199219663:12@s.whatsapp.net -> 6283199219663)
	const rawJid = sock.user?.id ?? ""
	const parsedPhone = rawJid.split(":")[0]?.split("@")[0] ?? ""

	logger.info(
		`[${userId}] Connected With : ${sock.user?.name ?? "Unknown"} Phone Number : ${parsedPhone}`,
	)

	updateAgentStatus(userId, "active")

	// Only sync phone number to DB if agent mode was explicitly pairing-code
	if (parsedPhone && manager.getAgentMode(userId) === "pairing-code") {
		updateAgentPhone(userId, parsedPhone)
		logger.info(`[${userId}] Phone updated: ${parsedPhone}`)
	}

	await commandLoader.initOwner?.(sock, userId)
}

async function handleCloseConnection(
	userId: string,
	lastDisconnect: ConnectionState["lastDisconnect"],
	manager: BaileysManager,
): Promise<void> {
	const err = lastDisconnect?.error as Boom | undefined
	const statusCode = err?.output?.statusCode
	const errorMessage = err?.message ?? "Unknown disconnect reason"

	logger.info(
		`[${userId}] Disconnected : ${errorMessage} (code: ${statusCode ?? "none"})`,
	)

	const agent = getAgent(userId)
	const wasActive = agent?.status === "active"

	// Socket guard cleanup
	manager.clearConnectionInfo(userId)
	manager.removeRunningSocket(userId)
	manager.pushToClient(userId, "disconnected", { reason: statusCode })

	// Clean auth ONLY if agent was already active/authenticated AND explicitly logged out
	if (wasActive && isLogoutReason(statusCode)) {
		logger.info(
			`[${userId}] Account logged out from WhatsApp (${errorMessage})`,
		)
		updateAgentStatus(userId, "loggedOut")
		cleanAgentAuth(userId)
		return
	}

	// If agent is marked loggedOut in DB, do not auto reconnect
	if (agent?.status === "loggedOut") return

	// Reconnect for any temporary disconnect (connection lost, restart required, stream error, etc.)
	const mode = manager.getAgentMode(userId)
	const reconnectPhone =
		mode === "pairing-code" ? (agent?.phoneNumber ?? null) : null

	logger.info(
		`[${userId}] Reconnecting in 3s (mode: ${mode}, phone: ${reconnectPhone ?? "none"})...`,
	)
	await new Promise((resolve) => setTimeout(resolve, 3000))

	const freshAgent = getAgent(userId)
	if (!freshAgent || freshAgent.status === "loggedOut") return

	void manager.startAgent(userId, reconnectPhone)
}

function isLogoutReason(statusCode?: number): boolean {
	return (
		statusCode === DisconnectReason.loggedOut ||
		statusCode === DisconnectReason.forbidden
	)
}
