import React from "react"

interface MetricCardProps {
	title: string
	value: number
	icon: React.ReactNode
	colorStyle?: string
}

export const MetricCard: React.FC<MetricCardProps> = ({
	title,
	value,
	icon,
	colorStyle = "var(--text-main)",
}) => {
	return (
		<div className="glass-card" style={{ padding: "20px 24px" }}>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					color: colorStyle,
					marginBottom: "8px",
				}}
			>
				<span style={{ fontSize: "0.88rem", fontWeight: 500 }}>{title}</span>
				{icon}
			</div>
			<div style={{ fontSize: "2rem", fontWeight: 700, color: colorStyle }}>
				{value}
			</div>
		</div>
	)
}
