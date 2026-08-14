import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import type { ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"
import { logger } from "@utils/logger"
import type { WAMessage, WASocket } from "baileys"
import NodeCache from "node-cache"
import { buildCommandContext, detectMessageType } from "./contextBuilder"

export class CommandLoader {
	private static instance: CommandLoader
	private commands = new Map<string, ICommand>()
	private commandsDir = path.resolve(__dirname, "../commands")
	private loaded = false

	// Security Shield 1: Message Deduplication Cache (TTL: 60s)
	private processedMsgCache = new NodeCache({ stdTTL: 60, checkperiod: 30 })

	// Security Shield 2: Per-User Command Cooldown Cache (key: agentId:senderJid:commandName, value: expiryTimestampMs)
	private cooldownCache = new Map<string, number>()

	private constructor() {}

	public static getInstance(): CommandLoader {
		if (!CommandLoader.instance) {
			CommandLoader.instance = new CommandLoader()
		}
		return CommandLoader.instance
	}

	/**
	 * Dynamically loads all commands from src/commands directory.
	 */
	public async init(): Promise<void> {
		if (this.loaded) return
		try {
			await this.loadCommandsFromDir(this.commandsDir)
			this.loaded = true
			logger.system(
				"/services/commandLoader.ts",
				`Successfully loaded ${this.commands.size} command trigger(s)`,
			)
		} catch (error) {
			logger.error(
				"/services/commandLoader.ts",
				`Failed to load commands: ${error}`,
			)
		}
	}

	private async loadCommandsFromDir(dir: string): Promise<void> {
		try {
			const files = await fs.readdir(dir, { withFileTypes: true })
			for (const file of files) {
				const fullPath = path.join(dir, file.name)
				if (file.isDirectory()) {
					await this.loadCommandsFromDir(fullPath)
					continue
				}

				if (!file.name.match(/\.(ts|js)$/) || file.name.endsWith(".d.ts")) {
					continue
				}

				const fileUrl = pathToFileURL(fullPath).href
				const mod = await import(fileUrl)
				const command: ICommand = mod.default || mod.command
				if (!command?.name || typeof command.execute !== "function") {
					continue
				}

				const relativeCategory = path.relative(this.commandsDir, dir)
				command.category =
					relativeCategory && relativeCategory !== "."
						? relativeCategory.split(path.sep)[0]
						: "general"

				const names = Array.isArray(command.name)
					? command.name
					: [command.name]
				for (const name of names) {
					this.commands.set(name.toLowerCase(), command)
				}
			}
		} catch {
			// Ignore missing directory if not yet created
		}
	}

	/**
	 * Gets all unique loaded commands.
	 */
	public getAllCommands(): ICommand[] {
		const unique = new Map<ICommand, boolean>()
		for (const cmd of this.commands.values()) {
			unique.set(cmd, true)
		}
		return Array.from(unique.keys())
	}

	/**
	 * Main 3-layer Command Processing Pipeline with Security & Robustness Shields.
	 */
	public async executeMessage(
		agentId: string,
		sock: WASocket,
		rawMsg: WAMessage,
	): Promise<void> {
		if (!this.loaded) await this.init()

		const key = rawMsg.key
		if (!key.remoteJid || key.remoteJid === "status@broadcast") return

		// Security Shield 1: Deduplication (Ignore processed message IDs)
		if (key.id) {
			const msgDedupeKey = `${agentId}:${key.id}`
			if (this.processedMsgCache.has(msgDedupeKey)) {
				return
			}
			this.processedMsgCache.set(msgDedupeKey, true)
		}

		const jid = key.remoteJid
		const isGroup = jid.endsWith("@g.us")
		const rawSender = key.fromMe
			? sock.user?.id || sock.user?.lid || jid
			: key.participant || jid
		const senderJid = commandRepository.normalizeJid(rawSender)

		// Extract Body Text (unwrapping ephemeral & viewonce containers)
		const m = rawMsg.message
		if (!m) return

		const rawContent =
			m.ephemeralMessage?.message ||
			m.viewOnceMessage?.message ||
			m.viewOnceMessageV2?.message ||
			m

		let body = (
			rawContent.conversation ||
			rawContent.extendedTextMessage?.text ||
			rawContent.imageMessage?.caption ||
			rawContent.videoMessage?.caption ||
			""
		).trim()

		if (!body) return

		// Security Shield 4: Input Length Guard (Limit to max 4000 characters to prevent ReDoS / Buffer Overflow)
		if (body.length > 4000) {
			body = body.slice(0, 4000)
		}

		// Layer 1: Check Group Settings & Bot Listening Status
		const groupSettings = isGroup
			? await commandRepository.getGroupSettings(agentId, jid)
			: null

		// Layer 1: Check User Blacklist
		const isBlacklisted = await commandRepository.isBlacklisted(
			agentId,
			senderJid,
		)
		if (isBlacklisted) return

		// Layer 1: Check User Auto-Delete (Check both normalized sender JID and raw LID/participant)
		const isAutoDelete = isGroup
			? (await commandRepository.isAutoDelete(agentId, senderJid)) ||
				(await commandRepository.isAutoDelete(agentId, rawSender))
			: false

		if (isAutoDelete) {
			try {
				await sock.sendMessage(jid, { delete: key })
				logger.info(
					"/services/commandLoader.ts",
					`[${agentId}] Auto-deleted message for target user ${senderJid} in ${jid}`,
				)
			} catch (err) {
				logger.warn(
					"/services/commandLoader.ts",
					`[${agentId}] Failed auto-deleting message for ${senderJid} in ${jid}: ${err}`,
				)
			}
			return
		}

		// Layer 1: Check Custom Agent / Group Prefix
		const activePrefix = groupSettings?.customPrefix || "."
		const defaultPrefixes = [activePrefix, ".", "!", "/", "#"]
		const matchedPrefix = defaultPrefixes.find((p) => body.startsWith(p))

		if (!matchedPrefix) return // Not a command message

		const textAfterPrefix = body.slice(matchedPrefix.length).trim()
		const parts = textAfterPrefix.split(/\s+/)
		const commandName = (parts.shift() || "").toLowerCase()
		let args = parts

		if (!commandName) return

		// Security Shield 4: Limit arguments length (max 50 args)
		if (args.length > 50) {
			args = args.slice(0, 50)
		}

		// Allow enablebot / bot / listen commands even if botEnabled is false in group so admins can turn bot ON
		const isGroupToggleCommand = [
			"enablebot",
			"disablebot",
			"bot",
			"listen",
		].includes(commandName)

		if (
			isGroup &&
			groupSettings &&
			!groupSettings.botEnabled &&
			!isGroupToggleCommand
		) {
			// Bot is disabled/not listening in this group
			return
		}

		// Layer 2: Check Registered Command
		const command = this.commands.get(commandName)
		if (!command) return

		// Layer 2: Check Media Type & Text-Only Rule
		// textOnly: true means the command requires text body (works for conversation, extendedTextMessage, ephemeral, or captions)
		if (command.textOnly && !body) {
			logger.warn(
				"/services/commandLoader.ts",
				`[${agentId}] Ignored command "${commandName}" because command requires text body but message had none.`,
			)
			return
		}

		if (command.allowedMediaTypes && command.allowedMediaTypes.length > 0) {
			const messageType = detectMessageType(rawContent)
			const contextInfo =
				rawContent.extendedTextMessage?.contextInfo ||
				rawContent.imageMessage?.contextInfo ||
				rawContent.videoMessage?.contextInfo ||
				rawContent.documentMessage?.contextInfo
			const quotedMsg = contextInfo?.quotedMessage
			const quotedMessageType = quotedMsg ? detectMessageType(quotedMsg) : null

			const matchesAllowed =
				command.allowedMediaTypes.includes(messageType) ||
				(quotedMessageType &&
					command.allowedMediaTypes.includes(quotedMessageType))

			if (!matchesAllowed) {
				logger.warn(
					"/services/commandLoader.ts",
					`[${agentId}] Ignored command "${commandName}" because message type "${messageType}" (quoted: "${quotedMessageType}") is not in allowedMediaTypes [${command.allowedMediaTypes.join(", ")}].`,
				)
				return
			}
		}

		// Layer 2: Check Global Agent Command Toggle
		const isGloballyEnabled = await commandRepository.isCommandEnabledGlobally(
			agentId,
			commandName,
		)
		if (!isGloballyEnabled) return

		// Layer 3: Check Group Command Registration (if command requires it)
		if (command.needAdminRegisterThisCommand && isGroup) {
			const isGroupRegistered = await commandRepository.isCommandEnabledInGroup(
				agentId,
				jid,
				commandName,
			)
			if (!isGroupRegistered) return
		}

		// Construct Lazy Context
		const ctx = buildCommandContext(
			agentId,
			sock,
			rawMsg,
			matchedPrefix,
			commandName,
			args,
		)

		// Layer 3: Check ICommand Access & Environment Rules
		if (command.inGroup && !isGroup) {
			await ctx.reply("❌ This command can only be used inside groups.")
			return
		}

		const isOwnerOrMaster = await ctx.getOwnerRole()

		if (command.access === "owner" || command.access === "master") {
			if (!isOwnerOrMaster) return
		}

		if (isGroup && command.inGroupAccess === "admin") {
			const { isAdmin } = await ctx.getSenderAdminStatus()
			if (!isAdmin && !isOwnerOrMaster) {
				await ctx.reply("❌ This command requires Group Admin permissions.")
				return
			}
		}

		if (isGroup && command.botAdminRequired) {
			const { isBotAdmin } = await ctx.getSenderAdminStatus()
			if (!isBotAdmin) {
				await ctx.reply("❌ Bot must be a Group Admin to execute this command.")
				return
			}
		}

		// Security Shield 3: Anti-Spam Rate Limiter / Cooldown Guard
		// Owners and Masters bypass cooldown checks
		if (!isOwnerOrMaster) {
			const cooldownSec = command.cooldown ?? 2 // Default 2 seconds cooldown
			const cooldownKey = `${agentId}:${senderJid}:${commandName}`
			const now = Date.now()
			const expiresAt = this.cooldownCache.get(cooldownKey) || 0

			if (now < expiresAt) {
				const remainingSec = Math.ceil((expiresAt - now) / 1000)
				await ctx.reply(
					`⏱️ *Please wait ${remainingSec} second(s) before using this command again.*`,
				)
				return
			}
			this.cooldownCache.set(cooldownKey, now + cooldownSec * 1000)
		}

		// Security Shield 5: Execution Timeout Guard (Max 30s timeout per command)
		const timeoutMs = 30000
		let timeoutTimer: ReturnType<typeof setTimeout> | undefined
		const timeoutPromise = new Promise<never>((_, reject) => {
			timeoutTimer = setTimeout(() => {
				reject(new Error("EXECUTION_TIMEOUT"))
			}, timeoutMs)
		})

		try {
			await Promise.race([
				Promise.resolve(command.execute(args, ctx)),
				timeoutPromise,
			])
			logger.info(
				"/services/commandLoader.ts",
				`[${agentId}] Command "${commandName}" executed for ${senderJid} in ${jid}`,
			)
		} catch (error: unknown) {
			const err = error as Error
			if (err?.message === "EXECUTION_TIMEOUT") {
				logger.error(
					"/services/commandLoader.ts",
					`[${agentId}] Command "${commandName}" timed out after 30s for ${senderJid} in ${jid}`,
				)
				await ctx.reply(
					"⏱️ *Command execution timed out after 30 seconds (Timeout).*",
				)
			} else {
				logger.error(
					"/services/commandLoader.ts",
					`[${agentId}] Error executing command "${commandName}": ${error}`,
				)
				await ctx.reply("⚠️ An error occurred while processing the command.")
			}
		} finally {
			if (timeoutTimer) clearTimeout(timeoutTimer)
		}
	}
}

export const commandLoader = CommandLoader.getInstance()
