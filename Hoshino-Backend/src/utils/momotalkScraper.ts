import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { MomoDialogue } from "@repositories/momo.repository"
import { logger } from "@utils/logger"
import { getStudentImageUrl, type SchaleStudent } from "@utils/schaledb"
import sharp from "sharp"

const MOMO_CACHE_DIR = join(process.cwd(), "data", "schaledb", "momotalk")
const ICON_CACHE_DIR = join(process.cwd(), "data", "schaledb", "icons")

function ensureDirs() {
	if (!existsSync(MOMO_CACHE_DIR)) {
		mkdirSync(MOMO_CACHE_DIR, { recursive: true })
	}
	if (!existsSync(ICON_CACHE_DIR)) {
		mkdirSync(ICON_CACHE_DIR, { recursive: true })
	}
}

export interface ParsedMomoStep {
	index: number
	type: "student-text" | "student-image" | "reply" | "sensei" | "relationship"
	name?: string
	text?: string
	option1?: string
	option2?: string
	option3?: string
	favorRank?: number
	sequence?: number
}

export interface ScrapedMomoEpisode {
	episodeNumber: number
	favorRequired: number
	steps: ParsedMomoStep[]
	openingBubbles: string[]
	choices: Array<{
		text: string
		replyBubbles: string[]
		triggersRelationshipEvent: boolean
		favorRank: number
		exp: number
	}>
}

/**
 * Parses raw MediaWiki `{{MomoTalk ... }}` templates from bluearchive.wiki into structured MomoTalk episodes.
 */
export function parseWikiMomoTalkWikitext(
	wikitext: string,
	student: SchaleStudent,
): ScrapedMomoEpisode[] {
	const episodes: ScrapedMomoEpisode[] = []
	const blockRegex =
		/(?:<span id="momotalk-(\d+)"><\/span>)?(?:<span id="momotalk-favor-(\d+)"><\/span>)?\s*\{\{MomoTalk([\s\S]*?)\}\}/gi

	let match: RegExpExecArray | null = blockRegex.exec(wikitext)
	let epCounter = 1

	while (match !== null) {
		const epNum = Number.parseInt(match[1] || String(epCounter), 10) || epCounter
		const spanFavor = Number.parseInt(match[2] || "0", 10) || 0
		const body = match[3] || ""

		const kvMap = new Map<string, string>()
		const lines = body.split("\n")
		for (const rawLine of lines) {
			const line = rawLine.trim()
			if (!line.startsWith("|")) continue
			const eqIdx = line.indexOf("=")
			if (eqIdx === -1) continue
			const key = line.slice(1, eqIdx).trim()
			const val = line
				.slice(eqIdx + 1)
				.trim()
				.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1")
				.replace(/'''/g, "")
				.replace(/''/g, "")
			kvMap.set(key, val)
		}

		const steps: ParsedMomoStep[] = []
		let detectedFavor = spanFavor || Math.min(20, epCounter + 1)

		for (let i = 1; i <= 40; i++) {
			const stepType = kvMap.get(String(i))
			if (!stepType) continue

			if (stepType === "student-text") {
				const text = kvMap.get(`text${i}`)
				if (text) {
					steps.push({
						index: i,
						type: "student-text",
						name: kvMap.get(`name${i}`) || student.Name,
						text,
					})
				}
			} else if (stepType === "student-image") {
				steps.push({
					index: i,
					type: "student-image",
					name: kvMap.get(`name${i}`) || student.Name,
					text: `[📷 Sent a photo: ${kvMap.get(`file${i}`) || "Photo"}]`,
				})
			} else if (stepType === "reply") {
				const opt1 = kvMap.get(`option${i}_1`)
				const opt2 = kvMap.get(`option${i}_2`)
				const opt3 = kvMap.get(`option${i}_3`)
				if (opt1 || opt2) {
					steps.push({
						index: i,
						type: "reply",
						option1: opt1 || "I understand.",
						option2: opt2 || opt1 || "Tell me more!",
						option3: opt3,
					})
				}
			} else if (stepType === "sensei") {
				const text = kvMap.get(`text${i}`)
				if (text) {
					steps.push({
						index: i,
						type: "sensei",
						text,
					})
				}
			} else if (stepType === "relationship") {
				const fav = Number.parseInt(kvMap.get(`favor${i}`) || "0", 10)
				if (fav > 0) detectedFavor = fav
				steps.push({
					index: i,
					type: "relationship",
					name: kvMap.get(`name${i}`) || student.Name,
					favorRank: detectedFavor,
					sequence: Number.parseInt(kvMap.get(`sequence${i}`) || String(epNum), 10),
				})
			}
		}

		if (steps.length > 0) {
			// Build opening student bubbles up to the first Sensei reply/sensei step
			const firstReplyIdx = steps.findIndex(
				(s) => s.type === "reply" || s.type === "sensei",
			)
			const openingSteps =
				firstReplyIdx === -1 ? steps : steps.slice(0, firstReplyIdx)
			const openingBubbles = openingSteps
				.filter((s) => s.type === "student-text" || s.type === "student-image")
				.map((s) => s.text!)
				.filter(Boolean)

			if (openingBubbles.length === 0) {
				const anyStudentText = steps.find((s) => s.type === "student-text")
				if (anyStudentText?.text) openingBubbles.push(anyStudentText.text)
			}

			const replyStep =
				firstReplyIdx !== -1 ? steps[firstReplyIdx] : undefined
			const afterSteps =
				firstReplyIdx !== -1 ? steps.slice(firstReplyIdx + 1) : []

			const followUpStudentBubbles = afterSteps
				.filter((s) => s.type === "student-text" || s.type === "student-image")
				.map((s) => s.text!)
				.filter(Boolean)

			const hasRelationship = steps.some((s) => s.type === "relationship")

			if (FollowUpOrOpeningValid(openingBubbles)) {
				const opt1Text =
					replyStep?.type === "reply"
						? replyStep.option1 || "Okay, I'm on my way!"
						: replyStep?.type === "sensei"
							? replyStep.text || "Got it!"
							: `Sure, ${student.PersonalName || student.Name}! Let's do it.`

				const opt2Text =
					replyStep?.type === "reply"
						? replyStep.option2 || "Tell me more about it."
						: `Wait for me at Schale, ${student.PersonalName || student.Name}!`

				const opt3Text =
					replyStep?.type === "reply" && replyStep.option3
						? replyStep.option3
						: `I brought your favorite snacks along too!`

				const defaultFollowUp =
					followUpStudentBubbles.length > 0
						? followUpStudentBubbles.slice(0, 4)
						: [
								hasRelationship
									? `Thank you for coming to see me today, Sensei! Let's hang out again soon.`
									: `Hehe, thanks for replying so quickly, Sensei!`,
							]

				episodes.push({
					episodeNumber: epNum,
					favorRequired: detectedFavor,
					steps,
					openingBubbles,
					choices: [
						{
							text: opt1Text,
							replyBubbles: defaultFollowUp,
							triggersRelationshipEvent: hasRelationship,
							favorRank: detectedFavor,
							exp: 95,
						},
						{
							text: opt2Text,
							replyBubbles: defaultFollowUp,
							triggersRelationshipEvent: hasRelationship,
							favorRank: detectedFavor,
							exp: 85,
						},
						{
							text: opt3Text,
							replyBubbles: defaultFollowUp,
							triggersRelationshipEvent: hasRelationship,
							favorRank: detectedFavor,
							exp: 100,
						},
					],
				})
				epCounter++
			}
		}

		match = blockRegex.exec(wikitext)
	}

	return episodes
}

function FollowUpOrOpeningValid(openingBubbles: string[]): boolean {
	return openingBubbles.length > 0
}

/**
 * Scrapes authentic MomoTalk episodes for a student from `bluearchive.wiki/w/api.php` with persistent local JSON caching.
 */
export async function getOrScrapeStudentMomoTalks(
	student: SchaleStudent,
): Promise<MomoDialogue[]> {
	ensureDirs()
	const cacheFile = join(MOMO_CACHE_DIR, `${student.Id}.json`)

	// 1. Check persistent local disk cache first
	if (existsSync(cacheFile)) {
		try {
			const cached = JSON.parse(
				readFileSync(cacheFile, "utf-8"),
			) as MomoDialogue[]
			if (Array.isArray(cached) && cached.length > 0) {
				return cached
			}
		} catch {}
	}

	// 2. Scrape from bluearchive.wiki MediaWiki API
	const candidateTitles = [
		`${student.Name}/MomoTalk`,
		`${student.Name.replace(/\s+/g, "_")}/MomoTalk`,
	]
	if (student.PersonalName && student.PersonalName !== student.Name) {
		candidateTitles.push(`${student.PersonalName}/MomoTalk`)
	}

	for (const pageTitle of candidateTitles) {
		try {
			const url = `https://bluearchive.wiki/w/api.php?action=parse&page=${encodeURIComponent(pageTitle)}&prop=wikitext&format=json`
			const res = await fetch(url, {
				headers: {
					"User-Agent": "HoshinoBot/1.0 (Blue Archive MomoTalk Scraper)",
				},
			})
			if (!res.ok) continue

			const data = (await res.json()) as {
				parse?: { wikitext?: { "*"?: string } }
			}
			const wikitext = data?.parse?.wikitext?.["*"]
			if (!wikitext || !wikitext.includes("{{MomoTalk")) continue

			const parsedEpisodes = parseWikiMomoTalkWikitext(wikitext, student)
			if (parsedEpisodes.length > 0) {
				const dialogues: MomoDialogue[] = parsedEpisodes.map((ep) => ({
					id: `${student.Id}_ep${ep.episodeNumber}`,
					speaker: student.Name,
					studentId: student.Id,
					episodeNumber: ep.episodeNumber,
					favorRequired: ep.favorRequired,
					openingBubbles: ep.openingBubbles,
					message: ep.openingBubbles.join("\n\n"),
					choices: [
						{
							text: ep.choices[0]!.text,
							reply: ep.choices[0]!.replyBubbles.join("\n\n"),
							replyBubbles: ep.choices[0]!.replyBubbles,
							triggersRelationshipEvent: ep.choices[0]!.triggersRelationshipEvent,
							exp: ep.choices[0]!.exp,
						},
						{
							text: ep.choices[1]!.text,
							reply: ep.choices[1]!.replyBubbles.join("\n\n"),
							replyBubbles: ep.choices[1]!.replyBubbles,
							triggersRelationshipEvent: ep.choices[1]!.triggersRelationshipEvent,
							exp: ep.choices[1]!.exp,
						},
						{
							text: ep.choices[2]!.text,
							reply: ep.choices[2]!.replyBubbles.join("\n\n"),
							replyBubbles: ep.choices[2]!.replyBubbles,
							triggersRelationshipEvent: ep.choices[2]!.triggersRelationshipEvent,
							exp: ep.choices[2]!.exp,
						},
					],
				}))

				try {
					writeFileSync(cacheFile, JSON.stringify(dialogues, null, 2), "utf-8")
					logger.info(
						"/utils/momotalkScraper.ts",
						`Scraped & cached ${dialogues.length} authentic MomoTalk episodes for ${student.Name} from bluearchive.wiki`,
					)
				} catch {}

				return dialogues
			}
		} catch (err) {
			logger.warn(
				"/utils/momotalkScraper.ts",
				`Wiki scrape attempt failed for ${pageTitle}: ${err}`,
			)
		}
	}

	return []
}

function escapeXml(unsafe: string): string {
	return unsafe
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;")
}

function wrapTextLines(text: string, maxCharsPerLine: number): string[] {
	const paragraphs = text.split(/\n+/)
	const lines: string[] = []

	for (const para of paragraphs) {
		const words = para.trim().split(/\s+/)
		let current = ""
		for (const word of words) {
			if (!current) {
				current = word
			} else if (current.length + 1 + word.length <= maxCharsPerLine) {
				current += ` ${word}`
			} else {
				lines.push(current)
				current = word
			}
		}
		if (current) lines.push(current)
	}
	return lines.length > 0 ? lines : [""]
}

async function getStudentCircularAvatarDataUri(
	studentId: number,
): Promise<string | null> {
	ensureDirs()
	const iconPath = join(ICON_CACHE_DIR, `${studentId}.png`)

	try {
		if (existsSync(iconPath)) {
			const buf = readFileSync(iconPath)
			return `data:image/png;base64,${buf.toString("base64")}`
		}

		const iconUrl = getStudentImageUrl(studentId, "icon")
		const res = await fetch(iconUrl)
		if (!res.ok) return null
		const rawBuf = Buffer.from(await res.arrayBuffer())

		const circleMask = Buffer.from(
			`<svg width="72" height="72"><circle cx="36" cy="36" r="36" fill="#fff"/></svg>`,
		)
		const pngBuf = await sharp(rawBuf)
			.resize(72, 72)
			.composite([{ input: circleMask, blend: "dest-in" }])
			.png()
			.toBuffer()

		try {
			writeFileSync(iconPath, pngBuf)
		} catch {}

		return `data:image/png;base64,${pngBuf.toString("base64")}`
	} catch {
		return null
	}
}

/**
 * Renders an authentic Blue Archive MomoTalk Messenger UI Card as a PNG Buffer using `sharp` SVG rendering.
 */
export async function renderMomoTalkCard(options: {
	student: SchaleStudent
	bondLevel: number
	episodeNumber?: number
	studentBubbles: string[]
	choices?: [string, string, string]
	senseiChosenText?: string
	followUpBubbles?: string[]
	triggersRelationshipEvent?: boolean
}): Promise<Buffer | null> {
	try {
		const width = 760
		const avatarUri = await getStudentCircularAvatarDataUri(options.student.Id)

		let currentY = 98
		const svgElements: string[] = []

		// Helper to draw a block of student bubbles on the left
		const renderStudentBubbles = (bubbles: string[]) => {
			for (let idx = 0; idx < bubbles.length; idx++) {
				const rawText = bubbles[idx] || ""
				const wrapped = wrapTextLines(rawText, 44)
				const bubbleHeight = Math.max(52, wrapped.length * 26 + 24)
				const maxLineLen = Math.max(...wrapped.map((l) => l.length), 12)
				const bubbleWidth = Math.min(540, Math.max(180, maxLineLen * 11 + 36))

				if (idx === 0) {
					// Draw avatar and Student Name header
					if (avatarUri) {
						svgElements.push(
							`<image href="${avatarUri}" x="24" y="${currentY}" width="64" height="64" />`,
						)
					} else {
						svgElements.push(
							`<circle cx="56" cy="${currentY + 32}" r="32" fill="#FF85A1" />`,
							`<text x="56" y="${currentY + 40}" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${escapeXml(options.student.Name.charAt(0))}</text>`,
						)
					}
					svgElements.push(
						`<text x="104" y="${currentY + 18}" font-family="Segoe UI, Arial, sans-serif" font-size="18" font-weight="bold" fill="#2C3E50">${escapeXml(options.student.Name)}</text>`,
					)
					currentY += 28
				}

				// Dark slate/navy Blue Archive MomoTalk student bubble (#465362)
				svgElements.push(
					`<rect x="104" y="${currentY}" width="${bubbleWidth}" height="${bubbleHeight}" rx="14" ry="14" fill="#465362" />`,
				)

				for (let l = 0; l < wrapped.length; l++) {
					svgElements.push(
						`<text x="122" y="${currentY + 29 + l * 26}" font-family="Segoe UI, Arial, sans-serif" font-size="18" fill="#FFFFFF">${escapeXml(wrapped[l]!)}</text>`,
					)
				}

				currentY += bubbleHeight + 12
			}
		}

		// 1. Opening student bubbles
		renderStudentBubbles(options.studentBubbles)

		// 2. Either Sensei Reply Prompt Box OR Sensei Chosen Blue Bubble + Follow-Up
		if (options.choices && !options.senseiChosenText) {
			currentY += 10
			// Calculate Reply Box height
			const opt1Lines = wrapTextLines(`[1] ${options.choices[0]}`, 46)
			const opt2Lines = wrapTextLines(`[2] ${options.choices[1]}`, 46)
			const opt3Lines = wrapTextLines(`[3] ${options.choices[2]}`, 46)

			const h1 = opt1Lines.length * 24 + 20
			const h2 = opt2Lines.length * 24 + 20
			const h3 = opt3Lines.length * 24 + 20
			const boxHeight = 52 + h1 + h2 + h3 + 36

			const boxX = 140
			const boxW = 592

			// In-game MomoTalk Reply Container (#E8F2FC with #4A90E2 header accent)
			svgElements.push(
				`<rect x="${boxX}" y="${currentY}" width="${boxW}" height="${boxHeight}" rx="14" ry="14" fill="#E6F0FA" stroke="#B8D4F2" stroke-width="2" />`,
				`<rect x="${boxX + 16}" y="${currentY + 14}" width="4" height="20" rx="2" fill="#3B82F6" />`,
				`<text x="${boxX + 28}" y="${currentY + 30}" font-family="Segoe UI, Arial, sans-serif" font-size="17" font-weight="bold" fill="#2C5282">Reply (Type 1, 2, or 3)</text>`,
			)

			let optY = currentY + 46
			const allOpts = [
				{ lines: opt1Lines, h: h1 },
				{ lines: opt2Lines, h: h2 },
				{ lines: opt3Lines, h: h3 },
			]

			for (const opt of allOpts) {
				svgElements.push(
					`<rect x="${boxX + 16}" y="${optY}" width="${boxW - 32}" height="${opt.h}" rx="10" ry="10" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.5" />`,
				)
				for (let l = 0; l < opt.lines.length; l++) {
					svgElements.push(
						`<text x="${boxX + 32}" y="${optY + 26 + l * 24}" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="600" fill="#1E293B">${escapeXml(opt.lines[l]!)}</text>`,
					)
				}
				optY += opt.h + 10
			}

			currentY += boxHeight + 18
		} else if (options.senseiChosenText) {
			currentY += 8
			const senseiLines = wrapTextLines(options.senseiChosenText, 44)
			const sBubbleH = Math.max(50, senseiLines.length * 26 + 24)
			const maxLen = Math.max(...senseiLines.map((l) => l.length), 14)
			const sBubbleW = Math.min(540, Math.max(200, maxLen * 11 + 36))
			const sBubbleX = width - 28 - sBubbleW

			// Sensei Right-Aligned Blue Bubble (#4A90E2)
			svgElements.push(
				`<rect x="${sBubbleX}" y="${currentY}" width="${sBubbleW}" height="${sBubbleH}" rx="14" ry="14" fill="#4A90E2" />`,
			)
			for (let l = 0; l < senseiLines.length; l++) {
				svgElements.push(
					`<text x="${sBubbleX + 18}" y="${currentY + 29 + l * 26}" font-family="Segoe UI, Arial, sans-serif" font-size="18" fill="#FFFFFF">${escapeXml(senseiLines[l]!)}</text>`,
				)
			}
			currentY += sBubbleH + 16

			// Follow-up student bubbles
			if (options.followUpBubbles && options.followUpBubbles.length > 0) {
				renderStudentBubbles(options.followUpBubbles)
			}

			// Relationship Story Event Banner (In-game Pink MomoTalk Bond Event Box!)
			if (options.triggersRelationshipEvent) {
				currentY += 10
				const relX = 120
				const relW = 610
				const relH = 88

				svgElements.push(
					`<rect x="${relX}" y="${currentY}" width="${relW}" height="${relH}" rx="14" ry="14" fill="#FFF0F5" stroke="#FF85A1" stroke-width="2" />`,
					`<rect x="${relX + 16}" y="${currentY + 14}" width="4" height="20" rx="2" fill="#FF6B8B" />`,
					`<text x="${relX + 28}" y="${currentY + 30}" font-family="Segoe UI, Arial, sans-serif" font-size="17" font-weight="bold" fill="#D53F8C">♥ Relationship Event</text>`,
					`<rect x="${relX + 16}" y="${currentY + 42}" width="${relW - 32}" height="34" rx="8" ry="8" fill="#FF85A1" />`,
					`<text x="${relX + relW / 2}" y="${currentY + 65}" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="bold" fill="#FFFFFF" text-anchor="middle">Go to ${escapeXml(options.student.Name)}&apos;s Bond Story ♥</text>`,
				)
				currentY += relH + 16
			}
		}

		const totalHeight = Math.max(360, currentY + 28)
		const epLabel = options.episodeNumber
			? `Episode #${options.episodeNumber}`
			: "Schale Messenger"

		const fullSvg = `
		<svg width="${width}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">
			<!-- Background -->
			<rect x="0" y="0" width="${width}" height="${totalHeight}" fill="#F3F6FA" />

			<!-- Top MomoTalk Pink Header Bar -->
			<rect x="0" y="0" width="${width}" height="74" fill="#FF85A1" />
			<circle cx="40" cy="37" r="18" fill="#FFFFFF" />
			<text x="40" y="44" font-family="Segoe UI, Arial, sans-serif" font-size="20" font-weight="bold" fill="#FF85A1" text-anchor="middle">♥</text>
			<text x="70" y="45" font-family="Segoe UI, Arial, sans-serif" font-size="26" font-weight="bold" fill="#FFFFFF">MomoTalk</text>
			<text x="215" y="44" font-family="Segoe UI, Arial, sans-serif" font-size="16" fill="#FFE4EC">|  ${escapeXml(options.student.School)} • ${escapeXml(epLabel)}</text>

			<!-- Bond Level Badge on Right -->
			<rect x="${width - 170}" y="19" width="146" height="36" rx="18" ry="18" fill="#FFFFFF" />
			<text x="${width - 97}" y="43" font-family="Segoe UI, Arial, sans-serif" font-size="17" font-weight="bold" fill="#FF6B8B" text-anchor="middle">♥ Bond Rank ${options.bondLevel}</text>

			${svgElements.join("\n")}
		</svg>`

		return await sharp(Buffer.from(fullSvg)).png().toBuffer()
	} catch (err) {
		logger.warn(
			"/utils/momotalkScraper.ts",
			`Failed to render MomoTalk UI card: ${err}`,
		)
		return null
	}
}

