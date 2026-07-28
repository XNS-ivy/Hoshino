import { bootAllAgents } from "@modules/baileys/agent"
import baileysManager from "@modules/baileys/socket"
import qrcode from "qrcode-terminal"
import { server } from "./server"

async function main() {
	await Promise.all([bootAllAgents(), server])

	baileysManager.onPairingCode = (userId, code, isFromTerminal) => {
		if (!isFromTerminal) return
		logger.info(
			`ON TERMINAL Pairing Code For : [${userId}] Pairing code: ${code.split("").join(" ")}`,
		)
	}

	baileysManager.onQRCode = (userId, qr, isFromTerminal) => {
		if (!isFromTerminal) return
		logger.info(`ON TERMINAL QRCODE FOR [${userId}] : `)
		qrcode.generate(qr, { small: true })
	}

	baileysManager.onConnected = (userId) => {
		logger.info(`[${userId}] Agent connected`)
	}
}

main()
