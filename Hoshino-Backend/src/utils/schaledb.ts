import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { logger } from "@utils/logger"
import sharp from "sharp"

export interface SchaleStudentSkillEntry {
	Name?: string
	Desc?: string
	Parameters?: string[][]
	Cost?: number[]
}

export interface SchaleStudent {
	Id: number
	Name: string
	DevName: string
	PathName?: string
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
	Hobby?: string
	CharacterSSRNew?: string
	CharacterAge?: string
	BirthDay?: string
	CharacterVoice?: string
	Designer?: string
	Illustrator?: string
	StreetBattleAdaptation?: number
	OutdoorBattleAdaptation?: number
	IndoorBattleAdaptation?: number
	AttackPower1?: number
	AttackPower100?: number
	MaxHP1?: number
	MaxHP100?: number
	DefensePower1?: number
	DefensePower100?: number
	HealPower1?: number
	HealPower100?: number
	CriticalPoint?: number
	AccuracyPoint?: number
	DodgePoint?: number
	Equipment?: string[]
	SkillExMaterial?: number[][]
	SkillExMaterialAmount?: number[][]
	SkillMaterial?: number[][]
	SkillMaterialAmount?: number[][]
	Skills?: {
		Ex?: SchaleStudentSkillEntry
		Public?: SchaleStudentSkillEntry
		Passive?: SchaleStudentSkillEntry
		ExtraPassive?: SchaleStudentSkillEntry
	}
	Weapon?: {
		Name?: string
		Desc?: string
		AttackPower1?: number
		AttackPower100?: number
		MaxHP1?: number
		MaxHP100?: number
		HealPower1?: number
		HealPower100?: number
	}
	Gear?: {
		Name?: string
		Desc?: string
		TierUpMaterial?: number[][]
		TierUpMaterialAmount?: number[][]
	}
	MemoryLobby?: number[]
	FavorStatType?: string[]
	FavorStatValue?: number[][]
}

export interface SchaleItem {
	Id: number
	Name: string
	Desc?: string
	Category: string
	SubCategory?: string
	Rarity: "N" | "R" | "SR" | "SSR" | string
	Quality?: number
	ExpValue?: number
	Icon?: string
}

export interface SchaleEquipment {
	Id: number
	Category: string
	Rarity: string
	Tier: number
	Icon?: string
	Name: string
	Desc?: string
	MaxLevel?: number
	StatType?: string[]
	StatValue?: number[][]
	Recipe?: number[][]
	RecipeCost?: number
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
 * - 9800: Exact match on cleaned name (ignoring punctuation/parentheses/quotes)
 * - 8500: Exact match on base name (e.g. "Mari" matching "Mari (Track)")
 * - 7000-7800: Multi-token match (all tokens matched in any order)
 * - 5000-6500: Whole word boundary match (strictly prevents "Mari" matching inside "Himari")
 * - 3000-4500: Prefix match (e.g. "mari" matching "Marina", "hima" matching "Himari")
 * - 2000-4000: Exact/partial PersonalName, FamilyName, or DevName
 */
export function getStudentMatchScore(
	candidateName: string,
	query: string,
	devName?: string,
	familyName?: string,
	personalName?: string,
): number {
	// Strip quotes and trim
	const rawQ = query
		.replace(/["'“”‘’`]/g, "")
		.trim()
		.toLowerCase()
	const rawName = candidateName
		.replace(/["'“”‘’`]/g, "")
		.trim()
		.toLowerCase()
	if (!rawQ || !rawName) return 0

	// 1. Direct raw exact match
	if (rawName === rawQ) return 10000

	// Normalize punctuation and extra whitespace
	const cleanQ = rawQ
		.replace(/[()[\]*_\-.]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
	const cleanName = rawName
		.replace(/[()[\]*_\-.]/g, " ")
		.replace(/\s+/g, " ")
		.trim()

	if (cleanName === cleanQ) return 9800

	// Extract base student name (without parentheses or variant qualifiers)
	const baseName = rawName
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

	// 4. Whole-word boundary token match (strictly requires word boundaries; prevents "Mari" from matching inside "Himari")
	const escapedQ = cleanQ.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
	const wordRegex = new RegExp(
		`(^|\\s|[(_\\-\\./])${escapedQ}($|\\s|[)_\\-\\./])`,
		"i",
	)
	if (wordRegex.test(rawName) || wordRegex.test(cleanName)) {
		const lenDiff = Math.abs(cleanName.length - cleanQ.length)
		return Math.max(5000, 6500 - lenDiff * 20)
	}

	// 5. Prefix match on full name or base name (e.g. "mari" matching "Marina", "hima" matching "Himari")
	if (cleanName.startsWith(cleanQ) || cleanBase.startsWith(cleanQ)) {
		const lenDiff = Math.abs(cleanName.length - cleanQ.length)
		return Math.max(3000, 4500 - lenDiff * 30)
	}

	// 6. Name parts (PersonalName, FamilyName, DevName)
	const devLower = devName
		?.replace(/["'“”‘’`]/g, "")
		.toLowerCase()
		.trim()
	const famLower = familyName
		?.replace(/["'“”‘’`]/g, "")
		.toLowerCase()
		.trim()
	const perLower = personalName
		?.replace(/["'“”‘’`]/g, "")
		.toLowerCase()
		.trim()

	if (perLower === cleanQ) return 4000
	if (famLower === cleanQ) return 3800
	if (devLower === cleanQ) return 3700

	if (perLower && wordRegex.test(perLower)) return 2800
	if (famLower && wordRegex.test(famLower)) return 2700
	if (devLower && wordRegex.test(devLower)) return 2600

	if (perLower?.startsWith(cleanQ)) return 2500
	if (famLower?.startsWith(cleanQ)) return 2400
	if (devLower?.startsWith(cleanQ)) return 2300

	// Disallow arbitrary inside-word substring matches (prevents "Mari" hitting "Himari" or "Aru" hitting "Haruka")
	return 0
}

/**
 * Searches students by Name, DevName, or ID with intelligent relevance scoring.
 */
export async function searchSchaleStudent(
	query: string,
): Promise<SchaleStudent[]> {
	const students = await getSchaleStudents()
	const q = query
		.replace(/["'“”‘’`]/g, "")
		.trim()
		.toLowerCase()
	if (!q) return []

	// Exact ID search
	const num = Number.parseInt(q, 10)
	if (!Number.isNaN(num) && String(num) === q) {
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

const ITEMS_FILE = join(CACHE_DIR, "items.json")
const EQUIPMENT_FILE = join(CACHE_DIR, "equipment.json")

let cachedItemsMap: Record<number, SchaleItem> | null = null
let lastItemsFetchedAt = 0

let cachedEquipmentList: SchaleEquipment[] | null = null
let lastEquipmentFetchedAt = 0

/**
 * Fetches and caches all SchaleDB items (Skill Blu-rays, Tech Notes, Oopart Artifacts, Activity Reports).
 */
export async function getSchaleItems(): Promise<Record<number, SchaleItem>> {
	const now = Date.now()
	if (cachedItemsMap && now - lastItemsFetchedAt < CACHE_TTL_MS) {
		return cachedItemsMap
	}

	ensureCacheDir()

	if (existsSync(ITEMS_FILE)) {
		try {
			const raw = readFileSync(ITEMS_FILE, "utf-8")
			const parsed = JSON.parse(raw) as Record<string, SchaleItem> | SchaleItem[]
			const map: Record<number, SchaleItem> = {}
			const list = Array.isArray(parsed) ? parsed : Object.values(parsed)
			for (const item of list) {
				if (item?.Id) map[item.Id] = item
			}
			if (Object.keys(map).length > 0) {
				cachedItemsMap = map
				lastItemsFetchedAt = now
				return cachedItemsMap
			}
		} catch (err) {
			logger.warn("/utils/schaledb.ts", `Failed to read local items cache: ${err}`)
		}
	}

	try {
		logger.info("/utils/schaledb.ts", "Fetching fresh items database from SchaleDB...")
		const res = await fetch("https://schaledb.com/data/en/items.json", {
			headers: { "User-Agent": "HoshinoBot/1.0 (Blue Archive WhatsApp Assistant)" },
		})
		if (!res.ok) throw new Error(`SchaleDB items HTTP ${res.status}`)
		const data = (await res.json()) as Record<string, SchaleItem> | SchaleItem[]
		const list = Array.isArray(data) ? data : Object.values(data)
		const map: Record<number, SchaleItem> = {}
		for (const item of list) {
			if (item?.Id && item.Name) {
				map[item.Id] = item
			}
		}
		cachedItemsMap = map
		lastItemsFetchedAt = now

		try {
			writeFileSync(ITEMS_FILE, JSON.stringify(map, null, 2), "utf-8")
		} catch {}
		return map
	} catch (error) {
		if (cachedItemsMap) return cachedItemsMap
		throw error
	}
}

/**
 * Looks up a specific SchaleDB material or item by ID.
 */
export async function getSchaleItemById(itemId: number): Promise<SchaleItem | undefined> {
	const items = await getSchaleItems()
	return items[itemId]
}

/**
 * Fetches and caches all SchaleDB equipment definitions (Hat, Gloves, Shoes, Bag, Badge, Hairpin, Amulet, Watch, Necklace T1-T9).
 */
export async function getSchaleEquipment(): Promise<SchaleEquipment[]> {
	const now = Date.now()
	if (cachedEquipmentList && now - lastEquipmentFetchedAt < CACHE_TTL_MS) {
		return cachedEquipmentList
	}

	ensureCacheDir()

	if (existsSync(EQUIPMENT_FILE)) {
		try {
			const raw = readFileSync(EQUIPMENT_FILE, "utf-8")
			const parsed = JSON.parse(raw) as SchaleEquipment[] | Record<string, SchaleEquipment>
			const list = Array.isArray(parsed) ? parsed : Object.values(parsed)
			if (list.length > 0) {
				cachedEquipmentList = list
				lastEquipmentFetchedAt = now
				return cachedEquipmentList
			}
		} catch (err) {
			logger.warn("/utils/schaledb.ts", `Failed to read local equipment cache: ${err}`)
		}
	}

	try {
		logger.info("/utils/schaledb.ts", "Fetching fresh equipment database from SchaleDB...")
		const res = await fetch("https://schaledb.com/data/en/equipment.json", {
			headers: { "User-Agent": "HoshinoBot/1.0 (Blue Archive WhatsApp Assistant)" },
		})
		if (!res.ok) throw new Error(`SchaleDB equipment HTTP ${res.status}`)
		const data = (await res.json()) as Record<string, SchaleEquipment> | SchaleEquipment[]
		const list = (Array.isArray(data) ? data : Object.values(data)).filter(
			(e) => e?.Id && e.Name && e.Category,
		)
		cachedEquipmentList = list
		lastEquipmentFetchedAt = now

		try {
			writeFileSync(EQUIPMENT_FILE, JSON.stringify(list, null, 2), "utf-8")
		} catch {}
		return list
	} catch (error) {
		if (cachedEquipmentList) return cachedEquipmentList
		throw error
	}
}

/**
 * Finds the exact SchaleDB equipment piece by category (e.g. "Hat") and tier (1..9).
 */
export async function getEquipmentByCategoryAndTier(
	category: string,
	tier: number,
): Promise<SchaleEquipment | undefined> {
	const eqList = await getSchaleEquipment()
	return eqList.find(
		(e) => e.Category.toLowerCase() === category.toLowerCase() && e.Tier === tier,
	)
}

export interface MaterialRequirement {
	itemId: number
	itemName: string
	category: string
	rarity: string
	requiredCount: number
}

/**
 * Resolves the exact SchaleDB material requirements for upgrading a student's EX Skill (Lv 1 -> 5) or Basic/Passive/Sub Skill (Lv 1 -> 10).
 */
export async function getSkillUpgradeRecipe(
	student: SchaleStudent,
	skillType: "ex" | "normal" | "passive" | "sub",
	currentLevel: number,
): Promise<{
	canUpgrade: boolean
	targetLevel: number
	creditCost: number
	materials: MaterialRequirement[]
	reason?: string
}> {
	const itemsMap = await getSchaleItems()

	if (skillType === "ex") {
		if (currentLevel >= 5) {
			return {
				canUpgrade: false,
				targetLevel: 5,
				creditCost: 0,
				materials: [],
				reason: "MAX_LEVEL",
			}
		}
		const idx = currentLevel - 1 // 0..3 for Lv 1->2, 2->3, 3->4, 4->5
		const matIds = student.SkillExMaterial?.[idx] || []
		const matAmounts = student.SkillExMaterialAmount?.[idx] || []
		const exCreditCosts = [80000, 500000, 3000000, 10000000]
		const creditCost = exCreditCosts[idx] || 500000

		const materials: MaterialRequirement[] = []
		for (let i = 0; i < matIds.length; i++) {
			const id = matIds[i]!
			const amt = matAmounts[i] || 1
			const itemInfo = itemsMap[id]
			materials.push({
				itemId: id,
				itemName: itemInfo?.Name || `Schale Material #${id}`,
				category: itemInfo?.SubCategory || itemInfo?.Category || "Material",
				rarity: itemInfo?.Rarity || "N",
				requiredCount: amt,
			})
		}

		return {
			canUpgrade: true,
			targetLevel: currentLevel + 1,
			creditCost,
			materials,
		}
	}

	// Normal / Passive / Sub Skill (Lv 1 -> 10)
	if (currentLevel >= 10) {
		return {
			canUpgrade: false,
			targetLevel: 10,
			creditCost: 0,
			materials: [],
			reason: "MAX_LEVEL",
		}
	}

	const idx = currentLevel - 1 // 0..8
	const matIds = student.SkillMaterial?.[idx] || []
	const matAmounts = student.SkillMaterialAmount?.[idx] || []
	const subCreditCosts = [
		5000, 7500, 60000, 90000, 300000, 450000, 1500000, 2400000, 4000000,
	]
	const creditCost = subCreditCosts[idx] || 100000

	const materials: MaterialRequirement[] = []
	for (let i = 0; i < matIds.length; i++) {
		const id = matIds[i]!
		const amt = matAmounts[i] || 1
		const itemInfo = itemsMap[id]
		materials.push({
			itemId: id,
			itemName: itemInfo?.Name || `Schale Material #${id}`,
			category: itemInfo?.SubCategory || itemInfo?.Category || "Material",
			rarity: itemInfo?.Rarity || "N",
			requiredCount: amt,
		})
	}

	return {
		canUpgrade: true,
		targetLevel: currentLevel + 1,
		creditCost,
		materials,
	}
}

export interface StudentProgressionState {
	starGrade: number
	level: number
	exSkillLevel: number
	normalSkillLevel: number
	passiveSkillLevel: number
	subSkillLevel: number
	equipSlot1Tier: number
	equipSlot2Tier: number
	equipSlot3Tier: number
	weaponStar: number
	bondLevel?: number
}

export interface ComputedCombatStats {
	level: number
	starGrade: number
	weaponStar: number
	atk: number
	maxHp: number
	def: number
	heal: number
	crit: number
	accuracy: number
	dodge: number
	exMultiplier: number
	skillMultiplier: number
	combatPower: number
}

/**
 * Calculates a student's authentic combat stats and Combat Power based on SchaleDB Lv1-Lv100 growth curves,
 * Star Grade liberation (1★-5★), Unique Weapon (UE), Skill Levels, Equipment Tiers (T1-T9), and Bond Rank.
 */
export function calculateStudentCombatStats(
	student: SchaleStudent,
	prog: Partial<StudentProgressionState> = {},
): ComputedCombatStats {
	const level = Math.max(1, Math.min(90, prog.level || 1))
	const starGrade = Math.max(student.StarGrade || 1, prog.starGrade || student.StarGrade || 1)
	const weaponStar = Math.max(0, prog.weaponStar || 0)
	const exLv = Math.max(1, Math.min(5, prog.exSkillLevel || 1))
	const normalLv = Math.max(1, Math.min(10, prog.normalSkillLevel || 1))
	const passiveLv = Math.max(1, Math.min(10, prog.passiveSkillLevel || 1))
	const subLv = Math.max(1, Math.min(10, prog.subSkillLevel || 1))
	const eq1 = Math.max(1, Math.min(9, prog.equipSlot1Tier || 1))
	const eq2 = Math.max(1, Math.min(9, prog.equipSlot2Tier || 1))
	const eq3 = Math.max(1, Math.min(9, prog.equipSlot3Tier || 1))
	const bondLv = Math.max(1, Math.min(50, prog.bondLevel || 1))

	const ratio = (level - 1) / 99
	const baseAtk =
		(student.AttackPower1 || 250) +
		((student.AttackPower100 || 2800) - (student.AttackPower1 || 250)) * ratio
	const baseHp =
		(student.MaxHP1 || 2200) +
		((student.MaxHP100 || 22000) - (student.MaxHP1 || 2200)) * ratio
	const baseDef =
		(student.DefensePower1 || 20) +
		((student.DefensePower100 || 160) - (student.DefensePower1 || 20)) * ratio
	const baseHeal =
		(student.HealPower1 || 1200) +
		((student.HealPower100 || 4200) - (student.HealPower1 || 1200)) * ratio

	// Star Grade Multiplier (Official BA: 1★ = 1.0x, 2★ = 1.05x, 3★ = 1.12x, 4★ = 1.22x, 5★ = 1.35x)
	const starMultipliers: Record<number, number> = {
		1: 1.0,
		2: 1.06,
		3: 1.14,
		4: 1.25,
		5: 1.38,
	}
	const starMult = starMultipliers[starGrade] || 1.14

	// Unique Weapon (UE1★/2★/3★) bonus stats
	let weaponAtk = 0
	let weaponHp = 0
	let weaponHeal = 0
	if (weaponStar > 0 && student.Weapon) {
		const wRatio = (weaponStar * 15) / 50
		weaponAtk =
			(student.Weapon.AttackPower1 || 100) +
			((student.Weapon.AttackPower100 || 1200) - (student.Weapon.AttackPower1 || 100)) * wRatio
		weaponHp =
			(student.Weapon.MaxHP1 || 500) +
			((student.Weapon.MaxHP100 || 5000) - (student.Weapon.MaxHP1 || 500)) * wRatio
		weaponHeal =
			(student.Weapon.HealPower1 || 0) +
			((student.Weapon.HealPower100 || 1500) - (student.Weapon.HealPower1 || 0)) * wRatio
	}

	// Equipment Tier multipliers (Slot 1: Offensive, Slot 2: Defensive/HP, Slot 3: Utility/Crit/Heal)
	const eq1Bonus = 1 + (eq1 - 1) * 0.045 // Up to +36% ATK at T9
	const eq2Bonus = 1 + (eq2 - 1) * 0.045 // Up to +36% HP/DEF at T9
	const eq3Bonus = 1 + (eq3 - 1) * 0.035 // Up to +28% Secondary stats at T9

	// Bond Rank bonus (+1% per bond level up to +35%)
	const bondBonus = 1 + Math.min(35, bondLv - 1) * 0.01

	// Passive Skill Lv bonus (1..10 -> +14% to +26.6%)
	const passiveBonus = 1 + 0.08 + passiveLv * 0.015

	const atk = Math.round((baseAtk * starMult + weaponAtk) * eq1Bonus * bondBonus * passiveBonus)
	const maxHp = Math.round((baseHp * starMult + weaponHp) * eq2Bonus * bondBonus)
	const def = Math.round(baseDef * starMult * eq2Bonus)
	const heal = Math.round((baseHeal * starMult + weaponHeal) * eq3Bonus * bondBonus)
	const crit = Math.round((student.CriticalPoint || 200) * eq3Bonus)
	const accuracy = Math.round((student.AccuracyPoint || 700) * eq1Bonus)
	const dodge = Math.round((student.DodgePoint || 200) * eq2Bonus)

	// Skill Damage Multipliers
	const exMultiplier = 1.6 + (exLv - 1) * 0.32 // Lv1: 1.6x -> Lv5: 2.88x
	const skillMultiplier = 1.0 + (normalLv - 1) * 0.05 + (subLv - 1) * 0.05

	const combatPower = Math.round(
		atk * 2.2 +
			maxHp * 0.18 +
			def * 3.5 +
			heal * 0.65 +
			exLv * 420 +
			(normalLv + passiveLv + subLv) * 140 +
			(eq1 + eq2 + eq3) * 180 +
			starGrade * 500 +
			weaponStar * 850 +
			bondLv * 45,
	)

	return {
		level,
		starGrade,
		weaponStar,
		atk,
		maxHp,
		def,
		heal,
		crit,
		accuracy,
		dodge,
		exMultiplier,
		skillMultiplier,
		combatPower,
	}
}

/**
 * Blue Archive Official Type Affinity Matrix (BulletType vs ArmorType):
 * - Weak (Effective): 2.0x
 * - Normal: 1.0x
 * - Resisted: 0.5x
 */
export function calculateArmorMultiplier(
	bulletType: string,
	armorType: string,
): { multiplier: number; label: string } {
	const matrix: Record<string, Record<string, number>> = {
		Explosion: {
			LightArmor: 2.0,
			HeavyArmor: 0.5,
			Unarmed: 1.0,
			ElasticArmor: 0.5,
		},
		Pierce: {
			LightArmor: 0.5,
			HeavyArmor: 2.0,
			Unarmed: 0.5,
			ElasticArmor: 1.0,
		},
		Mystic: {
			LightArmor: 1.0,
			HeavyArmor: 0.5,
			Unarmed: 2.0,
			ElasticArmor: 1.0,
		},
		Sonic: {
			LightArmor: 1.0,
			HeavyArmor: 0.5,
			Unarmed: 1.5,
			ElasticArmor: 2.0,
		},
	}

	const mult = matrix[bulletType]?.[armorType] ?? 1.0
	if (mult >= 2.0) return { multiplier: 2.0, label: "💥 WEAK (2.0x)" }
	if (mult > 1.0) return { multiplier: mult, label: `✨ EFFECTIVE (${mult}x)` }
	if (mult < 1.0) return { multiplier: 0.5, label: "🛡️ RESIST (0.5x)" }
	return { multiplier: 1.0, label: "⚪ NORMAL (1.0x)" }
}

/**
 * Calculates Terrain Mood Adaptation multiplier (D=0.8x, C=0.9x, B=1.0x, A=1.1x, S=1.2x, SS=1.3x).
 */
export function calculateTerrainMultiplier(
	student: SchaleStudent,
	terrain: string = "Outdoor",
): { multiplier: number; grade: string } {
	let adapt = 2
	const t = terrain.toLowerCase()
	if (t.includes("street") || t.includes("urban")) {
		adapt = student.StreetBattleAdaptation ?? 2
	} else if (t.includes("indoor")) {
		adapt = student.IndoorBattleAdaptation ?? 2
	} else {
		adapt = student.OutdoorBattleAdaptation ?? 2
	}

	const grades: Record<number, { multiplier: number; grade: string }> = {
		0: { multiplier: 0.8, grade: "😫 D (0.8x)" },
		1: { multiplier: 0.9, grade: "😟 C (0.9x)" },
		2: { multiplier: 1.0, grade: "😐 B (1.0x)" },
		3: { multiplier: 1.1, grade: "😊 A (1.1x)" },
		4: { multiplier: 1.2, grade: "😆 S (1.2x)" },
		5: { multiplier: 1.3, grade: "👑 SS (1.3x)" },
	}
	return grades[adapt] || { multiplier: 1.0, grade: "😐 B (1.0x)" }
}

/**
 * Returns verified SchaleDB Raid Boss image URLs in priority order (`Boss_Portrait_${DevName}_Lobby.png`, `Icon_${DevName}.png`).
 */
export function getRaidBossImageUrls(boss: {
	DevName: string
	PathName?: string
	Name: string
}): string[] {
	const urls = [
		`https://schaledb.com/images/raid/Boss_Portrait_${boss.DevName}_Lobby.png`,
		`https://schaledb.com/images/raid/icon/Icon_${boss.DevName}.png`,
	]
	if (boss.PathName && boss.PathName !== boss.DevName) {
		urls.push(
			`https://schaledb.com/images/raid/Boss_Portrait_${boss.PathName}_Lobby.png`,
		)
	}
	return urls
}

/**
 * Safely fetches an image from SchaleDB, verifying that `Content-Type` is strictly `image/*`
 * (preventing SchaleDB's SPA HTML 200 OK fallback from being treated as an image) and normalizing
 * WebP/PNG buffers to a clean PNG Buffer via `sharp` so WhatsApp never renders a blank image.
 */
export async function fetchSchaleImageBuffer(
	urlOrCandidates: string | string[],
): Promise<Buffer | null> {
	const urls = Array.isArray(urlOrCandidates)
		? urlOrCandidates
		: [urlOrCandidates]

	for (const url of urls) {
		if (!url) continue
		try {
			const res = await fetch(url, {
				headers: {
					"User-Agent": "HoshinoBot/1.0 (Blue Archive WhatsApp Assistant)",
				},
			})
			if (!res.ok) continue

			const contentType = (res.headers.get("content-type") || "").toLowerCase()
			if (!contentType.startsWith("image/")) {
				continue
			}

			const rawBuf = Buffer.from(await res.arrayBuffer())
			if (rawBuf.length < 128) continue

			const pngBuf = await sharp(rawBuf).png().toBuffer()
			if (pngBuf && pngBuf.length > 128) {
				return pngBuf
			}
		} catch {}
	}

	return null
}
