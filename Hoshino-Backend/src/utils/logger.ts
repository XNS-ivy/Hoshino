import * as fs from "node:fs"
import * as path from "node:path"

// ─── Types ────────────────────────────────────────────────────────────────────

export type LogLevel = "info" | "warn" | "error" | "system" | "debug"

export interface LogEntry {
	timestamp: string
	level: LogLevel
	source: string
	message: string | object
}

export interface LogFileInfo {
	filename: string
	filePath: string
	date: string
	sizeBytes: number
	size: string
	modifiedAt: string
	isCurrent: boolean
}

export interface LogStats {
	totalFiles: number
	totalSizeBytes: number
	totalSize: string
	logDirs: string[]
	files: LogFileInfo[]
}

export interface FlushLogsResult {
	deletedFiles: number
	freedBytes: number
	freedSize: string
	remainingFiles: number
}

export function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B"
	const k = 1024
	const sizes = ["B", "KB", "MB", "GB", "TB"]
	const i = Math.floor(Math.log(bytes) / Math.log(k))
	return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`
}

// ─── ANSI Colors ──────────────────────────────────────────────────────────────

const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"
const DIM = "\x1b[2m"

const COLORS: Record<LogLevel, string> = {
	info: "\x1b[36m", // Cyan
	warn: "\x1b[33m", // Yellow
	error: "\x1b[31m", // Red
	system: "\x1b[35m", // Magenta
	debug: "\x1b[90m", // Gray
}

const ICONS: Record<LogLevel, string> = {
	info: "ℹ",
	warn: "⚠",
	error: "✖",
	system: "⚙",
	debug: "◉",
}

// ─── Original Console Functions ────────────────────────────────────────────────

export const originalConsole = {
	log: console.log,
	error: console.error,
	warn: console.warn,
	info: console.info,
}

/**
 * Automatically extracts the caller's relative file path and line number from the stack trace.
 */
export function getCallerLocation(): string {
	const error = new Error()
	const stack = error.stack?.split("\n") ?? []

	for (const line of stack) {
		// Skip non-stack lines and internal logger frames
		if (!line.includes("at ") && !line.match(/\.ts|\.js/)) continue
		if (line.includes("logger.ts") || line.includes("logger.js")) continue
		if (line.includes("node_modules")) continue
		if (line.includes("node:internal") || line.includes("bun:main")) continue

		const match =
			line.match(/\((.*):(\d+):(\d+)\)/) ||
			line.match(/at\s+(.*):(\d+):(\d+)/) ||
			line.match(/(.*):(\d+):(\d+)/)

		if (match?.[1] && match[2]) {
			let fullPath = match[1].trim()
			const lineNumber = match[2]

			if (fullPath.startsWith("file://")) {
				fullPath = fullPath.replace(/^file:\/\/\/?/, "")
			}

			const lastSpace = fullPath.lastIndexOf(" ")
			if (lastSpace !== -1) {
				fullPath = fullPath.slice(lastSpace + 1)
			}

			let relativePath = path.relative(process.cwd(), fullPath)
			relativePath = relativePath.replace(/\\/g, "/")

			return `${relativePath}:${lineNumber}`
		}
	}

	return "unknown"
}

// Override console.log globally to automatically include file path and line number prefix
console.log = (...args: unknown[]) => {
	const caller = getCallerLocation()
	const prefix = `\x1b[36m[${caller}]\x1b[0m`
	originalConsole.log.apply(console, [prefix, ...args])
}

// ─── Logger Class ─────────────────────────────────────────────────────────────

export class Logger {
	private static instance: Logger
	private logDir: string
	private logStream: fs.WriteStream | null = null
	private currentLogDate: string = ""

	private constructor() {
		this.logDir = path.resolve(`./${process.env.LOGS_FOLDER_NAME ?? "logs"}`)
		this.ensureLogDir()
		this.registerGlobalHandlers()
	}

	static getInstance(): Logger {
		if (!Logger.instance) {
			Logger.instance = new Logger()
		}
		return Logger.instance
	}

	// ── Core log method ─────────────────────────────────────────────────────────

	log(message: string | object | Error, level?: LogLevel): void
	log(source: string, message: string | object | Error, level?: LogLevel): void
	log(
		arg1: string | object | Error,
		arg2?: string | object | Error | LogLevel,
		arg3: LogLevel = "info",
	): void {
		let source: string
		let message: string | object | Error
		let level: LogLevel

		const isLogLevel = (val: unknown): val is LogLevel =>
			typeof val === "string" &&
			["info", "warn", "error", "system", "debug"].includes(val)

		if (isLogLevel(arg2)) {
			source = getCallerLocation()
			message = arg1
			level = arg2
		} else if (arg2 !== undefined) {
			source = String(arg1)
			message = arg2
			level = arg3
		} else {
			source = getCallerLocation()
			message = arg1
			level = "info"
		}

		const now = new Date()
		const timestamp = this.formatTimestamp(now)
		const dateKey = this.formatDate(now)

		// Resolve message string for file
		const resolved = this.resolveMessage(message, level)

		// Console output
		this.printConsole(timestamp, level, source, resolved.display)

		// File output
		this.writeToFile(dateKey, {
			timestamp,
			level,
			source,
			message: resolved.file,
		})
	}

	// ── Convenience shorthands ──────────────────────────────────────────────────

	info(message: string | object): void
	info(source: string, message: string | object): void
	info(arg1: string | object, arg2?: string | object): void {
		if (arg2 === undefined) {
			this.log(getCallerLocation(), arg1, "info")
		} else {
			this.log(String(arg1), arg2, "info")
		}
	}

	warn(message: string | object): void
	warn(source: string, message: string | object): void
	warn(arg1: string | object, arg2?: string | object): void {
		if (arg2 === undefined) {
			this.log(getCallerLocation(), arg1, "warn")
		} else {
			this.log(String(arg1), arg2, "warn")
		}
	}

	error(message: string | object | Error): void
	error(source: string, message: string | object | Error): void
	error(arg1: string | object | Error, arg2?: string | object | Error): void {
		if (arg2 === undefined) {
			this.log(getCallerLocation(), arg1, "error")
		} else {
			this.log(String(arg1), arg2, "error")
		}
	}

	system(message: string | object): void
	system(source: string, message: string | object): void
	system(arg1: string | object, arg2?: string | object): void {
		if (arg2 === undefined) {
			this.log(getCallerLocation(), arg1, "system")
		} else {
			this.log(String(arg1), arg2, "system")
		}
	}

	debug(message: string | object): void
	debug(source: string, message: string | object): void
	debug(arg1: string | object, arg2?: string | object): void {
		if (arg2 === undefined) {
			this.log(getCallerLocation(), arg1, "debug")
		} else {
			this.log(String(arg1), arg2, "debug")
		}
	}

	// ── Internal helpers ────────────────────────────────────────────────────────

	private resolveMessage(
		message: string | object | Error,
		level: LogLevel,
	): { display: string; file: string } {
		if (message instanceof Error) {
			const display =
				level === "error"
					? `${message.message}\n${DIM}${message.stack ?? ""}${RESET}`
					: message.message
			const file = JSON.stringify({
				name: message.name,
				message: message.message,
				stack: message.stack,
			})
			return { display, file }
		}

		if (typeof message === "string") {
			return { display: message, file: message }
		}

		// object / payload
		const pretty = JSON.stringify(message, null, 2)
		const inline = JSON.stringify(message)
		return { display: pretty, file: inline }
	}

	private printConsole(
		timestamp: string,
		level: LogLevel,
		source: string,
		display: string,
	): void {
		const color = COLORS[level]
		const icon = ICONS[level]
		const label = level.toUpperCase().padEnd(6)

		const header =
			`${DIM}${timestamp}${RESET} ` +
			`${color}${BOLD}${icon} ${label}${RESET} ` +
			`${DIM}[${source}]${RESET}`

		// Multi-line messages indent continuation lines
		const body = display.includes("\n")
			? display
					.split("\n")
					.map((l, i) => (i === 0 ? l : `             ${l}`))
					.join("\n")
			: display

		originalConsole.log(`${header} ${body}`)
	}

	private writeToFile(dateKey: string, entry: LogEntry): void {
		try {
			if (dateKey !== this.currentLogDate) {
				this.rotateStream(dateKey)
			}

			if (!this.logStream) return

			const line = `${JSON.stringify(entry)}\n`
			this.logStream.write(line)
		} catch {
			// Avoid recursive logging if file write fails
		}
	}

	private rotateStream(dateKey: string): void {
		if (this.logStream) {
			this.logStream.end()
			this.logStream = null
		}

		const filePath = path.join(this.logDir, `${dateKey}.log`)
		this.logStream = fs.createWriteStream(filePath, { flags: "a" })
		this.currentLogDate = dateKey

		this.logStream.on("error", (err) => {
			originalConsole.error(`[logger] Stream error: ${err.message}`)
		})
	}

	private ensureLogDir(): void {
		if (!fs.existsSync(this.logDir)) {
			fs.mkdirSync(this.logDir, { recursive: true })
		}
	}

	private formatTimestamp(date: Date): string {
		return date.toISOString().replace("T", " ").slice(0, 23)
	}

	private formatDate(date: Date): string {
		return date.toISOString().slice(0, 10) // YYYY-MM-DD
	}

	/**
	 * Returns active log directories (both cwd/logs and workspace root logs if exists).
	 */
	public getActiveLogDirs(): string[] {
		const dirs = [this.logDir]
		const envFolderName = process.env.LOGS_FOLDER_NAME ?? "logs"
		const parentDir = path.resolve(process.cwd(), "..", envFolderName)
		if (fs.existsSync(parentDir) && !dirs.includes(parentDir)) {
			dirs.push(parentDir)
		}
		return dirs
	}

	/**
	 * Scans log directories and returns comprehensive statistics and file inventory.
	 */
	public getLogStats(): LogStats {
		this.ensureLogDir()
		const files: LogFileInfo[] = []
		let totalSizeBytes = 0
		const seenPaths = new Set<string>()
		const todayKey = this.formatDate(new Date())

		for (const dir of this.getActiveLogDirs()) {
			try {
				if (!fs.existsSync(dir)) continue
				const dirEntries = fs.readdirSync(dir, { withFileTypes: true })
				const logEntries = dirEntries.filter(
					(entry) => entry.isFile() && entry.name.endsWith(".log"),
				)

				for (const entry of logEntries) {
					const filePath = path.join(dir, entry.name)
					if (seenPaths.has(filePath)) continue
					seenPaths.add(filePath)

					const stat = fs.statSync(filePath)
					totalSizeBytes += stat.size

					const dateMatch = entry.name.match(/^(\d{4}-\d{2}-\d{2})\.log$/)
					const dateStr = dateMatch
						? dateMatch[1]
						: stat.mtime.toISOString().slice(0, 10)
					const isCurrent =
						dateStr === todayKey || dateStr === this.currentLogDate

					files.push({
						filename: entry.name,
						filePath,
						date: dateStr ?? entry.name,
						sizeBytes: stat.size,
						size: formatBytes(stat.size),
						modifiedAt: stat.mtime.toISOString(),
						isCurrent: Boolean(isCurrent),
					})
				}
			} catch (err) {
				originalConsole.error(
					`[logger] Failed to inspect log directory ${dir}: ${err}`,
				)
			}
		}

		// Sort newest log files first
		files.sort((a, b) => b.filename.localeCompare(a.filename))

		return {
			totalFiles: files.length,
			totalSizeBytes,
			totalSize: formatBytes(totalSizeBytes),
			logDirs: this.getActiveLogDirs(),
			files,
		}
	}

	/**
	 * Flushes or prunes historical log files according to retention policy or flushAll flag.
	 */
	public flushLogs(
		options: { retentionDays?: number; flushAll?: boolean } = {},
	): FlushLogsResult {
		this.ensureLogDir()
		let deletedFiles = 0
		let freedBytes = 0
		const todayKey = this.formatDate(new Date())
		const now = Date.now()
		const retentionDays = options.retentionDays ?? 7

		for (const dir of this.getActiveLogDirs()) {
			try {
				if (!fs.existsSync(dir)) continue
				const dirEntries = fs.readdirSync(dir, { withFileTypes: true })
				const logEntries = dirEntries.filter(
					(entry) => entry.isFile() && entry.name.endsWith(".log"),
				)

				for (const entry of logEntries) {
					const filePath = path.join(dir, entry.name)
					const stat = fs.statSync(filePath)
					const dateMatch = entry.name.match(/^(\d{4}-\d{2}-\d{2})\.log$/)

					const isCurrent =
						(dateMatch && dateMatch[1] === todayKey) ||
						dateMatch?.[1] === this.currentLogDate

					let shouldDelete = false

					if (options.flushAll) {
						if (!isCurrent) {
							shouldDelete = true
						} else {
							// Truncate current day active log stream to 0 bytes safely
							try {
								if (this.logStream) {
									this.logStream.end()
									this.logStream = null
								}
								fs.truncateSync(filePath, 0)
								freedBytes += stat.size
								this.rotateStream(todayKey)
							} catch (truncErr) {
								originalConsole.error(
									`[logger] Failed to truncate active log: ${truncErr}`,
								)
							}
						}
					} else {
						// Calculate age
						let fileTime = stat.mtimeMs
						if (dateMatch?.[1]) {
							const parsed = Date.parse(`${dateMatch[1]}T00:00:00Z`)
							if (!Number.isNaN(parsed)) {
								fileTime = parsed
							}
						}

						const ageDays = (now - fileTime) / (24 * 60 * 60 * 1000)
						if (ageDays >= retentionDays && !isCurrent) {
							shouldDelete = true
						}
					}

					if (shouldDelete) {
						try {
							fs.unlinkSync(filePath)
							deletedFiles++
							freedBytes += stat.size
						} catch (delErr) {
							originalConsole.error(
								`[logger] Failed to delete log file ${entry.name}: ${delErr}`,
							)
						}
					}
				}
			} catch (err) {
				originalConsole.error(
					`[logger] Failed during flushLogs in ${dir}: ${err}`,
				)
			}
		}

		const updatedStats = this.getLogStats()
		return {
			deletedFiles,
			freedBytes,
			freedSize: formatBytes(freedBytes),
			remainingFiles: updatedStats.totalFiles,
		}
	}

	// ─── Global Error Handlers ─────────────────────────────────────────────────

	private registerGlobalHandlers(): void {
		process.on("uncaughtException", (err: Error) => {
			this.log("process/uncaughtException", err, "error")
			// Give the stream time to flush before exiting
			setTimeout(() => process.exit(1), 200)
		})

		process.on("unhandledRejection", (reason: unknown) => {
			const msg = reason instanceof Error ? reason.message : String(reason)
			if (
				msg.includes("Connection Closed") ||
				msg.includes("Stream Errored") ||
				msg.includes("Connection Terminated") ||
				msg.includes("Cancelled") ||
				msg.includes("Timed Out") ||
				msg.includes("QR refs attempts ended") ||
				msg.includes("rate-overlimit")
			) {
				this.log(
					"process/unhandledRejection",
					`Baileys background event: ${msg}`,
					"warn",
				)
				return
			}

			const err =
				reason instanceof Error
					? reason
					: new Error(String(reason ?? "Unhandled rejection"))
			this.log("process/unhandledRejection", err, "error")
		})

		// Graceful shutdown — flush stream
		const shutdown = () => {
			this.log("process", "Shutting down — flushing log stream", "system")
			if (this.logStream) {
				this.logStream.end(() => process.exit(0))
			} else {
				process.exit(0)
			}
		}

		process.once("SIGINT", shutdown)
		process.once("SIGTERM", shutdown)
	}
}

export const logger = Logger.getInstance()

// Make globally available without import
declare global {
	// biome-ignore lint/suspicious/noRedeclare: global logger instance
	var logger: Logger
}

globalThis.logger = logger
