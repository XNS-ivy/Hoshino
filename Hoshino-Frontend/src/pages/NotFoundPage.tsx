import React from "react"
import { ArrowLeft, Bot } from "lucide-react"
import { useNavigate } from "react-router-dom"

export const NotFoundPage: React.FC = () => {
	const navigate = useNavigate()

	return (
		<div
			style={{
				padding: "100px 20px",
				textAlign: "center",
				color: "var(--text-muted)",
			}}
		>
			<Bot size={64} style={{ opacity: 0.3, marginBottom: "16px" }} />
			<h2 style={{ fontSize: "2rem", color: "var(--text-main)", marginBottom: "8px" }}>404 - Page Not Found</h2>
			<p style={{ fontSize: "0.95rem", marginBottom: "24px" }}>
				The requested page does not exist or has been moved.
			</p>
			<button type="button" onClick={() => navigate("/")} className="gradient-btn">
				<ArrowLeft size={18} /> Return to Dashboard
			</button>
		</div>
	)
}
