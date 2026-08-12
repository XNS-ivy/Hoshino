import { socketManager } from "@modules/baileys/socket"
import { messageRepository } from "@repositories/message.repository"
import { wsManager } from "@services/wsManager"
import type { AnyMessageContent } from "baileys"
import { Elysia, t } from "elysia"

export const messageRoutes = new Elysia({ prefix: "/api/agents/:id" })
	// WS /api/agents/:id/ws - Real-Time Event Stream
	.ws("/ws", {
		open(ws: {
			data?: { params?: { id?: string } }
			send: (msg: string) => void
		}) {
			const id = ws.data?.params?.id
			if (id) wsManager.subscribe(id, ws)
		},
		close(ws: {
			data?: { params?: { id?: string } }
			send: (msg: string) => void
		}) {
			const id = ws.data?.params?.id
			if (id) wsManager.unsubscribe(id, ws)
		},
	})

	// POST /api/agents/:id/messages - Send Message (Text, Media, Location, Contact, Reply)
	.post(
		"/messages",
		async ({ params: { id }, body, set }) => {
			try {
				const {
					recipient,
					type,
					text,
					mediaUrl,
					fileName,
					mimetype,
					location,
					contact,
				} = body

				let content: AnyMessageContent

				if (type === "text") {
					if (!text) {
						set.status = 400
						return {
							success: false,
							message: "Text field is required for text message type",
						}
					}
					content = { text }
				} else if (type === "image") {
					if (!mediaUrl) {
						set.status = 400
						return {
							success: false,
							message: "mediaUrl is required for image message type",
						}
					}
					content = { image: { url: mediaUrl }, caption: text }
				} else if (type === "video") {
					if (!mediaUrl) {
						set.status = 400
						return {
							success: false,
							message: "mediaUrl is required for video message type",
						}
					}
					content = { video: { url: mediaUrl }, caption: text }
				} else if (type === "document") {
					if (!mediaUrl) {
						set.status = 400
						return {
							success: false,
							message: "mediaUrl is required for document message type",
						}
					}
					content = {
						document: { url: mediaUrl },
						fileName: fileName || "document",
						mimetype: mimetype || "application/octet-stream",
						caption: text,
					}
				} else if (type === "location") {
					if (!location) {
						set.status = 400
						return {
							success: false,
							message: "location object is required for location message type",
						}
					}
					content = {
						location: {
							degreesLatitude: location.degreesLatitude,
							degreesLongitude: location.degreesLongitude,
							name: location.name,
							address: location.address,
						},
					}
				} else if (type === "contact") {
					if (!contact) {
						set.status = 400
						return {
							success: false,
							message: "contact object is required for contact message type",
						}
					}
					const vcard =
						contact.vcard ||
						`BEGIN:VCARD\nVERSION:3.0\nFN:${contact.displayName}\nTEL;type=CELL;type=VOICE;waid=${contact.phoneNumber.replace(/[^0-9]/g, "")}:${contact.phoneNumber}\nEND:VCARD`

					content = {
						contacts: {
							displayName: contact.displayName,
							contacts: [{ vcard }],
						},
					}
				} else {
					set.status = 400
					return {
						success: false,
						message: `Unsupported message type '${type}'`,
					}
				}

				const sentMsg = await socketManager.sendMessage(id, recipient, content)

				return {
					success: true,
					data: {
						messageId: sentMsg.key.id,
						recipient,
						type,
						timestamp: sentMsg.messageTimestamp,
					},
				}
			} catch (error) {
				set.status = 500
				return {
					success: false,
					message: `Failed to send message: ${error}`,
				}
			}
		},
		{
			params: t.Object({
				id: t.String(),
			}),
			body: t.Object({
				recipient: t.String({ minLength: 1 }),
				type: t.Union([
					t.Literal("text"),
					t.Literal("image"),
					t.Literal("video"),
					t.Literal("document"),
					t.Literal("location"),
					t.Literal("contact"),
				]),
				text: t.Optional(t.String()),
				mediaUrl: t.Optional(t.String()),
				fileName: t.Optional(t.String()),
				mimetype: t.Optional(t.String()),
				location: t.Optional(
					t.Object({
						degreesLatitude: t.Number(),
						degreesLongitude: t.Number(),
						name: t.Optional(t.String()),
						address: t.Optional(t.String()),
					}),
				),
				contact: t.Optional(
					t.Object({
						displayName: t.String(),
						phoneNumber: t.String(),
						vcard: t.Optional(t.String()),
					}),
				),
			}),
		},
	)

	// GET /api/agents/:id/chats - List all active chats for agent
	.get(
		"/chats",
		async ({ params: { id }, set }) => {
			try {
				const safeAgentId = socketManager.sanitizeAgentId(id)
				const chats = await messageRepository.getChatsByAgent(safeAgentId)
				return {
					success: true,
					data: chats,
				}
			} catch (error) {
				set.status = 500
				return {
					success: false,
					message: `Failed to fetch chats: ${error}`,
				}
			}
		},
		{
			params: t.Object({
				id: t.String(),
			}),
		},
	)

	// GET /api/agents/:id/chats/:jid/messages - Get chat messages history
	.get(
		"/chats/:jid/messages",
		async ({ params: { id, jid }, query, set }) => {
			try {
				const safeAgentId = socketManager.sanitizeAgentId(id)
				const limit = query?.limit ? Number.parseInt(query.limit, 10) : 50
				const offset = query?.offset ? Number.parseInt(query.offset, 10) : 0

				const messages = await messageRepository.getMessagesByChat(
					safeAgentId,
					jid,
					limit,
					offset,
				)

				// Mark as read when viewing messages
				await messageRepository.markChatAsRead(safeAgentId, jid)

				return {
					success: true,
					data: messages,
				}
			} catch (error) {
				set.status = 500
				return {
					success: false,
					message: `Failed to fetch messages: ${error}`,
				}
			}
		},
		{
			params: t.Object({
				id: t.String(),
				jid: t.String(),
			}),
		},
	)

	// POST /api/agents/:id/chats/:jid/read - Mark chat as read
	.post(
		"/chats/:jid/read",
		async ({ params: { id, jid } }) => {
			const safeAgentId = socketManager.sanitizeAgentId(id)
			await messageRepository.markChatAsRead(safeAgentId, jid)
			return { success: true }
		},
		{
			params: t.Object({
				id: t.String(),
				jid: t.String(),
			}),
		},
	)
