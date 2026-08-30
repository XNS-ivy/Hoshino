import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import * as webpmux from "node-webpmux"
import sharp from "sharp"

export interface StickerOptions {
	crop?: boolean
	fit?: "contain" | "cover" | "fill" | "inside" | "outside"
	quality?: number
	lossless?: boolean
	fps?: number
	duration?: number
	packname?: string
	publisher?: string
}

export const STICKER_ARG_MAP: Record<string, Partial<StickerOptions>> = {
	// Static & Animated flags
	crop: { crop: true },
	hq: { quality: 100 },
	lq: { quality: 50 },
	// Static fit modes
	cover: { fit: "cover" },
	fill: { fit: "fill" },
	contain: { fit: "contain" },
	inside: { fit: "inside" },
	outside: { fit: "outside" },
	lossless: { lossless: true },
	// Animated options
	fps8: { fps: 8 },
	fps12: { fps: 12 },
	fps15: { fps: 15 },
	fps24: { fps: 24 },
	"3s": { duration: 3 },
	"5s": { duration: 5 },
	"8s": { duration: 8 },
}

/**
 * Parses command args into StickerOptions, extracting flags (crop, hq, cover, fps15, etc.) and EXIF Pack/Publisher names.
 */
export function parseStickerOptions(args: string[]): StickerOptions {
	const opt: StickerOptions = {}
	const remainingArgs: string[] = []

	for (const arg of args) {
		const mapped = STICKER_ARG_MAP[arg.toLowerCase()]
		if (mapped) {
			Object.assign(opt, mapped)
		} else {
			remainingArgs.push(arg)
		}
	}

	const fullText = remainingArgs.join(" ").trim()
	if (fullText) {
		if (fullText.includes("|")) {
			const [pName, pubName] = fullText.split("|").map((s) => s.trim())
			if (pName) opt.packname = pName
			if (pubName) opt.publisher = pubName
		} else {
			opt.packname = fullText
		}
	}

	return opt
}

/**
 * Writes WhatsApp Sticker EXIF Metadata (Pack Name & Publisher) using node-webpmux.
 */
export async function writeExif(
	media: Buffer,
	packname = "Hoshino Bot",
	publisher = "XNS-ivy",
): Promise<Buffer> {
	const stringJson = JSON.stringify({
		"sticker-pack-name": packname,
		"sticker-pack-publisher": publisher,
		emojis: ["✨"],
	})

	const exifAttr = Buffer.from("SUkqAAgAAAABAEFXBwAAAAAAFgAAAA==", "base64")
	const jsonBuff = Buffer.from(stringJson, "utf8")
	const exif = Buffer.concat([exifAttr, jsonBuff])
	exif.writeUIntLE(jsonBuff.length, 14, 4)

	const img = new webpmux.Image()
	await img.load(media)
	img.exif = exif
	const savedBuffer = await img.save(null)
	return Buffer.from(savedBuffer)
}

/**
 * Converts static image buffer into a 512x512 WebP WhatsApp sticker with options (crop, fit, quality, EXIF).
 */
export async function makeSticker(
	buffer: Buffer,
	opt: StickerOptions = {},
): Promise<Buffer> {
	const quality = opt.quality ?? 80
	const fit = opt.fit ?? "contain"
	const packname = opt.packname ?? "Hoshino Bot"
	const publisher = opt.publisher ?? "XNS-ivy"

	let pipeline = sharp(buffer)

	if (opt.crop) {
		const meta = await pipeline.metadata()
		if (meta.width && meta.height) {
			const size = Math.min(meta.width, meta.height)
			pipeline = pipeline.extract({
				left: Math.floor((meta.width - size) / 2),
				top: Math.floor((meta.height - size) / 2),
				width: size,
				height: size,
			})
		}
	}

	const webpBuffer = await pipeline
		.resize(512, 512, {
			fit,
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		})
		.webp({ quality, lossless: opt.lossless ?? false })
		.toBuffer()

	return await writeExif(webpBuffer, packname, publisher)
}

/**
 * Converts video/GIF buffer into an animated 512x512 WebP WhatsApp sticker with options (crop, fps, duration, EXIF).
 */
export async function makeAnimatedSticker(
	buffer: Buffer,
	opt: StickerOptions = {},
): Promise<Buffer> {
	const id = randomUUID()
	const tmpDir = os.tmpdir()
	const input = path.join(tmpDir, `${id}.mp4`)
	const output = path.join(tmpDir, `${id}.webp`)

	await fs.writeFile(input, buffer)

	try {
		const packname = opt.packname ?? "Hoshino Bot"
		const publisher = opt.publisher ?? "XNS-ivy"
		let duration = opt.duration ?? 6.0
		let fps = opt.fps ?? 15
		let quality = opt.quality ?? 70
		const crop = opt.crop ?? false
		let size = 512

		const buildVf = (f: number, isCrop: boolean, s: number) => {
			if (isCrop) {
				return `crop=min(iw\\,ih):min(iw\\,ih),scale=${s}:${s},fps=${f}`
			}
			return `scale=${s}:${s}:force_original_aspect_ratio=decrease,fps=${f},pad=${s}:${s}:(ow-iw)/2:(oh-ih)/2:color=black@0`
		}

		const runFfmpeg = async (vf: string, q: number, d: number) => {
			const proc = Bun.spawn({
				cmd: [
					"ffmpeg",
					"-loglevel",
					"quiet",
					"-i",
					input,
					"-an",
					"-vf",
					vf,
					"-loop",
					"0",
					"-q:v",
					String(q),
					"-t",
					String(d),
					"-pix_fmt",
					"yuva420p",
					"-y",
					output,
				],
				stdout: "ignore",
				stderr: "ignore",
			})
			await proc.exited
		}

		// Tier 1: Initial high-quality render
		await runFfmpeg(buildVf(fps, crop, size), quality, duration)
		let stat = await fs.stat(output).catch(() => ({ size: 0 }))

		// Tier 2: Lower quality & slight FPS drop (512x512, q50, 12 fps)
		if (stat.size / 1024 > 850 && !opt.quality) {
			quality = 50
			if (!opt.fps) fps = 12
			await runFfmpeg(buildVf(fps, crop, size), quality, duration)
			stat = await fs.stat(output).catch(() => ({ size: 0 }))
		}

		// Tier 3: Downscale resolution to 400x400 (saves ~40-50% size while preserving duration)
		if (stat.size / 1024 > 850) {
			size = 400
			quality = 45
			if (!opt.fps) fps = 12
			await runFfmpeg(buildVf(fps, crop, size), quality, duration)
			stat = await fs.stat(output).catch(() => ({ size: 0 }))
		}

		// Tier 4: Downscale resolution to 320x320 & 10 FPS (saves ~70% size while preserving duration)
		if (stat.size / 1024 > 850) {
			size = 320
			quality = 35
			if (!opt.fps) fps = 10
			await runFfmpeg(buildVf(fps, crop, size), quality, duration)
			stat = await fs.stat(output).catch(() => ({ size: 0 }))
		}

		// Tier 5: Downscale resolution to 256x256 & 8 FPS (saves ~80% size while preserving duration)
		if (stat.size / 1024 > 850) {
			size = 256
			quality = 25
			if (!opt.fps) fps = 8
			await runFfmpeg(buildVf(fps, crop, size), quality, duration)
			stat = await fs.stat(output).catch(() => ({ size: 0 }))
		}

		// Tier 6 (Last Resort): If even at 256x256 @ 8fps it exceeds 850KB, gently trim duration
		while (stat.size / 1024 > 850 && duration > 2.0 && !opt.duration) {
			duration = Math.max(2.0, Number((duration * 0.85).toFixed(2)))
			await runFfmpeg(buildVf(fps, crop, size), quality, duration)
			stat = await fs.stat(output).catch(() => ({ size: 0 }))
		}

		if (stat.size === 0) {
			return await makeSticker(buffer, opt)
		}

		const webpBuffer = await fs.readFile(output)
		return await writeExif(webpBuffer, packname, publisher)
	} finally {
		await fs.unlink(input).catch(() => {})
		await fs.unlink(output).catch(() => {})
	}
}
