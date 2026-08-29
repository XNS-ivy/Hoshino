import type { CommandContext, ICommand } from "@customTypes/command"
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

		// Mode B: Detail View (!help <command_name>)
		const targetArg = (args[0] || "").toLowerCase().replace(/^[.!/#]/, "")
		if (targetArg) {
			const targetCmd = cmdMap.get(targetArg)
			if (!targetCmd) {
				await ctx.reply(`❌ Command *"${targetArg}"* not found in system menu.`)
				return
			}

			await ctx.reply(renderCommandDetail(targetCmd, ctx.prefix))
			return
		}

		// Mode A: Context & Role Aware Menu View
		const isOwnerOrMaster = Boolean(await ctx.getOwnerRole())
		const adminStatus = ctx.isGroup
			? await ctx.getSenderAdminStatus()
			: { isAdmin: false, isBotAdmin: false }
		const isGroupAdmin = adminStatus.isAdmin

		// Filter commands strictly based on chat location and user role
		const visibleCommands = allCommands.filter((cmd) => {
			// 1. Bot Master / Owner Access Control
			if (cmd.access === "owner" || cmd.access === "master") {
				if (!isOwnerOrMaster) return false
			}

			// 2. Chat Location (Private DM vs Group)
			if (cmd.inGroup && !ctx.isGroup) {
				// Hide group-only commands when in Private Chat
				return false
			}

			// 3. Group Role Access Control
			if (
				ctx.isGroup &&
				cmd.inGroupAccess === "admin" &&
				!isGroupAdmin &&
				!isOwnerOrMaster
			) {
				// Hide admin commands from regular group members
				return false
			}

			return true
		})

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

		const userRoleStr = isOwnerOrMaster
			? "👑 Bot Owner"
			: ctx.isGroup && isGroupAdmin
				? "🛡️ Group Admin"
				: "👤 Member"

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
