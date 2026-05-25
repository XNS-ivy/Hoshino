import { resolveGif } from '@utils/ytdlp'

export default {
    name: 'audiomp3',
    usage: 'audiomp3 <utrl>',
    category: 'downloader',
    async execute(args, { msg, socket }: ICTX) {
        const url = args[0]
        if (!url) {
            socket.sendMessage(msg.remoteJid, { text: `❌ Please Provide Gif URL Please.` }, { quoted: msg.raw })
            return
        }
        try {
            const result = await resolveGif(url)
            const { gif, caption } = result
            if (!gif) {
                socket.sendMessage(msg.remoteJid, { text: `❌ Video Not Found! Or Just A Wrong Url That's Not Contain Gif` }, { quoted: msg.raw })
                return
            }
            await socket.sendMessage(msg.remoteJid, { video: gif, gifPlayback: true, caption: caption }, { quoted: msg.raw })
        } catch (err: any) {
            await socket.sendMessage(msg.remoteJid, { text: `Error Cannot Resolve Gif ${err?.message}` })
        }
    }
} satisfies ICommand