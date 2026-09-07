import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { logger } from "./logger"

/**
 * Detects the media format/extension from buffer magic bytes.
 */
function detectExtension(buf: Buffer): string {
	if (!buf || buf.length < 4) return "mp4"
	const magic = buf.slice(0, 4)
	if (magic.toString("ascii", 0, 3) === "GIF") return "gif"
	if (magic[0] === 0x89 && magic.toString("ascii", 1, 4) === "PNG") return "png"
	if (magic[0] === 0xff && magic[1] === 0xd8 && magic[2] === 0xff) return "jpg"
	if (magic.toString("ascii", 0, 4) === "RIFF") return "webp"
	return "mp4"
}

/**
 * Transcodes a video or GIF buffer into a standard WhatsApp-compatible MP4 format.
 * - Auto-detects input format (raw .gif, .mp4, .webp) to prevent demuxer failures
 * - Forces H.264 (libx264) Baseline Profile Level 3.0 and yuv420p pixel format
 * - Normalizes dimensions to even numbers (scale=trunc(iw/2)*2:trunc(ih/2)*2)
 * - Enables +faststart for instant streaming/looping playback on WhatsApp
 * - Strips audio (-an) for GIFs or encodes to AAC for regular videos
 */
export async function transcodeForWhatsapp(
	inputBuffer: Buffer,
	isGif = false,
): Promise<Buffer> {
	if (!inputBuffer || inputBuffer.length === 0) {
		return inputBuffer
	}

	const tmpDir = os.tmpdir()
	const id = Math.random().toString(36).slice(2, 9)
	const ext = detectExtension(inputBuffer)
	const inPath = path.join(tmpDir, `hoshino_wa_in_${id}.${ext}`)
	const outPath = path.join(tmpDir, `hoshino_wa_out_${id}.mp4`)

	await fs.writeFile(inPath, inputBuffer)

	try {
		const ffmpegArgs = [
			"ffmpeg",
			"-loglevel",
			"error",
			"-i",
			inPath,
			"-c:v",
			"libx264",
			"-profile:v",
			"baseline",
			"-level",
			"3.0",
			"-preset",
			"veryfast",
			"-crf",
			"23",
			"-pix_fmt",
			"yuv420p",
			"-vf",
			"scale=trunc(iw/2)*2:trunc(ih/2)*2",
			"-movflags",
			"+faststart",
		]

		if (isGif) {
			ffmpegArgs.push("-an")
		} else {
			ffmpegArgs.push("-c:a", "aac", "-b:a", "128k")
		}

		ffmpegArgs.push("-y", outPath)

		const proc = Bun.spawn({
			cmd: ffmpegArgs,
			stdout: "ignore",
			stderr: "ignore",
		})
		const exitCode = await proc.exited

		if (exitCode === 0) {
			const outBuf = await fs.readFile(outPath)
			if (outBuf.length > 0) {
				return outBuf
			}
		}

		logger.warn(
			"/utils/media.ts",
			`ffmpeg exited with code ${exitCode}, falling back to original buffer`,
		)
		return inputBuffer
	} catch (err) {
		logger.warn(
			"/utils/media.ts",
			`transcodeForWhatsapp failed: ${err}, using raw buffer`,
		)
		return inputBuffer
	} finally {
		await fs.unlink(inPath).catch(() => {})
		await fs.unlink(outPath).catch(() => {})
	}
}
