import { Elysia, t } from 'elysia'
import BaileysManager from '@modules/baileys/main'
import { getAllAgents, getAgent } from '@modules/baileys/agent'
import QRCode from 'qrcode'

export const agentRoute = new Elysia({ prefix: '/agent' })

    .post('/register', async ({ body }) => {
        const existing = getAgent(body.userId)
        if (existing) {
            return { success: false, message: `Agent ${body.userId} already exists` }
        }

        await BaileysManager.registerAgent(body.userId, body.phoneNumber ?? null)

        return {
            success: true,
            method: body.phoneNumber ? 'pairing-code' : 'qr',
            message: body.phoneNumber
                ? 'Agent registered, check pairing code via GET /agent/:userId/pairing-code'
                : 'Agent registered, scan QR via GET /agent/:userId/qr'
        }
    }, {
        body: t.Object({
            userId: t.String(),
            phoneNumber: t.Optional(t.String())
        })
    })

    .post('/reregister', async ({ body }) => {
        const agent = getAgent(body.userId)
        if (!agent) {
            return { success: false, message: 'Agent not found' }
        }
        if (agent.status !== 'loggedOut') {
            return { success: false, message: 'Agent is not logged out' }
        }

        await BaileysManager.reRegisterAgent(body.userId, body.phoneNumber ?? null)
        return { success: true, message: 'Agent re-registered' }
    }, {
        body: t.Object({
            userId: t.String(),
            phoneNumber: t.Optional(t.String())
        })
    })

    .get('/:userId/status', ({ params }) => {
        const agent = getAgent(params.userId)
        if (!agent) {
            return { success: false, message: 'Agent not found' }
        }

        return {
            success: true,
            data: {
                ...agent,
                running: BaileysManager.getAgentStatus(params.userId)
            }
        }
    })

    .get('/:userId/qr', async ({ params, set }) => {
        const qr = BaileysManager.getQR(params.userId)

        if (!qr) {
            set.status = 404
            return { success: false, message: 'QR not available or agent already connected' }
        }

        const base64 = await QRCode.toDataURL(qr)
        return { success: true, data: base64 }
    })

    .get('/:userId/qr/image', async ({ params, set }) => {
        const qr = BaileysManager.getQR(params.userId)

        if (!qr) {
            set.status = 404
            return { success: false, message: 'QR not available or agent already connected' }
        }

        const buffer = await QRCode.toBuffer(qr, { type: 'png', width: 300 })
        set.headers['Content-Type'] = 'image/png'
        return buffer
    })

    .get('/:userId/pairing-code', ({ params }) => {
        const agent = getAgent(params.userId)
        if (!agent) {
            return { success: false, message: 'Agent not found' }
        }

        const code = BaileysManager.getPairingCode(params.userId)
        if (!code) {
            return { success: false, message: 'Pairing code not available or already connected' }
        }

        return { success: true, data: code }
    })

    .get('/list', () => {
        const agents = getAllAgents()
        return {
            success: true,
            data: agents.map(a => ({
                ...a,
                running: BaileysManager.getAgentStatus(a.userId)
            }))
        }
    })

    .delete('/:userId', ({ params }) => {
        const agent = getAgent(params.userId)
        if (!agent) {
            return { success: false, message: 'Agent not found' }
        }

        BaileysManager.deleteAgent(params.userId)
        return { success: true, message: 'Agent deleted' }
    })