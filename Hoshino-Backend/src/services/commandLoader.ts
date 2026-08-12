import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import type { ICommand } from "@customTypes/command"
import { commandRepository } from "@repositories/command.repository"
import { logger } from "@utils/logger"
import type { WAMessage, WASocket } from "baileys"
import { buildCommandContext } from "./contextBuilder"

export class CommandLoader {
	private static instance: CommandLoader
	private commands = new Map<string, ICommand>()
	private commandsDir = path.resolve(__dirname, "../commands")
	private loaded = false

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
	 * Main 3-layer Command Processing Pipeline.
	 */
	public async executeMessage(
		agentId: string,
		sock: WASocket,
		rawMsg: WAMessage,
	): Promise<void> {
		if (!this.loaded) await this.init()

		const key = rawMsg.key
		if (!key.remoteJid || key.remoteJid === "status@broadcast") return

		const jid = key.remoteJid
		const isGroup = jid.endsWith("@g.us")
		const senderJid = commandRepository.normalizeJid(key.participant || jid)

		// Layer 1: Check Group Settings & Bot Status
		const groupSettings = isGroup
			? await commandRepository.getGroupSettings(agentId, jid)
			: null

		if (isGroup && groupSettings && !groupSettings.botEnabled) {
			return // Bot disabled in this group
		}

		// Layer 1: Check User Blacklist
		const isBlacklisted = await commandRepository.isBlacklisted(
			agentId,
			senderJid,
		)
		if (isBlacklisted) return

		// Layer 1: Check User Auto-Delete
		const isAutoDelete = isGroup
			? await commandRepository.isAutoDelete(agentId, senderJid)
			: false

		if (isAutoDelete) {
			try {
				await sock.sendMessage(jid, { delete: key })
			} catch {
				// Failed auto-delete (bot might not be admin)
			}
			return
		}

		// Extract Body Text
		const m = rawMsg.message
		if (!m) return
		const body = (
			m.conversation ||
			m.extendedTextMessage?.text ||
			m.imageMessage?.caption ||
			m.videoMessage?.caption ||
			""
		).trim()

		if (!body) return

		// Layer 1: Check Custom Agent / Group Prefix
		const activePrefix = groupSettings?.customPrefix || "."
		const defaultPrefixes = [activePrefix, ".", "!", "/", "#"]
		const matchedPrefix = defaultPrefixes.find((p) => body.startsWith(p))

		if (!matchedPrefix) return // Not a command message

		const textAfterPrefix = body.slice(matchedPrefix.length).trim()
		const parts = textAfterPrefix.split(/\s+/)
		const commandName = (parts.shift() || "").toLowerCase()
		const args = parts

		if (!commandName) return

		// Layer 2: Check Registered Command
		const command = this.commands.get(commandName)
		if (!command) return

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
			await ctx.reply("❌ Perintah ini hanya dapat digunakan di dalam grup.")
			return
		}

		if (command.access === "owner" || command.access === "master") {
			const ownerRole = await ctx.getOwnerRole()
			if (!ownerRole) return
		}

		if (isGroup && command.inGroupAccess === "admin") {
			const { isAdmin } = await ctx.getSenderAdminStatus()
			const ownerRole = await ctx.getOwnerRole()
			if (!isAdmin && !ownerRole) {
				await ctx.reply("❌ Perintah ini membutuhkan perizinan Admin Grup.")
				return
			}
		}

		if (isGroup && command.botAdminRequired) {
			const { isBotAdmin } = await ctx.getSenderAdminStatus()
			if (!isBotAdmin) {
				await ctx.reply(
					"❌ Bot harus menjadi Admin Grup untuk menjalankan perintah ini.",
				)
				return
			}
		}

		// Execute Command
		try {
			await command.execute(args, ctx)
			logger.info(
				"/services/commandLoader.ts",
				`[${agentId}] Command "${commandName}" executed for ${senderJid}`,
			)
		} catch (error) {
			logger.error(
				"/services/commandLoader.ts",
				`[${agentId}] Error executing command "${commandName}": ${error}`,
			)
			await ctx.reply("⚠️ Terjadi kesalahan saat memproses perintah.")
		}
	}
}

export const commandLoader = CommandLoader.getInstance()
