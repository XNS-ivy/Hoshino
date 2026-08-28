import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fbdown } from "btch-downloader"
import youtubedl from "youtube-dl-exec"

export interface FacebookVideoResult {
	buffer: Buffer
	title: string
	uploader: string
	duration?: string
	url: string
	fileName: string
	sizeBytes: number
}

const FB_REGEX =
	/^(https?:\/\/)?(www\.|web\.|m\.|mobile\.)?(facebook\.com|fb\.watch|fb\.com)\/(watch\/?\?v=[0-9]+|reel\/[0-9a-zA-Z_-]+|share\/(v|r)\/[0-9a-zA-Z_-]+|[a-zA-Z0-9._-]+\/(videos|posts)\/[0-9]+|[a-zA-Z0-9._-]+)/i

/**
 * Validates whether the given string is a valid Facebook video/reel link.
 */
export function isValidFacebookUrl(input: string): boolean {
	return FB_REGEX.test(input.trim())
}

/**
 * Downloads a public Facebook video or reel into a buffer with automated cleanup.
 */
export async function downloadFacebookVideo(
	url: string,
): Promise<FacebookVideoResult> {
	const clean = url.trim()
	if (!isValidFacebookUrl(clean)) {
		throw new Error("Invalid Facebook link format.")
	}

	const tempDir = os.tmpdir()
	const outputPath = path.join(
		tempDir,
		`hoshino_fb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.mp4`,
	)

	// Attempt 1: yt-dlp native extraction
	try {
		const rawInfo = (await youtubedl(clean, {
			dumpSingleJson: true,
			noWarnings: true,
			noCheckCertificates: true,
		})) as Record<string, unknown>

		const title =
			(rawInfo.title as string) ||
			(rawInfo.description as string) ||
			"Facebook Video"
		const uploader =
			(rawInfo.uploader as string) ||
			(rawInfo.channel as string) ||
			"Facebook User"
		const duration = (rawInfo.duration_string as string) || undefined

		await youtubedl(clean, {
			output: outputPath,
			format: "best[ext=mp4]/best",
			noWarnings: true,
			noCheckCertificates: true,
		})

		const buffer = await fs.readFile(outputPath)
		const stats = await fs.stat(outputPath)

		return {
			buffer,
			title,
			uploader,
			duration,
			url: clean,
			fileName: `facebook_${Date.now()}.mp4`,
			sizeBytes: stats.size,
		}
	} catch (primaryError) {
		// Attempt 2: Fallback via btch-downloader fbdown
		try {
			const fbRes = await fbdown(clean)
			const directUrl = fbRes.HD || fbRes.Normal_video
			if (!directUrl) {
				throw primaryError
			}

			const videoFetch = await fetch(directUrl, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				},
			})

			if (!videoFetch.ok) {
				throw primaryError
			}

			const arrayBuffer = await videoFetch.arrayBuffer()
			const buffer = Buffer.from(arrayBuffer)

			return {
				buffer,
				title: "Facebook Video",
				uploader: "Facebook User",
				url: clean,
				fileName: `facebook_${Date.now()}.mp4`,
				sizeBytes: buffer.length,
			}
		} catch {
			throw primaryError
		}
	} finally {
		void fs.unlink(outputPath).catch(() => {})
	}
}
