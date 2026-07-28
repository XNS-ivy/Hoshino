import {
	cleanAgentAuth,
	deleteAgent,
	getAgent,
	getAgentCommands,
	getAgentConfig,
	getAllAgents,
	registerAgent,
	reRegisterAgent,
	updateAgentConfig,
	updateAgentPhone,
	updateAgentStatus,
	updateCommandStatus,
} from "@modules/baileys/agent"
import baileysManager from "@modules/baileys/socket"
import { groupDb } from "@modules/databases-handler/groupDB"
import { ownerDb } from "@modules/databases-handler/ownerDB"
import type { WAPresence } from "baileys"
import { Elysia, t } from "elysia"
import QRCode from "qrcode"

export const agentRoute = new Elysia({ prefix: "/agent" })
	// ── System Health & Overview ──────────────────────────────────────────────
	.get("/health", () => {
		const agents = getAllAgents()
		const runningAgents = agents.filter((a) =>
			baileysManager.getAgentStatus(a.userId),
		)
		const memoryUsage = process.memoryUsage()

		return {
			success: true,
			data: {
				totalAgents: agents.length,
				runningAgentsCount: runningAgents.length,
				runningAgentIds: runningAgents.map((a) => a.userId),
				uptimeSeconds: Math.floor(process.uptime()),
				memory: {
					rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
					heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
				},
			},
		}
	})

	// ── Registration Routes ───────────────────────────────────────────────────
	.post(
		"/register",
		async ({ body }) => {
			const existing = getAgent(body.userId)
			if (existing) {
				return {
					success: false,
					message: `Agent ${body.userId} already exists`,
				}
			}

			const isFromTerminal = body.isFromTerminal ?? false
			await registerAgent(body.userId, body.phoneNumber ?? null, isFromTerminal)

			return {
				success: true,
				method: body.phoneNumber ? "pairing-code" : "qr",
				message: body.phoneNumber
					? "Agent registered, check pairing code via GET /agent/:userId/pairing-code"
					: "Agent registered, scan QR via GET /agent/:userId/qr",
			}
		},
		{
			body: t.Object({
				userId: t.String(),
				phoneNumber: t.Nullable(t.Optional(t.String())),
				isFromTerminal: t.Optional(t.Boolean()),
			}),
		},
	)
	.post(
		"/reregister",
		async ({ body }) => {
			const agent = getAgent(body.userId)
			if (!agent) {
				return { success: false, message: "Agent not found" }
			}
			if (agent.status !== "loggedOut") {
				return { success: false, message: "Agent is not logged out" }
			}

			const method =
				body.method ??
				(body.phoneNumber || agent.phoneNumber ? "pairing-code" : "qr")

			let finalPhone: string | null = null
			if (method === "pairing-code") {
				finalPhone = body.phoneNumber || agent.phoneNumber
				if (!finalPhone) {
					return {
						success: false,
						message:
							"Phone number is required for pairing code. Specify phoneNumber or switch method to qr.",
					}
				}
				updateAgentPhone(body.userId, finalPhone)
			} else {
				finalPhone = null
				updateAgentPhone(body.userId, null)
			}

			const isFromTerminal = body.isFromTerminal ?? false
			await reRegisterAgent(body.userId, finalPhone, isFromTerminal)

			return {
				success: true,
				method,
				phoneNumber: finalPhone,
				message:
					method === "pairing-code"
						? `Agent re-registered via pairing code (${finalPhone})`
						: "Agent re-registered via QR code scan",
			}
		},
		{
			body: t.Object({
				userId: t.String(),
				phoneNumber: t.Nullable(t.Optional(t.String())),
				method: t.Optional(
					t.Union([t.Literal("pairing-code"), t.Literal("qr")]),
				),
				isFromTerminal: t.Optional(t.Boolean()),
			}),
		},
	)

	// ── Socket Control & Lifecycle ────────────────────────────────────────────
	.post("/:userId/restart", async ({ params }) => {
		const agent = getAgent(params.userId)
		if (!agent) return { success: false, message: "Agent not found" }
		if (agent.status === "loggedOut") {
			return {
				success: false,
				message: "Agent is logged out. Please re-register instead.",
			}
		}

		const mode = baileysManager.getAgentMode(params.userId)
		const phone = mode === "pairing-code" ? agent.phoneNumber : null

		const sock = baileysManager.getSocket(params.userId)
		if (sock) {
			sock.end(undefined)
			baileysManager.removeRunningSocket(params.userId)
		}

		await baileysManager.startAgent(params.userId, phone)
		return { success: true, message: `Agent ${params.userId} restarted` }
	})
	.post("/:userId/logout", async ({ params }) => {
		const agent = getAgent(params.userId)
		if (!agent) return { success: false, message: "Agent not found" }

		const sock = baileysManager.getSocket(params.userId)
		if (!sock) {
			return { success: false, message: "Agent is not currently connected" }
		}

		await sock.logout()
		sock.end(undefined)
		baileysManager.removeRunningSocket(params.userId)
		cleanAgentAuth(params.userId)
		updateAgentStatus(params.userId, "loggedOut")

		return {
			success: true,
			message: `Agent ${params.userId} logged out successfully`,
		}
	})

	// ── Messaging & Presence API ──────────────────────────────────────────────
	.post(
		"/:userId/send-message",
		async ({ params, body }) => {
			const sock = baileysManager.getSocket(params.userId)
			if (!sock) {
				return { success: false, message: "Agent is not running or connected" }
			}

			let targetJid = body.to.trim()
			if (!targetJid.includes("@")) {
				targetJid = `${targetJid.replace(/[^0-9]/g, "")}@s.whatsapp.net`
			}

			try {
				const sent = await sock.sendMessage(targetJid, { text: body.text })
				return {
					success: true,
					message: "Message sent successfully",
					data: sent,
				}
			} catch (err: unknown) {
				const errorMsg = err instanceof Error ? err.message : String(err)
				return {
					success: false,
					message: `Failed to send message: ${errorMsg}`,
				}
			}
		},
		{
			body: t.Object({
				to: t.String({
					description:
						"Phone number (e.g. 628123456789) or JID (xxx@s.whatsapp.net / xxx@g.us)",
				}),
				text: t.String({ minLength: 1, description: "Text content to send" }),
			}),
		},
	)
	.post(
		"/:userId/presence",
		async ({ params, body }) => {
			const sock = baileysManager.getSocket(params.userId)
			if (!sock) {
				return { success: false, message: "Agent is not running or connected" }
			}

			let targetJid = body.to.trim()
			if (!targetJid.includes("@")) {
				targetJid = `${targetJid.replace(/[^0-9]/g, "")}@s.whatsapp.net`
			}

			try {
				await sock.sendPresenceUpdate(body.presence as WAPresence, targetJid)
				return {
					success: true,
					message: `Presence updated to ${body.presence}`,
				}
			} catch (err: unknown) {
				const errorMsg = err instanceof Error ? err.message : String(err)
				return {
					success: false,
					message: `Failed to update presence: ${errorMsg}`,
				}
			}
		},
		{
			body: t.Object({
				to: t.String(),
				presence: t.Union([
					t.Literal("composing"),
					t.Literal("recording"),
					t.Literal("paused"),
					t.Literal("available"),
					t.Literal("unavailable"),
				]),
			}),
		},
	)

	// ── Profile & Group Inspection API ────────────────────────────────────────
	.get("/:userId/profile", async ({ params }) => {
		const sock = baileysManager.getSocket(params.userId)
		if (!sock?.user) {
			return { success: false, message: "Agent is not connected" }
		}

		let pictureUrl: string | null = null
		try {
			pictureUrl = (await sock.profilePictureUrl(sock.user.id, "image")) ?? null
		} catch {
			// Profile picture optional
		}

		return {
			success: true,
			data: {
				id: sock.user.id,
				name: sock.user.name,
				lid: sock.user.lid,
				pictureUrl,
			},
		}
	})
	.get("/:userId/groups/fetch", async ({ params }) => {
		const sock = baileysManager.getSocket(params.userId)
		if (!sock) {
			return { success: false, message: "Agent is not connected" }
		}

		try {
			const groupsMap = await sock.groupFetchAllParticipating()
			const groupsList = Object.values(groupsMap).map((g) => ({
				id: g.id,
				subject: g.subject,
				owner: g.owner,
				creation: g.creation,
				participantsCount: g.participants.length,
			}))

			return { success: true, data: groupsList }
		} catch (err: unknown) {
			const errorMsg = err instanceof Error ? err.message : String(err)
			return { success: false, message: `Failed to fetch groups: ${errorMsg}` }
		}
	})

	// ── Agent Queries & Status ────────────────────────────────────────────────
	.get("/:userId/status", ({ params }) => {
		const agent = getAgent(params.userId)
		if (!agent) {
			return { success: false, message: "Agent not found" }
		}

		return {
			success: true,
			data: {
				...agent,
				running: baileysManager.getAgentStatus(params.userId),
			},
		}
	})
	.get("/:userId/qr", async ({ params, set }) => {
		const qr = baileysManager.getQR(params.userId)
		if (!qr) {
			set.status = 404
			return {
				success: false,
				message: "QR not available or agent already connected",
			}
		}

		const base64 = await QRCode.toDataURL(qr)
		return { success: true, data: base64 }
	})
	.get("/:userId/qr/image", async ({ params, set }) => {
		const qr = baileysManager.getQR(params.userId)
		if (!qr) {
			set.status = 404
			return {
				success: false,
				message: "QR not available or agent already connected",
			}
		}

		const buffer = await QRCode.toBuffer(qr, { type: "png", width: 300 })
		set.headers["Content-Type"] = "image/png"
		return buffer
	})
	.get("/:userId/pairing-code", ({ params }) => {
		const agent = getAgent(params.userId)
		if (!agent) {
			return { success: false, message: "Agent not found" }
		}

		const code = baileysManager.getPairingCode(params.userId)
		if (!code) {
			return {
				success: false,
				message: "Pairing code not available or already connected",
			}
		}

		return { success: true, data: code }
	})
	.get("/list", () => {
		const agents = getAllAgents()
		return {
			success: true,
			data: agents.map((a) => ({
				...a,
				running: baileysManager.getAgentStatus(a.userId),
			})),
		}
	})
	.delete("/:userId", async ({ params }) => {
		const agent = getAgent(params.userId)
		if (!agent) {
			return { success: false, message: "Agent not found" }
		}

		await deleteAgent(params.userId)
		return { success: true, message: "Agent deleted" }
	})

	// ── Config Management Routes ──────────────────────────────────────────────
	.get("/:userId/config", ({ params }) => {
		const config = getAgentConfig(params.userId)
		if (!config) {
			return { success: false, message: "Agent not found" }
		}
		return { success: true, data: config }
	})
	.put(
		"/:userId/config",
		({ params, body }) => {
			const agent = getAgent(params.userId)
			if (!agent) {
				return { success: false, message: "Agent not found" }
			}
			updateAgentConfig(params.userId, body)
			return { success: true, data: getAgentConfig(params.userId) }
		},
		{
			body: t.Partial(
				t.Object({
					prefix: t.String({ minLength: 1, maxLength: 5 }),
					autodelete: t.Array(t.String({ minLength: 1 })),
					commandBlacklist: t.Array(t.String({ minLength: 1 })),
				}),
			),
		},
	)

	// ── Owner Management Routes ───────────────────────────────────────────────
	.get("/:userId/owner/list", async ({ params }) => {
		const agent = getAgent(params.userId)
		if (!agent) return { success: false, message: "Agent not found" }
		const owners = await ownerDb.getAll(params.userId)
		return { success: true, data: owners }
	})
	.post(
		"/:userId/owner/add",
		async ({ params, body }) => {
			const agent = getAgent(params.userId)
			if (!agent) return { success: false, message: "Agent not found" }
			try {
				await ownerDb.addOwner(body.lid, body.level, params.userId)
				return {
					success: true,
					message: `Owner ${body.lid} added as ${body.level}`,
				}
			} catch (err: unknown) {
				const errorMsg = err instanceof Error ? err.message : String(err)
				return { success: false, message: errorMsg }
			}
		},
		{
			body: t.Object({
				lid: t.String(),
				level: t.Union([t.Literal("owner"), t.Literal("master")]),
			}),
		},
	)
	.delete("/:userId/owner/:lid", async ({ params }) => {
		const agent = getAgent(params.userId)
		if (!agent) return { success: false, message: "Agent not found" }
		try {
			await ownerDb.removeOwner(params.lid, params.userId)
			return { success: true, message: `Owner ${params.lid} removed` }
		} catch (err: unknown) {
			const errorMsg = err instanceof Error ? err.message : String(err)
			return { success: false, message: errorMsg }
		}
	})
	.put(
		"/:userId/owner/:lid/level",
		async ({ params, body }) => {
			const agent = getAgent(params.userId)
			if (!agent) return { success: false, message: "Agent not found" }
			try {
				await ownerDb.changeLevel(params.lid, body.level, params.userId)
				return {
					success: true,
					message: `Owner ${params.lid} level changed to ${body.level}`,
				}
			} catch (err: unknown) {
				const errorMsg = err instanceof Error ? err.message : String(err)
				return { success: false, message: errorMsg }
			}
		},
		{
			body: t.Object({
				level: t.Union([t.Literal("owner"), t.Literal("master")]),
			}),
		},
	)

	// ── Group Allowlist Management Routes ─────────────────────────────────────
	.get("/:userId/group/allowlist", async ({ params }) => {
		const agent = getAgent(params.userId)
		if (!agent) return { success: false, message: "Agent not found" }
		const groups = await groupDb.getAll(params.userId)
		return { success: true, data: groups }
	})
	.post(
		"/:userId/group/allow",
		async ({ params, body }) => {
			const agent = getAgent(params.userId)
			if (!agent) return { success: false, message: "Agent not found" }
			try {
				await groupDb.allow(body.groupJid, params.userId)
				return {
					success: true,
					message: `Group ${body.groupJid} added to allowlist`,
				}
			} catch (err: unknown) {
				const errorMsg = err instanceof Error ? err.message : String(err)
				return { success: false, message: errorMsg }
			}
		},
		{
			body: t.Object({ groupJid: t.String() }),
		},
	)
	.delete("/:userId/group/:groupJid", async ({ params }) => {
		const agent = getAgent(params.userId)
		if (!agent) return { success: false, message: "Agent not found" }
		try {
			await groupDb.disallow(params.groupJid, params.userId)
			return { success: true, message: `Group ${params.groupJid} removed` }
		} catch (err: unknown) {
			const errorMsg = err instanceof Error ? err.message : String(err)
			return { success: false, message: errorMsg }
		}
	})

	// ── Command Management Routes ─────────────────────────────────────────────
	.get("/:userId/commands", ({ params }) => {
		const commands = getAgentCommands(params.userId)
		return { success: true, data: commands }
	})
	.put(
		"/:userId/commands/:commandName",
		({ params, body }) => {
			const agent = getAgent(params.userId)
			if (!agent) {
				return { success: false, message: "Agent not found" }
			}
			updateCommandStatus(params.userId, params.commandName, body.status)
			const updated = getAgentCommands(params.userId)
			return { success: true, data: updated }
		},
		{
			body: t.Object({
				status: t.Union([t.Literal("enabled"), t.Literal("disabled")]),
			}),
		},
	)
