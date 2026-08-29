import type { CommandContext, ICommand } from "@customTypes/command"
import { messageRepository } from "@repositories/message.repository"
import { chatWithHoshino, resetAIMemory } from "@utils/ai"
import { logger } from "@utils/logger"

async function resolveChatContext(
	ctx: CommandContext,
	prompt: string,
): Promise<string> {
	const lines: string[] = []

	// 1. Sender profile
	const senderName = ctx.pushName || ctx.senderJid.split("@")[0]
	lines.push(
		`- Pengirim Chat (Sensei): "${senderName}" (Nomor: ${ctx.senderJid.split("@")[0]})`,
	)

	// 2. Chat context
	if (ctx.isGroup) {
		const meta = await ctx.getGroupMetadata()
		lines.push(
			`- Lokasi Chat: Grup WhatsApp "${meta?.subject || "Group Chat"}"`,
		)
	} else {
		lines.push(`- Lokasi Chat: Private Chat (Personal DM)`)
	}

	// 3. Mentions Resolver (from message contextInfo and text regex)
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
					`  • @${phone}: Nickname WhatsApp adalah "${resolvedName}" (Nomor: ${phone})`,
				)
			} else {
				lines.push(
					`  • @${phone}: User dengan nomor WhatsApp ${phone} (belum ada riwayat pesan tersimpan)`,
				)
			}
		}
	}

	return lines.join("\n")
}

const command: ICommand = {
	name: ["hoshino", "ojisan", "oji-san", "takanashi"],
	category: "bluearchive",
	description: "Chat interactively with Takanashi Hoshino AI persona",
	usage: [
		"hoshino <chat message>",
		"hoshino kamu lagi ngapain?",
		"hoshino reset",
	],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const prompt = args.join(" ").trim()

		// 1. Show Help if no message provided
		if (!prompt) {
			await ctx.reply(
				`🌸 *Takanashi Hoshino AI Chat*\n\n` +
					`💡 *Cara Pakai:*\n` +
					`• *${ctx.prefix}${ctx.commandName} <pesan>* — Ngobrol langsung dengan Hoshino\n` +
					`• *${ctx.prefix}${ctx.commandName} reset* — Reset memori percakapan\n\n` +
					`📌 *Contoh:*\n` +
					`• *${ctx.prefix}hoshino Sensei mau tidur siang bareng*\n` +
					`• *${ctx.prefix}hoshino cerita tentang Abydos dong*`,
			)
			return
		}

		// 2. Handle Memory Reset
		if (prompt.toLowerCase() === "reset" || prompt.toLowerCase() === "clear") {
			resetAIMemory(ctx.senderJid)
			await ctx.reply(
				"Uhe~ Memori obrolan kita sudah direset ya Sensei. Mau mulai ngobrol apa lagi nih?",
			)
			return
		}

		try {
			// 3. Resolve context and mentions dynamically
			const contextInfo = await resolveChatContext(ctx, prompt)

			// 4. Call Hoshino AI Persona with dynamic prefix and resolved context
			const reply = await chatWithHoshino(ctx.senderJid, prompt, {
				prefix: ctx.prefix,
				contextInfo,
			})

			await ctx.reply(reply)
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
