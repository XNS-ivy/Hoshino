import { makeWASocket, Browsers, fetchLatestWaWebVersion, DisconnectReason } from 'baileys'
import type { WASocket } from 'baileys'
import { Boom } from '@hapi/boom'
import { pino } from 'pino'
import path from 'path'
import { ImprovedAuth } from './auth'
import qrcode from 'qrcode-terminal'

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
            console.warn(`[${userId}] Already running`)
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
            console.log(`[${userId}] Pairing code: ${code}`)
            this.onPairingCode?.(userId, code)
        }

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update

            if (qr) {
                console.log(qrcode.generate(qr, { small: true }))
            }
            if (connection === 'open') {
                console.log(`[${userId}] Connected`)
                updateAgentStatus(userId, 'active')
            }

            if (connection === 'close') {
                const code = (lastDisconnect?.error as Boom)?.output?.statusCode
                const loggedOut = code === DisconnectReason.loggedOut

                this.runningSockets.delete(userId)

                if (loggedOut) {
                    console.log(`[${userId}] Logged out`)
                    updateAgentStatus(userId, 'loggedOut')
                    cleanAgentAuth(userId)
                } else {
                    console.log(`[${userId}] Reconnecting...`)
                    this.startAgent(userId, phoneNumber)
                }
            }
        })
    }

    async bootAllAgents() {
        const agents = getAllAgents()

        for (const agent of agents) {
            if (agent.status === 'loggedOut') {
                if (isAuthExists(agent.userId)) {
                    console.log(`[${agent.userId}] Auth residue found, cleaning...`)
                    cleanAgentAuth(agent.userId)
                }
                continue
            }

            if (!isAuthExists(agent.userId)) {
                if (agent.phoneNumber) {
                    console.log(`[${agent.userId}] Auth lost, will request reconnect`)
                    await this.startAgent(agent.userId, agent.phoneNumber)
                } else {
                    console.log(`[${agent.userId}] Auth missing & no phone number, skip`)
                    updateAgentStatus(agent.userId, 'loggedOut')
                }
                continue
            }
            await this.startAgent(agent.userId, agent.phoneNumber)
        }
        console.log(`Boot complete, ${this.getRunningAgents().length} agent running`)
    }

    async registerAgent(userId: string, phoneNumber: string | null) {
        addAgent(userId, phoneNumber)
        await this.startAgent(userId, phoneNumber)
    }

    async reRegisterAgent(userId: string, phoneNumber: string | null) {
        cleanAgentAuth(userId)
        updateAgentStatus(userId, 'active')
        await this.startAgent(userId, phoneNumber)
    }

    stopAgent(userId: string) {
        this.runningSockets.get(userId)?.end(undefined)
        this.runningSockets.delete(userId)
        removeAgent(userId)
        cleanAgentAuth(userId)
    }

    getRunningAgents() {
        return [...this.runningSockets.keys()]
    }

    isRunning(userId: string) {
        return this.runningSockets.has(userId)
    }
}

export default new BaileysManager()