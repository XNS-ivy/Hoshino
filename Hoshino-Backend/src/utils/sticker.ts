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
		let quality = opt.quality ?? 75
		const crop = opt.crop ?? false

		const buildVf = (f: number, isCrop: boolean) => {
			if (isCrop) {
				return `crop=min(iw\\,ih):min(iw\\,ih),scale=512:512,fps=${f}`
			}
			return `scale=512:512:force_original_aspect_ratio=decrease,fps=${f},pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0`
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

		// Pass 1: High Quality / Configured parameters
		await runFfmpeg(buildVf(fps, crop), quality, duration)
		let stat = await fs.stat(output).catch(() => ({ size: 0 }))

		// Pass 2: Medium Quality if > 900KB and quality not explicitly set
		if (stat.size / 1024 > 900 && !opt.quality) {
			quality = 50
			await runFfmpeg(buildVf(fps, crop), quality, duration)
			stat = await fs.stat(output).catch(() => ({ size: 0 }))
		}

		// Pass 3: Low Quality & 10 FPS if > 900KB and parameters not set
		if (stat.size / 1024 > 900 && !opt.quality) {
			quality = 30
			if (!opt.fps) fps = 10
			await runFfmpeg(buildVf(fps, crop), quality, duration)
			stat = await fs.stat(output).catch(() => ({ size: 0 }))
		}

		// Pass 4: Gradual Duration Trimming Loop if still > 900KB and duration not set
		while (stat.size / 1024 > 900 && duration > 1.5 && !opt.duration) {
			duration = Math.max(1.5, Number((duration * 0.85).toFixed(2)))
			await runFfmpeg(buildVf(fps, crop), quality, duration)
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
