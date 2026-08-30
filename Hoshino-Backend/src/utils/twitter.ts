import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { getLinkPreview } from "link-preview-js"
import youtubedl from "youtube-dl-exec"
import { logger } from "./logger"

export interface TwitterMediaResult {
	type: "video" | "image" | "images" | "gif"
	buffer?: Buffer
	images?: string[]
	title: string
	uploader: string
	duration?: string
	url: string
	fileName: string
	sizeBytes?: number
}

const TWITTER_REGEX =
	/^(https?:\/\/)?(www\.)?(twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/status\/([0-9]+)/i

/**
 * Checks if the given string is a valid Twitter / X URL.
 */
export function isValidTwitterUrl(input: string): boolean {
	return TWITTER_REGEX.test(input.trim())
}

/**
 * Extracts username and tweet ID from a Twitter / X URL.
 */
export function extractTwitterInfo(
	input: string,
): { username: string; id: string } | null {
	const match = input.trim().match(TWITTER_REGEX)
	if (!match?.[4] || !match?.[5]) return null
	return { username: match[4], id: match[5] }
}

/**
 * Downloads media from a Twitter / X post (Video, GIF, or Photos) with automated routing.
 */
export async function downloadTwitterMedia(
	url: string,
): Promise<TwitterMediaResult> {
	const clean = url.trim()
	if (!isValidTwitterUrl(clean)) {
		throw new Error("Invalid Twitter / X link format.")
	}

	const info = extractTwitterInfo(clean)
	const tweetId = info?.id || Date.now().toString()
	const username = info?.username || "Twitter User"

	// ──────────────────────────────────────────
	// Step 1: Try downloading Video / GIF with yt-dlp
	// ──────────────────────────────────────────
	const tempDir = os.tmpdir()
	const outputPath = path.join(
		tempDir,
		`hoshino_tw_${tweetId}_${Math.random().toString(36).slice(2, 7)}.mp4`,
	)

	try {
		const rawInfo = (await youtubedl(clean, {
			dumpSingleJson: true,
			noWarnings: true,
			noCheckCertificates: true,
		})) as Record<string, unknown>

		const title =
			(rawInfo.title as string) ||
			(rawInfo.description as string) ||
			`Tweet from @${username}`
		const uploader =
			(rawInfo.uploader as string) ||
			(rawInfo.channel as string) ||
			`@${username}`
		const duration = (rawInfo.duration_string as string) || undefined
		const durationSeconds = Number(rawInfo.duration) || 0
		const isGif =
			rawInfo.is_gif === true ||
			(durationSeconds > 0 && durationSeconds <= 5 && rawInfo.acodec === "none")

		// Force H.264 AVC1 + AAC for 100% WhatsApp compatibility
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
			type: isGif ? "gif" : "video",
			buffer,
			title,
			uploader,
			duration,
			url: clean,
			fileName: `twitter_${tweetId}.${isGif ? "mp4" : "mp4"}`,
			sizeBytes: stats.size,
		}
	} catch (videoError) {
		const errStr = String(videoError)
		logger.info(
			"/utils/twitter.ts",
			`yt-dlp video not found for tweet ${tweetId}, checking for photos...`,
		)

		// ──────────────────────────────────────────
		// Step 2: Fallback to Photo / Image Extraction
		// ──────────────────────────────────────────
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
				`Tweet by @${username}`

			// Filter and upscale images to highest resolution
			const photos = rawImages
				.filter((img) => typeof img === "string" && img.length > 5)
				.map((img) => {
					if (img.includes("pbs.twimg.com/media/")) {
						return `${img.split("?")[0]}?format=jpg&name=large`
					}
					return img
				})

			if (photos.length === 1 && photos[0]) {
				// Single image: download directly into buffer
				const imgRes = await fetch(photos[0])
				if (imgRes.ok) {
					const arrayBuf = await imgRes.arrayBuffer()
					const buffer = Buffer.from(arrayBuf)
					return {
						type: "image",
						buffer,
						title,
						uploader: `@${username}`,
						url: clean,
						fileName: `twitter_${tweetId}.jpg`,
						sizeBytes: buffer.length,
					}
				}
			} else if (photos.length > 1) {
				// Multiple images album
				return {
					type: "images",
					images: photos,
					title,
					uploader: `@${username}`,
					url: clean,
					fileName: `twitter_${tweetId}.jpg`,
				}
			}
		} catch (photoError) {
			logger.error(
				"/utils/twitter.ts",
				`Failed extracting photos for tweet ${tweetId}: ${photoError}`,
			)
		}

		// If both video and photo extraction failed
		if (errStr.includes("Private") || errStr.includes("protected")) {
			throw new Error("This Twitter/X post is from a private account.")
		}
		throw new Error(
			"No media (video, GIF, or photo) found in this Twitter/X post.",
		)
	} finally {
		void fs.unlink(outputPath).catch(() => {})
	}
}

// Backward compatibility alias
export const downloadTwitterVideo = downloadTwitterMedia
