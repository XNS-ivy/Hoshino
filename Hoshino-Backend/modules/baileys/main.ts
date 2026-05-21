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

const runningSockets = new Map<string, WASocket>()

async function startAgent(userId: string, phoneNumber: string | null) {
    if (runningSockets.has(userId)) {
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

    runningSockets.set(userId, sock)
    sock.ev.on('creds.update', auth.saveCreds)

    if (!auth.state.creds.registered && phoneNumber) {
        await new Promise(r => setTimeout(r, 3000))
        const code = await sock.requestPairingCode(
            phoneNumber.replace(/[^0-9]/g, '')
        )
        console.log(`[${userId}] Pairing code: ${code}`)
        onPairingCode?.(userId, code)
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

            runningSockets.delete(userId)

            if (loggedOut) {
                console.log(`[${userId}] Logged out`)
                updateAgentStatus(userId, 'loggedOut')
                cleanAgentAuth(userId)
            } else {
                console.log(`[${userId}] Reconnecting...`)
                startAgent(userId, phoneNumber)
            }
        }
    })
}

// --- Callbacks ---
export let onPairingCode: ((userId: string, code: string) => void) | undefined

// --- Boot: load all active agent ---
export async function bootAllAgents() {
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
                await startAgent(agent.userId, agent.phoneNumber)
            } else {
                console.log(`[${agent.userId}] Auth missing & no phone number, skip`)
                updateAgentStatus(agent.userId, 'loggedOut')
            }
            continue
        }
        await startAgent(agent.userId, agent.phoneNumber)
    }
    console.log(`Boot complete, ${getRunningAgents().length} agent running`)
}

// --- Public API ---
export async function registerAgent(userId: string, phoneNumber: string | null) {
    addAgent(userId, phoneNumber)
    await startAgent(userId, phoneNumber)
}

export async function reRegisterAgent(userId: string, phoneNumber: string | null) {
    cleanAgentAuth(userId)
    updateAgentStatus(userId, 'active')

    await startAgent(userId, phoneNumber)
}

export function stopAgent(userId: string) {
    runningSockets.get(userId)?.end(undefined)
    runningSockets.delete(userId)
    removeAgent(userId)
    cleanAgentAuth(userId)
}

export function getRunningAgents() {
    return [...runningSockets.keys()]
}

export function isRunning(userId: string) {
    return runningSockets.has(userId)
}