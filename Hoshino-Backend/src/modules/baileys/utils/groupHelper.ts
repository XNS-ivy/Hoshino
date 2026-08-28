import type NodeCache from "@cacheable/node-cache"
import type { GroupMetadata, WASocket } from "baileys"

/**
 * Fetches group metadata from cache or socket fallback.
 */
export async function getOrFetchGroupMetadata(
	sock: WASocket,
	jid: string,
	groupCache: NodeCache<unknown>,
): Promise<GroupMetadata | undefined> {
	if (!jid.endsWith("@g.us")) {
		return undefined
	}

	const cached = groupCache.get(jid) as GroupMetadata | undefined
	if (cached) {
		return cached
	}

	try {
		const meta = await sock.groupMetadata(jid)
		if (meta) {
			groupCache.set(jid, meta)
		}
		return meta
	} catch {
		return undefined
	}
}

/**
 * Resolves group subject name if the JID is a group chat.
 */
export async function resolveGroupSubject(
	jid: string,
	sock: WASocket,
	groupCache: NodeCache<unknown>,
): Promise<string | undefined> {
	if (!jid.endsWith("@g.us")) {
		return undefined
	}

	const meta = await getOrFetchGroupMetadata(sock, jid, groupCache)
	return meta?.subject
}

/**
 * Force-refreshes cached metadata for a given group JID.
 */
export async function refreshGroupCache(
	sock: WASocket,
	groupId: string,
	groupCache: NodeCache<unknown>,
): Promise<GroupMetadata | undefined> {
	if (!groupId) {
		return undefined
	}

	try {
		const meta = await sock.groupMetadata(groupId)
		if (meta) {
			groupCache.set(groupId, meta)
		}
		return meta
	} catch {
		return undefined
	}
}
