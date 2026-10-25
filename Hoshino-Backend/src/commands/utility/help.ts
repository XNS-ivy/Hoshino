import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"
import { commandLoader } from "@services/commandLoader"
import { logger } from "@utils/logger"

function getPrimaryName(cmd: ICommand): string {
	return (Array.isArray(cmd.name) ? cmd.name[0] : cmd.name) || ""
}

interface CategoryMeta {
	title: string
	icon: string
	badge: string
	order: number
}

const CATEGORY_METADATA: Record<string, CategoryMeta> = {
	bluearchive: {
		title: "BLUE ARCHIVE (KIVOTOS)",
		icon: "🌸",
		badge: "Sensei",
		order: 1,
	},
	downloaders: {
		title: "MEDIA DOWNLOADERS",
		icon: "📥",
		badge: "Public",
		order: 2,
	},
	waifuimages: {
		title: "ANIME & WAIFU",
		icon: "🎨",
		badge: "Public",
		order: 3,
	},
	utility: {
		title: "UTILITY & TOOLS",
		icon: "🛠️",
		badge: "Public",
		order: 4,
	},
	group: {
		title: "GROUP MANAGEMENT",
		icon: "🛡️",
		badge: "Admin Only",
		order: 5,
	},
	owner: {
		title: "BOT MASTER / OWNER",
		icon: "👑",
		badge: "Owner Only",
		order: 6,
	},
}

function renderCommandDetail(cmd: ICommand, prefix: string): string {
	const lines: string[] = []
	const primaryName = getPrimaryName(cmd)

	lines.push(`📌 *COMMAND DETAIL: ${primaryName.toUpperCase()}*`)
	lines.push(`───────────────────────────`)

	if (Array.isArray(cmd.name) && cmd.name.length > 1) {
		lines.push(
			`🔀 *Aliases:* ${cmd.name
				.slice(1)
				.map((a) => `${prefix}${a}`)
				.join(", ")}`,
		)
	}

	lines.push(`🔐 *Access Level:* ${cmd.access || "user"}`)
	lines.push(`📁 *Category:* ${cmd.category || "utility"}`)

	if (cmd.description) {
		lines.push(`💬 *Description:* ${cmd.description}`)
	}

	if (cmd.inGroup) {
		lines.push(`👥 *Group Only:* Yes`)
		if (cmd.inGroupAccess) {
			lines.push(`🛡️ *Required Group Role:* ${cmd.inGroupAccess}`)
		}
	}

	if (cmd.allowedMediaTypes && cmd.allowedMediaTypes.length > 0) {
		lines.push(`📥 *Allowed Media:* ${cmd.allowedMediaTypes.join(", ")}`)
	}

	if (cmd.cooldown) {
		lines.push(`⏱️ *Cooldown:* ${cmd.cooldown} second(s)`)
	}

	const usages = cmd.usage && cmd.usage.length > 0 ? cmd.usage : [primaryName]
	lines.push(`\n🧾 *Usage Examples:*`)
	for (const u of usages) {
		lines.push(`  • *${prefix}${u}*`)
	}

	return lines.join("\n")
}

const command: ICommand = {
	name: ["help", "menu"],
	category: "utility",
	description:
		"Display bot command menu tailored to your role and chat context",
	usage: ["help", "help sticker", "menu gacha", "help yt"],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		logger.info(
			"/commands/utility/help.ts",
			`[CMD-EXEC] Executing help command for ${ctx.senderJid} in ${ctx.jid}`,
		)
		const allCommands = commandLoader.getAllCommands()
		const cmdMap = new Map<string, ICommand>()

		for (const cmd of allCommands) {
			const names = Array.isArray(cmd.name) ? cmd.name : [cmd.name]
			for (const n of names) {
				cmdMap.set(n.toLowerCase(), cmd)
			}
		}

		// Resolve sender role & chat context once (shared by both modes)
		const isOwnerOrMaster = Boolean(await ctx.getOwnerRole())
		const adminStatus = ctx.isGroup
			? await ctx.getSenderAdminStatus()
			: { isAdmin: false, isBotAdmin: false }
		const isGroupAdmin = adminStatus.isAdmin

		// Bulk fetch global toggles and group commands in parallel (max 2 queries instead of 70!)
		const [globalToggles, groupCommands] = await Promise.all([
			commandRepository.getAllCommandToggles(ctx.agentId),
			ctx.isGroup
				? commandRepository.getGroupCommands(ctx.agentId, ctx.jid)
				: Promise.resolve([]),
		])

		const globalDisabledSet = new Set<string>()
		for (const t of globalToggles) {
			if (t.status === "disabled") {
				globalDisabledSet.add(t.commandName.toLowerCase())
			}
		}

		const groupStatusMap = new Map<string, "enabled" | "disabled">()
		for (const g of groupCommands) {
			groupStatusMap.set(
				g.commandName.toLowerCase(),
				g.status as "enabled" | "disabled",
			)
		}

		// Visibility rules mirror commandLoader execution layers exactly (100% in-memory O(1))
		const canSee = (cmd: ICommand): boolean => {
			// 1. Bot Master / Owner Access Control
			if ((cmd.access === "owner" || cmd.access === "master") && !isOwnerOrMaster)
				return false

			// 2. Chat Location (hide group-only commands in Private Chat)
			if (cmd.inGroup && !ctx.isGroup) return false

			// 3. Group Role Access Control (hide admin commands from members)
			if (
				ctx.isGroup &&
				cmd.inGroupAccess === "admin" &&
				!isGroupAdmin &&
				!isOwnerOrMaster
			)
				return false

			const rawNames = Array.isArray(cmd.name) ? cmd.name : [cmd.name]
			const names = rawNames.map((n) => n.toLowerCase()).filter(Boolean)

			// 4. Global agent toggle
			const isGloballyDisabled = names.some((n) => globalDisabledSet.has(n))
			if (isGloballyDisabled) return false

			// 5. Group policy (disablecmd / registration), same exemptions as loader
			const primary = getPrimaryName(cmd)
			if (ctx.isGroup && primary !== "enablecmd" && primary !== "disablecmd") {
				let hasDisabled = false
				let hasEnabled = false
				for (const n of names) {
					const s = groupStatusMap.get(n)
					if (s === "disabled") hasDisabled = true
					if (s === "enabled") hasEnabled = true
				}
				if (hasDisabled) return false
				if (hasEnabled) return true
				if (cmd.needAdminRegisterThisCommand) return false
			}

			return true
		}

		// Mode B: Detail View (!help <command_name>)
		const targetArg = (args[0] || "").toLowerCase().replace(/^[.!/#]/, "")
		if (targetArg) {
			const targetCmd = cmdMap.get(targetArg)
			// Treat inaccessible commands as non-existent to avoid leaking them
			if (!targetCmd || !canSee(targetCmd)) {
				await ctx.reply(`❌ Command *"${targetArg}"* not found in system menu.`)
				return
			}

			await ctx.reply(renderCommandDetail(targetCmd, ctx.prefix))
			return
		}

		// Mode A: Context & Role Aware Menu View
		const visibleCommands = allCommands.filter(canSee)

		const categoryMap = new Map<string, ICommand[]>()
		for (const cmd of visibleCommands) {
			const rawCat = (cmd.category || "utility").toLowerCase()
			if (!categoryMap.has(rawCat)) categoryMap.set(rawCat, [])
			categoryMap.get(rawCat)?.push(cmd)
		}

		const sortedCategories = Array.from(categoryMap.keys()).sort((a, b) => {
			const orderA = CATEGORY_METADATA[a]?.order ?? 99
			const orderB = CATEGORY_METADATA[b]?.order ?? 99
			return orderA - orderB
		})

		const roles: string[] = []
		if (isOwnerOrMaster) roles.push("👑 Bot Owner")
		if (ctx.isGroup && isGroupAdmin) roles.push("🛡️ Group Admin")
		const userRoleStr = roles.length > 0 ? roles.join(" + ") : "👤 Member"

		const chatLocationStr = ctx.isGroup ? "👥 Group Chat" : "💬 Private Chat"

		let text = `╔══════════════════════════╗\n`
		text += `  🌸 *TAKANASHI HOSHINO BOT*\n`
		text += `  _Abydos Foreclosure Task Force_\n`
		text += `╚══════════════════════════╝\n\n`
		text += `📍 *Chat:* ${chatLocationStr}  |  🎭 *Role:* ${userRoleStr}\n`
		text += `───────────────────────────\n\n`

		for (const cat of sortedCategories) {
			const meta = CATEGORY_METADATA[cat] || {
				title: cat.toUpperCase(),
				icon: "📁",
				badge: "General",
				order: 99,
			}

			const cmds = categoryMap.get(cat) || []
			const sortedCmds = cmds.sort((a, b) =>
				getPrimaryName(a).localeCompare(getPrimaryName(b)),
			)

			text += `${meta.icon} *${meta.title}* [_${meta.badge}_]\n`

			for (const c of sortedCmds) {
				const primary = getPrimaryName(c)
				const adminBadge = c.inGroupAccess === "admin" ? " 🛡️" : ""
				const shortDesc = c.description ? ` — _${c.description}_` : ""
				text += `• *${ctx.prefix}${primary}*${adminBadge}${shortDesc}\n`
			}
			text += `\n`
		}

		text += `───────────────────────────\n`
		text += `💡 *Tip:* Type *${ctx.prefix}help <command>* for detailed usage & aliases\n`
		text += `📌 *Prefix:* "${ctx.prefix}"  |  📦 *Available Commands:* ${visibleCommands.length}`

		await ctx.reply(text)
	},
}

export default command
