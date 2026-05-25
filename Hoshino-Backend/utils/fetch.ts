// utils/fetch.ts
import { pipeline } from 'stream/promises'
import { PassThrough } from 'stream'

export async function fetchBuffer(url: string, retries = 3): Promise<Buffer> {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            })
            if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)

            const pass   = new PassThrough()
            const chunks: Buffer[] = []
            pass.on('data', (chunk: Buffer) => chunks.push(chunk))
            await pipeline(res.body as any, pass)
            return Buffer.concat(chunks)

        } catch (err) {
            if (attempt === retries) throw err
            logger.warn('/utils/fetch.ts', `Fetch attempt ${attempt} failed, retrying...`)
            await new Promise(r => setTimeout(r, 500 * attempt))
        }
    }
    throw new Error('Fetch failed after retries')
}

export function isGifUrl(url: string): boolean {
    return url.toLowerCase().endsWith('.gif')
}