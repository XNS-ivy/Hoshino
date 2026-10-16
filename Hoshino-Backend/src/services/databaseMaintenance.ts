import { databaseRepository } from "@repositories/database.repository"
import { logger } from "@utils/logger"

export class DatabaseMaintenanceService {
	private static instance: DatabaseMaintenanceService
	private intervalHandle: NodeJS.Timeout | null = null
	private isRunning = false

	private constructor() {}

	public static getInstance(): DatabaseMaintenanceService {
		if (!DatabaseMaintenanceService.instance) {
			DatabaseMaintenanceService.instance = new DatabaseMaintenanceService()
		}
		return DatabaseMaintenanceService.instance
	}

	/**
	 * Starts the recurring maintenance loop (every 6 hours).
	 */
	public start(intervalMs = 6 * 60 * 60 * 1000): void {
		if (this.intervalHandle) return

		// Run an initial check 15 seconds after startup
		setTimeout(() => {
			void this.runMaintenance()
		}, 15000)

		this.intervalHandle = setInterval(() => {
			void this.runMaintenance()
		}, intervalMs)

		logger.system(
			"/services/databaseMaintenance.ts",
			`Database auto-prune maintenance scheduler started (interval: ${intervalMs / 3600000}h)`,
		)
	}

	/**
	 * Stops the recurring maintenance loop.
	 */
	public stop(): void {
		if (this.intervalHandle) {
			clearInterval(this.intervalHandle)
			this.intervalHandle = null
		}
	}

	/**
	 * Executes automated pruning if enabled in database settings.
	 */
	public async runMaintenance(): Promise<void> {
		if (this.isRunning) return
		this.isRunning = true

		try {
			const settings = await databaseRepository.getSettings()
			if (!settings.autoPruneEnabled) {
				return
			}

			logger.info(
				"/services/databaseMaintenance.ts",
				`Running automated message pruning (Retention: ${settings.retentionDays}d, Max/Chat: ${settings.maxMessagesPerChat})...`,
			)

			const res = await databaseRepository.pruneMessages({
				retentionDays: settings.retentionDays,
				maxMessagesPerChat: settings.maxMessagesPerChat,
				purgeMediaOnly: false,
			})

			if (res.deletedMessages > 0 || res.strippedMedia > 0) {
				logger.system(
					"/services/databaseMaintenance.ts",
					`Automated prune complete: deleted ${res.deletedMessages} old messages, stripped ${res.strippedMedia} media payloads`,
				)
			}
		} catch (error) {
			logger.warn(
				"/services/databaseMaintenance.ts",
				`Error during automated database maintenance: ${error}`,
			)
		} finally {
			this.isRunning = false
		}
	}
}

export const databaseMaintenance = DatabaseMaintenanceService.getInstance()
