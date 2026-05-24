import { Elysia } from 'elysia'
import BaileysManager from '@modules/baileys/main'
import { getAgent } from '@modules/baileys/agent'

export const wsRoute = new Elysia({ prefix: '/ws' })
    .ws('/agent/:userId', {
        open(ws) {
            const userId = ws.data.params.userId
            const agent  = getAgent(userId)

            if (!agent) {
                ws.send(JSON.stringify({ event: 'error', data: { message: 'Agent not found' } }))
                ws.close()
                return
            }
            BaileysManager.setWSClient(userId, ws.raw as unknown as any)
            logger.info('/routes/ws.route.ts', `[${userId}] WS client connected`)
            const qr   = BaileysManager.getQR(userId)
            const code = BaileysManager.getPairingCode(userId)

            if (qr) {
                ws.send(JSON.stringify({ event: 'qr', data: { qr } }))
            }
            if (code) {
                ws.send(JSON.stringify({ event: 'pairing-code', data: { code } }))
            }
        },

        close(ws) {
            const userId = ws.data.params.userId
            BaileysManager.removeWSClient(userId)
            logger.info('/routes/ws.route.ts', `[${userId}] WS client disconnected`)
        },

        message(ws, message) {
            const userId = ws.data.params.userId
            logger.info('/routes/ws.route.ts', `[${userId}] Message: ${JSON.stringify(message)}`)
        }
    })