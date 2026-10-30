import type { CommandContext, ICommand } from "@customTypes/command"
import { gachaRepository } from "@repositories/gacha.repository"
import { messageRepository } from "@repositories/message.repository"
import { commandLoader } from "@services/commandLoader"
import { detectMessageType } from "@services/contextBuilder"
import {
	chatWithHoshinoAgent,
	type HoshinoCommandAction,
	resetHoshinoMemory,
} from "@utils/ai"
import { logger } from "@utils/logger"
import { resolveCanonicalSensei } from "./upgrade"

const RECURSIVE_AI_TRIGGERS = new Set([
	"hoshino",
	"ojisan",
	"oji-san",
	"takanashi",
	"ai",
	"ask",
	"gemini",
	"gpt",
])

/**
 * Deterministic fallback command intent detector when the user passes a direct or natural command
 * instruction to `.hoshino` (e.g. `.hoshino kick @xxx`, `.hoshino gacha 10`, `.hoshino hapus pesan ini`).
 */
async function resolveFallbackCommandIntent(
	prompt: string,
	ctx: CommandContext,
): Promise<HoshinoCommandAction | null> {
	// Strip polite prefixes like "tolong", "coba", "bantu", "dong", "ya", "sensei"
	const cleaned = prompt
		.trim()
		.replace(
			/^(?:tolong|coba|bantu|bisa|minta|please|plis|boleh|ayo|yuk)\s+/i,
			"",
		)
		.replace(/^[.!#/]+/, "")
		.trim()

	if (!cleaned) return null

	const tokens = cleaned.split(/\s+/)
	const firstWord = (tokens[0] || "").toLowerCase()

	// 1. Direct command name match at start of cleaned prompt (e.g. ".hoshino kick @xxx", ".hoshino gacha 10", ".hoshino daily")
	if (firstWord && !RECURSIVE_AI_TRIGGERS.has(firstWord)) {
		const matchedCmd = commandLoader.getCommand(firstWord)
		if (matchedCmd) {
			// Avoid triggering "student" / "ba" / "raid" when the user is actually asking a conversational question like "raid boss terkuat siapa?"
			const isConversationalQuestion =
				/\b(siapa|apa|kenapa|mengapa|bagaimana|gimana|kapan|jelaskan|ceritakan|ceritain)\b/i.test(
					prompt,
				)
			if (!isConversationalQuestion) {
				return {
					command: firstWord,
					args: tokens.slice(1),
				}
			}
		}
	}

	const lower = prompt.toLowerCase()
	const mentions = await ctx.getMentions()
	const regexMentions = prompt.match(/@\d{7,16}/g) || []
	const targetTag =
		regexMentions[0] ||
		(mentions[0] ? `@${mentions[0].split("@")[0]}` : undefined)

	// 2. Natural language Group Moderation intents ("kick", "keluarin", "tendang", "hapus pesan")
	if (/\b(kick|keluarin|tendang)\b/i.test(lower)) {
		return {
			command: "kick",
			args: targetTag ? [targetTag] : [],
		}
	}

	if (
		/\b(hapus|delete|del)\s+(pesan|chat|ini|itu)\b/i.test(lower) ||
		/^(hapus|delete|del)$/i.test(cleaned)
	) {
		return {
			command: "delete",
			args: [],
		}
	}

	if (/\b(autodelete)\b/i.test(lower)) {
		const isDisable = /\b(matikan|disable|off|hapus|stop)\b/i.test(lower)
		return {
			command: isDisable ? "disableautodelete" : "autodelete",
			args: targetTag ? [targetTag] : [],
		}
	}

	// 3. Natural language Blue Archive & Utility intents
	if (/\b(klaim|claim|ambil)\s+daily\b/i.test(lower)) {
		return { command: "daily", args: [] }
	}

	const gachaMatch = lower.match(/\b(?:gacha|pull|tarik\s+gacha)\s*(10|1)?\b/i)
	if (
		gachaMatch &&
		!/\b(apa|gimana|cara|rate|berapa)\b/i.test(lower)
	) {
		return {
			command: "gacha",
			args: [gachaMatch[1] === "1" ? "1" : "10"],
		}
	}

	if (/\b(bikin|bikinin|buat|buatkan|jadiin)\s+(stiker|sticker)\b/i.test(lower)) {
		return { command: "sticker", args: [] }
	}

	if (/\b(serang|lawan|attack)\s+(raid|boss)\b/i.test(lower)) {
		return { command: "raid", args: ["attack"] }
	}

	return null
}

function isFalsePositiveRefusal(reply: string): boolean {
	return /\b(nggak ngerti yang aneh-aneh|tidak dapat memenuhi|tidak bisa membantu dengan itu|melanggar kebijakan|sebagai ai|out of character)\b/i.test(
		reply,
	)
}

async function buildHoshinoTelemetry(
	ctx: CommandContext,
	prompt: string,
): Promise<string> {
	const lines: string[] = []

	// 1. Sender identity & RBAC Roles
	const senderName = ctx.pushName || ctx.senderJid.split("@")[0]
	const ownerRole = await ctx.getOwnerRole()
	let isSenderAdmin = false
	let isBotAdmin = false

	if (ctx.isGroup) {
		const adminStatus = await ctx.getSenderAdminStatus()
		isSenderAdmin = adminStatus.isAdmin
		isBotAdmin = adminStatus.isBotAdmin
	}

	const canExecuteAdminCommands = Boolean(isSenderAdmin || ownerRole)
	const roleDescriptions: string[] = []
	if (ownerRole === "master") roleDescriptions.push("Master Owner Bot")
	else if (ownerRole === "owner") roleDescriptions.push("Bot Owner")
	if (ctx.isGroup) {
		if (isSenderAdmin) roleDescriptions.push("Admin Grup")
		else roleDescriptions.push("Member Biasa Grup")
	} else {
		roleDescriptions.push("Pengguna Private Chat")
	}

	lines.push(
		`- Pengirim Chat (Sensei): "${senderName}" (JID: ${ctx.senderJid}, Nomor: ${ctx.senderJid.split("@")[0]})`,
	)
	lines.push(`- Role Pengirim: ${roleDescriptions.join(" & ")}`)
	lines.push(
		`- Hak Akses Bot Owner (isOwnerOrMaster): ${ownerRole ? `YA (${ownerRole.toUpperCase()})` : "TIDAK"}`,
	)

	// 2. Chat environment & Bot admin status
	if (ctx.isGroup) {
		const meta = await ctx.getGroupMetadata()
		lines.push(
			`- Lokasi Chat: Grup WhatsApp "${meta?.subject || "Group Chat"}" (isGroup: true)`,
		)
		lines.push(
			`- Hak Akses Admin Grup Pengirim (canExecuteAdminCommands): ${canExecuteAdminCommands ? "YA (Boleh eksekusi command Admin Grup)" : "TIDAK (Member Biasa - DILARANG eksekusi command Admin Grup)"}`,
		)
		lines.push(
			`- Apakah Bot Admin Grup (isBotAdmin): ${isBotAdmin ? "YA (Bot bisa kick/delete)" : "TIDAK (Bot belum jadi Admin Grup)"}`,
		)
	} else {
		lines.push(`- Lokasi Chat: Private Chat / Personal DM (isGroup: false)`)
		lines.push(
			`- Hak Akses Admin Grup Pengirim (canExecuteAdminCommands): TIDAK (Sedang tidak di dalam grup)`,
		)
	}

	// 3. Sensei's Blue Archive Profile & Roster Summary from Database
	try {
		const { canonicalJid } = await resolveCanonicalSensei(ctx)
		const [profile, collection] = await Promise.all([
			gachaRepository.getOrCreateProfile(ctx.agentId, canonicalJid),
			gachaRepository.getCollection(ctx.agentId, canonicalJid),
		])
		const threeStars = collection
			.filter((s) => s.starGrade >= 3)
			.slice(0, 12)
			.map((s) => `${s.studentName} (Lv.${s.level}, ${s.starGrade}★)`)
		lines.push(
			`- Data Akun SCHALE Sensei Pengirim: Pyroxenes=${profile.pyroxenes.toLocaleString("en-US")} 💎, Credits=${profile.credits.toLocaleString("en-US")} 🪙, Total Murid Direkrut=${collection.length} murid${threeStars.length > 0 ? `, Murid Unggulan: ${threeStars.join(", ")}` : ""}`,
		)
	} catch {}

	// 4. Direct Media & Quoted Message Inspection
	lines.push(`- Tipe Media Pesan Saat Ini: ${ctx.messageType}`)

	const quoted = await ctx.getQuotedMessage()
	if (quoted?.rawQuoted) {
		const quotedType = detectMessageType(quoted.rawQuoted)
		const quotedPhone = quoted.senderJid
			? quoted.senderJid.split("@")[0]
			: "unknown"
		lines.push(
			`- Pesan yang Di-Reply (Quoted Message): ADA (Pengirim Pesan yang Di-reply: @${quotedPhone}, Tipe Media Quoted: ${quotedType}${quoted.text ? `, Isi Teks: "${quoted.text.slice(0, 300)}"` : ""})`,
		)
	} else {
		lines.push(`- Pesan yang Di-Reply (Quoted Message): TIDAK ADA`)
	}

	// 5. Mentions Resolver (from message contextInfo and text regex)
	const rawMentions = await ctx.getMentions()
	const promptMentions = (prompt.match(/@\d{7,16}/g) || []).map(
		(m) => `${m.replace("@", "")}@s.whatsapp.net`,
	)
	const allMentions = Array.from(new Set([...rawMentions, ...promptMentions]))

	if (allMentions.length > 0) {
		lines.push(`- Data Member yang Dimention / Disebut dalam pesan:`)
		for (const jid of allMentions) {
			const phone = jid.split("@")[0]
			let resolvedName = await messageRepository.getPushName(ctx.agentId, jid)

			if (!resolvedName && jid === ctx.senderJid) {
				resolvedName = ctx.pushName || null
			}

			if (resolvedName) {
				lines.push(
					`  • @${phone}: Nickname WhatsApp adalah "${resolvedName}" (Argumen Target: @${phone})`,
				)
			} else {
				lines.push(
					`  • @${phone}: User dengan nomor/ID ${phone} (Argumen Target: @${phone})`,
				)
			}
		}
	}

	return lines.join("\n")
}

const command: ICommand = {
	name: ["hoshino", "ojisan", "oji-san", "takanashi"],
	category: "bluearchive",
	description:
		"Chat interactively with Takanashi Hoshino AI persona (grounded in local SchaleDB) and autonomously execute bot commands according to user role",
	usage: [
		"hoshino <chat message / command instruction>",
		"hoshino siapa itu kisaki?",
		"hoshino gacha 10 kali dong",
		"hoshino kick @user",
		"hoshino reset",
	],
	textOnly: true,
	executionTimeout: 60000,
	execute: async (args: string[], ctx: CommandContext) => {
		const prompt = args.join(" ").trim()

		// 1. Show Help if no message provided
		if (!prompt) {
			await ctx.reply(
				`🌸 *Takanashi Hoshino AI (Autonomous Agent & SchaleDB Knowledge)*\n\n` +
					`💡 *Cara Pakai:*\n` +
					`• *${ctx.prefix}${ctx.commandName} <pesan>* — Ngobrol, tanya info murid Kivotos, atau minta Hoshino menjalankan fitur bot\n` +
					`• *${ctx.prefix}${ctx.commandName} reset* — Reset memori percakapan Hoshino\n\n` +
					`📌 *Contoh Interaksi & Otomasi:*\n` +
					`• *${ctx.prefix}hoshino siapa itu Kisaki?*\n` +
					`• *${ctx.prefix}hoshino tolong gacha 10 kali dong*\n` +
					`• *${ctx.prefix}hoshino bikinin stiker dari gambar ini*\n` +
					`• *${ctx.prefix}hoshino kick @user* _(Khusus Admin Grup)_`,
			)
			return
		}

		// 2. Handle Memory Reset (strictly resets only Hoshino memory)
		if (prompt.toLowerCase() === "reset" || prompt.toLowerCase() === "clear") {
			resetHoshinoMemory(ctx.senderJid, ctx.agentId)
			await ctx.reply(
				"Uhe~ Memori obrolan kita sudah direset ya Sensei. Mau mulai ngobrol atau minta bantuan apa lagi nih?",
			)
			return
		}

		try {
			// 3. Build live telemetry (Caller Role, Group Admin status, Bot Admin status, Sensei Roster, Mentions, Quoted Message, Media)
			const contextInfo = await buildHoshinoTelemetry(ctx, prompt)

			// 4. Call Hoshino Agentic AI Persona (automatically grounds with local SchaleDB students.json & raids.json)
			const agentRes = await chatWithHoshinoAgent(ctx.senderJid, prompt, {
				agentId: ctx.agentId,
				prefix: ctx.prefix,
				contextInfo,
			})

			// 5. Resolve command action (from AI tag OR deterministic fallback intent if AI forgot the tag)
			const resolvedAction =
				agentRes.action || (await resolveFallbackCommandIntent(prompt, ctx))

			let replyToSend = agentRes.reply
			if (resolvedAction && isFalsePositiveRefusal(replyToSend)) {
				replyToSend =
					"Uhe~ Siap Sensei! Biar Oji-san bantu jalankan perintahnya sekarang ya~ 🛡️"
			}

			// 6. Send Hoshino's conversational reply first
			if (replyToSend) {
				await ctx.reply(replyToSend)
			}

			// 7. If an action is present, validate RBAC & execute it via CommandLoader
			if (resolvedAction?.command) {
				await commandLoader.executeDelegatedCommand(
					ctx,
					resolvedAction.command,
					resolvedAction.args,
					{
						silentDeny: Boolean(
							replyToSend && !agentRes.action && !isFalsePositiveRefusal(replyToSend),
						),
					},
				)
			}
		} catch (error) {
			const errMsg = error instanceof Error ? error.message : String(error)
			logger.error("/commands/bluearchive/hoshino.ts", `AI Error: ${errMsg}`)

			if (errMsg.includes("GEMINI_API_KEY")) {
				await ctx.reply(
					"⚠️ *GEMINI_API_KEY* belum dikonfigurasi di file .env backend.",
				)
			} else {
				await ctx.reply(
					"Uhe~ Maaf ya Sensei, kepala Oji-san lagi pusing dan ngantuk banget... Coba tanya lagi sebentar ya~ zzz...",
				)
			}
		}
	},
}

export default command
