import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import type { CommandContext, ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"
import { logger } from "@utils/logger"
import type { WAMessage, WASocket } from "baileys"
import NodeCache from "node-cache"
import {
	buildCommandContext,
	detectMessageType,
	extractSenderIdentities,
	resolveUserIdentities,
} from "./contextBuilder"

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

		const m = rawMsg.message
		if (!m) return

		// Security Shield 1: Deduplication (Ignore processed message IDs once decrypted message payload is present)
		if (key.id) {
			const msgDedupeKey = `${agentId}:${key.id}`
			if (this.processedMsgCache.has(msgDedupeKey)) {
				return
			}
			this.processedMsgCache.set(msgDedupeKey, true)
		}

		const jid = key.remoteJid
		const isGroup = jid.endsWith("@g.us")
		const { senderJid, senderIdentities: initialIdentities } =
			extractSenderIdentities(sock, rawMsg)
		const senderIdentities = await resolveUserIdentities(
			sock,
			initialIdentities,
			null,
			false,
		)

		// Layer 0: Check User Blacklist across all known sender identities (LID & Phone Number)
		let isBlacklisted = await commandRepository.isBlacklisted(
			agentId,
			senderIdentities,
		)

		// If not directly matched and Signal LID mapping store is available, check if any blacklisted LID maps to this sender's PN (or vice versa)
		if (!isBlacklisted && sock.signalRepository?.lidMapping) {
			const lidMapping = sock.signalRepository.lidMapping
			try {
				const blacklistEntries = await commandRepository.getBlacklist(agentId)
				for (const entry of blacklistEntries) {
					const cleanEntryJid = commandRepository.normalizeJid(entry.userJid)
					if (cleanEntryJid.endsWith("@lid")) {
						const mappedPn = await lidMapping
							.getPNForLID(cleanEntryJid)
							.catch(() => null)
						if (mappedPn) {
							const cleanPn = commandRepository.normalizeJid(mappedPn)
							await commandRepository
								.addBlacklist(agentId, cleanPn, entry.reason || undefined)
								.catch(() => {})
							if (senderIdentities.includes(cleanPn)) {
								isBlacklisted = true
								break
							}
						}
					} else if (
						cleanEntryJid.endsWith("@s.whatsapp.net") &&
						!senderIdentities.some((id) => id.endsWith("@s.whatsapp.net"))
					) {
						const mappedLid = await lidMapping
							.getLIDForPN(cleanEntryJid)
							.catch(() => null)
						if (mappedLid) {
							const cleanLid = commandRepository.normalizeJid(mappedLid)
							await commandRepository
								.addBlacklist(agentId, cleanLid, entry.reason || undefined)
								.catch(() => {})
							if (senderIdentities.includes(cleanLid)) {
								isBlacklisted = true
								break
							}
						}
					}
				}
			} catch {}
		}

		if (isBlacklisted) {
			if (senderIdentities.length > 1) {
				await commandRepository
					.addBlacklist(agentId, senderIdentities)
					.catch(() => {})
			}
			return
		}

		// Layer 0: Check User Auto-Delete (scoped per group or global '*') across all sender identities
		let isAutoDelete = isGroup
			? await commandRepository.isAutoDelete(agentId, jid, senderIdentities)
			: false

		if (isGroup && !isAutoDelete && sock.signalRepository?.lidMapping) {
			const lidMapping = sock.signalRepository.lidMapping
			try {
				const autoDeleteEntries =
					await commandRepository.getAutoDeleteList(agentId)
				for (const entry of autoDeleteEntries) {
					if (entry.jid !== jid && entry.jid !== "*") continue
					const cleanEntryJid = commandRepository.normalizeJid(entry.userJid)
					if (cleanEntryJid.endsWith("@lid")) {
						const mappedPn = await lidMapping
							.getPNForLID(cleanEntryJid)
							.catch(() => null)
						if (mappedPn) {
							const cleanPn = commandRepository.normalizeJid(mappedPn)
							await commandRepository
								.addAutoDelete(agentId, cleanPn, entry.jid)
								.catch(() => {})
							if (senderIdentities.includes(cleanPn)) {
								isAutoDelete = true
								break
							}
						}
					} else if (
						cleanEntryJid.endsWith("@s.whatsapp.net") &&
						!senderIdentities.some((id) => id.endsWith("@s.whatsapp.net"))
					) {
						const mappedLid = await lidMapping
							.getLIDForPN(cleanEntryJid)
							.catch(() => null)
						if (mappedLid) {
							const cleanLid = commandRepository.normalizeJid(mappedLid)
							await commandRepository
								.addAutoDelete(agentId, cleanLid, entry.jid)
								.catch(() => {})
							if (senderIdentities.includes(cleanLid)) {
								isAutoDelete = true
								break
							}
						}
					}
				}
			} catch {}
		}

		if (isAutoDelete) {
			if (senderIdentities.length > 1) {
				await commandRepository
					.addAutoDelete(agentId, senderIdentities, jid)
					.catch(() => {})
			}
			try {
				await sock.sendMessage(jid, { delete: key })
				logger.info(
					"/services/commandLoader.ts",
					`[${agentId}] Auto-deleted message (type: ${detectMessageType(m)}) for target user ${senderJid} in ${jid}`,
				)
			} catch (err) {
				logger.warn(
					"/services/commandLoader.ts",
					`[${agentId}] Failed auto-deleting message for ${senderJid} in ${jid}: ${err}`,
				)
			}
			return
		}

		// Layer 1: Check Group Settings & Bot Listening Status
		const groupSettings = isGroup
			? await commandRepository.getGroupSettings(agentId, jid)
			: null

		// Extract Body Text (unwrapping ephemeral & viewonce containers)
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

		// Layer 2: Check Registered Command
		const command = this.commands.get(commandName)
		if (!command) return

		const rawPrimary = Array.isArray(command.name)
			? command.name[0]
			: command.name
		const primaryName = (rawPrimary || commandName).toLowerCase()
		const allCommandNames = (
			Array.isArray(command.name) ? command.name : [command.name]
		).map((n) => n.toLowerCase())

		// Allow enablebot / bot / listen commands even if botEnabled is false in group so admins can turn bot ON
		const isGroupToggleCommand =
			["enablebot", "disablebot", "bot", "listen"].includes(commandName) ||
			["enablebot", "disablebot", "bot", "listen"].includes(primaryName)

		if (
			isGroup &&
			groupSettings &&
			!groupSettings.botEnabled &&
			!isGroupToggleCommand
		) {
			// Bot is disabled/not listening in this group
			return
		}

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

		// Layer 2: Check Global Agent Command Toggle (Inspecting all aliases to prevent bypass)
		const isGloballyEnabled = await commandRepository.isCommandEnabledGlobally(
			agentId,
			allCommandNames,
		)
		if (!isGloballyEnabled) {
			logger.debug(
				"/services/commandLoader.ts",
				`[${agentId}] Command "${primaryName}" (triggered as "${commandName}") blocked globally.`,
			)
			return
		}

		// Layer 3: Check Group Command Permission & Registration (Inspecting all aliases to prevent bypass)
		if (isGroup) {
			const isExempt =
				isGroupToggleCommand ||
				primaryName === "enablecmd" ||
				primaryName === "disablecmd" ||
				commandName === "enablecmd" ||
				commandName === "disablecmd"
			if (!isExempt) {
				const isAllowedInGroup =
					await commandRepository.isCommandAllowedInGroup(
						agentId,
						jid,
						allCommandNames,
						!!command.needAdminRegisterThisCommand,
					)
				if (!isAllowedInGroup) {
					logger.debug(
						"/services/commandLoader.ts",
						`[${agentId}] Command "${primaryName}" (triggered as "${commandName}") blocked in group ${jid} (group policy / not registered).`,
					)
					return
				}
			}
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

		// Security Shield 5: Execution Timeout Guard (Configurable per command, default 60s for downloaders, 30s for standard)
		const defaultTimeout = command.category === "downloaders" ? 60000 : 30000
		const timeoutMs = command.executionTimeout ?? defaultTimeout
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
				const timeoutSec = Math.round(timeoutMs / 1000)
				logger.error(
					"/services/commandLoader.ts",
					`[${agentId}] Command "${commandName}" timed out after ${timeoutSec}s for ${senderJid} in ${jid}`,
				)
				await ctx.reply(
					`⏱️ *Command execution timed out after ${timeoutSec} seconds (Timeout).*`,
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

	/**
	 * Safely executes a sub-command delegated by the Agentic Hoshino AI (`hoshino.ts`),
	 * enforcing all RBAC, group, bot-admin, media-type, and anti-loop security checks.
	 */
	public async executeDelegatedCommand(
		parentCtx: CommandContext,
		rawTargetCommand: string,
		rawTargetArgs: string[],
	): Promise<{
		executed: boolean
		deniedReason?: string
	}> {
		if (!this.loaded) await this.init()

		const cleanCmdName = rawTargetCommand
			.trim()
			.replace(/^[.!#/]+/, "")
			.toLowerCase()

		// Security Guard: Prevent recursive AI self-invocation loops
		const forbiddenRecursiveCommands = new Set([
			"hoshino",
			"ojisan",
			"oji-san",
			"takanashi",
			"ai",
			"ask",
			"gemini",
			"gpt",
		])
		if (!cleanCmdName || forbiddenRecursiveCommands.has(cleanCmdName)) {
			return {
				executed: false,
				deniedReason: "RECURSIVE_AI_COMMAND_BLOCKED",
			}
		}

		const command = this.commands.get(cleanCmdName)
		if (!command) {
			return {
				executed: false,
				deniedReason: `COMMAND_NOT_FOUND:${cleanCmdName}`,
			}
		}

		const rawPrimary = Array.isArray(command.name)
			? command.name[0]
			: command.name
		const primaryName = (rawPrimary || cleanCmdName).toLowerCase()
		const allCommandNames = (
			Array.isArray(command.name) ? command.name : [command.name]
		).map((n) => n.toLowerCase())

		// 1. Check Global Agent Command Toggle
		const isGloballyEnabled = await commandRepository.isCommandEnabledGlobally(
			parentCtx.agentId,
			allCommandNames,
		)
		if (!isGloballyEnabled) {
			return {
				executed: false,
				deniedReason: "COMMAND_GLOBALLY_DISABLED",
			}
		}

		// 2. Check Group Command Permission & Registration
		const isGroupToggleCommand =
			["enablebot", "disablebot", "bot", "listen"].includes(cleanCmdName) ||
			["enablebot", "disablebot", "bot", "listen"].includes(primaryName)

		if (parentCtx.isGroup) {
			const isExempt =
				isGroupToggleCommand ||
				primaryName === "enablecmd" ||
				primaryName === "disablecmd" ||
				cleanCmdName === "enablecmd" ||
				cleanCmdName === "disablecmd"
			if (!isExempt) {
				const isAllowedInGroup =
					await commandRepository.isCommandAllowedInGroup(
						parentCtx.agentId,
						parentCtx.jid,
						allCommandNames,
						!!command.needAdminRegisterThisCommand,
					)
				if (!isAllowedInGroup) {
					return {
						executed: false,
						deniedReason: "COMMAND_DISABLED_IN_GROUP",
					}
				}
			}
		}

		// 3. Check Group-Only Constraint
		if (command.inGroup && !parentCtx.isGroup) {
			await parentCtx.reply(
				"Uhe~ Perintah ini cuma bisa dipakai di dalam grup ya Sensei~",
			)
			return {
				executed: false,
				deniedReason: "GROUP_ONLY_COMMAND",
			}
		}

		// 4. Hard RBAC Check: Owner / Master Access
		const isOwnerOrMaster = await parentCtx.getOwnerRole()
		if (command.access === "owner" || command.access === "master") {
			if (!isOwnerOrMaster) {
				await parentCtx.reply(
					"Uhe~ Maaf ya Sensei, perintah itu cuma boleh dijalankan oleh Bot Owner utama~",
				)
				return {
					executed: false,
					deniedReason: "OWNER_REQUIRED",
				}
			}
		}

		// 5. Hard RBAC Check: Group Admin & Bot Admin Access
		if (parentCtx.isGroup && command.inGroupAccess === "admin") {
			const { isAdmin } = await parentCtx.getSenderAdminStatus()
			if (!isAdmin && !isOwnerOrMaster) {
				await parentCtx.reply(
					"Uhe~ Sensei kan belum jadi Admin di grup ini, jadi Oji-san nggak bisa jalanin perintah khusus Admin ya~",
				)
				return {
					executed: false,
					deniedReason: "GROUP_ADMIN_REQUIRED",
				}
			}
		}

		if (parentCtx.isGroup && command.botAdminRequired) {
			const { isBotAdmin } = await parentCtx.getSenderAdminStatus()
			if (!isBotAdmin) {
				await parentCtx.reply(
					"Uhe~ Oji-san belum dijadikan Admin di grup ini nih Sensei, jadi belum bisa eksekusi perintah itu~",
				)
				return {
					executed: false,
					deniedReason: "BOT_ADMIN_REQUIRED",
				}
			}
		}

		// 6. Check Allowed Media Types
		if (command.allowedMediaTypes && command.allowedMediaTypes.length > 0) {
			const quoted = await parentCtx.getQuotedMessage()
			const quotedMsg = quoted?.rawQuoted
			const quotedMessageType = quotedMsg ? detectMessageType(quotedMsg) : null
			const matchesAllowed =
				command.allowedMediaTypes.includes(parentCtx.messageType) ||
				(quotedMessageType &&
					command.allowedMediaTypes.includes(quotedMessageType))

			if (!matchesAllowed) {
				return {
					executed: false,
					deniedReason: "MEDIA_TYPE_MISMATCH",
				}
			}
		}

		// 7. Build Delegated Context preserving original message, mentions, and quoted message
		const cleanArgs = rawTargetArgs.slice(0, 50)
		const delegatedCtx: CommandContext = {
			...parentCtx,
			commandName: cleanCmdName,
			args: cleanArgs,
			body: `${parentCtx.prefix}${cleanCmdName}${cleanArgs.length > 0 ? ` ${cleanArgs.join(" ")}` : ""}`,
			getMentions: async () => {
				const baseMentions = await parentCtx.getMentions()
				const argMentions: string[] = []
				for (const arg of cleanArgs) {
					const digits = arg.replace(/[^0-9]/g, "")
					if (digits.length >= 7 && digits.length <= 16) {
						argMentions.push(
							commandRepository.normalizeJid(arg.includes("@") ? arg : digits),
						)
					}
				}
				return Array.from(new Set([...baseMentions, ...argMentions]))
			},
		}

		// 8. Execute with Timeout Guard
		const defaultTimeout = command.category === "downloaders" ? 60000 : 30000
		const timeoutMs = command.executionTimeout ?? defaultTimeout
		let timeoutTimer: ReturnType<typeof setTimeout> | undefined
		const timeoutPromise = new Promise<never>((_, reject) => {
			timeoutTimer = setTimeout(() => {
				reject(new Error("EXECUTION_TIMEOUT"))
			}, timeoutMs)
		})

		try {
			await Promise.race([
				Promise.resolve(command.execute(cleanArgs, delegatedCtx)),
				timeoutPromise,
			])
			logger.info(
				"/services/commandLoader.ts",
				`[${parentCtx.agentId}] Delegated AI Command "${cleanCmdName}" executed for ${parentCtx.senderJid} in ${parentCtx.jid}`,
			)
			return { executed: true }
		} catch (error: unknown) {
			const err = error as Error
			logger.error(
				"/services/commandLoader.ts",
				`[${parentCtx.agentId}] Error executing delegated AI command "${cleanCmdName}": ${err?.message || error}`,
			)
			return {
				executed: false,
				deniedReason: `EXECUTION_ERROR:${err?.message || error}`,
			}
		} finally {
			if (timeoutTimer) clearTimeout(timeoutTimer)
		}
	}
}

export const commandLoader = CommandLoader.getInstance()
