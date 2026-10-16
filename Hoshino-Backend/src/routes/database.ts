import { databaseRepository } from "@repositories/database.repository"
import { Elysia, t } from "elysia"

export const databaseRoutes = new Elysia({ prefix: "/api/database" })
	// GET /api/database/stats - Full storage metrics & table sizing
	.get("/stats", async ({ set }) => {
		try {
			const stats = await databaseRepository.getDatabaseStats()
			return {
				success: true,
				data: stats,
			}
		} catch (error) {
			set.status = 500
			return {
				success: false,
				message: `Failed to fetch database metrics: ${error}`,
			}
		}
	})

	// GET /api/database/settings - Retention policy configuration
	.get("/settings", async ({ set }) => {
		try {
			const settings = await databaseRepository.getSettings()
			return {
				success: true,
				data: settings,
			}
		} catch (error) {
			set.status = 500
			return {
				success: false,
				message: `Failed to fetch database settings: ${error}`,
			}
		}
	})

	// PUT /api/database/settings - Update retention policy configuration
	.put(
		"/settings",
		async ({ body, set }) => {
			try {
				const updated = await databaseRepository.updateSettings({
					autoPruneEnabled: body.autoPruneEnabled,
					retentionDays: body.retentionDays,
					maxMessagesPerChat: body.maxMessagesPerChat,
					cleanMediaBloat: body.cleanMediaBloat,
				})
				return {
					success: true,
					data: updated,
					message: "Database retention settings updated successfully",
				}
			} catch (error) {
				set.status = 500
				return {
					success: false,
					message: `Failed to update database settings: ${error}`,
				}
			}
		},
		{
			body: t.Object({
				autoPruneEnabled: t.Optional(t.Boolean()),
				retentionDays: t.Optional(t.Number()),
				maxMessagesPerChat: t.Optional(t.Number()),
				cleanMediaBloat: t.Optional(t.Boolean()),
			}),
		},
	)

	// POST /api/database/clean - Trigger manual message pruning or media bloat purge
	.post(
		"/clean",
		async ({ body, set }) => {
			try {
				const res = await databaseRepository.pruneMessages({
					retentionDays: body.retentionDays,
					maxMessagesPerChat: body.maxMessagesPerChat,
					purgeMediaOnly: body.purgeMediaOnly,
				})
				return {
					success: true,
					data: res,
					message: `Pruning complete: deleted ${res.deletedMessages} messages, purged ${res.strippedMedia} media payloads`,
				}
			} catch (error) {
				set.status = 500
				return {
					success: false,
					message: `Failed to prune database: ${error}`,
				}
			}
		},
		{
			body: t.Object({
				retentionDays: t.Optional(t.Number()),
				maxMessagesPerChat: t.Optional(t.Number()),
				purgeMediaOnly: t.Optional(t.Boolean()),
			}),
		},
	)

	// POST /api/database/vacuum - Trigger VACUUM FULL to reclaim physical disk space
	.post(
		"/vacuum",
		async ({ body, set }) => {
			try {
				const res = await databaseRepository.runVacuum(body?.table)
				return {
					success: true,
					data: res,
					message: res.message,
				}
			} catch (error) {
				set.status = 500
				return {
					success: false,
					message: `Failed to execute VACUUM: ${error}`,
				}
			}
		},
		{
			body: t.Optional(
				t.Object({
					table: t.Optional(t.String()),
				}),
			),
		},
	)
