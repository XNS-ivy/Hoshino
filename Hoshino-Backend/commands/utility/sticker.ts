import { downloadMediaMessage } from 'baileys'
import { makeSticker } from '@utils/sharp'
import { makeAnimatedSticker, type AnimatedStickerOptions } from '@utils/ffmpeg'
import type { StickerOptions } from '@utils/sharp'

const ARG_MAP: Record<string, Partial<StickerOptions & AnimatedStickerOptions>> = {
    // Static & animated
    'crop': { crop: true },
    'hq': { quality: 100 },
    'lq': { quality: 50 },
    // Static only
    'cover': { fit: 'cover' },
    'fill': { fit: 'fill' },
    'contain': { fit: 'contain' },
    'inside': { fit: 'inside' },
    'outside': { fit: 'outside' },
    'lossless': { lossless: true },
    // Animated only
    'fps8': { fps: 8 },
    'fps12': { fps: 12 },
    'fps15': { fps: 15 },
    'fps24': { fps: 24 },
    '3s': { duration: 3 },
    '5s': { duration: 5 },
    '8s': { duration: 8 },
}

function parseArgs(args: string[]): StickerOptions & AnimatedStickerOptions {
    const opt: StickerOptions & AnimatedStickerOptions = {}
    for (const arg of args) {
        const mapped = ARG_MAP[arg.toLowerCase()]
        if (mapped) Object.assign(opt, mapped)
    }
    return opt
}

export default {
    name: ['sticker', 'stc'],
    usage: [
        'sticker',
        'sticker crop',
        'sticker crop hq',
        'sticker cover lossless',
        'sticker fps15 5s',
        'sticker crop fps24 8s hq',
    ],
    args: Object.keys(ARG_MAP),
    category: 'media',
    async execute(args, { msg, socket }) {

        let targetMsg: any = null
        let isAnimated = false

        if (msg.type === 'imageMessage') {
            targetMsg = msg.raw
        }
        else if (msg.type === 'videoMessage') {
            targetMsg = msg.raw
            isAnimated = true
        }
        else if (msg.type === 'documentMessage') {
            const parsed = parseDocumentType(msg.raw.message?.documentMessage)
            if (!parsed) return

            targetMsg = msg.raw
            isAnimated = parsed.animated
        }
        else if (msg.quoted?.type === 'imageMessage') {
            targetMsg = { key: msg.raw.key, message: msg.rawQuoted }
        }
        else if (msg.quoted?.type === 'videoMessage') {
            targetMsg = { key: msg.raw.key, message: msg.rawQuoted }
            isAnimated = true
        }
        else if (msg.quoted?.type === 'documentMessage') {
            if (!msg.rawQuoted) return
            const parsed = parseDocumentType(msg.rawQuoted.documentMessage)
            if (!parsed) return

            targetMsg = { key: msg.raw.key, message: msg.rawQuoted }
            isAnimated = parsed.animated
        }

        if (!targetMsg) return

        const buffer = await downloadMediaMessage(
            targetMsg,
            'buffer',
            {},
            { logger: { level: 'silent' } as any, reuploadRequest: socket.updateMediaMessage }
        )

        const stickerOpt = parseArgs(args)
        let sticker: Buffer | null = null

        if (isAnimated) {
            try {
                sticker = await makeAnimatedSticker(buffer, stickerOpt)
            } catch (err: any) {
                logger.error(`/commands/utility/sticker.ts`, `FFMPEG failed`)
                try {
                    sticker = await makeSticker(buffer, stickerOpt)
                } catch (fallbackErr) {
                    logger.error(`/commands/utility/sticker.ts`, `Fallback failed : ${fallbackErr}`)
                }
            }
        } else {
            sticker = await makeSticker(buffer, stickerOpt)
        }

        if (!sticker) {
            return socket.sendMessage(
                msg.remoteJid,
                { text: '❌ Failed to create sticker (ffmpeg / image error)' },
                { quoted: msg.raw }
            )
        }

        await socket.sendMessage(
            msg.remoteJid,
            { sticker },
            { quoted: msg.raw }
        )
    }
} as ICommand

function parseDocumentType(doc: any) {
    const mime = doc.mimetype || ''
    const name = (doc.fileName || '').toLowerCase()

    if (mime.startsWith('image/')) {
        if (mime === 'image/gif' || name.endsWith('.gif')) {
            return { type: 'gif', animated: true }
        }
        return { type: 'image', animated: false }
    }

    if (mime.startsWith('video/')) {
        return { type: 'video', animated: true }
    }

    return null
}