import { fetchBuffer, isGifUrl } from '@utils/fetch'
import { fetchJson } from '@utils/fetch'
import { gifBufferToMp4 } from '@utils/ffmpeg'

const NEKOS_BEST_GIF = [
    'lurk', 'shoot', 'sleep', 'clap', 'shrug', 'stare', 'wave', 'poke',
    'confused', 'smile', 'peck', 'wink', 'sip', 'blush', 'smug', 'tickle',
    'yeet', 'think', 'highfive', 'feed', 'wag', 'bite', 'teehee', 'shocked',
    'bleh', 'bored', 'nom', 'nya', 'yawn', 'facepalm', 'cuddle', 'kick',
    'happy', 'carry', 'hug', 'kabedon', 'baka', 'bonk', 'pat', 'angry',
    'spin', 'shake', 'run', 'nod', 'nope', 'kiss', 'dance', 'punch',
    'handshake', 'slap', 'cry', 'lappillow', 'pout', 'blowkiss', 'handhold',
    'salute', 'thumbsup', 'laugh', 'tableflip'
]

const NEKOS_BEST_PNG = ['neko', 'waifu', 'husbando', 'kitsune']

const NEKOS_BEST_SFW = [...NEKOS_BEST_GIF, ...NEKOS_BEST_PNG]

export default {
    name: 'waifupict',
    access: 'regular',
    category: 'waifupict',
    args: NEKOS_BEST_SFW,
    usage: 'waifupict <type>',
    async execute(args, { msg, socket }) {
        const input = args?.[0]?.toLowerCase()
        const category = (typeof input === 'string' && NEKOS_BEST_SFW.includes(input)) ? input : 'waifu'

        if (input && !NEKOS_BEST_SFW.includes(input)) {
            const listText = NEKOS_BEST_SFW.map(a => `• ${a}`).join('\n')
            socket.sendMessage(
                msg.remoteJid,
                { text: `❌ Invalid category: *${input}*\n\n✅ Available types:\n${listText}` },
                { ephemeralExpiration: msg.expiration, quoted: msg.raw }
            )
            return
        }

        try {
            const data = await fetchJson<{ results: { url: string, anime_name?: string }[] }>(
                `https://nekos.best/api/v2/${category}`
            )
            const item = data.results[0]
            if (!item) throw new Error('No result')

            const url = item.url
            const caption = `✨ Random *${category}*${item.anime_name ? `\n🎬 ${item.anime_name}` : ''}`

            if (isGifUrl(url)) {
                const gifBuffer = await fetchBuffer(url, 2, false)
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