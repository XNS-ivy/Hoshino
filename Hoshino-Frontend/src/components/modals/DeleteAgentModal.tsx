import React, { useState } from "react"
import { AlertTriangle } from "lucide-react"
import type { Agent } from "../../types"

interface DeleteAgentModalProps {
	agent: Agent | null
	onClose: () => void
	onConfirmDelete: () => Promise<void>
}

export const DeleteAgentModal: React.FC<DeleteAgentModalProps> = ({
	agent,
	onClose,
	onConfirmDelete,
}) => {
	const [isDeleting, setIsDeleting] = useState(false)

	if (!agent) return null

	const handleConfirm = async () => {
		setIsDeleting(true)
		try {
			await onConfirmDelete()
		} finally {
			setIsDeleting(false)
		}
	}

	return (
		<div
			onClick={(e) => {
				if (e.target === e.currentTarget && !isDeleting) onClose()
			}}
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				background: "rgba(0, 0, 0, 0.8)",
				backdropFilter: "blur(8px)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 110,
				padding: "20px",
			}}
		>
			<div
				className="glass-panel"
				style={{
					width: "100%",
					maxWidth: "420px",
					padding: "28px",
					background: "var(--bg-card)",
					textAlign: "center",
				}}
			>
				<div
					style={{
						width: "54px",
						height: "54px",
						borderRadius: "50%",
						background: "rgba(239, 68, 68, 0.15)",
						border: "1px solid rgba(239, 68, 68, 0.3)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						margin: "0 auto 16px auto",
					}}
				>
					<AlertTriangle size={28} color="var(--status-red)" />
				</div>

				<h3 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "8px" }}>
					Delete Agent Permanently?
				</h3>

				<p style={{ fontSize: "0.88rem", color: "var(--text-muted)", marginBottom: "24px", lineHeight: "1.4" }}>
					Agent <strong style={{ color: "var(--text-main)" }}>{agent.name}</strong> and all authentication keys in PostgreSQL will be permanently deleted.
				</p>

				<div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
					<button
						type="button"
						disabled={isDeleting}
						onClick={onClose}
						className="secondary-btn"
						style={{ flex: 1, justifyContent: "center" }}
					>
						Cancel
					</button>

					<button
						type="button"
						disabled={isDeleting}
						onClick={handleConfirm}
						className="danger-btn"
						style={{ flex: 1, justifyContent: "center", padding: "10px 18px", fontSize: "0.9rem" }}
					>
						{isDeleting ? "Deleting..." : "Yes, Delete Agent"}
					</button>
				</div>
			</div>
		</div>
	)
}
