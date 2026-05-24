import { makeWASocket, Browsers, fetchLatestWaWebVersion, DisconnectReason } from 'baileys'
import type { WASocket } from 'baileys'
import { Boom } from '@hapi/boom'
import { pino } from 'pino'
import path from 'path'
import { ImprovedAuth } from './auth'
import type { ServerWebSocket } from 'bun'
import NodeCache from 'node-cache'

import {
    getAllAgents,
    addAgent,
    updateAgentStatus,
    removeAgent,
    cleanAgentAuth,
    isAuthExists,
    cleanOrphanAuth,
    updateAgentPhone,
    getAgentConfig,
} from './agent'

import { message as messageParse } from '@modules/baileys/mesage-parse'
import command from '@modules/handlers/commands-loader'

class BaileysManager {
    private runningSockets = new Map<string, WASocket>()
    private qrStore = new Map<string, string>()
    private pairingStore = new Map<string, string>()
    private wsClients = new Map<string, ServerWebSocket<any>>()

    onPairingCode: ((userId: string, code: string) => void) | undefined
    onQRCode: ((userId: string, qr: string) => void) | undefined
    onConnected: ((userId: string) => void) | undefined

    private async startAgent(userId: string, phoneNumber: string | null) {
        if (this.runningSockets.has(userId)) {
            logger.warn(`/modules/baileys/main.ts`, `[${userId}] Already running`)
            return
        }
        const groupCache = new NodeCache({ stdTTL: 300, checkperiod: 60 })
        const auth = new ImprovedAuth(path.resolve(`./auth/${userId}`))
        const { version } = await fetchLatestWaWebVersion()

        const sock = makeWASocket({
            version,
            auth: auth.state,
            browser: Browsers.appropriate('Chrome'),
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            cachedGroupMetadata: async (jid) => groupCache.get(jid) ?? undefined
        })

        this.runningSockets.set(userId, sock)
        sock.ev.on('creds.update', auth.saveCreds)

        if (!auth.state.creds.registered && phoneNumber) {
            await new Promise(r => setTimeout(r, 3000))
            const code = await sock.requestPairingCode(
                phoneNumber.replace(/[^0-9]/g, '')
            )
            this.pairingStore.set(userId, code)
            this.onPairingCode?.(userId, code)
            this.pushToClient(userId, 'pairing-code', { code })
        }

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update

            if (qr) {
                this.qrStore.set(userId, qr)
                this.onQRCode?.(userId, qr)
                this.pushToClient(userId, 'qr', { qr })
            }

            switch (connection) {
                case 'open':
                    this.qrStore.delete(userId)
                    this.pairingStore.delete(userId)
                    this.onConnected?.(userId)
                    this.pushToClient(userId, 'connected', {
                        name: sock?.user?.name,
                    })
                    logger.info(`/modules/baileys/main.ts`, `[${userId}] Connected With : ${sock?.user?.name} Phone Number : ${String(await sock.signalRepository.lidMapping.getPNForLID(sock.user?.lid ?? ''))?.split('@')[0]?.split(":")[0]}`)
                    updateAgentStatus(userId, 'active')
                    await command.initOwner(sock, userId)

                    if (!phoneNumber) {
                        try {
                            const pn = await sock.signalRepository.lidMapping.getPNForLID(sock.user?.lid ?? '')
                            if (pn) {
                                const phone = pn.split('@')[0]?.split(":")[0]
                                if (phone) {
                                    updateAgentPhone(userId, phone)
                                    phoneNumber = phone
                                    logger.info(`/modules/baileys/main.ts`, `[${userId}] Phone updated: ${phone}`)
                                }
                            }
                        } catch (err) {
                            logger.error(`/modules/baileys/main.ts`, `[${userId}] Failed to get PN from LID: ${err}`)
                        }
                    }
                    break
                case 'close':
                    {
                        const disconnected = (lastDisconnect?.error && 'output' in lastDisconnect.error)
                            ? (lastDisconnect.error as Boom).output?.statusCode
                            : undefined
                        logger.info(`/modules/baileys/main.ts`, `[${userId}] Disconnected : ${lastDisconnect?.error?.message}`)
                        this.qrStore.delete(userId) /* quard for qrstore */
                        this.runningSockets.delete(userId) /* this function is for socket guard while agent is disconnected */
                        this.pushToClient(userId, 'disconnected', {
                            reason: (lastDisconnect?.error as Boom)?.output?.statusCode
                        })
                        switch (disconnected) {
                            case DisconnectReason.loggedOut:
                            case DisconnectReason.forbidden:
                                logger.info(`/modules/baileys/main.ts`, `[${userId}] ${lastDisconnect?.error?.message}`)
                                updateAgentStatus(userId, 'loggedOut')
                                cleanAgentAuth(userId)
                                break
                            case DisconnectReason.restartRequired:
                            case DisconnectReason.connectionLost:
                            case DisconnectReason.unavailableService:
                            case DisconnectReason.connectionClosed:
                            case DisconnectReason.multideviceMismatch:
                            case DisconnectReason.connectionReplaced:
                            case DisconnectReason.badSession:
                                logger.info(`/modules/baileys/main.ts`, `[${userId}] Reconnecting...`)
                                this.startAgent(userId, phoneNumber)
                                break
                            default:
                                logger.warn(`/modules/baileys/main.ts`, `[${userId}] Unknown disconnect reason: ${disconnected}, reconnecting...`)
                                this.startAgent(userId, phoneNumber)
                                break
                        }
                        break
                    }
                default:
                    break
            }
        })

        sock.ev.on('messages.upsert', async (messageContainer) => {
            const { messages, type } = messageContainer
            for (const msg of messages) {
                if (type !== 'notify') continue

                try {
                    const parsed = await messageParse.fetch(msg, sock, userId)
                    if (!parsed) continue

                    if (!parsed.isGroupAllowed && !parsed.isAdmin) continue // bypass for admin use only

                    await command.execute(parsed, sock, userId)
                } catch (err: any) {
                    logger.error(`/modules/baileys/main.ts`, `[${userId}] Message processing error: ${err?.message}`)
                }
            }
        })

        sock.ev.on('groups.update', (updates) => {
            for (const update of updates) {
                if (!update.id) continue
                const cached = groupCache.get<any>(update.id)
                if (cached) groupCache.set(update.id, { ...cached, ...update })
            }
        })

        sock.ev.on('group-participants.update', async ({ id }) => {
            try {
                const meta = await sock.groupMetadata(id)
                groupCache.set(id, meta)
            } catch { }
        })
    }

    async bootAllAgents() {
        cleanOrphanAuth()
        const agents = getAllAgents()

        for (const agent of agents) {
            if (agent.status === 'loggedOut') {
                if (isAuthExists(agent.userId)) {
                    logger.info('/modules/baileys/main.ts', `[${agent.userId}] Auth residue found, cleaning...`)
                    cleanAgentAuth(agent.userId)
                }
                continue
            }

            if (!isAuthExists(agent.userId)) {
                if (agent.phoneNumber) {
                    logger.info('/modules/baileys/main.ts', `[${agent.userId}] Auth lost, will request reconnect`)
                    await this.startAgent(agent.userId, agent.phoneNumber)
                } else {
                    logger.info('/modules/baileys/main.ts', `[${agent.userId}] Auth missing & no phone number, skip`)
                    updateAgentStatus(agent.userId, 'loggedOut')
                }
                continue
            }
            await this.startAgent(agent.userId, agent.phoneNumber)
        }
        logger.info('/modules/baileys/main.ts', `Boot complete, ${this.getRunningAgents().length} agent running`)
    }

    /** @method registerAgent - this for register a new agent */
    async registerAgent(userId: string, phoneNumber: string | null) {
        addAgent(userId, phoneNumber)
        await this.startAgent(userId, phoneNumber)
    }

    /** @method reRegisterAgent - registering again for logged out agent */
    async reRegisterAgent(userId: string, phoneNumber: string | null) {
        cleanAgentAuth(userId)
        updateAgentStatus(userId, 'active')
        await this.startAgent(userId, phoneNumber)
    }

    /** @method deleteAgent - this for deleting agent */
    async deleteAgent(userId: string) {
        await this.runningSockets.get(userId)?.logout()
        this.runningSockets.get(userId)?.end(undefined)
        this.runningSockets.delete(userId)
        removeAgent(userId)
        cleanAgentAuth(userId)
    }

    /** @method getRunningAgents - method for get running all agent */
    getRunningAgents() {
        return [...this.runningSockets.keys()]
    }

    /** @method getAgentStatus - check the status of specific agent */
    getAgentStatus(userId: string) {
        return this.runningSockets.has(userId)
    }

    /** @member getSocket - this just getting socket from user agent */
    getSocket(userId: string): WASocket | null {
        return this.runningSockets.get(userId) ?? null
    }

    /** @member getAllSockets - this just getting socket from all agent */
    getAllSockets(): Map<string, WASocket> {
        return this.runningSockets
    }

    getQR(userId: string): string | null {
        return this.qrStore.get(userId) ?? null
    }

    getPairingCode(userId: string): string | null {
        return this.pairingStore.get(userId) ?? null
    }
    setWSClient(userId: string, ws: ServerWebSocket<any>) {
        this.wsClients.set(userId, ws)
    }

    removeWSClient(userId: string) {
        this.wsClients.delete(userId)
    }

    private pushToClient(userId: string, event: string, data: unknown) {
        const ws = this.wsClients.get(userId)
        if (ws && ws.readyState === 1) {
            ws.send(JSON.stringify({ event, data }))
        }
    }
}

export default new BaileysManager()