import type { WASocket } from "baileys"
import { getAgent } from "../agent"
import type { ImprovedAuth } from "../auth"
import type { BaileysManager } from "../socket"

/**
 * Handles requesting and dispatching pairing code for unregistered agents with a phone number.
 */
export async function handlePairingCode(
	sock: WASocket,
	userId: string,
	phoneNumber: string | null,
	auth: ImprovedAuth,
	manager: BaileysManager,
): Promise<void> {
	// Guard clauses: silent return if already registered, not in pairing-code mode, or missing phone number
	if (auth.state.creds.registered) return
	if (manager.getAgentMode(userId) !== "pairing-code") return
	if (!phoneNumber) return

	logger.info(
		`[${userId}] Requesting pairing code for phone: ${phoneNumber}...`,
	)
	await new Promise((resolve) => setTimeout(resolve, 3000))

	const cleanPhone = phoneNumber.replace(/[^0-9]/g, "")
	const code = await sock.requestPairingCode(cleanPhone)

	logger.info(`[${userId}] Pairing code generated: ${code}`)

	const agent = getAgent(userId)
	const isFromTerminal = agent?.isFromTerminal ?? false

	manager.clearQR(userId) // Ensure any QR is cleared when pairing code is active
	manager.setPairingCode(userId, code)
	manager.onPairingCode?.(userId, code, isFromTerminal)
	manager.pushToClient(userId, "pairing-code", { code })
}
