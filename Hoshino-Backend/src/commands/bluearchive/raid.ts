import type { CommandContext, ICommand } from "@customTypes/command"
import { logger } from "@utils/logger"
import { formatArmorType, formatBulletType } from "@utils/schaledb"

interface SchaleRaidBoss {
	Id: number
	Name: string
	DevName: string
	PathName?: string
	ArmorType: string
	BulletType?: string
	BulletTypeInsane?: string
	Terrain?: string[]
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const CACHE_DIR = join(process.cwd(), "data", "schaledb")
const RAIDS_FILE = join(CACHE_DIR, "raids.json")

let cachedRaids: SchaleRaidBoss[] | null = null
let lastRaidFetch = 0

async function getRaidBosses(): Promise<SchaleRaidBoss[]> {
	const now = Date.now()
	if (cachedRaids && now - lastRaidFetch < 7 * 24 * 60 * 60 * 1000) {
		return cachedRaids
	}

	if (!existsSync(CACHE_DIR)) {
		mkdirSync(CACHE_DIR, { recursive: true })
	}

	// 1. Try local disk cache
	if (existsSync(RAIDS_FILE)) {
		try {
			const localData = readFileSync(RAIDS_FILE, "utf-8")
			const parsed = JSON.parse(localData) as SchaleRaidBoss[]
			if (Array.isArray(parsed) && parsed.length > 0) {
				cachedRaids = parsed
				lastRaidFetch = now
				return cachedRaids
			}
		} catch {}
	}

	// 2. Fetch fresh from SchaleDB
	try {
		const res = await fetch("https://schaledb.com/data/en/raids.json")
		if (!res.ok) throw new Error(`HTTP ${res.status}`)
		const data = (await res.json()) as { Raid?: SchaleRaidBoss[] }
		cachedRaids = data.Raid || []
		lastRaidFetch = now

		try {
			writeFileSync(RAIDS_FILE, JSON.stringify(cachedRaids, null, 2), "utf-8")
		} catch {}

		return cachedRaids
	} catch (e) {
		if (cachedRaids) return cachedRaids
		throw e
	}
}

function getRecommendedCounter(armorType: string): string {
	switch (armorType) {
		case "LightArmor":
			return "🔴 Explosive (Red) Strikers"
		case "HeavyArmor":
			return "🟡 Piercing (Yellow) Strikers"
		case "Unarmed":
			return "🔵 Mystic (Blue) Strikers"
		case "ElasticArmor":
			return "🟣 Sonic (Purple) Strikers"
		default:
			return "General Strikers"
	}
}

const command: ICommand = {
	name: ["raid", "boss", "totalassault"],
	category: "bluearchive",
	description:
		"View Blue Archive Total Assault raid boss guides, weaknesses, and armor counters",
	usage: [
		"raid",
		"raid binah",
		"raid chesed",
		"raid hieronymus",
		"raid goz",
		"raid shirokuro",
	],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const targetName = args.join(" ").trim().toLowerCase()

		try {
			const bosses = await getRaidBosses()

			// Mode A: Show All Bosses List
			if (!targetName) {
				let text = `⚔️ *KIVOTOS TOTAL ASSAULT BOSSES (SchaleDB)*\n`
				text += `───────────────────────────\n\n`

				for (const b of bosses) {
					const armorStr = formatArmorType(b.ArmorType)
					const counterStr = getRecommendedCounter(b.ArmorType)
					text += `👾 *${b.Name}*\n`
					text += `  • 🛡️ *Armor:* ${armorStr}\n`
					text += `  • ⚔️ *Best Counter:* ${counterStr}\n`
					text += `  • 🏞️ *Terrain:* ${b.Terrain?.join(", ") || "General"}\n\n`
				}

				text += `───────────────────────────\n`
				text += `💡 *Detail Guide:* Type *${ctx.prefix}raid <boss name>* (e.g. *${ctx.prefix}raid binah*)`

				await ctx.reply(text)
				return
			}

			// Mode B: Boss Detail
			const match = bosses.find(
				(b) =>
					b.Name.toLowerCase().includes(targetName) ||
					b.DevName.toLowerCase().includes(targetName) ||
					b.PathName?.toLowerCase().includes(targetName),
			)

			if (!match) {
				await ctx.reply(
					`❌ Boss *"${targetName}"* not found in Total Assault database.\n\n` +
						`💡 *Available Bosses:* ${bosses.map((b) => b.Name).join(", ")}`,
				)
				return
			}

			let caption = `👾 *TOTAL ASSAULT: ${match.Name.toUpperCase()}*\n`
			caption += `───────────────────────────\n`
			caption += `🛡️ *Defense Armor:* ${formatArmorType(match.ArmorType)}\n`
			caption += `🎯 *Recommended Attack:* ${getRecommendedCounter(match.ArmorType)}\n`

			if (match.BulletTypeInsane) {
				caption += `💥 *Insane/Torment Attack:* ${formatBulletType(match.BulletTypeInsane)}\n`
			}

			if (match.Terrain && match.Terrain.length > 0) {
				caption += `🏞️ *Combat Terrain:* ${match.Terrain.join(", ")}\n`
			}

			caption += `\n💡 *Battle Strategy:*\n`
			caption += `Deploy ${getRecommendedCounter(match.ArmorType)} with high mood affinity for ${match.Terrain?.[0] || "the battlefield"} to maximize EX skill damage output!`

			// Fetch Boss Portrait Image from SchaleDB
			const imgName = match.PathName || match.DevName || match.Name
			const imgUrl = `https://schaledb.com/images/raid/Boss_Portrait_${imgName}.png`

			try {
				const imgRes = await fetch(imgUrl)
				if (imgRes.ok) {
					const imgBuf = Buffer.from(await imgRes.arrayBuffer())
					await ctx.sock.sendMessage(
						ctx.jid,
						{ image: imgBuf, caption },
						{ quoted: ctx.rawMsg },
					)
					return
				}
			} catch {}

			await ctx.reply(caption)
		} catch (error) {
			logger.error("/commands/bluearchive/raid.ts", `Raid error: ${error}`)
			await ctx.reply("⚠️ Failed to load Total Assault boss data.")
		}
	},
}

export default command
