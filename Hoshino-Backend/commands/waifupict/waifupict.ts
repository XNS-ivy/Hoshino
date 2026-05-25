import { fetchBuffer, isGifUrl } from '@utils/fetch'
import { gifBufferToMp4 } from '@utils/ffmpeg'

const NEKOS_BEST_SFW: Record<string, string> = {
    waifu:    'waifu',
    neko:     'neko',
    shinobu:  'shinobu',
    megumin:  'megumin',
    pat:      'pat',
    cuddle:   'cuddle',
    cry:      'cry',
    blush:    'blush',
    wave:     'wave',
    smile:    'smile',
    dance:    'dance',
    wink:     'wink',
    poke:     'poke',
    slap:     'slap',
    bonk:     'bonk',
    nom:      'nom',
    bite:     'bite',
    kick:     'kick',
    happy:    'happy',
    highfive: 'highfive',
    handhold: 'handhold',
    glomp:    'glomp',
    kill:     'kill',
    yeet:     'yeet',
    smug:     'smug',
    bully:    'bully',
    cringe:   'cringe',
    lick:     'lick',
}

export default {
    name: 'waifupict',
    access: 'regular',
    category: 'waifupict',
    args: Object.keys(NEKOS_BEST_SFW),
    usage: 'waifupict <type>',
    async execute(args, { msg, socket }) {
        const available = Object.keys(NEKOS_BEST_SFW)
        const input     = args?.[0]?.toLowerCase()
        const category  = (typeof input === 'string' && available.includes(input)) ? input : 'waifu'

        if (input && !available.includes(input)) {
            const listText = available.map(a => `• ${a}`).join('\n')
            socket.sendMessage(
                msg.remoteJid,
                { text: `❌ Invalid category: *${input}*\n\n✅ Available types:\n${listText}` },
                { ephemeralExpiration: msg.expiration, quoted: msg.raw }
            )
            return
        }

        try {
            const res  = await fetch(`https://nekos.best/api/v2/${category}`)
            const data = await res.json() as { results: { url: string, anime_name?: string }[] }
            const item = data.results[0]
            if (!item) throw new Error('No result')

            const url     = item.url
            const caption = `✨ Random *${category}*${item.anime_name ? `\n🎬 ${item.anime_name}` : ''}`

            if (isGifUrl(url)) {
                const gifBuffer = await fetchBuffer(url)
                const mp4Buffer = await gifBufferToMp4(gifBuffer)
                await socket.sendMessage(
                    msg.remoteJid,
                    { video: mp4Buffer, gifPlayback: true, caption },
                    { quoted: msg.raw }
                )
                return
            }

            await socket.sendMessage(
                msg.remoteJid,
                { image: { url }, caption },
                { quoted: msg.raw }
            )
        } catch (error) {
            logger.error('commands/waifupict', `Error: ${error instanceof Error ? error.message : String(error)}`)
            await socket.sendMessage(
                msg.remoteJid,
                { text: '❌ Failed to fetch anime image. Try again later.' },
                { quoted: msg.raw }
            )
        }
    }
} satisfies ICommand