import os from 'os'
import path from 'path'
import fs from 'fs'
import { execa } from 'execa'
import { unlink } from 'fs/promises'
import { randomUUID } from 'crypto'
import { writeExif } from './exif'
import { pipeline } from 'stream/promises'
import { createReadStream, createWriteStream } from 'fs'
import { Readable, PassThrough } from 'stream'

export type AnimatedStickerOptions = {
    crop?: boolean
    fps?: number
    quality?: number
    duration?: number
    packname?: string
    publisher?: string
}

type VideoMeta = {
    fps: number
    duration: number
}

export async function gifBufferToMp4(gifBuffer: Buffer): Promise<Buffer> {
    const tmpGif = path.join(os.tmpdir(), `hoshino-gif-${Date.now()}.gif`)
    const tmpMp4 = path.join(os.tmpdir(), `hoshino-mp4-${Date.now()}.mp4`)

    await pipeline(Readable.from(gifBuffer), createWriteStream(tmpGif))

    try {
        const proc = Bun.spawn({
            cmd: [
                'ffmpeg',
                '-i', tmpGif,
                '-movflags', 'faststart',
                '-pix_fmt', 'yuv420p',
                '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
                '-y', tmpMp4
            ],
            stdout: 'pipe',
            stderr: 'pipe',
        })

        const exitCode = await proc.exited
        if (exitCode !== 0) {
            const err = await new Response(proc.stderr).text()
            throw new Error(`ffmpeg failed: ${err}`)
        }

        const pass = new PassThrough()
        const chunks: Buffer[] = []
        pass.on('data', (chunk: Buffer) => chunks.push(chunk))
        await pipeline(createReadStream(tmpMp4), pass)
        return Buffer.concat(chunks)

    } finally {
        await unlink(tmpGif).catch(() => { })
        await unlink(tmpMp4).catch(() => { })
    }
}


async function getVideoMeta(filePath: string): Promise<VideoMeta> {
    const { stdout } = await execa('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        '-show_format',
        filePath
    ])

    const data = JSON.parse(stdout)
    const videoStream = data.streams?.find((s: any) => s.codec_type === 'video')
    const duration = Number(data.format?.duration ?? 0)

    let fps = 12
    const rateStr = videoStream?.r_frame_rate ?? videoStream?.avg_frame_rate
    if (rateStr) {
        const [num, den] = rateStr.split('/').map(Number)
        if (num && den && den > 0) fps = Math.round(num / den)
    }

    return { fps, duration }
}


export async function gifToMP4(input: string, output: string): Promise<void> {
    logger.info('/utils/ffmpeg.ts', 'Executing FFMPEG')
    await execa('ffmpeg', [
        '-i', input,
        '-movflags', 'faststart',
        '-pix_fmt', 'yuv420p',
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-profile:v', 'baseline',
        '-level', '3.0',
        '-r', '30',
        '-an',
        output
    ])
}

export async function validateGif(filePath: string): Promise<void> {
    const stat = await fs.promises.stat(filePath)
    if (stat.size < 50 * 1024) throw new Error(`GIF too small (${stat.size})`)

    const fd = await fs.promises.open(filePath, 'r')
    const header = Buffer.alloc(6)
    await fd.read(header, 0, 6, 0)
    const sig = header.toString('ascii')

    if (sig !== 'GIF87a' && sig !== 'GIF89a') {
        await fd.close()
        throw new Error(`Invalid GIF header: ${sig}`)
    }

    const tail = Buffer.alloc(1)
    await fd.read(tail, 0, 1, stat.size - 1)
    await fd.close()

    if (tail[0] !== 0x3B) throw new Error('GIF missing trailer')

    const { stdout } = await execa('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        filePath
    ])

    const data = JSON.parse(stdout)
    if (!data.streams?.length) throw new Error('No media streams')
}


export async function makeAnimatedSticker(
    buffer: Buffer,
    opt: AnimatedStickerOptions = {}
): Promise<Buffer> {
    const id = randomUUID()
    const tmpDir = os.tmpdir()
    const input = path.join(tmpDir, `${id}.mp4`)
    const output = path.join(tmpDir, `${id}.webp`)

    const creator = {
        packname: 'Hoshino',
        publisher: 'XNS-ivy',
    }

    await pipeline(Readable.from(buffer), createWriteStream(input))

    try {
        const meta = await getVideoMeta(input)

        const MAX_DURATION = 8
        const MIN_FPS = 8
        const MAX_FPS = 60
        const MAX_SIZE_KB = 900
        const MAX_SIZE_LAST_RESORT = 1024

        const quality = opt.quality ?? 80
        const crop = opt.crop ?? false
        const packname = opt.packname ?? creator.packname
        const publisher = opt.publisher ?? creator.publisher

        const fps = Math.min(Math.max(meta.fps, MIN_FPS), MAX_FPS)
        const duration = opt.duration
            ? Math.min(opt.duration, meta.duration, MAX_DURATION)
            : Math.min(meta.duration, MAX_DURATION)

        const buildVf = (f: number) => {
            const filters: string[] = []
            if (crop) {
                filters.push('crop=min(iw\\,ih):min(iw\\,ih)')
                filters.push('scale=512:512')
            } else {
                filters.push('scale=512:512:force_original_aspect_ratio=decrease')
                filters.push('pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0')
            }
            filters.push(`fps=${f}`)
            return filters.join(',')
        }

        const runFfmpeg = async (vf: string, q: number, d: number) => {
            try {
                await execa('ffmpeg', [
                    '-i', input,
                    '-an',
                    '-vf', vf,
                    '-loop', '0',
                    '-qscale', String(q),
                    '-t', String(d),
                    '-pix_fmt', 'yuva420p',
                    '-y',
                    output
                ])
            } catch (err: any) {
                logger.error('/utils/ffmpeg.ts', `FFMPEG Error: ${err.message}`)
                throw err
            }
        }

        let currentFps = fps
        let currentQuality = quality
        await runFfmpeg(buildVf(currentFps), currentQuality, duration)
        let stat = await fs.promises.stat(output)

        if (stat.size / 1024 > MAX_SIZE_KB) {
            currentQuality = 60
            await runFfmpeg(buildVf(currentFps), currentQuality, duration)
            stat = await fs.promises.stat(output)
        }

        if (stat.size / 1024 > MAX_SIZE_KB) {
            currentQuality = 40
            await runFfmpeg(buildVf(currentFps), currentQuality, duration)
            stat = await fs.promises.stat(output)
        }

        if (stat.size / 1024 > MAX_SIZE_KB) {
            const reducedDuration = duration * 0.6
            await runFfmpeg(buildVf(currentFps), currentQuality, reducedDuration)
            stat = await fs.promises.stat(output)
        }

        if (stat.size / 1024 > MAX_SIZE_LAST_RESORT) {
            currentFps = Math.max(Math.floor(fps * 0.5), MIN_FPS)
            currentQuality = 30
            await runFfmpeg(buildVf(currentFps), currentQuality, duration)
            stat = await fs.promises.stat(output)
        }

        if (stat.size < 1024) {
            throw new Error(`Output webp too small (${stat.size} bytes), likely corrupt`)
        }

        const pass = new PassThrough()
        const chunks: Buffer[] = []
        pass.on('data', (chunk: Buffer) => chunks.push(chunk))
        await pipeline(createReadStream(output), pass)
        let webpBuffer = Buffer.concat(chunks)

        if (packname || publisher) {
            webpBuffer = Buffer.from(await writeExif(webpBuffer, packname, publisher))
        }

        return webpBuffer
    } finally {
        await unlink(input).catch(() => { })
        await unlink(output).catch(() => { })
    }
}