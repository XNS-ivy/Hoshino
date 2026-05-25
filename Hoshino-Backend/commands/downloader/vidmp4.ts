import { resolveVideo } from '@utils/ytdlp'

export default {
    name: 'vidmp4',
    usage: 'vidmp4 <utrl>',
    category: 'downloader',
    async execute(args, { msg, socket }: ICTX) {
        const url = args[0]
        if (!url) {
            socket.sendMessage(msg.remoteJid, { text: `❌ Please Provide Video URL Please.` }, { quoted: msg.raw })
            return
        }
        try {
            const result = await resolveVideo(url)
            const { video, caption } = result
            if (!video) {
                socket.sendMessage(msg.remoteJid, { text: `❌ Video Not Found! Or Just A Wrong Url That's Not Contain Video.` }, { quoted: msg.raw })
                return
            }
            await socket.sendMessage(msg.remoteJid, { video: video, caption: caption }, { quoted: msg.raw })
        } catch (err: any) {
            await socket.sendMessage(msg.remoteJid, {text : `Error Cannot Resolve Video ${err?.message}`})
        }
    }
} satisfies ICommand