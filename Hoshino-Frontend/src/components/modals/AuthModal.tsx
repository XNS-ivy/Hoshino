import React from "react"
import { CheckCircle2, Clock, X } from "lucide-react"
import type { Agent } from "../../types"
import { PairingCodeGuide } from "./PairingCodeGuide"
import { QRCodeGuide } from "./QRCodeGuide"

interface AuthModalProps {
	agent: Agent | null
	onClose: () => void
}

export const AuthModal: React.FC<AuthModalProps> = ({ agent, onClose }) => {
	if (!agent) return null

	return (
		<div
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose()
			}}
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				background: "rgba(0, 0, 0, 0.75)",
				backdropFilter: "blur(8px)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 100,
				padding: "20px",
			}}
		>
			<div
				className="glass-panel"
				style={{
					width: "100%",
					maxWidth: "480px",
					padding: "28px",
					background: "var(--bg-card)",
					textAlign: "center",
				}}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						marginBottom: "20px",
					}}
				>
					<h3 style={{ fontSize: "1.1rem", fontWeight: 600 }}>
						WhatsApp Authentication: {agent.name}
					</h3>
					<button
						type="button"
						onClick={onClose}
						style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
					>
						<X size={20} />
					</button>
				</div>

				{/* Case 1: Pairing Code Available */}
				{agent.pairingCode && <PairingCodeGuide pairingCode={agent.pairingCode} />}

				{/* Case 2: QR Code Available */}
				{agent.qrCode && !agent.pairingCode && <QRCodeGuide qrCode={agent.qrCode} />}

				{/* Case 3: Already Connected or Waiting */}
				{!agent.pairingCode && !agent.qrCode && (
					<div style={{ padding: "30px 10px" }}>
						{agent.status === "connected" ? (
							<>
								<CheckCircle2 size={48} color="var(--status-green)" style={{ marginBottom: "12px" }} />
								<h4 style={{ color: "var(--status-green)", marginBottom: "8px" }}>Already Connected!</h4>
								<p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
									Agent {agent.name} is successfully connected to WhatsApp.
								</p>
							</>
						) : (
							<>
								<Clock size={48} color="var(--status-amber)" style={{ marginBottom: "12px" }} />
								<h4 style={{ color: "var(--status-amber)", marginBottom: "8px" }}>Preparing Socket...</h4>
								<p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
									Please wait a moment, the backend is initializing socket and login credentials...
								</p>
							</>
						)}
					</div>
				)}

				<div style={{ marginTop: "24px" }}>
					<button
						type="button"
						onClick={onClose}
						className="secondary-btn"
						style={{ width: "100%", justifyContent: "center" }}
					>
						Close
					</button>
				</div>
			</div>
		</div>
	)
}
