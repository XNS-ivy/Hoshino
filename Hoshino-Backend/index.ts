import BaileysManager from '@modules/baileys/main'
import qrcode from 'qrcode-terminal'
import { server } from './server'

async function main() {
    await BaileysManager.bootAllAgents()
    server
    BaileysManager.onPairingCode = (userId, code) => {
        logger.info(`/modules/baileys/main.ts`, `ON TERMINAL Pairing Code For : [${userId}] Pairing code: ${code.split('').join(' ')}`)
    }

    BaileysManager.onQRCode = (userId, qr) => {
        logger.info('/modules/baileys/main.ts', `ON TERMINAL QRCODE FOR [${userId}] : `)
        qrcode.generate(qr, { small: true })
    }

    BaileysManager.onConnected = (userId) => {
        logger.info('/index.ts', `[${userId}] Agent connected`)
    }
}

main()