import React from "react"
import { User } from "lucide-react"
import { API_BASE_URL } from "../../services/api"
import type { ChatSummary } from "../../types"

interface ChatItemProps {
	chat: ChatSummary
	isActive: boolean
	onSelect: (jid: string) => void
}

export const ChatItem: React.FC<ChatItemProps> = ({
	chat,
	isActive,
	onSelect,
}) => {
	return (
		<div
			onClick={() => onSelect(chat.jid)}
			style={{
				padding: "12px",
				borderRadius: "10px",
				marginBottom: "4px",
				cursor: "pointer",
				background: isActive ? "rgba(0, 242, 254, 0.12)" : "transparent",
				border: isActive ? "1px solid rgba(0, 242, 254, 0.3)" : "1px solid transparent",
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
					overflow: "hidden",
					flexShrink: 0,
				}}
			>
				<img
					src={`${API_BASE_URL}/api/agents/${chat.agentId}/avatar?jid=${encodeURIComponent(chat.jid)}`}
					alt="Avatar"
					style={{ width: "100%", height: "100%", objectFit: "cover" }}
					onError={(e) => {
						e.currentTarget.style.display = "none"
						const sibling = e.currentTarget.nextElementSibling as HTMLElement
						if (sibling) sibling.style.display = "flex"
					}}
				/>
				<span style={{ display: "none" }}>
					{chat.name ? chat.name[0]?.toUpperCase() : <User size={18} />}
				</span>
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
	)
}
