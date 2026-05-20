import { makeWASocket, Browsers, fetchLatestWaWebVersion } from 'baileys'
import type { WASocket } from 'baileys'
import { db } from '@modules/database/connection'
import { redis } from '@modules/database/redis'
import { usePostgresAuthState, initDatabase } from '@modules/database/auth-state'
import { pino } from 'pino'
import qrcode from 'qrcode-terminal'

class Whatsapp {
    private sock: WASocket | null = null
    private phoneNumber: string = process.env.PHONE_NUMBER || '1234567890'
    private reconnectAttempts = 0
    private maxReconnectAttempts = 5
    private isInitialConnection = true

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
            browser: Browsers.appropriate('Chrome'),
            version: (await fetchLatestWaWebVersion()).version,
            logger: pino({ level: 'silent' })
        })

        // Save credentials when connection updates
        this.sock.ev.on('creds.update', saveCreds)

        // Handle connection updates
        this.sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update
            
            // Display QR code if needed
            if (qr) {
                console.log('\n📱 Scan QR code to login:')
                console.log(qrcode.generate(qr, { small: true }))
                this.isInitialConnection = false
            }

            if (connection === 'open') {
                this.reconnectAttempts = 0
                console.log('✅ Bot connected!')
            } else if (connection === 'close') {
                const code = (lastDisconnect?.error as any)?.output?.statusCode
                const shouldReconnect = code && code !== 401
                
                if (code === 401) {
                    console.log('❌ Unauthorized (invalid credentials). Please scan QR code again.')
                    this.isInitialConnection = true
                } else if (this.isInitialConnection) {
                    console.log('⏳ Waiting for QR code scan...')
                    // Don't reconnect on first close if waiting for QR
                    return
                } else if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++
                    console.log(`🔄 Reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
                    
                    // Exponential backoff delay
                    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
                    await new Promise(resolve => setTimeout(resolve, delay))
                    
                    await this.start()
                } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                    console.error('❌ Max reconnection attempts reached. Exiting.')
                    process.exit(1)
                }
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
