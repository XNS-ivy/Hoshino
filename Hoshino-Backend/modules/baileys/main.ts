import { makeWASocket, Browsers, fetchLatestWaWebVersion, useMultiFileAuthState } from 'baileys'
import type { WASocket } from 'baileys'
import { pino } from 'pino'
import qrcode from 'qrcode-terminal'

class BotManager {
    private sock: WASocket | null = null
    constructor() { }
    // create instance file
    async createBotInstance(user_id: string, phoneNumber: string | null) {
        try {
            
        } catch (error) {
            console.error('Failed to start Whatsapp:', error)
            process.exit(1)
        }
    }
}

const Hoshino = new BotManager()
export default Hoshino
