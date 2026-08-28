import type NodeCache from "@cacheable/node-cache"
import { commandRepository } from "@repositories/command.repository"
import { logger } from "@utils/logger"
import type { GroupMetadata, WASocket } from "baileys"
import { refreshGroupCache } from "../utils/groupHelper"

export interface GroupHandlerContext {
	sock: WASocket
	safeAgentId: string
	groupCache: NodeCache<unknown>
}

/**
 * Handles 'groups.update' event to refresh group metadata cache.
 */
export async function handleGroupsUpdate(
	groups: Partial<GroupMetadata>[],
	sock: WASocket,
	groupCache: NodeCache<unknown>,
): Promise<void> {
	if (!groups?.length) return

	for (const group of groups) {
		if (!group.id) continue
		await refreshGroupCache(sock, group.id, groupCache)
	}
}

/**
 * Sends welcome message to newly joined participants.
 */
async function sendWelcomeMessage(
	sock: WASocket,
	groupId: string,
	participants: (string | { id: string })[],
	groupCache: NodeCache<unknown>,
): Promise<void> {
	const mentions = participants.map((p) => {
		const pJid = typeof p === "string" ? p : p.id
		return commandRepository.normalizeJid(pJid)
	})

	const groupMeta = groupCache.get(groupId) as GroupMetadata | undefined
	const groupName = groupMeta?.subject || "kami"
	const welcomeText = `👋 Selamat datang @${mentions.map((m) => m.split("@")[0]).join(", @")} di grup *${groupName}*!`

	await sock.sendMessage(groupId, {
		text: welcomeText,
		mentions,
	})
}

/**
 * Sends goodbye message when participants leave or get removed.
 */
async function sendGoodbyeMessage(
	sock: WASocket,
	groupId: string,
	participants: (string | { id: string })[],
): Promise<void> {
	const mentions = participants.map((p) => {
		const pJid = typeof p === "string" ? p : p.id
		return commandRepository.normalizeJid(pJid)
	})

	const goodbyeText = `👋 Selamat tinggal @${mentions.map((m) => m.split("@")[0]).join(", @")}!`

	await sock.sendMessage(groupId, {
		text: goodbyeText,
		mentions,
	})
}

/**
 * Handles 'group-participants.update' event for welcome & goodbye announcements using clean guard clauses.
 */
export async function handleGroupParticipantsUpdate(
	update: {
		id: string
		author?: string
		participants: (string | { id: string })[]
		action: string
	},
	ctx: GroupHandlerContext,
): Promise<void> {
	const { id, participants, action } = update
	if (!id || !participants?.length) return

	const { sock, safeAgentId, groupCache } = ctx

	// Always refresh cached group metadata on participant changes
	await refreshGroupCache(sock, id, groupCache)

	// Guard: only proceed for add/remove actions
	if (action !== "add" && action !== "remove") return

	try {
		const groupSettings = await commandRepository.getGroupSettings(
			safeAgentId,
			id,
		)

		// Guard: bot must be enabled in group
		if (!groupSettings.botEnabled) return

		if (action === "add" && groupSettings.welcomeEnabled) {
			await sendWelcomeMessage(sock, id, participants, groupCache)
			return
		}

		if (action === "remove" && groupSettings.goodbyeEnabled) {
			await sendGoodbyeMessage(sock, id, participants)
		}
	} catch (err) {
		logger.error(
			"/modules/baileys/handlers/group.handler.ts",
			`Welcome/Goodbye event processing error: ${err}`,
		)
	}
}
