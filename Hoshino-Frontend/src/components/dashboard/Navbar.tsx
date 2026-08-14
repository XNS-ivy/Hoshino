import React from "react"
import { Bot, Plus, RefreshCw } from "lucide-react"
import { BackendStatus } from "./BackendStatus"

interface NavbarProps {
	isOnline: boolean
	isLoading: boolean
	onRefresh: () => void
	onOpenCreateModal: () => void
}

export const Navbar: React.FC<NavbarProps> = ({
	isOnline,
	isLoading,
	onRefresh,
	onOpenCreateModal,
}) => {
	return (
		<header
			className="glass-panel"
			style={{
				margin: "20px 24px",
				padding: "16px 28px",
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				position: "sticky",
				top: "20px",
				zIndex: 50,
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
				<div
					style={{
						width: "42px",
						height: "42px",
						borderRadius: "12px",
						background: "linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						boxShadow: "0 0 20px rgba(0, 242, 254, 0.4)",
					}}
				>
					<Bot size={24} color="#040914" />
				</div>
				<div>
					<h1 style={{ fontSize: "1.3rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
						Hoshino <span className="gradient-text">Web Console</span>
					</h1>
					<p style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
						Multi-Instance WhatsApp Agent Manager
					</p>
				</div>
			</div>

			<div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
				<BackendStatus isOnline={isOnline} />

				<button
					type="button"
					onClick={onRefresh}
					className="secondary-btn"
					style={{ padding: "8px 14px" }}
				>
					<RefreshCw size={14} className={isLoading ? "spin" : ""} />
					Refresh
				</button>

				<button
					type="button"
					onClick={onOpenCreateModal}
					className="gradient-btn"
				>
					<Plus size={18} />
					Add Agent
				</button>
			</div>
		</header>
	)
}
