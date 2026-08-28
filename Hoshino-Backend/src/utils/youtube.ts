import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import youtubedl from "youtube-dl-exec"

export interface YoutubeMetadata {
	id: string
	title: string
	url: string
	duration: string
	durationSeconds: number
	uploader: string
	thumbnail?: string
	views?: number
	description?: string
}

export interface YoutubeDownloadResult {
	buffer: Buffer
	meta: YoutubeMetadata
	mimetype: string
	fileName: string
	sizeBytes: number
}

const YOUTUBE_REGEX =
	/^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i

/**
 * Checks if the given string is a valid YouTube URL.
 */
export function isValidYoutubeUrl(input: string): boolean {
	return YOUTUBE_REGEX.test(input.trim())
}

/**
 * Extracts YouTube Video ID from a URL.
 */
export function extractYoutubeId(input: string): string | null {
	const match = input.trim().match(YOUTUBE_REGEX)
	return match?.[5] ?? null
}

/**
 * Formats view count into human-readable string (e.g. 1.2M, 450K).
 */
export function formatViews(views?: number): string {
	if (!views || Number.isNaN(views)) return "N/A"
	if (views >= 1_000_000_000) {
		return `${(views / 1_000_000_000).toFixed(1)}B`
	}
	if (views >= 1_000_000) {
		return `${(views / 1_000_000).toFixed(1)}M`
	}
	if (views >= 1_000) {
		return `${(views / 1_000).toFixed(1)}K`
	}
	return views.toLocaleString("en-US")
}

/**
 * Formats duration in seconds to MM:SS or HH:MM:SS.
 */
export function formatDuration(seconds?: number): string {
	if (!seconds || Number.isNaN(seconds)) return "0:00"
	const hrs = Math.floor(seconds / 3600)
	const mins = Math.floor((seconds % 3600) / 60)
	const secs = Math.floor(seconds % 60)

	const paddedSecs = secs.toString().padStart(2, "0")
	if (hrs > 0) {
		const paddedMins = mins.toString().padStart(2, "0")
		return `${hrs}:${paddedMins}:${paddedSecs}`
	}
	return `${mins}:${paddedSecs}`
}

/**
 * Sanitizes a title for use in filenames.
 */
export function sanitizeFileName(name: string): string {
	return name
		.replace(/[\\/:*?"<>|]+/g, "")
		.trim()
		.slice(0, 80)
}

/**
 * Fetches YouTube video metadata from a direct URL or search query.
 */
export async function fetchYoutubeMetadata(
	queryOrUrl: string,
): Promise<YoutubeMetadata | null> {
	const clean = queryOrUrl.trim()
	const target = isValidYoutubeUrl(clean) ? clean : `ytsearch1:${clean}`

	try {
		const rawInfo = (await youtubedl(target, {
			dumpSingleJson: true,
			noWarnings: true,
			noCheckCertificates: true,
			preferFreeFormats: true,
		})) as Record<string, unknown>

		const entries = rawInfo.entries as Record<string, unknown>[] | undefined
		const info = entries?.[0] ?? rawInfo

		const id = (info.id as string) || ""
		const title = (info.title as string) || "YouTube Video"
		const url =
			(info.webpage_url as string) ||
			(info.url as string) ||
			(id ? `https://www.youtube.com/watch?v=${id}` : clean)
		const durationSeconds = Number(info.duration) || 0
		const duration =
			(info.duration_string as string) || formatDuration(durationSeconds)
		const uploader =
			(info.uploader as string) || (info.channel as string) || "Unknown Creator"
		const thumbnail = info.thumbnail as string | undefined
		const views = Number(info.view_count) || undefined
		const description = info.description as string | undefined

		return {
			id,
			title,
			url,
			duration,
			durationSeconds,
			uploader,
			thumbnail,
			views,
			description,
		}
	} catch {
		return null
	}
}

/**
 * Downloads a YouTube video (MP4) or audio (MP3) into a buffer with automated cleanup.
 */
export async function downloadYoutubeMedia(
	queryOrUrl: string,
	type: "video" | "audio",
): Promise<YoutubeDownloadResult> {
	const clean = queryOrUrl.trim()
	const isUrl = isValidYoutubeUrl(clean)
	const target = isUrl ? clean : `ytsearch1:${clean}`

	// 1. Fetch metadata first
	const meta = await fetchYoutubeMetadata(target)
	if (!meta) {
		throw new Error("Video not found or is inaccessible.")
	}

	// Guard: Maximum duration limit (e.g. 20 minutes) to prevent server strain & payload overflow
	const MAX_DURATION_SECONDS = 20 * 60
	if (meta.durationSeconds > MAX_DURATION_SECONDS) {
		throw new Error(
			`Video duration too long (${meta.duration}). Maximum allowed is 20 minutes.`,
		)
	}

	const tempDir = os.tmpdir()
	const safeTitle = sanitizeFileName(meta.title) || "youtube_media"
	const ext = type === "video" ? "mp4" : "mp3"
	const outputPath = path.join(
		tempDir,
		`hoshino_yt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`,
	)

	try {
		if (type === "video") {
			await youtubedl(meta.url, {
				output: outputPath,
				format:
					"bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]/best",
				mergeOutputFormat: "mp4",
				noWarnings: true,
				noCheckCertificates: true,
			})
		} else {
			await youtubedl(meta.url, {
				output: outputPath,
				extractAudio: true,
				audioFormat: "mp3",
				audioQuality: 0,
				noWarnings: true,
				noCheckCertificates: true,
			})
		}

		const buffer = await fs.readFile(outputPath)
		const stats = await fs.stat(outputPath)

		return {
			buffer,
			meta,
			mimetype: type === "video" ? "video/mp4" : "audio/mpeg",
			fileName: `${safeTitle}.${ext}`,
			sizeBytes: stats.size,
		}
	} finally {
		// Clean up temporary file asynchronously
		void fs.unlink(outputPath).catch(() => {})
	}
}
