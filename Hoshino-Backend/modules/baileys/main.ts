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

type BotStatus = 'idle' | 'connecting' | 'pairing' | 'connected' | 'disconnected'

 /**
  * @interface BotInstance - this is bot controller interface
  * @param BotInstance - the unique user id
  * @param status - bot status from {@link BotStatus}
  * @param PN - this is a phone number
  * @param socket - {@link WASocket}
  */
interface BotInstance {
    userID: string,
    status: BotStatus,
    PN: string | null,
    socket: WASocket 
}