import { socketManager } from "@modules/baileys/socket"
import { agentRepository } from "@repositories/agent.repository"
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
