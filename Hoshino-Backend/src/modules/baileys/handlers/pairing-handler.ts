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
	// Guard clause: Mode check
	if (manager.getAgentMode(userId) !== "pairing-code") {
		logger.info(
			`[${userId}] Skipping pairing code request: agent is in QR mode`,
		)
		return
	}

	// Guard clauses: skip if already registered or phone number is absent
	if (auth.state.creds.registered) {
		logger.info(
			`[${userId}] Skipping pairing code request: creds already registered`,
		)
		return
	}
	if (!phoneNumber) {
		logger.info(
			`[${userId}] Skipping pairing code request: no phone number provided`,
		)
		return
	}

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
