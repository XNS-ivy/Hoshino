import { makeWASocket, Browsers, fetchLatestWaWebVersion } from 'baileys'
import type { WASocket } from 'baileys'
import { db } from '@modules/database/connection'
import { redis } from '@modules/database/redis'
import { usePostgresAuthState, initDatabase } from '@modules/database/auth-state'
import { pino } from 'pino'

class Whatsapp {
    private sock: WASocket | null = null
    private phoneNumber: string = process.env.PHONE_NUMBER || '1234567890'

    constructor() { }

    async start() {
        try {
            await db.connect()
            await redis.connect()
            await initDatabase()
            await this.init()
        } catch (error) {
            console.error('Failed to start Whatsapp:', error)
            process.exit(1)
        }
    }

    private async init() {
        const { state, saveCreds } = await usePostgresAuthState(this.phoneNumber)

        this.sock = makeWASocket({
            auth: state,
            browser: Browsers.ubuntu('Chrome'),
            version: (await fetchLatestWaWebVersion()).version,
            logger: pino({ level: 'silent' })
        })

        // Save credentials when connection updates
        this.sock.ev.on('creds.update', saveCreds)

        // Handle connection updates
        this.sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update
            if (connection === 'close') {
                const code = (lastDisconnect?.error as any)?.output?.statusCode
                console.log('Connection closed with code:', code)
                if (code !== 401) {
                    await this.start()
                }
            } else if (connection === 'open') {
                console.log('Bot connected!')
            }
        })

        // Handle messages
        this.sock.ev.on('messages.upsert', async (m) => {
            console.log('New message:', m)
        })
    }
}

const Hoshino = new Whatsapp()
export default Hoshino