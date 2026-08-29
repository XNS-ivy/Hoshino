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
 * Searches students by Name, DevName, or ID.
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

	// Filter matches (name, devName, familyName, personalName)
	const matched = students.filter(
		(s) =>
			s.Name.toLowerCase().includes(q) ||
			s.DevName.toLowerCase().includes(q) ||
			s.FamilyName?.toLowerCase().includes(q) ||
			s.PersonalName?.toLowerCase().includes(q),
	)

	// Sort so exact matches come first
	matched.sort((a, b) => {
		const aExact = a.Name.toLowerCase() === q ? 1 : 0
		const bExact = b.Name.toLowerCase() === q ? 1 : 0
		if (aExact !== bExact) return bExact - aExact
		return a.Name.localeCompare(b.Name)
	})

	return matched
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
