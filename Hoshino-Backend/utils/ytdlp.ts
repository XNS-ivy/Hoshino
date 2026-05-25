import ytdlp from 'node-ytdlp-wrap'
import { pipeline } from 'stream/promises'
import { PassThrough } from 'stream'
import fs from 'fs'
import os from 'os'
import path from 'path'

export interface YtdlpInfo {
    title: string
    url: string
    duration: number
    thumbnail: string
    ext: string
    mediaType: 'video' | 'audio' | 'image' | 'gif'
}

export interface MediaResult {
    info: YtdlpInfo
    video: Buffer | null
    audio: Buffer | null
    image: Buffer | null
    gif: Buffer | null
    caption: string
}

async function toBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const pass = new PassThrough()
    const chunks: Buffer[] = []
    pass.on('data', (chunk: Buffer) => chunks.push(chunk))
    await pipeline(stream, pass)
    return Buffer.concat(chunks)
}

async function getInfo(url: string): Promise<YtdlpInfo> {
    const proc = Bun.spawn({
        cmd: [ytdlp.path, '--dump-json', '--no-download', url],
        stdout: 'pipe',
        stderr: 'pipe',
    })

    const exitCode = await proc.exited
    if (exitCode !== 0) {
        const err = await new Response(proc.stderr).text()
        throw new Error(`yt-dlp info failed: ${err}`)
    }

    const raw = await new Response(proc.stdout).text()
    const data = JSON.parse(raw)

    const ext = data.ext as string ?? 'mp4'
    const vcodec = data.vcodec as string ?? 'none'
    const acodec = data.acodec as string ?? 'none'

    const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
    const isGif = ext === 'gif'
    const isAudio = vcodec === 'none' && acodec !== 'none'
    const mediaType = isImage ? 'image' : isGif ? 'gif' : isAudio ? 'audio' : 'video'

    return {
        title: data.title as string,
        url: data.webpage_url as string,
        duration: data.duration as number ?? 0,
        thumbnail: data.thumbnail as string,
        ext,
        mediaType,
    }
}

export async function resolveMedia(url: string, maxDuration = 600): Promise<MediaResult> {
    const info = await getInfo(url)

    if (info.mediaType === 'video' && info.duration > maxDuration) {
        throw new Error(`Video terlalu panjang (${Math.floor(info.duration / 60)} menit, max ${maxDuration / 60} menit)`)
    }

    const result: MediaResult = {
        info,
        video: null,
        audio: null,
        image: null,
        gif: null,
        caption: info.title,
    }

    switch (info.mediaType) {
        case 'video':
            result.video = await toBuffer(
                ytdlp.stream(url, ['-f', 'best[ext=mp4][filesize<50M]/best'])
            )
            break

        case 'audio':
            result.audio = await toBuffer(
                ytdlp.stream(url, ['-f', 'bestaudio[ext=m4a]/bestaudio'])
            )
            break

        case 'image':
            result.image = await toBuffer(
                ytdlp.stream(url, ['-o', '-'])
            )
            break

        case 'gif':
            result.gif = await toBuffer(
                ytdlp.stream(url, ['-o', '-'])
            )
            break
    }

    return result
}

export async function resolveAudio(url: string): Promise<MediaResult> {
    const info = await getInfo(url)
    const tmpFile = path.join(os.tmpdir(), `hoshino-audio-${Date.now()}.mp3`)
    const proc = Bun.spawn({
        cmd: [
            ytdlp.path,
            '-f', 'bestaudio',
            '-x',
            '--audio-format', 'mp3',
            '--audio-quality', '0',
            '-o', tmpFile,
            url
        ],
        stdout: 'pipe',
        stderr: 'pipe',
    })

    const exitCode = await proc.exited
    if (exitCode !== 0) {
        const err = await new Response(proc.stderr).text()
        throw new Error(`yt-dlp audio failed: ${err}`)
    }

    const audio = Buffer.from(await Bun.file(tmpFile).arrayBuffer())
    fs.unlinkSync(tmpFile)

    return {
        info: { ...info, mediaType: 'audio' },
        video: null,
        audio,
        image: null,
        gif: null,
        caption: info.title,
    }
}

export async function resolveVideo(url: string): Promise<MediaResult> {
    const info = await getInfo(url)

    const video = await toBuffer(ytdlp.stream(url, ['-f', 'best[ext=mp4][filesize<50M]/best']))

    return {
        info: { ...info, mediaType: 'video' },
        video,
        audio: null,
        image: null,
        gif: null,
        caption: info.title,
    }
}

export async function resolveGif(url: string): Promise<MediaResult> {
    const info    = await getInfo(url)
    const tmpGif  = path.join(os.tmpdir(), `hoshino-gif-${Date.now()}.gif`)
    const tmpMp4  = path.join(os.tmpdir(), `hoshino-gif-${Date.now()}.mp4`)

    const proc = Bun.spawn({
        cmd: [ytdlp.path, '-o', tmpGif, url],
        stdout: 'pipe',
        stderr: 'pipe',
    })

    const exitCode = await proc.exited
    if (exitCode !== 0) {
        const err = await new Response(proc.stderr).text()
        throw new Error(`yt-dlp gif failed: ${err}`)
    }
    const ffmpeg = Bun.spawn({
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

    const ffmpegExit = await ffmpeg.exited
    if (ffmpegExit !== 0) {
        const err = await new Response(ffmpeg.stderr).text()
        throw new Error(`ffmpeg convert failed: ${err}`)
    }
    const gif = Buffer.from(await Bun.file(tmpMp4).arrayBuffer())
    fs.unlinkSync(tmpGif)
    fs.unlinkSync(tmpMp4)
    return {
        info: { ...info, mediaType: 'gif' },
        video: null,
        audio: null,
        image: null,
        gif,
        caption: info.title,
    }
}