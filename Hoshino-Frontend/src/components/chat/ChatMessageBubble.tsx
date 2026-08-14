import React, { useState } from "react"
import {
	FileText,
	Image as ImageIcon,
	MapPin,
	Music,
	Reply,
	Smile,
	User,
	Video,
} from "lucide-react"
import { API_BASE_URL } from "../../services/api"
import type { ChatMessage } from "../../types"

const getContentText = (content: unknown): string => {
	if (!content) return ""
	if (typeof content === "string") {
		try {
			const parsed = JSON.parse(content)
			return String(parsed.text || parsed.caption || content)
		} catch {
			return content
		}
	}
	if (typeof content === "object" && content !== null) {
		const obj = content as Record<string, unknown>
		return String(obj.text || obj.caption || "")
	}
	return String(content)
}

const getMediaField = (content: unknown, field: string): string => {
	if (!content) return ""
	let obj: Record<string, unknown> = {}
	if (typeof content === "string") {
		try {
			obj = JSON.parse(content)
		} catch {
			return ""
		}
	} else if (typeof content === "object" && content !== null) {
		obj = content as Record<string, unknown>
	}
	return String(obj[field] || "")
}

const getQuotedObj = (content: unknown): { id?: string; text?: string; participant?: string } | null => {
	if (!content || typeof content !== "object") return null
	const obj = content as Record<string, unknown>
	if (obj.quoted && typeof obj.quoted === "object") {
		return obj.quoted as { id?: string; text?: string; participant?: string }
	}
	return null
}

interface ChatMessageBubbleProps {
	msg: ChatMessage
	onReplyTo: (msg: ChatMessage) => void
}

export const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = ({
	msg,
	onReplyTo,
}) => {
	const [isHovered, setIsHovered] = useState(false)
	const quotedObj = getQuotedObj(msg.content)

	const scrollToQuoted = (quotedId: string) => {
		const el = document.getElementById(`msg-${quotedId}`)
		if (el) {
			el.scrollIntoView({ behavior: "smooth", block: "center" })
			el.style.transition = "background 0.3s ease"
			const origBg = el.style.background
			el.style.background = "rgba(0, 242, 254, 0.3)"
			setTimeout(() => {
				el.style.background = origBg
			}, 1200)
		}
	}

	return (
		<div
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			style={{
				alignSelf: msg.fromMe ? "flex-end" : "flex-start",
				maxWidth: "75%",
				display: "flex",
				alignItems: "center",
				gap: "8px",
				flexDirection: msg.fromMe ? "row" : "row-reverse",
			}}
		>
			{/* Smooth Fade Reply Button */}
			<button
				type="button"
				onClick={() => onReplyTo(msg)}
				title="Reply to message"
				style={{
					opacity: isHovered ? 1 : 0,
					pointerEvents: isHovered ? "auto" : "none",
					transition: "opacity 0.15s ease",
					background: "rgba(15, 23, 42, 0.85)",
					border: "1px solid var(--border-color)",
					color: "#38bdf8",
					borderRadius: "50%",
					width: "28px",
					height: "28px",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					cursor: "pointer",
					flexShrink: 0,
					boxShadow: "0 2px 8px rgba(0, 0, 0, 0.4)",
				}}
			>
				<Reply size={14} />
			</button>

			{/* Main Message Bubble */}
			<div
				id={`msg-${msg.id}`}
				style={{
					flex: 1,
					padding: "12px 16px",
					borderRadius: msg.fromMe ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
					background: msg.fromMe
						? "linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)"
						: "rgba(255, 255, 255, 0.08)",
					color: msg.fromMe ? "#040914" : "var(--text-main)",
					border: msg.fromMe ? "none" : "1px solid var(--border-color)",
					boxShadow: msg.fromMe ? "0 4px 15px rgba(0, 242, 254, 0.2)" : "none",
					transition: "background 0.2s ease",
				}}
			>
				{!msg.fromMe && (
					<span style={{ fontSize: "0.72rem", fontWeight: 700, display: "block", marginBottom: "4px", color: msg.jid.endsWith("@g.us") ? "var(--primary-cyan)" : "inherit", opacity: 0.9 }}>
						{msg.pushName || (msg.sender ? `+${msg.sender.split("@")[0]}` : "User")}
					</span>
				)}

				{/* Quoted Message Render Box */}
				{quotedObj && (
					<div
						onClick={() => quotedObj.id && scrollToQuoted(quotedObj.id)}
						style={{
							background: msg.fromMe ? "rgba(0, 0, 0, 0.15)" : "rgba(0, 242, 254, 0.1)",
							borderLeft: "3px solid " + (msg.fromMe ? "#040914" : "var(--primary-cyan)"),
							borderRadius: "6px",
							padding: "6px 10px",
							marginBottom: "8px",
							cursor: "pointer",
							fontSize: "0.78rem",
						}}
					>
						<span style={{ fontWeight: 600, display: "block", fontSize: "0.72rem", opacity: 0.85 }}>
							{quotedObj.participant ? quotedObj.participant.split("@")[0] : "Quoted Message"}
						</span>
						<span style={{ fontStyle: "italic", opacity: 0.9 }}>
							{quotedObj.text || "Pesan"}
						</span>
					</div>
				)}

				{/* Message Content Renderers */}
				{msg.messageType === "text" && (
					<p style={{ fontSize: "0.9rem", lineHeight: "1.4", margin: 0, wordBreak: "break-word" }}>
						{getContentText(msg.content)}
					</p>
				)}

				{msg.messageType === "image" && (
					<div>
						<ImageIcon size={22} style={{ marginBottom: "4px" }} />
						<p style={{ fontSize: "0.85rem", fontStyle: "italic", margin: 0 }}>
							[Photo]: {getContentText(msg.content)}
						</p>
					</div>
				)}

				{msg.messageType === "video" && (
					<div>
						<Video size={22} style={{ marginBottom: "4px" }} />
						<p style={{ fontSize: "0.85rem", fontStyle: "italic", margin: 0 }}>
							[Video]: {getContentText(msg.content)}
						</p>
					</div>
				)}

				{msg.messageType === "audio" && (
					<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
						<Music size={22} />
						<span style={{ fontSize: "0.85rem", fontWeight: 500 }}>🎵 Voice Note / Audio</span>
					</div>
				)}

				{msg.messageType === "sticker" && (
					<div style={{ padding: "4px" }}>
						<img
							src={
								(msg.content?.mediaData as string) ||
								`${API_BASE_URL}/api/agents/${msg.agentId}/messages/${msg.id}/media`
							}
							alt="Sticker"
							style={{
								width: "140px",
								height: "140px",
								objectFit: "contain",
								display: "block",
								borderRadius: "8px",
							}}
							onError={(e) => {
								e.currentTarget.style.display = "none"
								const parent = e.currentTarget.parentElement
								if (parent) {
									const fallback = parent.querySelector(".sticker-fallback") as HTMLElement
									if (fallback) fallback.style.display = "flex"
								}
							}}
						/>
						<div className="sticker-fallback" style={{ display: "none", alignItems: "center", gap: "8px" }}>
							<Smile size={24} color={msg.fromMe ? "#040914" : "#f59e0b"} />
							<span style={{ fontSize: "0.85rem", fontWeight: 600 }}>🧩 Sticker</span>
						</div>
					</div>
				)}

				{msg.messageType === "document" && (
					<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
						<FileText size={22} />
						<div>
							<span style={{ fontSize: "0.85rem", fontWeight: 600, display: "block" }}>
								📄 {getMediaField(msg.content, "fileName") || "Document"}
							</span>
							{getContentText(msg.content) && (
								<span style={{ fontSize: "0.75rem", opacity: 0.8 }}>
									{getContentText(msg.content)}
								</span>
							)}
						</div>
					</div>
				)}

				{msg.messageType === "location" && (
					<div>
						<MapPin size={20} style={{ marginBottom: "4px" }} />
						<p style={{ fontSize: "0.85rem", margin: 0 }}>
							📍 [Location]: {getMediaField(msg.content, "degreesLatitude")}, {getMediaField(msg.content, "degreesLongitude")}
						</p>
					</div>
				)}

				{msg.messageType === "contact" && (
					<div>
						<User size={20} style={{ marginBottom: "4px" }} />
						<p style={{ fontSize: "0.85rem", margin: 0 }}>
							👤 [Contact]: {getMediaField(msg.content, "displayName")}
						</p>
					</div>
				)}

				<span style={{ fontSize: "0.68rem", opacity: 0.65, display: "block", textAlign: "right", marginTop: "6px" }}>
					{new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
				</span>
			</div>
		</div>
	)
}
