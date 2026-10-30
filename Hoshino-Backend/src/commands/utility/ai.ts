import type { CommandContext, ICommand } from "@customTypes/command"
import { messageRepository } from "@repositories/message.repository"
import { chatWithGeneralAI, resetGeneralAIMemory } from "@utils/ai"
import { logger } from "@utils/logger"

async function resolveChatContext(
	ctx: CommandContext,
	prompt: string,
): Promise<string> {
	const lines: string[] = []

	const senderName = ctx.pushName || ctx.senderJid.split("@")[0]
	lines.push(
		`- Nama Pengguna: "${senderName}" (Nomor: ${ctx.senderJid.split("@")[0]})`,
	)

	if (ctx.isGroup) {
		const meta = await ctx.getGroupMetadata()
		lines.push(
			`- Lokasi Chat: Grup WhatsApp "${meta?.subject || "Group Chat"}"`,
		)
	} else {
		lines.push(`- Lokasi Chat: Private Chat (Personal DM)`)
	}

	const quoted = await ctx.getQuotedMessage()
	if (quoted?.text) {
		lines.push(
			`- Pesan yang sedang di-reply oleh pengguna: "${quoted.text.slice(0, 600)}"`,
		)
	}

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
				lines.push(`  • @${phone}: User dengan nomor WhatsApp ${phone}`)
			}
		}
	}

	return lines.join("\n")
}

const command: ICommand = {
	name: ["ai", "ask", "gemini", "gpt"],
	category: "utility",
	description: "Ask questions to General AI Assistant powered by Google Gemini",
	usage: [
		"ai <question>",
		"ai jelaskan teori relativitas secara singkat",
		"ai buatkan contoh REST API dengan Bun dan Elysia",
		"ai reset",
	],
	textOnly: true,
	executionTimeout: 60000,
	execute: async (args: string[], ctx: CommandContext) => {
		const prompt = args.join(" ").trim()

		// 1. Show Help if no prompt provided
		if (!prompt) {
			await ctx.reply(
				`🤖 *General AI Assistant (Google Gemini)*\n\n` +
					`💡 *Cara Pakai:*\n` +
					`• *${ctx.prefix}${ctx.commandName} <pertanyaan>* — Tanya koding, sains, tugas, atau pengetahuan umum\n` +
					`• *${ctx.prefix}${ctx.commandName} reset* — Reset memori percakapan AI umum\n\n` +
					`📌 *Contoh:* *${ctx.prefix}ai jelaskan cara kerja algoritma Dijkstra beserta contoh kodenya*`,
			)
			return
		}

		// 2. Handle Memory Reset (strictly resets only General AI memory)
		if (prompt.toLowerCase() === "reset" || prompt.toLowerCase() === "clear") {
			resetGeneralAIMemory(ctx.senderJid, ctx.agentId)
			await ctx.reply("🔄 General AI conversation memory has been cleared.")
			return
		}

		try {
			// 3. Resolve context and mentions
			const contextInfo = await resolveChatContext(ctx, prompt)

			// 4. Call General AI (neutral, objective assistant)
			const reply = await chatWithGeneralAI(ctx.senderJid, prompt, {
				agentId: ctx.agentId,
				prefix: ctx.prefix,
				contextInfo,
			})
			await ctx.reply(reply)
		} catch (error) {
			const errMsg = error instanceof Error ? error.message : String(error)
			logger.error("/commands/utility/ai.ts", `AI Error: ${errMsg}`)

			if (errMsg.includes("GEMINI_API_KEY")) {
				await ctx.reply(
					"⚠️ *GEMINI_API_KEY* is not configured in .env backend file.",
				)
			} else {
				await ctx.reply(
					"❌ AI service is currently unavailable. Please try again later.",
				)
			}
		}
	},
}

export default command
