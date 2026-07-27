import type { GroupMetadata, WASocket } from "baileys"
import type NodeCache from "node-cache"

/**
 * Attaches group updates and participants updates event listeners.
 */
export function attachGroupEvents(sock: WASocket, groupCache: NodeCache): void {
	sock.ev.on("groups.update", (updates) => {
		for (const update of updates) {
			if (!update.id) continue
			const cached = groupCache.get<Record<string, unknown>>(update.id)
			if (cached) {
				groupCache.set(update.id, { ...cached, ...update })
			}
		}
	})

	sock.ev.on("group-participants.update", async ({ id }) => {
		if (!id) return
		try {
			const meta: GroupMetadata = await sock.groupMetadata(id)
			groupCache.set(id, meta)
		} catch {
			// Ignore metadata fetch errors
		}
	})
}
