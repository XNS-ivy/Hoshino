import React from "react"
import { Bot, Plus } from "lucide-react"
import type { Agent } from "../../types"
import { AgentCard } from "./AgentCard"

interface AgentGridProps {
	agents: Agent[]
	isLoading: boolean
	onSelect: (agent: Agent) => void
	onOpenChat: (agent: Agent) => void
	onOpenSettings: (agent: Agent) => void
	onReconnect: (agentId: string, phoneNumber?: string) => void
	onDeleteConfirm: (agent: Agent) => void
	onOpenCreateModal: () => void
}

export const AgentGrid: React.FC<AgentGridProps> = ({
	agents,
	isLoading,
	onSelect,
	onOpenChat,
	onOpenSettings,
	onReconnect,
	onDeleteConfirm,
	onOpenCreateModal,
}) => {
	return (
		<>
			{/* Header */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: "16px",
				}}
			>
				<h2 style={{ fontSize: "1.2rem", fontWeight: 600 }}>WhatsApp Agent List</h2>
				<span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
					Auto-refreshing every 3 seconds
				</span>
			</div>

			{/* Empty State */}
			{!isLoading && agents.length === 0 && (
				<div
					className="glass-panel"
					style={{
						padding: "60px 20px",
						textAlign: "center",
						color: "var(--text-muted)",
					}}
				>
					<Bot size={48} style={{ opacity: 0.3, marginBottom: "16px" }} />
					<h3 style={{ color: "var(--text-main)", marginBottom: "8px" }}>No Agents Available</h3>
					<p style={{ fontSize: "0.9rem", marginBottom: "20px" }}>
						Click the button below to create and connect a new WhatsApp agent.
					</p>
					<button
						type="button"
						onClick={onOpenCreateModal}
						className="gradient-btn"
					>
						<Plus size={18} /> Create First Agent
					</button>
				</div>
			)}

			{/* Grid Layout */}
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
					gap: "20px",
				}}
			>
				{agents.map((agent) => (
					<AgentCard
						key={agent.agentId}
						agent={agent}
						onSelect={onSelect}
						onOpenChat={onOpenChat}
						onOpenSettings={onOpenSettings}
						onReconnect={onReconnect}
						onDeleteConfirm={onDeleteConfirm}
					/>
				))}
			</div>
		</>
	)
}
