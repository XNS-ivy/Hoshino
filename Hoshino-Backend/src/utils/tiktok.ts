export interface TikTokAuthor {
	name: string
	username: string
	avatar?: string
}

export interface TikTokResult {
	type: "video" | "audio" | "images"
	buffer?: Buffer
	images?: string[]
	title: string
	author: TikTokAuthor
	duration?: number
	durationFormatted?: string
	likes?: number
	shares?: number
	comments?: number
	plays?: number
	musicTitle?: string
	musicAuthor?: string
	musicUrl?: string
	url: string
	fileName: string
	sizeBytes?: number
}

const TIKTOK_REGEX =
	/^(https?:\/\/)?(www\.|vm\.|vt\.|mobile\.|m\.)?(tiktok\.com\/(t\/[a-zA-Z0-9_-]+|@[a-zA-Z0-9._-]+\/(video|photo)\/[0-9]+|share\/(video|photo)\/[0-9]+)|vt\.tiktok\.com\/[a-zA-Z0-9_-]+|vm\.tiktok\.com\/[a-zA-Z0-9_-]+)/i

/**
 * Checks if the given string is a valid TikTok URL.
 */
export function isValidTikTokUrl(input: string): boolean {
	return TIKTOK_REGEX.test(input.trim())
}

/**
 * Formats view count / numbers into human-readable string (e.g. 1.2M, 450K).
 */
export function formatTikTokCount(count?: number): string {
	if (!count || Number.isNaN(count)) return "0"
	if (count >= 1_000_000_000) {
		return `${(count / 1_000_000_000).toFixed(1)}B`
	}
	if (count >= 1_000_000) {
		return `${(count / 1_000_000).toFixed(1)}M`
	}
	if (count >= 1_000) {
		return `${(count / 1_000).toFixed(1)}K`
	}
	return count.toLocaleString("en-US")
}

/**
 * Sanitizes a title for use in filenames.
 */
function sanitizeFileName(name: string): string {
	return name
		.replace(/[\\/:*?"<>|]+/g, "")
		.trim()
		.slice(0, 80)
}

/**
 * Downloads TikTok video (no watermark), audio MP3, or photo slides.
 */
export async function downloadTikTokMedia(
	url: string,
	mode: "video" | "audio" = "video",
): Promise<TikTokResult> {
	const cleanUrl = url.trim()
	if (!isValidTikTokUrl(cleanUrl)) {
		throw new Error("Invalid TikTok URL format.")
	}

	const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(cleanUrl)}&hd=1`
	const res = await fetch(apiUrl, {
		headers: {
			"User-Agent":
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		},
	})

	if (!res.ok) {
		throw new Error(`TikWM API HTTP error: ${res.status}`)
	}

	const json = (await res.json()) as {
		code: number
		msg: string
		data?: {
			id: string
			title: string
			duration: number
			play: string
			wmplay: string
			hdplay: string
			music: string
			music_info?: {
				title: string
				author: string
				play: string
			}
			images?: string[]
			author?: {
				nickname: string
				unique_id: string
				avatar: string
			}
			digg_count?: number
			comment_count?: number
			share_count?: number
			play_count?: number
		}
	}

	if (json.code !== 0 || !json.data) {
		throw new Error(
			json.msg || "Video / post TikTok tidak ditemukan atau bersifat privat.",
		)
	}

	const data = json.data
	const title = data.title || "TikTok Media"
	const safeTitle = sanitizeFileName(title) || "tiktok_media"
	const author: TikTokAuthor = {
		name: data.author?.nickname || "TikTok Creator",
		username: data.author?.unique_id || "tiktok",
		avatar: data.author?.avatar,
	}

	// 1. Audio Mode
	if (mode === "audio") {
		const musicUrl = data.music || data.music_info?.play
		if (!musicUrl) {
			throw new Error("Audio track not found for this TikTok post.")
		}

		const musicRes = await fetch(musicUrl, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				Referer: "https://www.tiktok.com/",
			},
		})

		if (!musicRes.ok) {
			throw new Error("Failed to download TikTok audio stream.")
		}

		const arrayBuf = await musicRes.arrayBuffer()
		const buffer = Buffer.from(arrayBuf)

		return {
			type: "audio",
			buffer,
			title,
			author,
			duration: data.duration,
			durationFormatted: `${Math.floor(data.duration / 60)}:${(data.duration % 60).toString().padStart(2, "0")}`,
			likes: data.digg_count,
			shares: data.share_count,
			comments: data.comment_count,
			plays: data.play_count,
			musicTitle: data.music_info?.title || "TikTok Audio",
			musicAuthor: data.music_info?.author || author.name,
			musicUrl,
			url: cleanUrl,
			fileName: `${safeTitle}.mp3`,
			sizeBytes: buffer.length,
		}
	}

	// 2. Photo Slide Mode (Images)
	if (data.images && data.images.length > 0) {
		return {
			type: "images",
			images: data.images,
			title,
			author,
			likes: data.digg_count,
			shares: data.share_count,
			comments: data.comment_count,
			plays: data.play_count,
			musicTitle: data.music_info?.title,
			musicAuthor: data.music_info?.author,
			musicUrl: data.music,
			url: cleanUrl,
			fileName: `${safeTitle}.jpg`,
		}
	}

	// 3. Video Mode (No Watermark MP4)
	const videoUrl = data.hdplay || data.play || data.wmplay
	if (!videoUrl) {
		throw new Error("Video stream URL not found for this TikTok post.")
	}

	const videoRes = await fetch(videoUrl, {
		headers: {
			"User-Agent":
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			Referer: "https://www.tiktok.com/",
		},
	})

	if (!videoRes.ok) {
		throw new Error("Failed to download TikTok video stream.")
	}

	const arrayBuf = await videoRes.arrayBuffer()
	const buffer = Buffer.from(arrayBuf)

	return {
		type: "video",
		buffer,
		title,
		author,
		duration: data.duration,
		durationFormatted: `${Math.floor(data.duration / 60)}:${(data.duration % 60).toString().padStart(2, "0")}`,
		likes: data.digg_count,
		shares: data.share_count,
		comments: data.comment_count,
		plays: data.play_count,
		musicTitle: data.music_info?.title,
		musicAuthor: data.music_info?.author,
		musicUrl: data.music,
		url: cleanUrl,
		fileName: `${safeTitle}.mp4`,
		sizeBytes: buffer.length,
	}
}
