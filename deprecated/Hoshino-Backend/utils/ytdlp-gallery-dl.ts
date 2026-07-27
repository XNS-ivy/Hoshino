import { pipeline } from 'stream/promises'
import { PassThrough } from 'stream'
import fs, { existsSync } from 'fs'
import os from 'os'
import path from 'path'
import { normalizeUrl } from './validate-url'

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

// ── State ─────────────────────────────────────────────────────────────────────

let ytdlpBin: string | null = null
let galleryDlBin: string | null = null
const YTDLP_EXTRA_ARGS: string[] = []
const GALLERY_DL_EXTRA_ARGS: string[] = []

// ── Binary resolvers ──────────────────────────────────────────────────────────

async function ensureYtdlp(): Promise<string> {
    if (!ytdlpBin) ytdlpBin = await resolveBinary('yt-dlp', 'yt-dlp.exe', [
        '/usr/local/bin/yt-dlp',
        '/usr/bin/yt-dlp',
        `${process.env.HOME}/.local/bin/yt-dlp`,
    ], [
        'C:\\tools\\yt-dlp.exe',
        'C:\\yt-dlp\\yt-dlp.exe',
        `${process.env.APPDATA}\\yt-dlp\\yt-dlp.exe`,
        `${process.env.LOCALAPPDATA}\\Microsoft\\WinGet\\Links\\yt-dlp.exe`,
    ], 'sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod +x /usr/local/bin/yt-dlp')
    return ytdlpBin
}

async function ensureGalleryDl(): Promise<string> {
    if (!galleryDlBin) galleryDlBin = await resolveBinary('gallery-dl', 'gallery-dl.exe', [
        '/usr/local/bin/gallery-dl',
        '/usr/bin/gallery-dl',
        `${process.env.HOME}/.local/bin/gallery-dl`,
        `${process.env.HOME}/.local/pipx/envs/gallery-dl/bin/gallery-dl`,
    ], [
        'C:\\tools\\gallery-dl.exe',
        'C:\\gallery-dl\\gallery-dl.exe',
        `${process.env.APPDATA}\\gallery-dl\\gallery-dl.exe`,
        `${process.env.LOCALAPPDATA}\\Programs\\Python\\Scripts\\gallery-dl.exe`,
        `${process.env.APPDATA}\\Python\\Scripts\\gallery-dl.exe`,
    ], 'pip install gallery-dl  atau  sudo curl -L https://github.com/mikf/gallery-dl/releases/latest/download/gallery-dl.bin -o /usr/local/bin/gallery-dl && sudo chmod +x /usr/local/bin/gallery-dl')
    return galleryDlBin
}

async function resolveBinary(
    unixName: string,
    winName: string,
    unixCandidates: string[],
    winCandidates: string[],
    installHint: string
): Promise<string> {
    const isWindows = process.platform === 'win32'
    const binary = isWindows ? winName : unixName
    const whichCmd = isWindows ? 'where' : 'which'

    try {
        const proc = Bun.spawn({ cmd: [whichCmd, binary], stdout: 'pipe', stderr: 'pipe' })
        const [, found] = await Promise.all([
            proc.exited,
            new Response(proc.stdout).text(),
        ])
        const bin = found.trim().split('\n')[0]
        if (bin && existsSync(bin)) return bin
    } catch { }

    const candidates = isWindows ? winCandidates : unixCandidates
    for (const p of candidates) {
        if (p && existsSync(p)) return p
    }

    throw new Error(`${binary} not found. Install: ${installHint}`)
}

// ── Init args ─────────────────────────────────────────────────────────────────

export async function initYtdlpArgs() {
    const isWindows = process.platform === 'win32'
    const browsers = isWindows ? ['chrome', 'firefox', 'edge'] : ['chrome', 'firefox', 'chromium']

    for (const browser of browsers) {
        try {
            const proc = Bun.spawn({
                cmd: [await ensureYtdlp(), '--cookies-from-browser', browser, '--dump-json', '--no-download', '--quiet', 'https://www.youtube.com/'],
                stdout: 'pipe',
                stderr: 'pipe',
            })
            const [exitCode] = await Promise.all([
                proc.exited,
                new Response(proc.stdout).text(),
                new Response(proc.stderr).text(),
            ])
            if (exitCode === 0) {
                YTDLP_EXTRA_ARGS.push('--cookies-from-browser', browser)
                console.log(`[ytdlp] using cookies from browser: ${browser}`)
                return
            }
        } catch { }
    }

    const cookiesCandidates = [
        'cookies.txt',
        'cookies-youtube.txt',
        'youtube-cookies.txt',
        'yt-cookies.txt',
    ].map(f => path.join(path.dirname(Bun.main), f))

    for (const p of cookiesCandidates) {
        if (existsSync(p)) {
            YTDLP_EXTRA_ARGS.push('--cookies', p)
            console.log('[ytdlp] using cookies file:', p)
            return
        }
    }

    console.warn('[ytdlp] no cookies found, some content may be restricted')
}

export async function initGalleryDlArgs() {
    const isWindows = process.platform === 'win32'
    const browsers = isWindows ? ['chrome', 'firefox', 'edge'] : ['chrome', 'firefox', 'chromium']

    for (const browser of browsers) {
        try {
            const proc = Bun.spawn({
                cmd: [await ensureGalleryDl(), '--cookies-from-browser', browser, '--simulate', '--no-input', 'https://www.instagram.com/'],
                stdout: 'pipe',
                stderr: 'pipe',
            })
            const [exitCode] = await Promise.all([
                proc.exited,
                new Response(proc.stdout).text(),
                new Response(proc.stderr).text(),
            ])
            if (exitCode === 0) {
                GALLERY_DL_EXTRA_ARGS.push('--cookies-from-browser', browser)
                console.log(`[gallery-dl] using cookies from browser: ${browser}`)
                return
            }
        } catch { }
    }

    const cookiesCandidates = [
        'cookies-instagram.txt',
        'instagram-cookies.txt',
        'ig-cookies.txt',
        'cookies-twitter.txt',
        'twitter-cookies.txt',
        'cookies.txt',
        'youtube-cookies.txt',
        'yt-cookies.txt',
    ].map(f => path.join(path.dirname(Bun.main), f))

    for (const p of cookiesCandidates) {
        if (existsSync(p)) {
            GALLERY_DL_EXTRA_ARGS.push('--cookies', p)
            console.log('[gallery-dl] using cookies file:', p)
            return
        }
    }

    console.warn('[gallery-dl] no cookies found, some platforms may not work (Instagram, etc)')
}

function getGalleryDlArgs(): string[] {
    return GALLERY_DL_EXTRA_ARGS
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function toBuffer(readable: ReadableStream | NodeJS.ReadableStream): Promise<Buffer> {
    const pass = new PassThrough()
    const chunks: Buffer[] = []
    pass.on('data', (chunk: Buffer) => chunks.push(chunk))

    if (readable instanceof ReadableStream) {
        const nodeStream = require('stream').Readable.fromWeb(readable)
        await pipeline(nodeStream, pass)
    } else {
        await pipeline(readable as NodeJS.ReadableStream, pass)
    }

    return Buffer.concat(chunks)
}

async function spawnToBuffer(cmd: string[]): Promise<Buffer> {
    const proc = Bun.spawn({ cmd, stdout: 'pipe', stderr: 'pipe' })
    const [exitCode, buf, err] = await Promise.all([
        proc.exited,
        toBuffer(proc.stdout),
        new Response(proc.stderr).text(),
    ])
    if (exitCode !== 0) throw new Error(`Command failed: ${err}`)
    return buf
}

// ── Info resolvers ────────────────────────────────────────────────────────────

async function getInfoYtdlp(url: string): Promise<{ data: any; raw: string; err: string; exitCode: number }> {
    const bin = await ensureYtdlp()
    const proc = Bun.spawn({
        cmd: [bin, '--dump-json', '--no-download', ...YTDLP_EXTRA_ARGS, url],
        stdout: 'pipe',
        stderr: 'pipe',
    })

    const [exitCode, raw, err] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ])

    if (exitCode !== 0) return { data: null, raw, err, exitCode }

    const lines = raw.trim().split('\n').filter(Boolean)
    const data = lines.length ? JSON.parse(String(lines[0])) : null
    return { data, raw, err, exitCode }
}

async function getInfoGalleryDl(url: string): Promise<YtdlpInfo> {
    const bin = await ensureGalleryDl()
    const proc = Bun.spawn({
        cmd: [bin, '-j', '--no-download', ...getGalleryDlArgs(), url],
        stdout: 'pipe',
        stderr: 'pipe',
    })

    const [exitCode, raw, err] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ])

    if (!raw.trim()) throw new Error(`gallery-dl empty output. stderr: ${err}`)

    const lines = raw.trim().split('\n').filter(Boolean)
    const first = JSON.parse(String(lines[0]))

    if (Array.isArray(first) && first[0] === -1) {
        const errObj = first[1]
        throw new Error(`gallery-dl error: ${errObj?.message ?? JSON.stringify(errObj)}`)
    }

    const meta = Array.isArray(first) ? first[2] : first
    if (!meta) throw new Error('gallery-dl: no metadata found')

    const ext = (meta.extension ?? meta.ext ?? 'jpg') as string
    const isGif = ext === 'gif'

    return {
        title: meta.description ?? meta.title ?? meta.post_shortcode ?? 'media',
        url: meta.url ?? (Array.isArray(first) ? first[1] : ''),
        duration: 0,
        thumbnail: meta.thumbnail ?? '',
        ext,
        mediaType: isGif ? 'gif' : 'image',
    }
}

async function getInfo(url: string): Promise<YtdlpInfo> {
    url = normalizeUrl(url)

    const isYoutubePost = /youtube\.com\/post\//i.test(url)
    if (isYoutubePost) return await getInfoYoutubePost(url)

    const { data, err, exitCode } = await getInfoYtdlp(url)

    if (exitCode !== 0 || !data) {
        const isTwitter = /(?:twitter\.com|x\.com)/i.test(url)
        const isInstagram = /instagram\.com/i.test(url)
        const isFacebook = /facebook\.com/i.test(url)

        if (isTwitter || isInstagram || isFacebook) {
            return await getInfoGalleryDl(url)
        }
        throw new Error(`yt-dlp info failed: ${err}`)
    }

    const ext = (data.ext as string) ?? 'mp4'
    const vcodec = (data.vcodec as string) ?? 'none'
    const acodec = (data.acodec as string) ?? 'none'

    const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
    const isGif = ext === 'gif'
    const isAudio = vcodec === 'none' && acodec !== 'none'
    const mediaType = isImage ? 'image' : isGif ? 'gif' : isAudio ? 'audio' : 'video'

    return {
        title: data.title as string,
        url: data.webpage_url as string,
        duration: (data.duration as number) ?? 0,
        thumbnail: data.thumbnail as string,
        ext,
        mediaType,
    }
}

async function getInfoYoutubePost(url: string): Promise<YtdlpInfo> {
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
        }
    })

    if (!res.ok) throw new Error(`Failed to fetch YouTube post: ${res.status}`)

    const html = await res.text()
    const match = html.match(/var ytInitialData\s*=\s*({.+?});<\/script>/)
    if (!match) throw new Error('Could not parse YouTube post data')

    const ytData = JSON.parse(String(match[1]))
    const backstagePost = ytData?.contents
        ?.twoColumnBrowseResultsRenderer?.tabs?.[0]
        ?.tabRenderer?.content
        ?.sectionListRenderer?.contents?.[0]
        ?.itemSectionRenderer?.contents?.[0]
        ?.backstagePostThreadRenderer?.post
        ?.backstagePostRenderer

    if (!backstagePost) throw new Error('Could not find post content')

    const text = backstagePost.contentText?.runs?.map((r: any) => r.text).join('') ?? ''
    const images: { url: string; width?: number; height?: number }[] =
        backstagePost.backstageAttachment?.backstageImageRenderer?.image?.thumbnails ?? []
    const bestImage = images.at(-1)

    return {
        title: text.slice(0, 100) || 'YouTube Post',
        url: bestImage?.url ?? url,
        duration: 0,
        thumbnail: bestImage?.url ?? '',
        ext: 'jpg',
        mediaType: 'image',
    }
}

// ── Download helpers ──────────────────────────────────────────────────────────

async function downloadWithGalleryDl(url: string): Promise<Buffer> {
    const bin = await ensureGalleryDl()
    const tmpDir = path.join(os.tmpdir(), `hoshino-gdl-${Date.now()}`)
    fs.mkdirSync(tmpDir, { recursive: true })

    const proc = Bun.spawn({
        cmd: [bin, '-d', tmpDir, ...getGalleryDlArgs(), url],
        stdout: 'pipe',
        stderr: 'pipe',
    })

    const [exitCode, , err] = await Promise.all([
        proc.exited,
        toBuffer(proc.stdout),
        new Response(proc.stderr).text(),
    ])

    if (exitCode !== 0) throw new Error(`gallery-dl download failed: ${err}`)

    const files = fs.readdirSync(tmpDir)
    if (!files.length) throw new Error('gallery-dl downloaded no files')

    const pass = new PassThrough()
    const chunks: Buffer[] = []
    pass.on('data', (chunk: Buffer) => chunks.push(chunk))

    const fileStream = fs.createReadStream(path.join(tmpDir, String(files[0])))
    await pipeline(fileStream, pass)

    const buf = Buffer.concat(chunks)
    fs.rmSync(tmpDir, { recursive: true, force: true })
    return buf
}

// ── Exports ───────────────────────────────────────────────────────────────────

export async function resolveMedia(url: string): Promise<MediaResult> {
    const bin = await ensureYtdlp()
    const info = await getInfo(url)

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
            result.video = await spawnToBuffer([bin, '-f', 'best[ext=mp4][filesize<50M]/best', '-o', '-', ...YTDLP_EXTRA_ARGS, url])
            break
        case 'audio':
            result.audio = await spawnToBuffer([bin, '-f', 'bestaudio[ext=m4a]/bestaudio', '-o', '-', ...YTDLP_EXTRA_ARGS, url])
            break
        case 'image':
            result.image = await downloadWithGalleryDl(url)
            break
        case 'gif':
            result.gif = await downloadWithGalleryDl(url)
            break
    }

    return result
}

export async function resolveAudio(url: string): Promise<MediaResult> {
    const bin = await ensureYtdlp()
    const info = await getInfo(url)
    const tmpFile = path.join(os.tmpdir(), `hoshino-audio-${Date.now()}.mp3`)

    const proc = Bun.spawn({
        cmd: [bin, '-f', 'bestaudio', '-x', '--audio-format', 'mp3', '--audio-quality', '0', '-o', tmpFile, ...YTDLP_EXTRA_ARGS, url],
        stdout: 'pipe',
        stderr: 'pipe',
    })

    const [exitCode, , err] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ])

    if (exitCode !== 0) throw new Error(`yt-dlp audio failed: ${err}`)

    const audio = Buffer.from(await Bun.file(tmpFile).arrayBuffer())
    fs.unlinkSync(tmpFile)

    return {
        info: { ...info, mediaType: 'audio' },
        video: null, audio, image: null, gif: null,
        caption: info.title,
    }
}

export async function resolveVideo(url: string): Promise<MediaResult> {
    const bin = await ensureYtdlp()
    const info = await getInfo(url)
    const video = await spawnToBuffer([bin, '-f', 'best[ext=mp4][filesize<50M]/best', '-o', '-', ...YTDLP_EXTRA_ARGS, url])

    return {
        info: { ...info, mediaType: 'video' },
        video, audio: null, image: null, gif: null,
        caption: info.title,
    }
}

export async function resolveGif(url: string): Promise<MediaResult> {
    const bin = await ensureYtdlp()
    const info = await getInfo(url)
    const tmpGif = path.join(os.tmpdir(), `hoshino-gif-${Date.now()}.gif`)
    const tmpMp4 = path.join(os.tmpdir(), `hoshino-gif-${Date.now()}.mp4`)

    const proc = Bun.spawn({
        cmd: [bin, '-o', tmpGif, ...YTDLP_EXTRA_ARGS, url],
        stdout: 'pipe',
        stderr: 'pipe',
    })

    const [exitCode, , err] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ])

    if (exitCode !== 0) throw new Error(`yt-dlp gif failed: ${err}`)

    const ffmpeg = Bun.spawn({
        cmd: ['ffmpeg', '-i', tmpGif, '-movflags', 'faststart', '-pix_fmt', 'yuv420p',
            '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-y', tmpMp4],
        stdout: 'pipe',
        stderr: 'pipe',
    })

    const [ffmpegExit, , ffmpegErr] = await Promise.all([
        ffmpeg.exited,
        new Response(ffmpeg.stdout).text(),
        new Response(ffmpeg.stderr).text(),
    ])

    if (ffmpegExit !== 0) throw new Error(`ffmpeg convert failed: ${ffmpegErr}`)

    const gif = Buffer.from(await Bun.file(tmpMp4).arrayBuffer())
    fs.unlinkSync(tmpGif)
    fs.unlinkSync(tmpMp4)

    return {
        info: { ...info, mediaType: 'gif' },
        video: null, audio: null, image: null, gif,
        caption: info.title,
    }
}