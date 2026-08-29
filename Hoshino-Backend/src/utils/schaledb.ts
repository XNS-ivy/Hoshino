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

let cachedStudents: SchaleStudent[] | null = null
let lastFetchedAt = 0
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 Hours

/**
 * Fetches and caches all Blue Archive students from SchaleDB.
 */
export async function getSchaleStudents(): Promise<SchaleStudent[]> {
	const now = Date.now()
	if (cachedStudents && now - lastFetchedAt < CACHE_TTL_MS) {
		return cachedStudents
	}

	try {
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

/**
 * Formats Attack / Bullet Type with themed emojis and colors.
 */
export function formatBulletType(type: string): string {
	switch (type) {
		case "Explosion":
			return "🔴 Explosive (Red)"
		case "Pierce":
			return "🟡 Piercing (Yellow)"
		case "Mystic":
			return "🔵 Mystic (Blue)"
		case "Sonic":
			return "🟣 Sonic (Purple)"
		default:
			return type
	}
}

/**
 * Formats Armor / Defense Type with themed emojis.
 */
export function formatArmorType(type: string): string {
	switch (type) {
		case "LightArmor":
			return "🔴 Light Armor"
		case "HeavyArmor":
			return "🟡 Heavy Armor"
		case "Unarmed":
			return "🔵 Special Armor"
		case "ElasticArmor":
			return "🟣 Elastic Armor"
		default:
			return type
	}
}

/**
 * Formats Squad Type (Striker vs Special).
 */
export function formatSquadType(type: string): string {
	return type === "Main" ? "Striker (Frontline)" : "Special (Support)"
}

/**
 * Executes Blue Archive Gacha recruitment simulation with official rates.
 */
export async function executeGachaPull(
	pullCount: 1 | 10,
	isSpark = false,
): Promise<{
	results: GachaPullItem[]
	threeStars: SchaleStudent[]
	pyroxeneCost: number
}> {
	const students = await getSchaleStudents()

	const pool3Star = students.filter((s) => s.StarGrade === 3)
	const pool2Star = students.filter((s) => s.StarGrade === 2)
	const pool1Star = students.filter((s) => s.StarGrade === 1)

	const getRandom = (pool: SchaleStudent[]): SchaleStudent =>
		pool[Math.floor(Math.random() * pool.length)] ?? pool[0]!

	// Spark Redemption (200 Spark Points Guaranteed 3★ Pick)
	if (isSpark) {
		const sparkStudent = getRandom(pool3Star)
		return {
			results: [{ student: sparkStudent, starGrade: 3, isRateUp: true }],
			threeStars: [sparkStudent],
			pyroxeneCost: 0,
		}
	}

	const results: GachaPullItem[] = []
	const threeStars: SchaleStudent[] = []

	for (let i = 0; i < pullCount; i++) {
		const is10thGuaranteed = pullCount === 10 && i === 9
		const roll = Math.random() * 100

		if (is10thGuaranteed) {
			// Guaranteed 2★+ Rule on 10th pull
			// 3★: 3.0%, 2★: 97.0%
			if (roll < 3.0) {
				const picked = getRandom(pool3Star)
				results.push({
					student: picked,
					starGrade: 3,
					isGuaranteed2Star: true,
				})
				threeStars.push(picked)
			} else {
				const picked = getRandom(pool2Star)
				results.push({
					student: picked,
					starGrade: 2,
					isGuaranteed2Star: true,
				})
			}
		} else {
			// Standard Pull Rates: 3★ (3%), 2★ (18.5%), 1★ (78.5%)
			if (roll < 3.0) {
				const picked = getRandom(pool3Star)
				results.push({ student: picked, starGrade: 3 })
				threeStars.push(picked)
			} else if (roll < 3.0 + 18.5) {
				const picked = getRandom(pool2Star)
				results.push({ student: picked, starGrade: 2 })
			} else {
				const picked = getRandom(pool1Star)
				results.push({ student: picked, starGrade: 1 })
			}
		}
	}

	return {
		results,
		threeStars,
		pyroxeneCost: pullCount === 10 ? 1200 : 120,
	}
}
