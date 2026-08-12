import { useEffect, useRef, useState } from "react"
import {
	AlertCircle,
	Bot,
	FileText,
	Image as ImageIcon,
	MapPin,
	MessageSquare,
	Plus,
	Send,
	User,
	X,
} from "lucide-react"
import type { Agent, ApiResponse, ChatMessage, ChatSummary, WSEvent } from "../types"

const API_BASE_URL = "http://localhost:3000"

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

interface ChatConsoleModalProps {
	agent: Agent
	onClose: () => void
}

export function ChatConsoleModal({ agent, onClose }: ChatConsoleModalProps) {
	const [chats, setChats] = useState<ChatSummary[]>([])
	const [activeJid, setActiveJid] = useState<string | null>(null)
	const activeJidRef = useRef<string | null>(null)
	const [messages, setMessages] = useState<ChatMessage[]>([])
	const [isLoadingChats, setIsLoadingChats] = useState(true)
	const [isLoadingMessages, setIsLoadingMessages] = useState(false)

	// New Chat modal state
	const [newJidInput, setNewJidInput] = useState("")

	// Send message inputs
	const [sendType, setSendType] = useState<"text" | "image" | "location" | "contact">("text")
	const [textInput, setTextInput] = useState("")
	const [mediaUrlInput, setMediaUrlInput] = useState("")
	const [latInput, setLatInput] = useState("")
	const [lngInput, setLngInput] = useState("")
	const [contactNameInput, setContactNameInput] = useState("")
	const [contactPhoneInput, setContactPhoneInput] = useState("")
	const [isSending, setIsSending] = useState(false)

	const messagesEndRef = useRef<HTMLDivElement>(null)

	// Scroll to bottom when messages update
	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
	}

	// Fetch chats list
	const fetchChats = async () => {
		try {
			const res = await fetch(`${API_BASE_URL}/api/agents/${agent.agentId}/chats`)
			const json: ApiResponse<ChatSummary[]> = await res.json()
			if (json.success && json.data) {
				setChats(json.data)
			}
		} catch (err) {
			console.error("Failed to fetch chats:", err)
		} finally {
			setIsLoadingChats(false)
		}
	}

	// Fetch messages for active JID
	const fetchMessages = async (jid: string) => {
		setIsLoadingMessages(true)
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/agents/${agent.agentId}/chats/${encodeURIComponent(jid)}/messages`,
			)
			const json: ApiResponse<ChatMessage[]> = await res.json()
			if (json.success && json.data) {
				setMessages(json.data)
				scrollToBottom()
			}
		} catch (err) {
			console.error("Failed to fetch messages:", err)
		} finally {
			setIsLoadingMessages(false)
		}
	}

	// Initial load
	useEffect(() => {
		fetchChats()
	}, [agent.agentId])

	// Fetch messages when active JID changes
	useEffect(() => {
		activeJidRef.current = activeJid
		if (activeJid) {
			fetchMessages(activeJid)
		}
	}, [activeJid])

	// Real-Time WebSocket Connection (Single persistent connection per agent session)
	useEffect(() => {
		const wsUrl = `ws://localhost:3000/api/agents/${agent.agentId}/ws`
		const ws = new WebSocket(wsUrl)

		ws.onmessage = (event) => {
			try {
				const data: WSEvent = JSON.parse(event.data)
				if (data.type === "message_new") {
					const newMsg = data.payload as ChatMessage
					// Update chats list
					fetchChats()

					// If new message is for currently active chat, append to messages list safely without duplicates
					if (activeJidRef.current && newMsg.jid === activeJidRef.current) {
						setMessages((prev) => {
							if (prev.some((m) => m.id === newMsg.id)) {
								return prev.map((m) => (m.id === newMsg.id ? newMsg : m))
							}
							return [...prev, newMsg]
						})
						setTimeout(scrollToBottom, 100)
					}
				}
			} catch (e) {
				console.error("Error parsing WS event:", e)
			}
		}

		return () => {
			ws.close()
		}
	}, [agent.agentId])

	// Handle Send Message
	const handleSendMessage = async (e: React.FormEvent) => {
		e.preventDefault()
		const recipient = activeJid || newJidInput.trim()
		if (!recipient) return

		setIsSending(true)
		try {
			const payload: Record<string, unknown> = {
				recipient,
				type: sendType,
			}

			if (sendType === "text") {
				if (!textInput.trim()) return
				payload.text = textInput.trim()
			} else if (sendType === "image") {
				if (!mediaUrlInput.trim()) return
				payload.mediaUrl = mediaUrlInput.trim()
				payload.text = textInput.trim() || undefined
			} else if (sendType === "location") {
				payload.location = {
					degreesLatitude: Number.parseFloat(latInput) || -6.2,
					degreesLongitude: Number.parseFloat(lngInput) || 106.81,
				}
			} else if (sendType === "contact") {
				payload.contact = {
					displayName: contactNameInput.trim() || "Kontak",
					phoneNumber: contactPhoneInput.trim(),
				}
			}

			const res = await fetch(`${API_BASE_URL}/api/agents/${agent.agentId}/messages`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			})

			const json = await res.json()
			if (!res.ok || !json.success) {
				throw new Error(json.message || "Gagal mengirim pesan")
			}

			// Clear input fields
			setTextInput("")
			setMediaUrlInput("")

			// Set active chat JID if starting new chat
			if (newJidInput.trim()) {
				let formattedJid = newJidInput.trim()
				if (!formattedJid.includes("@")) {
					formattedJid = `${formattedJid.replace(/[^0-9]/g, "")}@s.whatsapp.net`
				}
				setActiveJid(formattedJid)
				setNewJidInput("")
			}

			await fetchChats()
		} catch (err) {
			alert(`Gagal mengirim pesan: ${err}`)
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
				{/* Modal Top Bar */}
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

				{/* Modal Body: Left Chats Sidebar + Right Chat Panel */}
				<div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
					{/* Left Sidebar: Chats List */}
					<div
						style={{
							width: "320px",
							borderRight: "1px solid var(--border-color)",
							display: "flex",
							flexDirection: "column",
							background: "rgba(0, 0, 0, 0.2)",
						}}
					>
						<div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-color)" }}>
							<div style={{ display: "flex", gap: "8px" }}>
								<input
									type="text"
									placeholder="Nomor HP Baru (628...)"
									value={newJidInput}
									onChange={(e) => setNewJidInput(e.target.value)}
									style={{
										flex: 1,
										padding: "8px 12px",
										background: "rgba(0, 0, 0, 0.4)",
										border: "1px solid var(--border-color)",
										borderRadius: "8px",
										color: "var(--text-main)",
										fontSize: "0.85rem",
										outline: "none",
									}}
								/>
								<button
									type="button"
									onClick={() => {
										if (newJidInput.trim()) {
											let formatted = newJidInput.trim()
											if (!formatted.includes("@")) formatted = `${formatted.replace(/[^0-9]/g, "")}@s.whatsapp.net`
											setActiveJid(formatted)
										}
									}}
									className="gradient-btn"
									style={{ padding: "8px 12px" }}
									title="Mulai Chat Baru"
								>
									<Plus size={16} />
								</button>
							</div>
						</div>

						{/* Chats Items List */}
						<div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
							{isLoadingChats && (
								<p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem", padding: "20px" }}>
									Memuat pesan...
								</p>
							)}

							{!isLoadingChats && chats.length === 0 && (
								<div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem", padding: "40px 16px" }}>
									<MessageSquare size={32} style={{ opacity: 0.3, marginBottom: "8px" }} />
									<p>Belum ada obrolan.</p>
								</div>
							)}

							{chats.map((chat) => (
								<div
									key={chat.jid}
									onClick={() => setActiveJid(chat.jid)}
									style={{
										padding: "12px",
										borderRadius: "10px",
										marginBottom: "4px",
										cursor: "pointer",
										background: activeJid === chat.jid ? "rgba(0, 242, 254, 0.12)" : "transparent",
										border: activeJid === chat.jid ? "1px solid rgba(0, 242, 254, 0.3)" : "1px solid transparent",
										display: "flex",
										alignItems: "center",
										gap: "12px",
									}}
								>
									<div
										style={{
											width: "38px",
											height: "38px",
											borderRadius: "50%",
											background: "rgba(255, 255, 255, 0.1)",
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											fontWeight: 600,
											fontSize: "0.9rem",
										}}
									>
										{chat.name ? chat.name[0]?.toUpperCase() : <User size={18} />}
									</div>

									<div style={{ flex: 1, overflow: "hidden" }}>
										<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
											<span style={{ fontWeight: 600, fontSize: "0.88rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
												{chat.name || chat.jid.split("@")[0]}
											</span>
											{chat.unreadCount > 0 && (
												<span style={{ background: "var(--primary-cyan)", color: "#000", fontWeight: 700, fontSize: "0.7rem", padding: "2px 6px", borderRadius: "10px" }}>
													{chat.unreadCount}
												</span>
											)}
										</div>
										<span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>
											{chat.jid}
										</span>
									</div>
								</div>
							))}
						</div>
					</div>

					{/* Right Panel: Chat Messages & Input */}
					<div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
						{activeJid ? (
							<>
								{/* Chat Header */}
								<div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-color)", background: "rgba(0,0,0,0.15)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
									<div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
										<User size={18} color="var(--primary-cyan)" />
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

								{/* Messages Stream */}
								<div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
									{isLoadingMessages ? (
										<p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>Memuat riwayat chat...</p>
									) : messages.length === 0 ? (
										<p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>Belum ada riwayat pesan di chat ini.</p>
									) : (
										messages.map((msg) => (
											<div
												key={msg.id}
												style={{
													alignSelf: msg.fromMe ? "flex-end" : "flex-start",
													maxWidth: "70%",
													padding: "12px 16px",
													borderRadius: msg.fromMe ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
													background: msg.fromMe ? "linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)" : "rgba(255, 255, 255, 0.08)",
													color: msg.fromMe ? "#040914" : "var(--text-main)",
													border: msg.fromMe ? "none" : "1px solid var(--border-color)",
													boxShadow: msg.fromMe ? "0 4px 15px rgba(0, 242, 254, 0.2)" : "none",
												}}
											>
												{!msg.fromMe && msg.pushName && (
													<span style={{ fontSize: "0.72rem", fontWeight: 700, display: "block", marginBottom: "4px", opacity: 0.8 }}>
														{msg.pushName}
													</span>
												)}

												{/* Message Content Renderers */}
												{msg.messageType === "text" && (
													<p style={{ fontSize: "0.9rem", lineHeight: "1.4", margin: 0, wordBreak: "break-word" }}>
														{getContentText(msg.content)}
													</p>
												)}

												{msg.messageType === "image" && (
													<div>
														<ImageIcon size={24} style={{ marginBottom: "4px" }} />
														<p style={{ fontSize: "0.85rem", fontStyle: "italic", margin: 0 }}>
															[Foto]: {getContentText(msg.content)}
														</p>
													</div>
												)}

												{msg.messageType === "location" && (
													<div>
														<MapPin size={20} style={{ marginBottom: "4px" }} />
														<p style={{ fontSize: "0.85rem", margin: 0 }}>
															[Lokasi]: {getMediaField(msg.content, "degreesLatitude")}, {getMediaField(msg.content, "degreesLongitude")}
														</p>
													</div>
												)}

												{msg.messageType === "contact" && (
													<div>
														<User size={20} style={{ marginBottom: "4px" }} />
														<p style={{ fontSize: "0.85rem", margin: 0 }}>
															[Kontak]: {getMediaField(msg.content, "displayName")}
														</p>
													</div>
												)}

												<span style={{ fontSize: "0.68rem", opacity: 0.65, display: "block", textAlign: "right", marginTop: "6px" }}>
													{new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
												</span>
											</div>
										))
									)}
									<div ref={messagesEndRef} />
								</div>

								{/* Send Message Input Footer */}
								<form onSubmit={handleSendMessage} style={{ padding: "16px", borderTop: "1px solid var(--border-color)", background: "rgba(0,0,0,0.2)" }}>
									{/* Message Type Selector */}
									<div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
										<button
											type="button"
											onClick={() => setSendType("text")}
											style={{
												padding: "4px 10px",
												borderRadius: "6px",
												fontSize: "0.75rem",
												background: sendType === "text" ? "var(--primary-cyan)" : "rgba(255,255,255,0.05)",
												color: sendType === "text" ? "#000" : "var(--text-muted)",
												border: "none",
												cursor: "pointer",
											}}
										>
											Teks
										</button>
										<button
											type="button"
											onClick={() => setSendType("image")}
											style={{
												padding: "4px 10px",
												borderRadius: "6px",
												fontSize: "0.75rem",
												background: sendType === "image" ? "var(--primary-cyan)" : "rgba(255,255,255,0.05)",
												color: sendType === "image" ? "#000" : "var(--text-muted)",
												border: "none",
												cursor: "pointer",
											}}
										>
											Gambar URL
										</button>
										<button
											type="button"
											onClick={() => setSendType("location")}
											style={{
												padding: "4px 10px",
												borderRadius: "6px",
												fontSize: "0.75rem",
												background: sendType === "location" ? "var(--primary-cyan)" : "rgba(255,255,255,0.05)",
												color: sendType === "location" ? "#000" : "var(--text-muted)",
												border: "none",
												cursor: "pointer",
											}}
										>
											Lokasi
										</button>
										<button
											type="button"
											onClick={() => setSendType("contact")}
											style={{
												padding: "4px 10px",
												borderRadius: "6px",
												fontSize: "0.75rem",
												background: sendType === "contact" ? "var(--primary-cyan)" : "rgba(255,255,255,0.05)",
												color: sendType === "contact" ? "#000" : "var(--text-muted)",
												border: "none",
												cursor: "pointer",
											}}
										>
											Kontak
										</button>
									</div>

									{/* Type Inputs */}
									{sendType === "text" && (
										<div style={{ display: "flex", gap: "10px" }}>
											<input
												type="text"
												placeholder="Ketik pesan..."
												value={textInput}
												onChange={(e) => setTextInput(e.target.value)}
												style={{
													flex: 1,
													padding: "12px 14px",
													background: "rgba(0,0,0,0.4)",
													border: "1px solid var(--border-color)",
													borderRadius: "10px",
													color: "var(--text-main)",
													outline: "none",
												}}
											/>
											<button type="submit" disabled={isSending} className="gradient-btn" style={{ padding: "12px 20px" }}>
												<Send size={18} />
											</button>
										</div>
									)}

									{sendType === "image" && (
										<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
											<input
												type="text"
												placeholder="URL Gambar (http://...)"
												value={mediaUrlInput}
												onChange={(e) => setMediaUrlInput(e.target.value)}
												style={{ padding: "10px", background: "rgba(0,0,0,0.4)", border: "1px solid var(--border-color)", borderRadius: "8px", color: "#fff" }}
											/>
											<div style={{ display: "flex", gap: "8px" }}>
												<input
													type="text"
													placeholder="Caption foto..."
													value={textInput}
													onChange={(e) => setTextInput(e.target.value)}
													style={{ flex: 1, padding: "10px", background: "rgba(0,0,0,0.4)", border: "1px solid var(--border-color)", borderRadius: "8px", color: "#fff" }}
												/>
												<button type="submit" disabled={isSending} className="gradient-btn">Kirim Gambar</button>
											</div>
										</div>
									)}

									{sendType === "location" && (
										<div style={{ display: "flex", gap: "8px" }}>
											<input
												type="text"
												placeholder="Latitude (-6.2)"
												value={latInput}
												onChange={(e) => setLatInput(e.target.value)}
												style={{ flex: 1, padding: "10px", background: "rgba(0,0,0,0.4)", border: "1px solid var(--border-color)", borderRadius: "8px", color: "#fff" }}
											/>
											<input
												type="text"
												placeholder="Longitude (106.8)"
												value={lngInput}
												onChange={(e) => setLngInput(e.target.value)}
												style={{ flex: 1, padding: "10px", background: "rgba(0,0,0,0.4)", border: "1px solid var(--border-color)", borderRadius: "8px", color: "#fff" }}
											/>
											<button type="submit" disabled={isSending} className="gradient-btn">Kirim Lokasi</button>
										</div>
									)}

									{sendType === "contact" && (
										<div style={{ display: "flex", gap: "8px" }}>
											<input
												type="text"
												placeholder="Nama Kontak"
												value={contactNameInput}
												onChange={(e) => setContactNameInput(e.target.value)}
												style={{ flex: 1, padding: "10px", background: "rgba(0,0,0,0.4)", border: "1px solid var(--border-color)", borderRadius: "8px", color: "#fff" }}
											/>
											<input
												type="text"
												placeholder="Nomor HP (628...)"
												value={contactPhoneInput}
												onChange={(e) => setContactPhoneInput(e.target.value)}
												style={{ flex: 1, padding: "10px", background: "rgba(0,0,0,0.4)", border: "1px solid var(--border-color)", borderRadius: "8px", color: "#fff" }}
											/>
											<button type="submit" disabled={isSending} className="gradient-btn">Kirim Kontak</button>
										</div>
									)}
								</form>
							</>
						) : (
							<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
								<Bot size={48} style={{ opacity: 0.3, marginBottom: "12px" }} />
								<p>Pilih percakapan di sebelah kiri atau ketik nomor telepon baru untuk mulai kirim pesan.</p>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
