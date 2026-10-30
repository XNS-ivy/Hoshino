import type { CommandContext, ICommand } from "@customTypes/command"
import { messageRepository } from "@repositories/message.repository"
import { commandLoader } from "@services/commandLoader"
import { detectMessageType } from "@services/contextBuilder"
import { chatWithHoshinoAgent, resetHoshinoMemory } from "@utils/ai"
import { logger } from "@utils/logger"

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

	// 3. Direct Media & Quoted Message Inspection
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

	// 4. Mentions Resolver (from message contextInfo and text regex)
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
		"Chat interactively with Takanashi Hoshino AI persona and autonomously execute bot commands according to user role",
	usage: [
		"hoshino <chat message / command instruction>",
		"hoshino kamu lagi ngapain?",
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
				`🌸 *Takanashi Hoshino AI (Autonomous Agent)*\n\n` +
					`💡 *Cara Pakai:*\n` +
					`• *${ctx.prefix}${ctx.commandName} <pesan>* — Ngobrol langsung atau minta Hoshino menjalankan fitur bot\n` +
					`• *${ctx.prefix}${ctx.commandName} reset* — Reset memori percakapan Hoshino\n\n` +
					`📌 *Contoh Interaksi & Otomasi:*\n` +
					`• *${ctx.prefix}hoshino Sensei mau tidur siang bareng*\n` +
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
			// 3. Build live telemetry (Caller Role, Group Admin status, Bot Admin status, Mentions, Quoted Message, Media)
			const contextInfo = await buildHoshinoTelemetry(ctx, prompt)

			// 4. Call Hoshino Agentic AI Persona
			const agentRes = await chatWithHoshinoAgent(ctx.senderJid, prompt, {
				agentId: ctx.agentId,
				prefix: ctx.prefix,
				contextInfo,
			})

			// 5. Send Hoshino's conversational reply first
			if (agentRes.reply) {
				await ctx.reply(agentRes.reply)
			}

			// 6. If Hoshino emitted an autonomous command action, validate RBAC & execute it via CommandLoader
			if (agentRes.action?.command) {
				await commandLoader.executeDelegatedCommand(
					ctx,
					agentRes.action.command,
					agentRes.action.args,
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
