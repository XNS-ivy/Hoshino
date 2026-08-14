import React from "react"
import { Wifi, WifiOff } from "lucide-react"

interface BackendStatusProps {
	isOnline: boolean
}

export const BackendStatus: React.FC<BackendStatusProps> = ({ isOnline }) => {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: "8px",
				padding: "6px 14px",
				borderRadius: "20px",
				background: isOnline
					? "rgba(16, 185, 129, 0.1)"
					: "rgba(239, 68, 68, 0.1)",
				border: `1px solid ${
					isOnline ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)"
				}`,
				fontSize: "0.85rem",
				fontWeight: 500,
			}}
		>
			{isOnline ? (
				<>
					<Wifi size={14} color="var(--status-green)" />
					<span style={{ color: "var(--status-green)" }}>Backend Connected</span>
				</>
			) : (
				<>
					<WifiOff size={14} color="var(--status-red)" />
					<span style={{ color: "var(--status-red)" }}>Backend Offline</span>
				</>
			)}
		</div>
	)
}
