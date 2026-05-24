import { Elysia, t } from 'elysia'
import BaileysManager from '@modules/baileys/main'
import { getAllAgents, getAgent, updateAgentConfig, getAgentConfig, getAgentCommands, updateCommandStatus } from '@modules/baileys/agent'
import { ownerDb } from '@modules/databases-handler/ownerDB'
import { groupDb } from '@modules/databases-handler/groupDB'
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

    // ────────────────────────────────────────────────────────────────
    // Config Management Routes
    // ────────────────────────────────────────────────────────────────

    .get('/:userId/config', ({ params }) => {
        const agent = getAgent(params.userId)
        if (!agent) {
            return { success: false, message: 'Agent not found' }
        }
        return { success: true, data: { prefix: agent.prefix } }
    })

    .put('/:userId/config',
        async ({ params, body }) => {
            const agent = getAgent(params.userId)
            if (!agent) {
                return { success: false, message: 'Agent not found' }
            }
            if (body.prefix) {
                updateAgentConfig(params.userId, { prefix: body.prefix })
            }
            const updated = getAgent(params.userId)
            return { success: true, data: { prefix: updated?.prefix ?? '.' } }
        },
        {
            body: t.Partial(t.Object({
                prefix: t.String({ minLength: 1, maxLength: 5 }),
            }))
        }
    )

    // ────────────────────────────────────────────────────────────────
    // Owner Management Routes
    // ────────────────────────────────────────────────────────────────

    .get('/:userId/owner/list', async ({ params }) => {
        const agent = getAgent(params.userId)
        if (!agent) return { success: false, message: 'Agent not found' }
        const owners = await ownerDb.getAll(params.userId)
        return { success: true, data: owners }
    })

    .post('/:userId/owner/add',
        async ({ params, body }) => {
            const agent = getAgent(params.userId)
            if (!agent) return { success: false, message: 'Agent not found' }
            try {
                await ownerDb.addOwner(body.lid, body.level, params.userId)
                return { success: true, message: `Owner ${body.lid} added as ${body.level}` }
            } catch (err: any) {
                return { success: false, message: err.message }
            }
        },
        {
            body: t.Object({
                lid: t.String(),
                level: t.Union([t.Literal('owner'), t.Literal('master')])
            })
        }
    )

    .delete('/:userId/owner/:lid', async ({ params }) => {
        const agent = getAgent(params.userId)
        if (!agent) return { success: false, message: 'Agent not found' }
        try {
            await ownerDb.removeOwner(params.lid, params.userId)
            return { success: true, message: `Owner ${params.lid} removed` }
        } catch (err: any) {
            return { success: false, message: err.message }
        }
    })

    .put('/:userId/owner/:lid/level',
        async ({ params, body }) => {
            const agent = getAgent(params.userId)
            if (!agent) return { success: false, message: 'Agent not found' }
            try {
                await ownerDb.changeLevel(params.lid, body.level, params.userId)
                return { success: true, message: `Owner ${params.lid} level changed to ${body.level}` }
            } catch (err: any) {
                return { success: false, message: err.message }
            }
        },
        {
            body: t.Object({
                level: t.Union([t.Literal('owner'), t.Literal('master')])
            })
        }
    )

    // ────────────────────────────────────────────────────────────────
    // Group Allowlist Management Routes
    // ────────────────────────────────────────────────────────────────

    .get('/:userId/group/allowlist', async ({ params }) => {
        const agent = getAgent(params.userId)
        if (!agent) return { success: false, message: 'Agent not found' }
        const groups = await groupDb.getAll(params.userId)
        return { success: true, data: groups }
    })

    .post('/:userId/group/allow',
        async ({ params, body }) => {
            const agent = getAgent(params.userId)
            if (!agent) return { success: false, message: 'Agent not found' }
            try {
                await groupDb.allow(body.groupJid, params.userId)
                return { success: true, message: `Group ${body.groupJid} added to allowlist` }
            } catch (err: any) {
                return { success: false, message: err.message }
            }
        },
        {
            body: t.Object({ groupJid: t.String() })
        }
    )

    .delete('/:userId/group/:groupJid', async ({ params }) => {
        const agent = getAgent(params.userId)
        if (!agent) return { success: false, message: 'Agent not found' }
        try {
            await groupDb.disallow(params.groupJid, params.userId)
            return { success: true, message: `Group ${params.groupJid} removed` }
        } catch (err: any) {
            return { success: false, message: err.message }
        }
    })

    // ────────────────────────────────────────────────────────────────
    // Command Management Routes
    // ────────────────────────────────────────────────────────────────

    .get('/:userId/commands', ({ params }) => {
        const commands = getAgentCommands(params.userId)
        return { success: true, data: commands }
    })

    .put('/:userId/commands/:commandName',
        async ({ params, body }) => {
            const agent = getAgent(params.userId)
            if (!agent) {
                return { success: false, message: 'Agent not found' }
            }
            updateCommandStatus(params.userId, params.commandName, body.status)
            const updated = getAgentCommands(params.userId)
            return { success: true, data: updated }
        },
        {
            body: t.Object({
                status: t.Union([t.Literal('enabled'), t.Literal('disabled')])
            })
        }
    )