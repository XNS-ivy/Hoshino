import React from "react"
import { CheckCircle2, Clock, Key, Server } from "lucide-react"
import type { Agent } from "../../types"
import { MetricCard } from "./MetricCard"

interface MetricsSummaryProps {
	agents: Agent[]
}

export const MetricsSummary: React.FC<MetricsSummaryProps> = ({ agents }) => {
	const totalAgents = agents.length
	const connectedCount = agents.filter((a) => a.status === "connected").length
	const authRequiredCount = agents.filter(
		(a) => a.status === "pairing_code" || a.status === "qr_code",
	).length
	const disconnectedCount = agents.filter(
		(a) => a.status === "disconnected",
	).length

	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
				gap: "16px",
				marginBottom: "28px",
			}}
		>
			<MetricCard
				title="Total Agents"
				value={totalAgents}
				icon={<Server size={18} />}
				colorStyle="var(--text-main)"
			/>
			<MetricCard
				title="Connected"
				value={connectedCount}
				icon={<CheckCircle2 size={18} />}
				colorStyle="var(--status-green)"
			/>
			<MetricCard
				title="Auth Required (Pairing/QR)"
				value={authRequiredCount}
				icon={<Key size={18} />}
				colorStyle="var(--primary-cyan)"
			/>
			<MetricCard
				title="Disconnected"
				value={disconnectedCount}
				icon={<Clock size={18} />}
				colorStyle="var(--status-red)"
			/>
		</div>
	)
}
