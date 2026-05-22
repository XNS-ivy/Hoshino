import { makeWASocket, Browsers, fetchLatestWaWebVersion, DisconnectReason } from 'baileys'
import type { WASocket } from 'baileys'
import { Boom } from '@hapi/boom'
import { pino } from 'pino'
import path from 'path'
import { ImprovedAuth } from './auth'
import qrcode from 'qrcode-terminal'
import { convertLID } from './baileys-functions'

import {
    getAllAgents,
    addAgent,
    updateAgentStatus,
    removeAgent,
    cleanAgentAuth,
    isAuthExists
} from './agent'

class BaileysManager {
    private runningSockets = new Map<string, WASocket>()
    onPairingCode: ((userId: string, code: string) => void) | undefined

    private async startAgent(userId: string, phoneNumber: string | null) {
        if (this.runningSockets.has(userId)) {
            logger.warn(`/modules/baileys/main.ts`, `[${userId}] Already running`)
            return
        }

        const auth = new ImprovedAuth(path.resolve(`./auth/${userId}`))
        const { version } = await fetchLatestWaWebVersion()

        const sock = makeWASocket({
            version,
            auth: auth.state,
            browser: Browsers.appropriate('Chrome'),
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
        })

        this.runningSockets.set(userId, sock)
        sock.ev.on('creds.update', auth.saveCreds)

        if (!auth.state.creds.registered && phoneNumber) {
            await new Promise(r => setTimeout(r, 3000))
            const code = await sock.requestPairingCode(
                phoneNumber.replace(/[^0-9]/g, '')
            )
            logger.info(`/modules/baileys/main.ts`, `[${userId}] Pairing code: ${code.split('').join(' ')}`)
            // need future fix for sending to frontend console
            this.onPairingCode?.(userId, code)
        }

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update

            if (qr) {
                qrcode.generate(qr, { small: true })
                // need future fix for sending to frontend console
            }

            switch (connection) {
                case 'open':
                    logger.info(`/modules/baileys/main.ts`, `[${userId}] Connected With : ${sock?.user?.name} Lid : ${convertLID(sock?.user?.lid ?? null)}`)
                    updateAgentStatus(userId, 'active')
                    break

                case 'close':
                    {
                        const disconnected = (lastDisconnect?.error && 'output' in lastDisconnect.error)
                            ? (lastDisconnect.error as Boom).output?.statusCode
                            : undefined
                        logger.info(`/modules/baileys/main.ts`, `[${userId}] Disconnected : ${lastDisconnect?.error?.message}`)

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
                                break
                        }
                        break
                    }
                default:
                    break
            }
        })
    }

    async bootAllAgents() {
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
    deleteAgent(userId: string) {
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
}

export default new BaileysManager()