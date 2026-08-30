import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fbdown } from "btch-downloader"
import { getLinkPreview } from "link-preview-js"
import youtubedl from "youtube-dl-exec"
import { logger } from "./logger"

export interface FacebookMediaResult {
	type: "video" | "image" | "images"
	buffer?: Buffer
	images?: string[]
	title: string
	uploader: string
	duration?: string
	url: string
	fileName: string
	sizeBytes?: number
}

const FB_REGEX =
	/^(https?:\/\/)?(www\.|web\.|m\.|mobile\.)?(facebook\.com|fb\.watch|fb\.com)\/(watch\/?\?v=[0-9]+|reel\/[0-9a-zA-Z_-]+|share\/(v|r|p)\/[0-9a-zA-Z_-]+|[a-zA-Z0-9._-]+\/(videos|posts|photos)\/[0-9]+|photo(\.php)?\?fbid=[0-9]+|[a-zA-Z0-9._-]+)/i

/**
 * Validates whether the given string is a valid Facebook video, reel, or photo link.
 */
export function isValidFacebookUrl(input: string): boolean {
	return FB_REGEX.test(input.trim())
}

/**
 * Checks if the Facebook URL is specifically a photo link.
 */
function isFacebookPhotoUrl(url: string): boolean {
	const lower = url.toLowerCase()
	return (
		lower.includes("/photo") ||
		lower.includes("/photos/") ||
		lower.includes("fbid=") ||
		lower.includes("/share/p/")
	)
}

/**
 * Downloads a public Facebook video, reel, or photo into a buffer with automated routing.
 */
export async function downloadFacebookMedia(
	url: string,
): Promise<FacebookMediaResult> {
	const clean = url.trim()
	if (!isValidFacebookUrl(clean)) {
		throw new Error("Invalid Facebook link format.")
	}

	// ──────────────────────────────────────────
	// Case 1: Facebook Photo / Post Extraction
	// ──────────────────────────────────────────
	if (isFacebookPhotoUrl(clean)) {
		try {
			const preview = (await getLinkPreview(clean, {
				followRedirects: "follow",
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				},
			})) as Record<string, unknown>

			const rawImages = (preview.images as string[]) || []
			const title =
				(preview.description as string) ||
				(preview.title as string) ||
				"Facebook Photo"

			const validImages = rawImages.filter(
				(img) => typeof img === "string" && img.startsWith("http"),
			)

			if (validImages.length === 1 && validImages[0]) {
				const imgRes = await fetch(validImages[0])
				if (imgRes.ok) {
					const arrayBuf = await imgRes.arrayBuffer()
					const buffer = Buffer.from(arrayBuf)
					return {
						type: "image",
						buffer,
						title,
						uploader: "Facebook User",
						url: clean,
						fileName: `facebook_${Date.now()}.jpg`,
						sizeBytes: buffer.length,
					}
				}
			} else if (validImages.length > 1) {
				return {
					type: "images",
					images: validImages,
					title,
					uploader: "Facebook User",
					url: clean,
					fileName: `facebook_${Date.now()}.jpg`,
				}
			}
		} catch (photoErr) {
			logger.warn(
				"/utils/facebook.ts",
				`Failed fetching photo via preview for ${clean}: ${photoErr}`,
			)
		}
	}

	// ──────────────────────────────────────────
	// Case 2: Facebook Video / Reel Extraction
	// ──────────────────────────────────────────
	const tempDir = os.tmpdir()
	const outputPath = path.join(
		tempDir,
		`hoshino_fb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.mp4`,
	)

	// Attempt 1: yt-dlp native extraction (H.264 + AAC)
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
			format:
				"bestvideo[vcodec^=avc1][height<=720]+bestaudio[acodec^=mp4a]/best[height<=720][ext=mp4]/best[ext=mp4]/best",
			noWarnings: true,
			noCheckCertificates: true,
		})

		const buffer = await fs.readFile(outputPath)
		const stats = await fs.stat(outputPath)

		return {
			type: "video",
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
				type: "video",
				buffer,
				title: "Facebook Video",
				uploader: "Facebook User",
				url: clean,
				fileName: `facebook_${Date.now()}.mp4`,
				sizeBytes: buffer.length,
			}
		} catch {
			// Attempt 3: Try photo fallback if yt-dlp threw "No video found"
			try {
				const preview = (await getLinkPreview(clean, {
					followRedirects: "follow",
				})) as Record<string, unknown>
				const rawImages = (preview.images as string[]) || []
				if (rawImages.length > 0 && rawImages[0]) {
					const imgRes = await fetch(rawImages[0])
					if (imgRes.ok) {
						const buffer = Buffer.from(await imgRes.arrayBuffer())
						return {
							type: "image",
							buffer,
							title: (preview.title as string) || "Facebook Photo",
							uploader: "Facebook User",
							url: clean,
							fileName: `facebook_${Date.now()}.jpg`,
							sizeBytes: buffer.length,
						}
					}
				}
			} catch {}

			throw primaryError
		}
	} finally {
		void fs.unlink(outputPath).catch(() => {})
	}
}

// Backward compatibility alias
export const downloadFacebookVideo = downloadFacebookMedia
