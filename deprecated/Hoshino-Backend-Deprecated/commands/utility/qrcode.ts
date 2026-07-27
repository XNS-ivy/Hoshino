import QRCode from 'qrcode'
import { PassThrough } from 'stream'
import { getAgent } from '@modules/baileys/agent'
async function qrToBuffer(text: string): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
        const pass = new PassThrough()
        const chunks: Buffer[] = []

        pass.on('data', (chunk: Buffer) => chunks.push(chunk))
        pass.on('end', () => resolve(Buffer.concat(chunks)))
        pass.on('error', reject)

        QRCode.toFileStream(pass, text, {
            type: 'png',
            width: 512,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff',
            },
        })
    })
}

export default {
    category: 'utility',
    inGroup: false,
    usage: ['qr <text or URL>', 'qr https://example.com', 'qr Hello World'],
    name: ['qrcode', 'qr'],
    async execute(_, { msg, socket }) {
        const agent = getAgent(msg.agentId)
        const prefix = agent?.prefix

        const rawText: string = msg.text || ''
        const commandPattern = new RegExp(`^\\S+\\s*`, '')
        const content = rawText.replace(commandPattern, '').trim()

        if (!content) {
            socket.sendMessage(msg.remoteJid, {
                text: `❌ Please provide text or a URL to encode!\nExample: ${prefix}qr https://example.com`
            }, { quoted: msg.raw })
            return
        }

        if (content.length > 500) {
            socket.sendMessage(msg.remoteJid, {
                text: `❌ Input too long! Maximum 500 characters.`
            }, { quoted: msg.raw })
            return
        }

        try {
            const imageBuffer = await qrToBuffer(content)
            await socket.sendMessage(msg.remoteJid, {
                image: imageBuffer,
                mimetype: 'image/png',
                caption: `🔳 QR Code generated\n📝 *Content:* ${content.length > 60 ? content.slice(0, 60) + '...' : content}`,
            }, { quoted: msg.raw })

        } catch (err: any) {
            logger.error(`/commands/utility/qrcode.ts`, `QR generation error: ${err?.message}`)
            socket.sendMessage(msg.remoteJid, {
                text: `❌ Failed to generate QR code: ${err.message || 'Unknown error'}`
            }, { quoted: msg.raw })
        }
    },
} as ICommand