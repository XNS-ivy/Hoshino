import React from "react"
import { Reply, X } from "lucide-react"

export interface QuotedTarget {
	id: string
	senderName: string
	text: string
}

interface QuotedPreviewBarProps {
	quotedTarget: QuotedTarget | null
	onCancelReply: () => void
}

export const QuotedPreviewBar: React.FC<QuotedPreviewBarProps> = ({
	quotedTarget,
	onCancelReply,
}) => {
	if (!quotedTarget) return null

	return (
		<div
			style={{
				padding: "8px 14px",
				background: "rgba(0, 242, 254, 0.08)",
				borderLeft: "4px solid var(--primary-cyan)",
				borderTop: "1px solid var(--border-color)",
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				fontSize: "0.82rem",
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
				<Reply size={16} color="var(--primary-cyan)" />
				<div style={{ overflow: "hidden" }}>
					<span style={{ fontWeight: 600, color: "var(--primary-cyan)", display: "block" }}>
						Replying to {quotedTarget.senderName}
					</span>
					<span
						style={{
							color: "var(--text-muted)",
							whiteSpace: "nowrap",
							overflow: "hidden",
							textOverflow: "ellipsis",
							display: "block",
						}}
					>
						{quotedTarget.text}
					</span>
				</div>
			</div>

			<button
				type="button"
				onClick={onCancelReply}
				style={{
					background: "none",
					border: "none",
					color: "var(--text-muted)",
					cursor: "pointer",
					padding: "4px",
				}}
			>
				<X size={16} />
			</button>
		</div>
	)
}
