import { getAgent } from "@modules/baileys/agent"
import baileysManager from "@modules/baileys/socket"
import type { ServerWebSocket } from "bun"
import { Elysia } from "elysia"
import QRCode from "qrcode"

export const wsRoute = new Elysia({ prefix: "/ws" }).ws("/agent/:userId", {
	async open(ws) {
		const userId = ws.data.params.userId
		const agent = getAgent(userId)

		if (!agent) {
			ws.send(
				JSON.stringify({
					event: "error",
					data: { message: "Agent not found" },
				}),
			)
			ws.close()
			return
		}

		baileysManager.setWSClient(
			userId,
			ws.raw as unknown as ServerWebSocket<unknown>,
		)
		logger.info(`[${userId}] WS client connected`)

		const qr = baileysManager.getQR(userId)
		const code = baileysManager.getPairingCode(userId)

		if (code) {
			ws.send(JSON.stringify({ event: "pairing-code", data: { code } }))
		} else if (qr) {
			let url = ""
			try {
				url = await QRCode.toDataURL(qr)
			} catch {
				// Ignore error
			}
			ws.send(JSON.stringify({ event: "qr", data: { qr, url } }))
		}
	},

	close(ws) {
		const userId = ws.data.params.userId
		baileysManager.removeWSClient(userId)
		logger.info(`[${userId}] WS client disconnected`)
	},

	message(ws, message) {
		const userId = ws.data.params.userId
		logger.info(`[${userId}] Message: ${JSON.stringify(message)}`)
	},
})
