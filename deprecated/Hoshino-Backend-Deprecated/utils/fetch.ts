// utils/fetch.ts
import { pipeline } from 'stream/promises'
import { PassThrough } from 'stream'

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}

export async function fetchBuffer(url: string, retries = 3, withHeader: boolean = true): Promise<Buffer> {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            let res
            if (withHeader == true) {
                res = await fetch(url, {
                    headers: DEFAULT_HEADERS
                })
            } else {
                res = await fetch(url)
            }
            if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)

            const pass = new PassThrough()
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

export async function fetchJson<T>(url: string, withHeader = false): Promise<T> {
    const buffer = await fetchBuffer(url, 3, withHeader)
    return JSON.parse(buffer.toString('utf-8')) as T
}

export function isGifUrl(url: string): boolean {
    return url.toLowerCase().endsWith('.gif')
}