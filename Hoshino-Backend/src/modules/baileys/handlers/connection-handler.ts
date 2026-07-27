import type { Boom } from "@hapi/boom"
import { type ConnectionState, DisconnectReason, type WASocket } from "baileys"
import { cleanAgentAuth, updateAgentPhone, updateAgentStatus } from "../agent"
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
			handleQrUpdate(userId, qr, manager)
		}

		if (connection === "open") {
			await handleOpenConnection(sock, userId, phoneNumber, manager)
			return
		}

		if (connection === "close") {
			handleCloseConnection(userId, phoneNumber, lastDisconnect, manager)
		}
	})
}

function handleQrUpdate(
	userId: string,
	qr: string,
	manager: BaileysManager,
): void {
	manager.setQR(userId, qr)
	manager.onQRCode?.(userId, qr)
	manager.pushToClient(userId, "qr", { qr })
}

async function handleOpenConnection(
	sock: WASocket,
	userId: string,
	phoneNumber: string | null,
	manager: BaileysManager,
): Promise<void> {
	manager.clearConnectionInfo(userId)
	manager.onConnected?.(userId)
	manager.pushToClient(userId, "connected", { name: sock.user?.name })

	const lid = sock.user?.lid ?? ""
	const pnRaw = await sock.signalRepository?.lidMapping?.getPNForLID?.(lid)
	const parsedPhone = pnRaw?.split("@")[0]?.split(":")[0] ?? ""

	logger.info(
		`[${userId}] Connected With : ${sock.user?.name ?? "Unknown"} Phone Number : ${parsedPhone}`,
	)

	updateAgentStatus(userId, "active")
	await commandLoader.initOwner?.(sock, userId)

	// Guard: skip phone sync if phone number is already set
	if (phoneNumber) return

	await syncPhoneNumberFromLid(sock, userId, lid)
}

async function syncPhoneNumberFromLid(
	sock: WASocket,
	userId: string,
	lid: string,
): Promise<void> {
	try {
		const pn = await sock.signalRepository?.lidMapping?.getPNForLID?.(lid)
		const phone = pn?.split("@")[0]?.split(":")[0]
		if (!phone) return

		updateAgentPhone(userId, phone)
		logger.info(`[${userId}] Phone updated: ${phone}`)
	} catch (err) {
		logger.error(`[${userId}] Failed to get PN from LID: ${err}`)
	}
}

function handleCloseConnection(
	userId: string,
	phoneNumber: string | null,
	lastDisconnect: ConnectionState["lastDisconnect"],
	manager: BaileysManager,
): void {
	const err = lastDisconnect?.error as Boom | undefined
	const statusCode = err?.output?.statusCode
	const errorMessage = err?.message ?? "Unknown disconnect reason"

	logger.info(`[${userId}] Disconnected : ${errorMessage}`)

	// Socket guard cleanup
	manager.clearConnectionInfo(userId)
	manager.removeRunningSocket(userId)
	manager.pushToClient(userId, "disconnected", { reason: statusCode })

	// Guard clause: handle logout vs reconnect
	if (isLogoutReason(statusCode)) {
		logger.info(`[${userId}] ${errorMessage}`)
		updateAgentStatus(userId, "loggedOut")
		cleanAgentAuth(userId)
		return
	}

	logger.info(`[${userId}] Reconnecting...`)
	void manager.startAgent(userId, phoneNumber)
}

function isLogoutReason(statusCode?: number): boolean {
	return (
		statusCode === DisconnectReason.loggedOut ||
		statusCode === DisconnectReason.forbidden
	)
}
