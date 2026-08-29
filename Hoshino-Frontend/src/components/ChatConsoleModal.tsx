import React, { useCallback, useEffect, useRef, useState } from "react"
import { Bot, User, X } from "lucide-react"
import { API_BASE_URL } from "../services/api"
import type { Agent, ApiResponse, ChatMessage, ChatSummary, WSEvent } from "../types"
import { ChatInputFooter } from "./chat/ChatInputFooter"
import { ChatMessageList } from "./chat/ChatMessageList"
import { ChatSidebar } from "./chat/ChatSidebar"
import type { QuotedTarget } from "./chat/QuotedPreviewBar"

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

interface ChatConsoleModalProps {
	agent: Agent
	onClose: () => void
}

export const ChatConsoleModal: React.FC<ChatConsoleModalProps> = ({
	agent,
	onClose,
}) => {
	const [chats, setChats] = useState<ChatSummary[]>([])
	const [activeJid, setActiveJid] = useState<string | null>(null)
	const activeJidRef = useRef<string | null>(null)
	const [messages, setMessages] = useState<ChatMessage[]>([])
	const [isLoadingChats, setIsLoadingChats] = useState(true)
	const [isLoadingMessages, setIsLoadingMessages] = useState(false)
	const [isSending, setIsSending] = useState(false)
	const [quotedTarget, setQuotedTarget] = useState<QuotedTarget | null>(null)

	const fetchChats = useCallback(async () => {
		try {
			const res = await fetch(`${API_BASE_URL}/api/agents/${agent.agentId}/chats`)
			const json: ApiResponse<ChatSummary[]> = await res.json()
			if (json.success && json.data) setChats(json.data)
		} catch (err) {
			console.error("Failed to fetch chats:", err)
		} finally {
			setIsLoadingChats(false)
		}
	}, [agent.agentId])

	const fetchMessages = useCallback(async (jid: string) => {
		setIsLoadingMessages(true)
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/agents/${agent.agentId}/chats/${encodeURIComponent(jid)}/messages`,
			)
			const json: ApiResponse<ChatMessage[]> = await res.json()
			if (json.success && json.data) setMessages(json.data)
		} catch (err) {
			console.error("Failed to fetch messages:", err)
		} finally {
			setIsLoadingMessages(false)
		}
	}, [agent.agentId])

	useEffect(() => {
		fetchChats()
	}, [fetchChats])

	useEffect(() => {
		activeJidRef.current = activeJid
		setQuotedTarget(null)
		if (activeJid) fetchMessages(activeJid)
	}, [activeJid, fetchMessages])

	// WebSocket Realtime Handler
	useEffect(() => {
		const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:"
		const wsHost = window.location.hostname || "localhost"
		const wsUrl = `${wsProtocol}//${wsHost}:3040/api/agents/${agent.agentId}/ws`
		const ws = new WebSocket(wsUrl)

		ws.onmessage = (event) => {
			try {
				const data: WSEvent = JSON.parse(event.data)
				if (data.type === "message_new") {
					const newMsg = data.payload as ChatMessage
					fetchChats()
					if (activeJidRef.current && newMsg.jid === activeJidRef.current) {
						setMessages((prev) => {
							if (prev.some((m) => m.id === newMsg.id)) {
								return prev.map((m) => (m.id === newMsg.id ? newMsg : m))
							}
							return [...prev, newMsg]
						})
					}
				}
			} catch (e) {
				console.error("Error parsing WS event:", e)
			}
		}

		return () => ws.close()
	}, [agent.agentId, fetchChats])

	const handleReplyToMessage = (msg: ChatMessage) => {
		const textSnippet = getContentText(msg.content) || msg.messageType.toUpperCase()
		const senderName = msg.fromMe
			? "You"
			: msg.pushName || (msg.sender ? msg.sender.split("@")[0] : "User")

		setQuotedTarget({
			id: msg.id,
			senderName,
			text: textSnippet,
		})
	}

	const handleSendMessage = async (payload: Record<string, unknown>) => {
		if (!activeJid) return
		setIsSending(true)
		try {
			const res = await fetch(`${API_BASE_URL}/api/agents/${agent.agentId}/messages`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ...payload, recipient: activeJid }),
			})

			const json = await res.json()
			if (!res.ok || !json.success) throw new Error(json.message || "Failed to send")
			await fetchChats()
		} catch (err) {
			alert(`Failed to send message: ${err}`)
		} finally {
			setIsSending(false)
		}
	}

	return (
		<div
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				background: "rgba(0, 0, 0, 0.82)",
				backdropFilter: "blur(10px)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 120,
				padding: "20px",
			}}
		>
			<div
				className="glass-panel"
				style={{
					width: "100%",
					maxWidth: "1050px",
					height: "85vh",
					display: "flex",
					flexDirection: "column",
					background: "var(--bg-card)",
					overflow: "hidden",
				}}
			>
				{/* Modal Header */}
				<div
					style={{
						padding: "16px 24px",
						borderBottom: "1px solid var(--border-color)",
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
						<div
							style={{
								width: "36px",
								height: "36px",
								borderRadius: "10px",
								background: "linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
							}}
						>
							<Bot size={20} color="#040914" />
						</div>
						<div>
							<h3 style={{ fontSize: "1.1rem", fontWeight: 600 }}>
								Live Chat Console: {agent.name}
							</h3>
							<span style={{ fontSize: "0.78rem", color: "var(--status-green)", display: "flex", alignItems: "center", gap: "6px" }}>
								<span className="status-dot connected" /> Real-time WebSocket Connected
							</span>
						</div>
					</div>

					<button
						type="button"
						onClick={onClose}
						style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
					>
						<X size={22} />
					</button>
				</div>

				{/* Body */}
				<div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
					<ChatSidebar
						chats={chats}
						activeJid={activeJid}
						isLoading={isLoadingChats}
						onSelectChat={(jid) => setActiveJid(jid)}
					/>

					<div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
						{activeJid ? (
							<>
								<div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-color)", background: "rgba(0,0,0,0.15)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
									<div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
										<div
											style={{
												width: "36px",
												height: "36px",
												borderRadius: "50%",
												background: "rgba(255, 255, 255, 0.1)",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												overflow: "hidden",
												flexShrink: 0,
											}}
										>
											<img
												src={`${API_BASE_URL}/api/agents/${agent.agentId}/avatar?jid=${encodeURIComponent(activeJid)}`}
												alt="Avatar"
												style={{ width: "100%", height: "100%", objectFit: "cover" }}
												onError={(e) => {
													e.currentTarget.style.display = "none"
													const sibling = e.currentTarget.nextElementSibling as HTMLElement
													if (sibling) sibling.style.display = "flex"
												}}
											/>
											<span style={{ display: "none" }}>
												<User size={18} color="var(--primary-cyan)" />
											</span>
										</div>
										<div>
											<span style={{ fontWeight: 600, fontSize: "0.95rem", display: "block" }}>
												{chats.find((c) => c.jid === activeJid)?.name || activeJid}
											</span>
											{chats.find((c) => c.jid === activeJid)?.name && (
												<span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
													{activeJid}
												</span>
											)}
										</div>
									</div>
								</div>

								<ChatMessageList
									messages={messages}
									isLoading={isLoadingMessages}
									onReplyTo={handleReplyToMessage}
								/>

								<ChatInputFooter
									isSending={isSending}
									quotedTarget={quotedTarget}
									onCancelReply={() => setQuotedTarget(null)}
									onSendMessage={handleSendMessage}
								/>
							</>
						) : (
							<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
								<Bot size={48} style={{ opacity: 0.3, marginBottom: "12px" }} />
								<p>Select a conversation on the left or type a new phone number to start messaging.</p>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
