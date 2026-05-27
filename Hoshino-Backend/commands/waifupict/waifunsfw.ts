import { isGifUrl, fetchBuffer } from '@utils/fetch'
import { fetchJson } from '@utils/fetch'
import { gifBufferToMp4 } from '@utils/ffmpeg'

const NEKOBOT_NSFW = [
    'hentai', 'ass', 'pgif', 'swimsuit', 'thigh',
    'hass', 'boobs', 'hboobs', 'pussy', 'paizuri',
    'pantsu', 'lewdneko', 'feet', 'hyuri', 'hthigh',
    'hmidriff', 'anal', 'nakadashi', 'blowjob',
    'gonewild', 'hkitsune', 'tentacle', 'futa', 'yaoi'
]

export default {
    name: 'waifunsfw',
    access: 'regular',
    args: NEKOBOT_NSFW,
    category: 'waifupict',
    usage: 'waifunsfw <type>',
    async execute(args, { msg, socket }) {
        const available = NEKOBOT_NSFW
        const input = args?.[0]?.toLowerCase()
        const category = (typeof input === 'string' && available.includes(input)) ? input : 'hentai'

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
            const data = await fetchJson<{ success: boolean, message: string }>(
                `https://nekobot.xyz/api/image?type=${category}`
            )

            if (!data.success) throw new Error('API returned failure')

            const imageUrl = data.message
            console.log(imageUrl)
            if (isGifUrl(imageUrl)) {
                const gifBuffer = await fetchBuffer(imageUrl, 5, false)
                const mp4Buffer = await gifBufferToMp4(gifBuffer)
                await socket.sendMessage(
                    msg.remoteJid,
                    { video: mp4Buffer, gifPlayback: true, caption: `✨ Random *${category}*` },
                    { quoted: msg.raw }
                )
                return
            }

            await socket.sendMessage(
                msg.remoteJid,
                { image: { url: imageUrl }, caption: `✨ Random *${category}*` },
                { quoted: msg.raw }
            )
        } catch (error) {
            logger.error('commands/waifunsfw', `Error: ${error instanceof Error ? error.message : String(error)}`)
            await socket.sendMessage(
                msg.remoteJid,
                { text: '❌ Failed to fetch. Try again later.' },
                { quoted: msg.raw }
            )
        }
    }
} satisfies ICommand