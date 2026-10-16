import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { logger } from "@utils/logger"

export interface SchaleStudent {
	Id: number
	Name: string
	DevName: string
	FamilyName?: string
	PersonalName?: string
	School: string
	Club: string
	StarGrade: number
	SquadType: "Main" | "Support" | string
	TacticRole?: string
	BulletType: "Explosion" | "Pierce" | "Mystic" | "Sonic" | string
	ArmorType: "LightArmor" | "HeavyArmor" | "Unarmed" | "ElasticArmor" | string
	WeaponType: string
	Position?: string
	ProfileIntroduction?: string
	CharacterAge?: string
	BirthDay?: string
	CharacterVoice?: string
	Designer?: string
	Illustrator?: string
}

export interface GachaPullItem {
	student: SchaleStudent
	starGrade: number
	isGuaranteed2Star?: boolean
	isRateUp?: boolean
}

const CACHE_DIR = join(process.cwd(), "data", "schaledb")
const STUDENTS_FILE = join(CACHE_DIR, "students.json")

let cachedStudents: SchaleStudent[] | null = null
let lastFetchedAt = 0
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 Days local disk cache

function ensureCacheDir() {
	if (!existsSync(CACHE_DIR)) {
		mkdirSync(CACHE_DIR, { recursive: true })
	}
}

/**
 * Fetches and caches all Blue Archive students with persistent local disk storage.
 */
export async function getSchaleStudents(): Promise<SchaleStudent[]> {
	const now = Date.now()
	if (cachedStudents && now - lastFetchedAt < CACHE_TTL_MS) {
		return cachedStudents
	}

	ensureCacheDir()

	// 1. Try reading from local disk cache first
	if (existsSync(STUDENTS_FILE)) {
		try {
			const localData = readFileSync(STUDENTS_FILE, "utf-8")
			const parsed = JSON.parse(localData) as SchaleStudent[]
			if (Array.isArray(parsed) && parsed.length > 0) {
				cachedStudents = parsed
				lastFetchedAt = now
				return cachedStudents
			}
		} catch (readErr) {
			logger.warn(
				"/utils/schaledb.ts",
				`Failed to read local students cache: ${readErr}`,
			)
		}
	}

	// 2. Fetch from SchaleDB API if local file missing or invalid
	try {
		logger.info(
			"/utils/schaledb.ts",
			"Fetching fresh students database from SchaleDB...",
		)
		const res = await fetch("https://schaledb.com/data/en/students.json", {
			headers: {
				"User-Agent": "HoshinoBot/1.0 (Blue Archive WhatsApp Assistant)",
			},
		})

		if (!res.ok) {
			throw new Error(`SchaleDB HTTP Error: ${res.status}`)
		}

		const data = (await res.json()) as Record<string, SchaleStudent>
		const students = Object.values(data).filter(
			(s) => s?.Id && s.Name && s.StarGrade,
		)

		cachedStudents = students
		lastFetchedAt = now

		// Save to local disk asynchronously
		try {
			writeFileSync(STUDENTS_FILE, JSON.stringify(students, null, 2), "utf-8")
			logger.system(
				"/utils/schaledb.ts",
				`Saved ${students.length} students to local cache: ${STUDENTS_FILE}`,
			)
		} catch (writeErr) {
			logger.warn(
				"/utils/schaledb.ts",
				`Failed to write students to disk cache: ${writeErr}`,
			)
		}

		return students
	} catch (error) {
		if (cachedStudents) return cachedStudents
		throw error
	}
}

/**
 * Calculates a match relevance score between a student and a search query.
 * Higher scores indicate a more precise match:
 * - 10000: Exact match on full name
 * - 9800: Exact match on cleaned name (ignoring punctuation/parentheses)
 * - 8500: Exact match on base name (e.g. "Mari" matching "Mari (Track)")
 * - 7000-7800: Multi-token match (all tokens matched in any order)
 * - 5000-6500: Whole word boundary match (prevents "Mari" matching inside "Himari")
 * - 3000-4500: Prefix match
 * - 2000-4000: Exact/partial PersonalName, FamilyName, or DevName
 * - 50-800: Weak substring match inside a word (only for queries >= 3 chars)
 */
export function getStudentMatchScore(
	candidateName: string,
	query: string,
	devName?: string,
	familyName?: string,
	personalName?: string,
): number {
	const q = query.trim().toLowerCase()
	const name = candidateName.trim().toLowerCase()
	if (!q || !name) return 0

	// 1. Direct raw exact match
	if (name === q) return 10000

	// Normalize punctuation and extra whitespace
	const cleanQ = q
		.replace(/[()[\]*_\-.]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
	const cleanName = name
		.replace(/[()[\]*_\-.]/g, " ")
		.replace(/\s+/g, " ")
		.trim()

	if (cleanName === cleanQ) return 9800

	// Extract base student name (without parentheses or variant qualifiers)
	const baseName = name
		.replace(/\s*[(*[].*?[)*\]]/g, "")
		.replace(/\s+/g, " ")
		.trim()
	const cleanBase = baseName
		.replace(/[()[\]*_\-.]/g, " ")
		.replace(/\s+/g, " ")
		.trim()

	// 2. Exact match against base name (e.g. query "mari" matching "Mari (Track)")
	if (cleanBase === cleanQ) {
		return 8500
	}

	// 3. Multi-token match (e.g. "mari track" or "track mari" matching "Mari (Track)")
	const qTokens = cleanQ.split(" ").filter(Boolean)
	const nameTokens = cleanName.split(" ").filter(Boolean)
	if (qTokens.length > 1) {
		const allTokensMatch = qTokens.every((qt) =>
			nameTokens.some((nt) => nt === qt || nt.startsWith(qt)),
		)
		if (allTokensMatch) {
			const lenDiff = Math.abs(cleanName.length - cleanQ.length)
			return Math.max(7000, 7800 - lenDiff * 10)
		}
	}

	// 4. Whole-word boundary token match (prevents "Mari" from matching inside "Himari")
	const escapedQ = cleanQ.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
	const wordRegex = new RegExp(
		`(^|\\s|[(_\\-\\./])${escapedQ}($|\\s|[)_\\-\\./])`,
		"i",
	)
	if (wordRegex.test(name) || wordRegex.test(cleanName)) {
		const lenDiff = Math.abs(cleanName.length - cleanQ.length)
		return Math.max(5000, 6500 - lenDiff * 20)
	}

	// 5. Prefix match on full name or base name (e.g. "mari" matching "Marina", "hima" matching "Himari")
	if (cleanName.startsWith(cleanQ) || cleanBase.startsWith(cleanQ)) {
		const lenDiff = Math.abs(cleanName.length - cleanQ.length)
		return Math.max(3000, 4500 - lenDiff * 30)
	}

	// 6. Name parts (PersonalName, FamilyName, DevName)
	const devLower = devName?.toLowerCase().trim()
	const famLower = familyName?.toLowerCase().trim()
	const perLower = personalName?.toLowerCase().trim()

	if (perLower === q) return 4000
	if (famLower === q) return 3800
	if (devLower === q) return 3700

	if (perLower?.includes(q)) return 2500
	if (famLower?.includes(q)) return 2400
	if (devLower?.includes(q)) return 2300

	// 7. Weak substring match inside words (only for queries >= 3 chars, e.g. "mari" inside "himari")
	if (cleanQ.length >= 3 && cleanName.includes(cleanQ)) {
		const lenDiff = Math.abs(cleanName.length - cleanQ.length)
		return Math.max(50, 800 - lenDiff * 50)
	}

	return 0
}

/**
 * Searches students by Name, DevName, or ID with intelligent relevance scoring.
 */
export async function searchSchaleStudent(
	query: string,
): Promise<SchaleStudent[]> {
	const students = await getSchaleStudents()
	const q = query.trim().toLowerCase()
	if (!q) return []

	// Exact ID search
	const num = Number.parseInt(q, 10)
	if (!Number.isNaN(num)) {
		const byId = students.find((s) => s.Id === num)
		if (byId) return [byId]
	}

	// Score all students and filter out zero-score candidates
	const scored: { student: SchaleStudent; score: number }[] = []
	for (const s of students) {
		const score = getStudentMatchScore(
			s.Name,
			q,
			s.DevName,
			s.FamilyName,
			s.PersonalName,
		)
		if (score > 0) {
			scored.push({ student: s, score })
		}
	}

	// Sort by relevance score descending, then alphabetically by Name
	scored.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score
		return a.student.Name.localeCompare(b.student.Name)
	})

	return scored.map((item) => item.student)
}

/**
 * Gets student high-resolution image URL from SchaleDB.
 */
export function getStudentImageUrl(
	id: number,
	type: "collection" | "portrait" | "icon" | "weapon" | "lobby" = "collection",
): string {
	return `https://schaledb.com/images/student/${type}/${id}.webp`
}

export interface GachaExecutionResult {
	results: GachaPullItem[]
	threeStars: SchaleStudent[]
	twoStars: SchaleStudent[]
	oneStars: SchaleStudent[]
}

/**
 * Official Blue Archive Gacha Rates:
 * 3-Star: 3.0% (Rate-Up: 0.7%)
 * 2-Star: 18.5%
 * 1-Star: 78.5%
 */
export async function executeGachaPull(
	pullCount: 1 | 10 | number = 10,
	guarantee3Star = false,
	rateUpStudentId?: number,
): Promise<GachaExecutionResult> {
	const allStudents = await getSchaleStudents()

	const star3 = allStudents.filter((s) => s.StarGrade === 3)
	const star2 = allStudents.filter((s) => s.StarGrade === 2)
	const star1 = allStudents.filter((s) => s.StarGrade === 1)

	const rateUpStudent = rateUpStudentId
		? allStudents.find((s) => s.Id === rateUpStudentId && s.StarGrade === 3)
		: undefined

	const results: GachaPullItem[] = []

	for (let i = 0; i < pullCount; i++) {
		const isLastOfTen = pullCount === 10 && i === 9
		const rand = Math.random() * 100

		if (guarantee3Star || rand < 3.0) {
			// 3★ Pull (3% or Spark Guarantee)
			let selected: SchaleStudent
			let isRateUp = false

			if (rateUpStudent && Math.random() < 0.7 / 3.0) {
				selected = rateUpStudent
				isRateUp = true
			} else {
				selected = star3[Math.floor(Math.random() * star3.length)]!
			}

			results.push({
				student: selected,
				starGrade: 3,
				isRateUp,
			})
		} else if (rand < 21.5 || isLastOfTen) {
			// 2★ Pull (18.5% or guaranteed on 10th pull)
			const selected = star2[Math.floor(Math.random() * star2.length)]!
			results.push({
				student: selected,
				starGrade: 2,
				isGuaranteed2Star: isLastOfTen,
			})
		} else {
			// 1★ Pull (78.5%)
			const selected = star1[Math.floor(Math.random() * star1.length)]!
			results.push({
				student: selected,
				starGrade: 1,
			})
		}
	}

	const threeStars = results
		.filter((r) => r.starGrade === 3)
		.map((r) => r.student)
	const twoStars = results
		.filter((r) => r.starGrade === 2)
		.map((r) => r.student)
	const oneStars = results
		.filter((r) => r.starGrade === 1)
		.map((r) => r.student)

	return {
		results,
		threeStars,
		twoStars,
		oneStars,
	}
}

export const simulateGacha = executeGachaPull

/**
 * Formats Bullet / Attack type into rich emoji format.
 */
export function formatBulletType(type: string): string {
	switch (type) {
		case "Explosion":
			return "🔴 Explosive"
		case "Pierce":
			return "🟡 Piercing"
		case "Mystic":
			return "🔵 Mystic"
		case "Sonic":
			return "🟣 Sonic"
		default:
			return `⚪ ${type}`
	}
}

/**
 * Formats Armor / Defense type into rich emoji format.
 */
export function formatArmorType(type: string): string {
	switch (type) {
		case "LightArmor":
			return "🔴 Light Armor"
		case "HeavyArmor":
			return "🟡 Heavy Armor"
		case "Unarmed":
			return "🔵 Special / Mystic Armor"
		case "ElasticArmor":
			return "🟣 Elastic / Sonic Armor"
		default:
			return `⚪ ${type}`
	}
}

/**
 * Formats Squad Type (Main / Striker or Support / Special).
 */
export function formatSquadType(type: string): string {
	return type === "Main" ? "⚔️ Striker (Main)" : "🛡️ Special (Support)"
}
