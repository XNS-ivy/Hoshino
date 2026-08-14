import React, { useState } from "react"
import { MessageSquare, Plus } from "lucide-react"
import type { ChatSummary } from "../../types"
import { ChatItem } from "./ChatItem"

interface ChatSidebarProps {
	chats: ChatSummary[]
	activeJid: string | null
	isLoading: boolean
	onSelectChat: (jid: string) => void
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
	chats,
	activeJid,
	isLoading,
	onSelectChat,
}) => {
	const [newJidInput, setNewJidInput] = useState("")

	const handleStartNewChat = () => {
		if (!newJidInput.trim()) return
		let formatted = newJidInput.trim()
		if (!formatted.includes("@")) {
			formatted = `${formatted.replace(/[^0-9]/g, "")}@s.whatsapp.net`
		}
		onSelectChat(formatted)
		setNewJidInput("")
	}

	return (
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
						placeholder="New Phone Number (628...)"
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
						onClick={handleStartNewChat}
						className="gradient-btn"
						style={{ padding: "8px 12px" }}
						title="Start New Chat"
					>
						<Plus size={16} />
					</button>
				</div>
			</div>

			{/* Chats Items List */}
			<div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
				{isLoading && (
					<p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem", padding: "20px" }}>
						Loading messages...
					</p>
				)}

				{!isLoading && chats.length === 0 && (
					<div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem", padding: "40px 16px" }}>
						<MessageSquare size={32} style={{ opacity: 0.3, marginBottom: "8px" }} />
						<p>No chat conversations yet.</p>
					</div>
				)}

				{chats.map((chat) => (
					<ChatItem
						key={chat.jid}
						chat={chat}
						isActive={activeJid === chat.jid}
						onSelect={onSelectChat}
					/>
				))}
			</div>
		</div>
	)
}
