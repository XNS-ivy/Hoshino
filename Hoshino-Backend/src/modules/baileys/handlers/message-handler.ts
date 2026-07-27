import type { WAMessage, WASocket } from "baileys"

export interface ParsedMessage {
	shouldDelete?: boolean
	isGroupAllowed?: boolean
	isAdmin?: boolean
	remoteJid: string
	key: WAMessage["key"]
	convertedLid?: string
}

// Optional dependencies placeholder
let messageParse: {
	fetch?: (
		msg: WAMessage,
		sock: WASocket,
		userId: string,
	) => Promise<ParsedMessage | null>
} = {}
let commandRunner: {
	execute?: (
		parsed: ParsedMessage,
		sock: WASocket,
		userId: string,
	) => Promise<void>
} = {}

try {
	messageParse = require("@modules/baileys/mesage-parse")?.message ?? {}
	commandRunner = require("@modules/handlers/commands-loader")?.default ?? {}
} catch {
	// Optional module fallback
}

/**
 * Attaches messages.upsert listener using guard clauses to reduce nesting.
 */
export function attachMessageEvents(sock: WASocket, userId: string): void {
	sock.ev.on("messages.upsert", async ({ messages, type }) => {
		// Guard clause: process notify messages only
		if (type !== "notify") return

		for (const msg of messages) {
			await processSingleMessage(msg, sock, userId)
		}
	})
}

async function processSingleMessage(
	msg: WAMessage,
	sock: WASocket,
	userId: string,
): Promise<void> {
	try {
		const parsed = await messageParse.fetch?.(msg, sock, userId)
		if (!parsed) return

		if (parsed.shouldDelete) {
			await deleteMessageSafely(sock, parsed, userId)
		}

		// Guard clause: bypass for admin or allowed group chats
		if (!parsed.isGroupAllowed && !parsed.isAdmin) return

		await commandRunner.execute?.(parsed, sock, userId)
	} catch (err: unknown) {
		const errorMsg = err instanceof Error ? err.message : String(err)
		logger.error(`[${userId}] Message processing error: ${errorMsg}`)
	}
}

async function deleteMessageSafely(
	sock: WASocket,
	parsed: { remoteJid: string; key: WAMessage["key"]; convertedLid?: string },
	userId: string,
): Promise<void> {
	try {
		await sock.sendMessage(parsed.remoteJid, { delete: parsed.key })
	} catch (err: unknown) {
		const errorMsg = err instanceof Error ? err.message : String(err)
		logger.error(
			`[${userId}] Auto-delete failed for LID ${parsed.convertedLid}: ${errorMsg}`,
		)
	}
}
