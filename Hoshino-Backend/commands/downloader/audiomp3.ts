import { resolveAudio } from '@utils/ytdlp'

export default {
    name: 'audiomp3',
    usage: 'audiomp3 <utrl>',
    category: 'downloader',
    async execute(args, { msg, socket }: ICTX) {
        const url = args[0]
        if (!url) {
            socket.sendMessage(msg.remoteJid, { text: `❌ Please Provide Audio URL Please.` }, { quoted: msg.raw })
            return
        }
        try {
            const result = await resolveAudio(url)
            const { audio } = result
            if (!audio) {
                socket.sendMessage(msg.remoteJid, { text: `❌ Video Not Found! Or Just A Wrong Url That's Not Contain Video.` }, { quoted: msg.raw })
                return
            }
            await socket.sendMessage(msg.remoteJid, { audio: audio, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg.raw })
        } catch (err: any) {
            await socket.sendMessage(msg.remoteJid, { text: `Error Cannot Resolve Audio ${err?.message}` })
        }
    }
} satisfies ICommand