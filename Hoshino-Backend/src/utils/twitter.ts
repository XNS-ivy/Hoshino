import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import youtubedl from "youtube-dl-exec"

export interface TwitterVideoResult {
	buffer: Buffer
	title: string
	uploader: string
	duration?: string
	url: string
	fileName: string
	sizeBytes: number
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
 * Downloads a video from a Twitter / X post using yt-dlp.
 */
export async function downloadTwitterVideo(
	url: string,
): Promise<TwitterVideoResult> {
	const clean = url.trim()
	if (!isValidTwitterUrl(clean)) {
		throw new Error("Invalid Twitter / X link format.")
	}

	const tempDir = os.tmpdir()
	const outputPath = path.join(
		tempDir,
		`hoshino_tw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.mp4`,
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
			"Twitter Video"
		const uploader =
			(rawInfo.uploader as string) ||
			(rawInfo.channel as string) ||
			"Twitter User"
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
			fileName: `twitter_${Date.now()}.mp4`,
			sizeBytes: stats.size,
		}
	} finally {
		void fs.unlink(outputPath).catch(() => {})
	}
}
