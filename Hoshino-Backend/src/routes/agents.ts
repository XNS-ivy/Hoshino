import { socketManager } from "@modules/baileys/socket"
import { agentRepository } from "@repositories/agent.repository"
import { commandRepository } from "@repositories/command.repository"
import { gachaRepository } from "@repositories/gacha.repository"
import { messageRepository } from "@repositories/message.repository"
import { momoRepository } from "@repositories/momo.repository"
import { commandLoader } from "@services/commandLoader"
import { Elysia, t } from "elysia"

export const agentRoutes = new Elysia({ prefix: "/api/agents" })
	// POST /api/agents - Create / Start Agent Session
	.post(
		"/",
		async ({ body, set }) => {
			try {
				const { name, phoneNumber } = body
				const { session } = await socketManager.startSock(name, phoneNumber)

				set.status = 201
				return {
					success: true,
					data: {
						agentId: session.agentId,
						name: session.agentName,
						phoneNumber: session.phoneNumber,
						status: session.status,
						pairingCode: session.pairingCode,
						qrCode: session.qrCode,
						updatedAt: session.updatedAt,
					},
				}
			} catch (error) {
				set.status = 500
				return {
					success: false,
					message: `Failed to start agent session: ${error}`,
				}
			}
		},
		{
			body: t.Object({
				name: t.String({ minLength: 1 }),
				phoneNumber: t.Optional(t.String()),
			}),
		},
	)

	// GET /api/agents - List all agents
	.get("/", async ({ set }) => {
		try {
			const dbAgents = await agentRepository.findAllAgents()

			const result = dbAgents.map((agent) => {
				const id = agent.id
				const liveSession = socketManager.getAgentSession(id)

				return {
					agentId: id,
					name: agent.name,
					phoneNumber: agent.phoneNumber ?? liveSession?.phoneNumber,
					status: liveSession?.status ?? agent.status,
					pairingCode: liveSession?.pairingCode,
					qrCode: liveSession?.qrCode,
					createdAt: agent.createdAt,
					updatedAt: liveSession?.updatedAt ?? agent.updatedAt,
				}
			})

			return {
				success: true,
				data: result,
			}
		} catch (error) {
			set.status = 500
			return {
				success: false,
				message: `Failed to fetch agents: ${error}`,
			}
		}
	})

	// GET /api/agents/:id - Get specific agent by ID/Name
	.get("/:id", async ({ params: { id }, set }) => {
		try {
			const safeAgentId = socketManager.sanitizeAgentId(id)
			const agent = await agentRepository.findAgentById(safeAgentId)

			if (!agent) {
				set.status = 404
				return {
					success: false,
					message: `Agent with ID '${id}' not found`,
				}
			}

			const liveSession = socketManager.getAgentSession(safeAgentId)

			return {
				success: true,
				data: {
					agentId: safeAgentId,
					name: agent.name,
					phoneNumber: agent.phoneNumber ?? liveSession?.phoneNumber,
					status: liveSession?.status ?? agent.status,
					pairingCode: liveSession?.pairingCode,
					qrCode: liveSession?.qrCode,
					createdAt: agent.createdAt,
					updatedAt: liveSession?.updatedAt ?? agent.updatedAt,
				},
			}
		} catch (error) {
			set.status = 500
			return {
				success: false,
				message: `Failed to fetch agent '${id}': ${error}`,
			}
		}
	})

	// POST /api/agents/:id/reconnect - Reconnect / Restart Agent
	.post("/:id/reconnect", async ({ params: { id }, body, set }) => {
		try {
			const phoneNumber = (body as { phoneNumber?: string })?.phoneNumber
			const { session } = await socketManager.reconnectAgent(id, phoneNumber)

			return {
				success: true,
				message: `Agent '${id}' reconnected successfully`,
				data: {
					agentId: session.agentId,
					status: session.status,
					pairingCode: session.pairingCode,
					qrCode: session.qrCode,
				},
			}
		} catch (error) {
			set.status = 500
			return {
				success: false,
				message: `Failed to reconnect agent '${id}': ${error}`,
			}
		}
	})

	// DELETE /api/agents/:id - Delete Agent permanently
	.delete("/:id", async ({ params: { id }, set }) => {
		try {
			await socketManager.deleteAgent(id)
			return {
				success: true,
				message: `Agent '${id}' deleted successfully`,
			}
		} catch (error) {
			set.status = 500
			return {
				success: false,
				message: `Failed to delete agent '${id}': ${error}`,
			}
		}
	})

	// ── Multi-Tenant Settings Endpoints ─────────────────────────────────────

	// GET /api/agents/:id/owners - List agent owners
	.get("/:id/owners", async ({ params: { id }, set }) => {
		try {
			const safeAgentId = socketManager.sanitizeAgentId(id)
			const owners = await commandRepository.getOwners(safeAgentId)
			return { success: true, data: owners }
		} catch (error) {
			set.status = 500
			return { success: false, message: `Failed to fetch owners: ${error}` }
		}
	})

	// POST /api/agents/:id/owners - Add agent owner
	.post(
		"/:id/owners",
		async ({ params: { id }, body, set }) => {
			try {
				const safeAgentId = socketManager.sanitizeAgentId(id)
				await commandRepository.addOwner(
					safeAgentId,
					body.userJid,
					body.role || "owner",
				)
				return { success: true, message: "Owner added successfully" }
			} catch (error) {
				set.status = 500
				return { success: false, message: `Failed to add owner: ${error}` }
			}
		},
		{
			body: t.Object({
				userJid: t.String({ minLength: 1 }),
				role: t.Optional(t.String()),
			}),
		},
	)

	// DELETE /api/agents/:id/owners/:userJid - Remove agent owner
	.delete("/:id/owners/:userJid", async ({ params: { id, userJid }, set }) => {
		try {
			const safeAgentId = socketManager.sanitizeAgentId(id)
			await commandRepository.removeOwner(safeAgentId, userJid)
			return { success: true, message: "Owner removed successfully" }
		} catch (error) {
			set.status = 500
			return { success: false, message: `Failed to remove owner: ${error}` }
		}
	})

	// GET /api/agents/:id/blacklist - List blacklisted users
	.get("/:id/blacklist", async ({ params: { id }, set }) => {
		try {
			const safeAgentId = socketManager.sanitizeAgentId(id)
			const list = await commandRepository.getBlacklist(safeAgentId)
			return { success: true, data: list }
		} catch (error) {
			set.status = 500
			return {
				success: false,
				message: `Failed to fetch blacklist: ${error}`,
			}
		}
	})

	// POST /api/agents/:id/blacklist - Add blacklisted user
	.post(
		"/:id/blacklist",
		async ({ params: { id }, body, set }) => {
			try {
				const safeAgentId = socketManager.sanitizeAgentId(id)
				await commandRepository.addBlacklist(
					safeAgentId,
					body.userJid,
					body.reason,
				)
				return { success: true, message: "User blacklisted successfully" }
			} catch (error) {
				set.status = 500
				return {
					success: false,
					message: `Failed to blacklist user: ${error}`,
				}
			}
		},
		{
			body: t.Object({
				userJid: t.String({ minLength: 1 }),
				reason: t.Optional(t.String()),
			}),
		},
	)

	// DELETE /api/agents/:id/blacklist/:userJid - Remove blacklisted user
	.delete(
		"/:id/blacklist/:userJid",
		async ({ params: { id, userJid }, set }) => {
			try {
				const safeAgentId = socketManager.sanitizeAgentId(id)
				await commandRepository.removeBlacklist(safeAgentId, userJid)
				return {
					success: true,
					message: "User removed from blacklist successfully",
				}
			} catch (error) {
				set.status = 500
				return {
					success: false,
					message: `Failed to remove user from blacklist: ${error}`,
				}
			}
		},
	)

	// GET /api/agents/:id/autodelete - List auto-delete target users (optionally filtered by groupJid)
	.get(
		"/:id/autodelete",
		async ({ params: { id }, query, set }) => {
			try {
				const safeAgentId = socketManager.sanitizeAgentId(id)
				const list = await commandRepository.getAutoDeleteList(
					safeAgentId,
					query?.groupJid,
				)
				return { success: true, data: list }
			} catch (error) {
				set.status = 500
				return {
					success: false,
					message: `Failed to fetch auto-delete list: ${error}`,
				}
			}
		},
		{
			query: t.Optional(
				t.Object({
					groupJid: t.Optional(t.String()),
				}),
			),
		},
	)

	// POST /api/agents/:id/autodelete - Add auto-delete target user (scoped per group or global '*')
	.post(
		"/:id/autodelete",
		async ({ params: { id }, body, set }) => {
			try {
				const safeAgentId = socketManager.sanitizeAgentId(id)
				await commandRepository.addAutoDelete(
					safeAgentId,
					body.userJid,
					body.groupJid || "*",
				)
				return { success: true, message: "User added to auto-delete list" }
			} catch (error) {
				set.status = 500
				return {
					success: false,
					message: `Failed to add user to auto-delete list: ${error}`,
				}
			}
		},
		{
			body: t.Object({
				userJid: t.String({ minLength: 1 }),
				groupJid: t.Optional(t.String()),
			}),
		},
	)

	// DELETE /api/agents/:id/autodelete/:userJid - Remove auto-delete user (scoped per group or all)
	.delete(
		"/:id/autodelete/:userJid",
		async ({ params: { id, userJid }, query, set }) => {
			try {
				const safeAgentId = socketManager.sanitizeAgentId(id)
				await commandRepository.removeAutoDelete(
					safeAgentId,
					userJid,
					query?.groupJid,
				)
				return {
					success: true,
					message: "User removed from auto-delete list",
				}
			} catch (error) {
				set.status = 500
				return {
					success: false,
					message: `Failed to remove user from auto-delete list: ${error}`,
				}
			}
		},
		{
			query: t.Optional(
				t.Object({
					groupJid: t.Optional(t.String()),
				}),
			),
		},
	)

	// GET /api/agents/:id/commands - List all commands & global status for agent
	.get("/:id/commands", async ({ params: { id }, set }) => {
		try {
			const safeAgentId = socketManager.sanitizeAgentId(id)
			await commandLoader.init()
			const allCmds = commandLoader.getAllCommands()
			const toggles = await commandRepository.getAllCommandToggles(safeAgentId)
			const toggleMap = new Map(toggles.map((t) => [t.commandName, t.status]))

			const result = allCmds.map((cmd) => {
				const primaryName = Array.isArray(cmd.name) ? cmd.name[0] : cmd.name
				return {
					name: primaryName,
					aliases: Array.isArray(cmd.name) ? cmd.name.slice(1) : [],
					category: cmd.category || "general",
					description: cmd.description,
					access: cmd.access || "user",
					needAdminRegisterThisCommand: !!cmd.needAdminRegisterThisCommand,
					status: toggleMap.get(primaryName || "") || "enabled",
				}
			})

			return { success: true, data: result }
		} catch (error) {
			set.status = 500
			return {
				success: false,
				message: `Failed to fetch command toggles: ${error}`,
			}
		}
	})

	// PATCH /api/agents/:id/commands/:commandName - Set global command status
	.patch(
		"/:id/commands/:commandName",
		async ({ params: { id, commandName }, body, set }) => {
			try {
				const safeAgentId = socketManager.sanitizeAgentId(id)
				await commandRepository.setGlobalCommandStatus(
					safeAgentId,
					commandName,
					body.status,
				)
				return {
					success: true,
					message: `Command '${commandName}' status set to '${body.status}'`,
				}
			} catch (error) {
				set.status = 500
				return {
					success: false,
					message: `Failed to set command status: ${error}`,
				}
			}
		},
		{
			body: t.Object({
				status: t.Union([t.Literal("enabled"), t.Literal("disabled")]),
			}),
		},
	)

	// GET /api/agents/:id/contacts - List saved contacts for auto-complete
	.get("/:id/contacts", async ({ params: { id }, set }) => {
		try {
			const safeAgentId = socketManager.sanitizeAgentId(id)
			const contacts = await messageRepository.findContactsByAgent(safeAgentId)
			return { success: true, data: contacts }
		} catch (error) {
			set.status = 500
			return {
				success: false,
				message: `Failed to fetch contacts: ${error}`,
			}
		}
	})

	// GET /api/agents/:id/groups - List all groups & listening settings for agent
	.get("/:id/groups", async ({ params: { id }, set }) => {
		try {
			const safeAgentId = socketManager.sanitizeAgentId(id)
			const groups = await commandRepository.getAllGroupSettings(safeAgentId)
			const sock = socketManager.getSock(safeAgentId)

			const enrichedGroups = await Promise.all(
				groups.map(async (g) => {
					let subject = g.subject || undefined
					if (sock && (!subject || subject === g.jid)) {
						try {
							const meta = await sock.groupMetadata(g.jid)
							if (meta?.subject) {
								subject = meta.subject
							}
						} catch {
							/* ignore metadata fetch error */
						}
					}
					return {
						...g,
						subject: subject || g.jid,
					}
				}),
			)

			return { success: true, data: enrichedGroups }
		} catch (error) {
			set.status = 500
			return {
				success: false,
				message: `Failed to fetch groups: ${error}`,
			}
		}
	})

	// GET /api/agents/:id/groups/:jid - Get group settings
	.get("/:id/groups/:jid", async ({ params: { id, jid }, set }) => {
		try {
			const safeAgentId = socketManager.sanitizeAgentId(id)
			const settings = await commandRepository.getGroupSettings(
				safeAgentId,
				jid,
			)
			return { success: true, data: settings }
		} catch (error) {
			set.status = 500
			return {
				success: false,
				message: `Failed to fetch group settings: ${error}`,
			}
		}
	})

	// PATCH /api/agents/:id/groups/:jid - Update group settings
	.patch(
		"/:id/groups/:jid",
		async ({ params: { id, jid }, body, set }) => {
			try {
				const safeAgentId = socketManager.sanitizeAgentId(id)
				const updated = await commandRepository.updateGroupSettings(
					safeAgentId,
					jid,
					body,
				)
				return { success: true, data: updated }
			} catch (error) {
				set.status = 500
				return {
					success: false,
					message: `Failed to update group settings: ${error}`,
				}
			}
		},
		{
			body: t.Object({
				botEnabled: t.Optional(t.Boolean()),
				welcomeEnabled: t.Optional(t.Boolean()),
				goodbyeEnabled: t.Optional(t.Boolean()),
				customPrefix: t.Optional(t.Nullable(t.String())),
			}),
		},
	)

	// GET /api/agents/:id/groups/:jid/commands - List all commands and group status
	.get("/:id/groups/:jid/commands", async ({ params: { id, jid }, set }) => {
		try {
			const safeAgentId = socketManager.sanitizeAgentId(id)
			await commandLoader.init()
			const allCmds = commandLoader.getAllCommands()
			const globalToggles =
				await commandRepository.getAllCommandToggles(safeAgentId)
			const globalToggleMap = new Map(
				globalToggles.map((t) => [t.commandName, t.status]),
			)

			const groupOverrides = await commandRepository.getGroupCommands(
				safeAgentId,
				jid,
			)
			const groupOverrideMap = new Map(
				groupOverrides.map((g) => [g.commandName, g.status]),
			)

			const result = allCmds.map((cmd) => {
				const primaryName = Array.isArray(cmd.name) ? cmd.name[0] : cmd.name
				const isRegisteredReq = !!cmd.needAdminRegisterThisCommand
				const override = groupOverrideMap.get(primaryName || "")

				const effectiveStatus: "enabled" | "disabled" = override
					? override
					: isRegisteredReq
						? "disabled"
						: "enabled"

				return {
					name: primaryName,
					aliases: Array.isArray(cmd.name) ? cmd.name.slice(1) : [],
					category: cmd.category || "general",
					description: cmd.description,
					access: cmd.access || "user",
					needAdminRegisterThisCommand: isRegisteredReq,
					globalStatus: globalToggleMap.get(primaryName || "") || "enabled",
					status: effectiveStatus,
					isCustomized: override !== undefined,
				}
			})

			return { success: true, data: result }
		} catch (error) {
			set.status = 500
			return {
				success: false,
				message: `Failed to fetch group commands: ${error}`,
			}
		}
	})

	// PATCH /api/agents/:id/groups/:jid/commands/:commandName - Set command status for group
	.patch(
		"/:id/groups/:jid/commands/:commandName",
		async ({ params: { id, jid, commandName }, body, set }) => {
			try {
				const safeAgentId = socketManager.sanitizeAgentId(id)
				await commandRepository.setGroupCommandStatus(
					safeAgentId,
					jid,
					commandName,
					body.status,
				)
				return {
					success: true,
					message: `Command '${commandName}' in group '${jid}' set to '${body.status}'`,
				}
			} catch (error) {
				set.status = 500
				return {
					success: false,
					message: `Failed to set group command status: ${error}`,
				}
			}
		},
		{
			body: t.Object({
				status: t.Union([t.Literal("enabled"), t.Literal("disabled")]),
			}),
		},
	)

	// DELETE /api/agents/:id/groups/:jid/commands/:commandName - Reset group command to default policy
	.delete(
		"/:id/groups/:jid/commands/:commandName",
		async ({ params: { id, jid, commandName }, set }) => {
			try {
				const safeAgentId = socketManager.sanitizeAgentId(id)
				await commandRepository.resetGroupCommandStatus(
					safeAgentId,
					jid,
					commandName,
				)
				return {
					success: true,
					message: `Command '${commandName}' in group '${jid}' reset to default`,
				}
			} catch (error) {
				set.status = 500
				return {
					success: false,
					message: `Failed to reset group command: ${error}`,
				}
			}
		},
	)

	// POST /api/agents/:id/groups/:jid/commands/batch - Batch update group commands
	.post(
		"/:id/groups/:jid/commands/batch",
		async ({ params: { id, jid }, body, set }) => {
			try {
				const safeAgentId = socketManager.sanitizeAgentId(id)
				await commandLoader.init()
				const allCmds = commandLoader.getAllCommands()

				if (body.action === "reset_all") {
					await commandRepository.resetAllGroupCommands(safeAgentId, jid)
					return {
						success: true,
						message: "All group command overrides reset to default",
					}
				}

				const targetCmds = body.category
					? allCmds.filter((c) => c.category === body.category)
					: allCmds

				const targetStatus =
					body.action === "enable_all" ? "enabled" : "disabled"
				for (const cmd of targetCmds) {
					const primaryName = Array.isArray(cmd.name) ? cmd.name[0] : cmd.name
					if (primaryName) {
						await commandRepository.setGroupCommandStatus(
							safeAgentId,
							jid,
							primaryName,
							targetStatus,
						)
					}
				}

				return {
					success: true,
					message: `Successfully set ${targetCmds.length} commands to ${targetStatus}`,
				}
			} catch (error) {
				set.status = 500
				return {
					success: false,
					message: `Failed to batch update group commands: ${error}`,
				}
			}
		},
		{
			body: t.Object({
				action: t.Union([
					t.Literal("enable_all"),
					t.Literal("disable_all"),
					t.Literal("reset_all"),
				]),
				category: t.Optional(t.String()),
			}),
		},
	)

	// GET /api/agents/:id/groups/:jid/autodelete - List auto-delete targets for this specific group
	.get("/:id/groups/:jid/autodelete", async ({ params: { id, jid }, set }) => {
		try {
			const safeAgentId = socketManager.sanitizeAgentId(id)
			const list = await commandRepository.getAutoDeleteList(safeAgentId, jid)
			return { success: true, data: list }
		} catch (error) {
			set.status = 500
			return {
				success: false,
				message: `Failed to fetch group auto-delete list: ${error}`,
			}
		}
	})

	// POST /api/agents/:id/groups/:jid/autodelete - Add auto-delete target in this group
	.post(
		"/:id/groups/:jid/autodelete",
		async ({ params: { id, jid }, body, set }) => {
			try {
				const safeAgentId = socketManager.sanitizeAgentId(id)
				await commandRepository.addAutoDelete(safeAgentId, body.userJid, jid)
				return {
					success: true,
					message: "User added to auto-delete list for this group",
				}
			} catch (error) {
				set.status = 500
				return {
					success: false,
					message: `Failed to add user to group auto-delete list: ${error}`,
				}
			}
		},
		{
			body: t.Object({
				userJid: t.String({ minLength: 1 }),
			}),
		},
	)

	// DELETE /api/agents/:id/groups/:jid/autodelete/:userJid - Remove auto-delete target from this group
	.delete(
		"/:id/groups/:jid/autodelete/:userJid",
		async ({ params: { id, jid, userJid }, set }) => {
			try {
				const safeAgentId = socketManager.sanitizeAgentId(id)
				await commandRepository.removeAutoDelete(safeAgentId, userJid, jid)
				return {
					success: true,
					message: "User removed from auto-delete list for this group",
				}
			} catch (error) {
				set.status = 500
				return {
					success: false,
					message: `Failed to remove user from group auto-delete list: ${error}`,
				}
			}
		},
	)

	// GET /api/agents/:id/sensei - List all Sensei profiles for this agent

	.get("/:id/sensei", async ({ params: { id }, set }) => {
		try {
			const safeAgentId = socketManager.sanitizeAgentId(id)
			const profiles = await gachaRepository.getAllProfiles(safeAgentId)

			const enriched = await Promise.all(
				profiles.map(async (p) => {
					const pushName = await messageRepository.getPushName(
						safeAgentId,
						p.userJid,
					)
					const students = await gachaRepository.getCollection(
						safeAgentId,
						p.userJid,
					)
					const bonds = await momoRepository.getAllBonds(safeAgentId, p.userJid)
					const jidUser = p.userJid.split("@")[0] ?? p.userJid
					const fallbackName = jidUser.replace(/^[+]+/, "")

					return {
						...p,
						pushName: pushName || fallbackName,
						totalStudents: students.length,
						totalBonds: bonds.length,
						highestBondLevel: bonds[0]?.bondLevel || 1,
					}
				}),
			)

			return { success: true, data: enriched }
		} catch (error) {
			set.status = 500
			return {
				success: false,
				message: `Failed to fetch Sensei profiles: ${error}`,
			}
		}
	})

	// GET /api/agents/:id/sensei/:userJid - Detail Sensei profile with students & bonds
	.get("/:id/sensei/:userJid", async ({ params: { id, userJid }, set }) => {
		try {
			const safeAgentId = socketManager.sanitizeAgentId(id)
			const decodedJid = decodeURIComponent(userJid)
			const profile = await gachaRepository.getOrCreateProfile(
				safeAgentId,
				decodedJid,
			)
			const pushName = await messageRepository.getPushName(
				safeAgentId,
				profile.userJid,
			)
			const students = await gachaRepository.getCollection(
				safeAgentId,
				profile.userJid,
			)
			const bonds = await momoRepository.getAllBonds(
				safeAgentId,
				profile.userJid,
			)
			const jidUser = profile.userJid.split("@")[0] ?? profile.userJid
			const fallbackName = jidUser.replace(/^[+]+/, "")

			return {
				success: true,
				data: {
					...profile,
					pushName: pushName || fallbackName,
					students,
					bonds,
				},
			}
		} catch (error) {
			set.status = 500
			return {
				success: false,
				message: `Failed to fetch Sensei detail: ${error}`,
			}
		}
	})

	// PATCH /api/agents/:id/sensei/:userJid/pyroxenes - Grant or set Pyroxenes
	.patch(
		"/:id/sensei/:userJid/pyroxenes",
		async ({ params: { id, userJid }, body, set }) => {
			try {
				const safeAgentId = socketManager.sanitizeAgentId(id)
				const decodedJid = decodeURIComponent(userJid)
				let updated: unknown

				if (body.setAmount !== undefined) {
					updated = await gachaRepository.setPyroxenes(
						safeAgentId,
						decodedJid,
						body.setAmount,
					)
				} else if (body.amount !== undefined) {
					updated = await gachaRepository.addPyroxenes(
						safeAgentId,
						decodedJid,
						body.amount,
					)
				}

				return {
					success: true,
					data: updated,
					message: "Pyroxenes updated successfully",
				}
			} catch (error) {
				set.status = 500
				return {
					success: false,
					message: `Failed to update Pyroxenes: ${error}`,
				}
			}
		},
		{
			body: t.Object({
				amount: t.Optional(t.Number()),
				setAmount: t.Optional(t.Number()),
			}),
		},
	)

	// DELETE /api/agents/:id/sensei/:userJid - Reset Sensei profile & roster
	.delete("/:id/sensei/:userJid", async ({ params: { id, userJid }, set }) => {
		try {
			const safeAgentId = socketManager.sanitizeAgentId(id)
			const decodedJid = decodeURIComponent(userJid)
			await gachaRepository.deleteProfile(safeAgentId, decodedJid)
			return {
				success: true,
				message: "Sensei profile and collection reset successfully",
			}
		} catch (error) {
			set.status = 500
			return {
				success: false,
				message: `Failed to reset Sensei profile: ${error}`,
			}
		}
	})

	// GET /api/agents/:id/settings - Get agent general settings
	.get("/:id/settings", async ({ params: { id }, set }) => {
		try {
			const safeAgentId = socketManager.sanitizeAgentId(id)
			const agent = await agentRepository.findAgentById(safeAgentId)
			if (!agent) {
				set.status = 404
				return { success: false, message: "Agent not found" }
			}

			return {
				success: true,
				data: {
					prefix: agent.prefix || ".",
					welcomeMessage: agent.welcomeMessage,
					goodbyeMessage: agent.goodbyeMessage,
					autoRead: agent.autoRead ?? false,
					typingIndicator: agent.typingIndicator ?? true,
				},
			}
		} catch (error) {
			set.status = 500
			return {
				success: false,
				message: `Failed to fetch agent settings: ${error}`,
			}
		}
	})

	// PATCH /api/agents/:id/settings - Update agent general settings
	.patch(
		"/:id/settings",
		async ({ params: { id }, body, set }) => {
			try {
				const safeAgentId = socketManager.sanitizeAgentId(id)
				const updated = await agentRepository.updateAgent(safeAgentId, body)
				return {
					success: true,
					data: updated,
					message: "Agent settings updated successfully",
				}
			} catch (error) {
				set.status = 500
				return {
					success: false,
					message: `Failed to update agent settings: ${error}`,
				}
			}
		},
		{
			body: t.Object({
				prefix: t.Optional(t.String()),
				welcomeMessage: t.Optional(t.Nullable(t.String())),
				goodbyeMessage: t.Optional(t.Nullable(t.String())),
				autoRead: t.Optional(t.Boolean()),
				typingIndicator: t.Optional(t.Boolean()),
			}),
		},
	)
