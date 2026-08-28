import type { MessageType } from "@repositories/message.repository"
import type { AnyMessageContent, proto } from "baileys"

/**
 * Parses an incoming Baileys proto.IMessage object into a normalized MessageType and contentData payload using guard clauses.
 */
export function parseIncomingMessage(message: proto.IMessage): {
	messageType: MessageType
	contentData: Record<string, unknown>
} {
	if (message.conversation) {
		return {
			messageType: "text",
			contentData: { text: message.conversation },
		}
	}

	if (message.extendedTextMessage?.text) {
		return {
			messageType: "text",
			contentData: { text: message.extendedTextMessage.text },
		}
	}

	if (message.imageMessage) {
		return {
			messageType: "image",
			contentData: {
				caption: message.imageMessage.caption,
				mimetype: message.imageMessage.mimetype,
			},
		}
	}

	if (message.videoMessage) {
		return {
			messageType: "video",
			contentData: {
				caption: message.videoMessage.caption,
				mimetype: message.videoMessage.mimetype,
			},
		}
	}

	if (message.audioMessage) {
		return {
			messageType: "audio",
			contentData: {
				mimetype: message.audioMessage.mimetype,
			},
		}
	}

	if (message.documentMessage) {
		return {
			messageType: "document",
			contentData: {
				fileName: message.documentMessage.fileName,
				mimetype: message.documentMessage.mimetype,
			},
		}
	}

	if (message.locationMessage) {
		return {
			messageType: "location",
			contentData: {
				degreesLatitude: message.locationMessage.degreesLatitude,
				degreesLongitude: message.locationMessage.degreesLongitude,
				name: message.locationMessage.name,
				address: message.locationMessage.address,
			},
		}
	}

	if (message.stickerMessage) {
		return {
			messageType: "sticker",
			contentData: {
				mimetype: message.stickerMessage.mimetype || "image/webp",
			},
		}
	}

	if (message.contactMessage) {
		return {
			messageType: "contact",
			contentData: {
				displayName: message.contactMessage.displayName,
				vcard: message.contactMessage.vcard,
			},
		}
	}

	if (message.reactionMessage) {
		return {
			messageType: "reaction",
			contentData: {
				text: message.reactionMessage.text,
			},
		}
	}

	return {
		messageType: "other",
		contentData: {},
	}
}

/**
 * Extracts quoted message context info if the message is replying to another message.
 */
export function extractQuotedContext(
	message: proto.IMessage,
): Record<string, unknown> | undefined {
	const contextInfo =
		message.extendedTextMessage?.contextInfo ||
		message.imageMessage?.contextInfo ||
		message.videoMessage?.contextInfo ||
		message.audioMessage?.contextInfo ||
		message.documentMessage?.contextInfo ||
		message.stickerMessage?.contextInfo

	if (!contextInfo?.quotedMessage) {
		return undefined
	}

	const qM = contextInfo.quotedMessage
	const quotedText =
		qM.conversation ||
		qM.extendedTextMessage?.text ||
		qM.imageMessage?.caption ||
		qM.videoMessage?.caption ||
		(qM.stickerMessage ? "🧩 Sticker" : "") ||
		(qM.audioMessage ? "🎵 Audio" : "") ||
		(qM.documentMessage ? "📄 Document" : "") ||
		(qM.locationMessage ? "📍 Location" : "") ||
		"Quoted Message"

	return {
		id: contextInfo.stanzaId,
		participant: contextInfo.participant,
		text: quotedText,
	}
}

/**
 * Parses outgoing message content in sendMessage into normalized MessageType and contentData payload.
 */
export function parseOutgoingContent(content: AnyMessageContent): {
	messageType: MessageType
	contentData: Record<string, unknown>
} {
	if ("text" in content && typeof content.text === "string") {
		return {
			messageType: "text",
			contentData: { text: content.text },
		}
	}

	if ("image" in content) {
		return {
			messageType: "image",
			contentData:
				typeof content.caption === "string" ? { caption: content.caption } : {},
		}
	}

	if ("document" in content) {
		return {
			messageType: "document",
			contentData: {
				fileName:
					typeof content.fileName === "string" ? content.fileName : undefined,
				caption:
					typeof content.caption === "string" ? content.caption : undefined,
			},
		}
	}

	if ("location" in content && content.location) {
		return {
			messageType: "location",
			contentData: {
				degreesLatitude: content.location.degreesLatitude,
				degreesLongitude: content.location.degreesLongitude,
				name: content.location.name,
				address: content.location.address,
			},
		}
	}

	if ("contacts" in content && content.contacts) {
		return {
			messageType: "contact",
			contentData: {
				displayName: content.contacts.displayName,
			},
		}
	}

	return {
		messageType: "other",
		contentData: {},
	}
}
