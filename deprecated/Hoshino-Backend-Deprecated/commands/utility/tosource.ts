import { downloadMediaMessage, getContentType } from 'baileys'
import type { proto } from 'baileys'
import { pipeline } from 'node:stream/promises'
import { Writable } from 'node:stream'

const MEDIA_TYPES = [
    'imageMessage',
    'videoMessage',
    'stickerMessage',
    'audioMessage',
    'documentMessage',
] as const

type SupportedMedia = typeof MEDIA_TYPES[number]

function unwrapInner(msg: proto.IMessage): proto.IMessage {
    if (msg.viewOnceMessage?.message)   return unwrapInner(msg.viewOnceMessage.message)
    if (msg.viewOnceMessageV2?.message) return unwrapInner(msg.viewOnceMessageV2.message)
    if (msg.ephemeralMessage?.message)  return unwrapInner(msg.ephemeralMessage.message)
    return msg
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = []

    const collector = new Writable({
        write(chunk: Buffer, _enc, cb) {
            chunks.push(chunk)
            cb()
        },
    })

    await pipeline(stream, collector)
    return Buffer.concat(chunks)
}

export default {
    name: ['tosource', 'src'],
    usage: [
        'tosource (reply image)',
        'tosource (reply video)',
        'tosource (reply sticker)',
        'tosource (reply audio)',
        'tosource (reply viewonce)',
    ],
    category: 'utility',
    async execute(_, { msg, socket }: ICTX) {
        if (!msg.rawQuoted) {
            await socket.sendMessage(
                msg.remoteJid,
                { text: '❌ Reply a media message (image / video / sticker / audio / viewonce)' },
                { quoted: msg.raw }
            )
            return
        }

        const innerMsg  = unwrapInner(msg.rawQuoted)
        const mediaType = getContentType(innerMsg) as keyof proto.IMessage | undefined

        if (!mediaType || !(MEDIA_TYPES as readonly string[]).includes(mediaType)) {
            await socket.sendMessage(
                msg.remoteJid,
                { text: `❌ Unsupported type: *${mediaType ?? 'unknown'}*` },
                { quoted: msg.raw }
            )
            return
        }

        const targetMsg = { key: msg.raw.key, message: innerMsg }

        try {
            const mediaStream = await downloadMediaMessage(
                targetMsg,
                'stream',
                {},
                {
                    logger: { level: 'silent' } as any,
                    reuploadRequest: socket.updateMediaMessage,
                }
            )

            const buffer = await streamToBuffer(mediaStream as NodeJS.ReadableStream)
            const content = (innerMsg as any)[mediaType] as any
            const caption = (content?.caption as string | null) ?? null

            switch (mediaType as SupportedMedia) {
                case 'imageMessage':
                    await socket.sendMessage(
                        msg.remoteJid,
                        {
                            image: buffer,
                            caption: caption ?? '✅ Image',
                            mimetype: (content?.mimetype as string) ?? 'image/jpeg',
                        },
                        { quoted: msg.raw }
                    )
                    break

                case 'videoMessage':
                    await socket.sendMessage(
                        msg.remoteJid,
                        {
                            video: buffer,
                            caption: caption ?? '✅ Video',
                            mimetype: 'video/mp4',
                        },
                        { quoted: msg.raw }
                    )
                    break

                case 'stickerMessage':
                    await socket.sendMessage(
                        msg.remoteJid,
                        { sticker: buffer },
                        { quoted: msg.raw }
                    )
                    break

                case 'audioMessage':
                    await socket.sendMessage(
                        msg.remoteJid,
                        {
                            audio: buffer,
                            mimetype: (content?.mimetype as string) ?? 'audio/ogg; codecs=opus',
                            ptt: (content?.ptt as boolean) ?? false,
                        },
                        { quoted: msg.raw }
                    )
                    break

                case 'documentMessage':
                    await socket.sendMessage(
                        msg.remoteJid,
                        {
                            document: buffer,
                            fileName: (content?.fileName as string) ?? 'file',
                            mimetype: (content?.mimetype as string) ?? 'application/octet-stream',
                        },
                        { quoted: msg.raw }
                    )
                    break
            }
        } catch (err: any) {
            logger.error('/commands/media/tosource.ts', `Download failed: ${err?.message}`)
            await socket.sendMessage(
                msg.remoteJid,
                { text: '❌ Failed to download media.' },
                { quoted: msg.raw }
            )
        }
    },
} satisfies ICommand