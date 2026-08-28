import { NekosAPI } from "nekosapi"
import type { Rating } from "nekosapi/v4/types/baseImageOptions"
import { type TagNames, Tags } from "nekosapi/v4/types/Tags"
import sharp from "sharp"

export const nekos = new NekosAPI()

export interface WaifuImage {
	id: number
	url?: string
	image_url?: string
	sample_url?: string
	rating?: Rating
	artist_name?: string | null
	artist?: { name?: string }
	source_url?: string | null
	source?: string
	tags?: (string | { name: string })[]
}

export const ALL_TAGS: TagNames[] = Object.keys(Tags).filter((k) =>
	Number.isNaN(Number(k)),
) as TagNames[]

export const NSFW_TAGS: TagNames[] = [
	"Anal",
	"Dick",
	"Exposed anus",
	"Exposed girl breasts",
	"Futanari",
	"Masturbating",
	"Pussy",
	"Threesome",
	"Yuri",
	"Bikini",
	"Wet",
	"Kissing",
]

export const SFW_TAGS: TagNames[] = ALL_TAGS.filter(
	(t) => !NSFW_TAGS.includes(t),
)

const NORMALIZED_TAG_MAP = new Map<string, TagNames>()
for (const tag of ALL_TAGS) {
	NORMALIZED_TAG_MAP.set(tag.toLowerCase().replace(/[\s_-]+/g, ""), tag)
}

export function resolveTag(input: string): TagNames | undefined {
	const clean = input
		.trim()
		.toLowerCase()
		.replace(/[\s_-]+/g, "")
	return NORMALIZED_TAG_MAP.get(clean)
}

export function getImageUrl(img: WaifuImage): string {
	return img.url || img.image_url || img.sample_url || ""
}

export async function downloadAndConvertImage(url: string): Promise<Buffer> {
	const res = await fetch(url)
	if (!res.ok) {
		throw new Error(`Failed to download image (HTTP ${res.status})`)
	}
	const arrayBuf = await res.arrayBuffer()
	const rawBuf = Buffer.from(arrayBuf)

	// Convert webp to high-quality JPEG for maximum WhatsApp client compatibility
	return sharp(rawBuf).jpeg({ quality: 90 }).toBuffer()
}

export const NEKOS_API_BASE_URL = "https://api.nekosapi.com/v4"

export function tagToSlug(tag: TagNames | string): string {
	return tag.toLowerCase().replace(/[\s-]+/g, "_")
}

export async function fetchRandomImageFromApi(options: {
	tag?: TagNames | string
	ratings?: Rating[]
}): Promise<WaifuImage | null> {
	const url = new URL(`${NEKOS_API_BASE_URL}/images/random`)
	if (options.tag) {
		url.searchParams.append("tags", tagToSlug(options.tag))
	}
	if (options.ratings && options.ratings.length > 0) {
		for (const rating of options.ratings) {
			url.searchParams.append("rating", rating)
		}
	}

	const res = await fetch(url.toString(), {
		signal: AbortSignal.timeout(10000),
	})
	if (!res.ok) {
		throw new Error(`NekosAPI responded with HTTP ${res.status}`)
	}

	const data = (await res.json()) as WaifuImage[]
	if (!Array.isArray(data) || data.length === 0) {
		return null
	}

	const randomIndex = Math.floor(Math.random() * data.length)
	return data[randomIndex] ?? null
}

export async function getRandomWaifu(options: {
	tag?: TagNames
	ratings?: Rating[]
}): Promise<WaifuImage | null> {
	// If tag is present (with or without ratings), fetch from API URL
	if (options.tag) {
		return fetchRandomImageFromApi({
			tag: options.tag,
			ratings: options.ratings,
		})
	}

	// If no tag is present (only ratings or default), use nekosAPI package
	const rawImg = await nekos.getRandomImage(undefined, {
		rating: options.ratings,
	})
	return (rawImg as unknown as WaifuImage) || null
}

export function buildWaifuCaption(
	img: WaifuImage,
	title = "Waifu Image",
): string {
	const rating = (img.rating || "safe").toUpperCase()
	const icon = rating === "SAFE" ? "🌸" : "🔞"
	const lines: string[] = [
		`${icon} *${title}* (${rating})`,
		`🆔 *ID:* \`${img.id}\``,
	]

	const artist = img.artist_name || img.artist?.name
	if (artist) {
		lines.push(`🎨 *Artist:* ${artist}`)
	}

	if (img.tags && img.tags.length > 0) {
		const tagNames = img.tags.map((t) => (typeof t === "string" ? t : t.name))
		lines.push(`🏷️ *Tags:* ${tagNames.join(", ")}`)
	}

	const source = img.source_url || img.source
	if (source) {
		lines.push(`🔗 *Source:* ${source}`)
	}

	return lines.join("\n")
}

export type { Rating, TagNames }
