import type { Boom } from "@hapi/boom"
import { agentRepository } from "@repositories/agent.repository"
import { commandRepository } from "@repositories/command.repository"
import { wsManager } from "@services/wsManager"
import { logger } from "@utils/logger"
import { type ConnectionState, DisconnectReason, type WASocket } from "baileys"
import type { AgentSession } from "../types"

export interface ConnectionHandlerContext {
	sock: WASocket
	safeAgentId: string
	agentName: string
	agentPhoneNumber?: string
	sessionInfo: AgentSession
	sessions: Map<string, WASocket>
	isStopping: Set<string>
	reconnectAttempts: Map<string, number>
	clearSession: () => Promise<void>
	onReconnect: () => Promise<void>
}

/**
 * Handles pairing code generation flow for unregistered credentials with a phone number.
 */
export async function requestPairingCode(
	sock: WASocket,
	safeAgentId: string,
	agentName: string,
	agentPhoneNumber: string,
	sessionInfo: AgentSession,
	isStopping: Set<string>,
): Promise<void> {
	if (isStopping.has(safeAgentId)) return

	try {
		const cleanPhone = agentPhoneNumber.replace(/[^0-9]/g, "")
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
			"/modules/baileys/handlers/connection.handler.ts",
			`Pairing code generated for Agent [${agentName}]: ${pairingCode}`,
		)
	} catch (error) {
		const errMsg = error instanceof Error ? error.message : String(error)
		if (errMsg.includes("Cancelled") || errMsg.includes("Connection Closed")) {
			logger.warn(
				"/modules/baileys/handlers/connection.handler.ts",
				`Pairing code request cancelled for Agent [${agentName}]`,
			)
			return
		}

		logger.error(
			"/modules/baileys/handlers/connection.handler.ts",
			`Failed to request pairing code for Agent [${agentName}]: ${error}`,
		)
	}
}

/**
 * Handles QR code generation update.
 */
async function handleQrUpdate(
	qr: string,
	ctx: ConnectionHandlerContext,
): Promise<void> {
	const { safeAgentId, agentName, agentPhoneNumber, sessionInfo } = ctx

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
		"/modules/baileys/handlers/connection.handler.ts",
		`QR code generated for Agent [${agentName}]`,
	)
}

/**
 * Handles closed connection, evaluating reconnect backoff vs logged out session cleanup.
 */
async function handleConnectionClose(
	lastDisconnect: ConnectionState["lastDisconnect"],
	ctx: ConnectionHandlerContext,
): Promise<void> {
	const {
		safeAgentId,
		agentName,
		agentPhoneNumber,
		sessionInfo,
		sessions,
		isStopping,
		reconnectAttempts,
		clearSession,
		onReconnect,
	} = ctx

	sessions.delete(safeAgentId)

	if (isStopping.has(safeAgentId)) {
		isStopping.delete(safeAgentId)
		reconnectAttempts.delete(safeAgentId)
		logger.system(
			"/modules/baileys/handlers/connection.handler.ts",
			`Agent [${agentName}] connection closed manually. Reconnect skipped.`,
		)
		return
	}

	const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
	const shouldReconnect = statusCode !== DisconnectReason.loggedOut

	if (shouldReconnect) {
		const attempts = (reconnectAttempts.get(safeAgentId) ?? 0) + 1
		reconnectAttempts.set(safeAgentId, attempts)
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
			"/modules/baileys/handlers/connection.handler.ts",
			`Agent [${agentName}] connection closed. Reconnecting in ${delay / 1000}s (attempt ${attempts})...`,
		)

		setTimeout(async () => {
			if (!isStopping.has(safeAgentId)) {
				await onReconnect()
			}
		}, delay)
		return
	}

	// Logged out: wipe session
	reconnectAttempts.delete(safeAgentId)
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
		"/modules/baileys/handlers/connection.handler.ts",
		`Agent [${agentName}] logged out. Cleared DB session.`,
	)
}

/**
 * Handles successful connection opening.
 */
async function handleConnectionOpen(
	ctx: ConnectionHandlerContext,
): Promise<void> {
	const {
		sock,
		safeAgentId,
		agentName,
		agentPhoneNumber,
		sessionInfo,
		reconnectAttempts,
	} = ctx

	reconnectAttempts.delete(safeAgentId)
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
		"/modules/baileys/handlers/connection.handler.ts",
		`Agent [${agentName}] connection opened successfully`,
	)

	const rawOwnerJid = sock.user?.id || sock.user?.lid
	if (rawOwnerJid) {
		const ownerJid = commandRepository.normalizeJid(rawOwnerJid)
		await commandRepository.addOwner(safeAgentId, ownerJid, "master")
	}
}

/**
 * Main dispatcher for 'connection.update' events using clean guard clauses.
 */
export async function handleConnectionUpdate(
	update: Partial<ConnectionState>,
	ctx: ConnectionHandlerContext,
): Promise<void> {
	const { connection, lastDisconnect, qr } = update
	const { sock, agentPhoneNumber } = ctx

	if (qr && !agentPhoneNumber && !sock.authState.creds.registered) {
		await handleQrUpdate(qr, ctx)
	}

	if (connection === "close") {
		await handleConnectionClose(lastDisconnect, ctx)
		return
	}

	if (connection === "open") {
		await handleConnectionOpen(ctx)
	}
}
