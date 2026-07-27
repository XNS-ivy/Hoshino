import { resolveAudio } from '@utils/ytdlp-gallery-dl'
import { isValidUrl } from '@utils/validate-url'

export default {
    name: ['youtube-mp3', 'ytmp3'],
    category: 'downloader',
    usage: ['youtube-mp3 <url>', 'ytmp3 <url>'],
    async execute(args, { msg, socket }: ICTX) {
        const url = args[0]

        if (!url || !isValidUrl(url, 'youtube')) {
            socket.sendMessage(msg.remoteJid, { text: `❌ Please Provide Valid Youtube URL Please.` }, { quoted: msg.raw })
            return
        }
        const result = await resolveAudio(url)
        const { info, video, caption, gif, audio, image } = result
        const media = { video, audio, image, gif }
        if (media[info.mediaType] == null) {
            socket.sendMessage(msg.remoteJid, { text: `❌ Media Not Found! Or Invalid URL` }, { quoted: msg.raw })
            return
        }
        switch (info.mediaType) {
            case 'video':
                await socket.sendMessage(msg.remoteJid, {
                    video: video!,
                    caption,
                    mimetype: 'video/mp4',
                }, { quoted: msg.raw })
                break

            case 'audio':
                await socket.sendMessage(msg.remoteJid, {
                    audio: audio!,
                    mimetype: 'audio/mp4',
                    ptt: false,
                }, { quoted: msg.raw })
                break

            case 'image':
                await socket.sendMessage(msg.remoteJid, {
                    image: image!,
                    caption,
                    mimetype: `image/${info.ext}`,
                }, { quoted: msg.raw })
                break

            case 'gif':
                await socket.sendMessage(msg.remoteJid, {
                    video: gif!,
                    caption,
                    gifPlayback: true,
                    mimetype: 'video/mp4',
                }, { quoted: msg.raw })
                break
        }
    }
} satisfies ICommand