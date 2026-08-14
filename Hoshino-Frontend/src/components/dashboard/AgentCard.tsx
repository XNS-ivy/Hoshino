import React from "react"
import {
	Activity,
	Key,
	MessageSquare,
	QrCode,
	RefreshCw,
	Settings,
	Smartphone,
	Trash2,
} from "lucide-react"
import type { Agent } from "../../types"

interface AgentCardProps {
	agent: Agent
	onSelect: (agent: Agent) => void
	onOpenChat: (agent: Agent) => void
	onOpenSettings: (agent: Agent) => void
	onReconnect: (agentId: string, phoneNumber?: string) => void
	onDeleteConfirm: (agent: Agent) => void
}

export const AgentCard: React.FC<AgentCardProps> = ({
	agent,
	onSelect,
	onOpenChat,
	onOpenSettings,
	onReconnect,
	onDeleteConfirm,
}) => {
	return (
		<div className="glass-card" style={{ padding: "20px" }}>
			{/* Card Header */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "flex-start",
					marginBottom: "14px",
				}}
			>
				<div>
					<h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "4px" }}>
						{agent.name}
					</h3>
					<span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
						ID: {agent.agentId}
					</span>
				</div>

				{/* Status Badge */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: "6px",
						padding: "4px 10px",
						borderRadius: "12px",
						background: "rgba(255, 255, 255, 0.05)",
						border: "1px solid var(--border-color)",
						fontSize: "0.78rem",
						fontWeight: 500,
						textTransform: "capitalize",
					}}
				>
					<span className={`status-dot ${agent.status}`} />
					<span>{agent.status.replace("_", " ")}</span>
				</div>
			</div>

			{/* Card Info */}
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: "8px",
					fontSize: "0.85rem",
					color: "var(--text-muted)",
					marginBottom: "20px",
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
					<Smartphone size={15} />
					<span>{agent.phoneNumber || "No phone number attached"}</span>
				</div>

				<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
					<Activity size={15} />
					<span>
						Last update:{" "}
						{agent.updatedAt
							? new Date(agent.updatedAt).toLocaleTimeString()
							: "Just now"}
					</span>
				</div>
			</div>

			{/* Pairing Code / QR Code Quick View Action */}
			{(agent.status === "pairing_code" || agent.status === "qr_code") && (
				<div
					style={{
						background: "rgba(0, 242, 254, 0.05)",
						border: "1px dashed rgba(0, 242, 254, 0.3)",
						borderRadius: "10px",
						padding: "12px",
						marginBottom: "16px",
						textAlign: "center",
					}}
				>
					<p style={{ fontSize: "0.8rem", color: "var(--primary-cyan)", marginBottom: "8px", fontWeight: 500 }}>
						{agent.status === "pairing_code"
							? "🔑 Pairing Code Ready"
							: "📷 QR Code Ready"}
					</p>
					<button
						type="button"
						onClick={() => onSelect(agent)}
						className="secondary-btn"
						style={{ width: "100%", justifyContent: "center", fontSize: "0.85rem" }}
					>
						{agent.status === "pairing_code" ? <Key size={15} /> : <QrCode size={15} />}
						View Login Code
					</button>
				</div>
			)}

			{/* Card Footer Actions */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "8px",
					borderTop: "1px solid var(--border-color)",
					paddingTop: "14px",
					flexWrap: "wrap",
				}}
			>
				{agent.status === "connected" && (
					<button
						type="button"
						onClick={() => onOpenChat(agent)}
						className="gradient-btn"
						style={{ fontSize: "0.8rem", padding: "6px 10px" }}
					>
						<MessageSquare size={13} />
						Chat
					</button>
				)}

				<button
					type="button"
					onClick={() => onOpenSettings(agent)}
					className="secondary-btn"
					style={{ fontSize: "0.8rem", padding: "6px 10px" }}
				>
					<Settings size={13} />
					Settings
				</button>

				<button
					type="button"
					onClick={() => onReconnect(agent.agentId, agent.phoneNumber)}
					className="secondary-btn"
					style={{ fontSize: "0.8rem", padding: "6px 10px" }}
				>
					<RefreshCw size={13} />
					Reconnect
				</button>

				<button
					type="button"
					onClick={() => onDeleteConfirm(agent)}
					className="danger-btn"
					style={{ fontSize: "0.8rem", padding: "6px 10px" }}
				>
					<Trash2 size={13} />
					Delete
				</button>
			</div>
		</div>
	)
}
