import type { WASocket } from "baileys"
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
	// Guard clauses: skip if already registered or phone number is absent
	if (auth.state.creds.registered) return
	if (!phoneNumber) return

	await new Promise((resolve) => setTimeout(resolve, 3000))

	const cleanPhone = phoneNumber.replace(/[^0-9]/g, "")
	const code = await sock.requestPairingCode(cleanPhone)

	manager.setPairingCode(userId, code)
	manager.onPairingCode?.(userId, code)
	manager.pushToClient(userId, "pairing-code", { code })
}
