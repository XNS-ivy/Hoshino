import React, { useState } from "react"
import { Check, Copy } from "lucide-react"

interface PairingCodeGuideProps {
	pairingCode: string
}

export const PairingCodeGuide: React.FC<PairingCodeGuideProps> = ({
	pairingCode,
}) => {
	const [copied, setCopied] = useState(false)

	const copyToClipboard = () => {
		navigator.clipboard.writeText(pairingCode)
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}

	return (
		<div>
			<p style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginBottom: "16px" }}>
				Enter the following 8-digit code in WhatsApp on your phone:
			</p>

			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					gap: "12px",
					marginBottom: "20px",
				}}
			>
				<div className="pairing-code-box">{pairingCode}</div>
				<button
					type="button"
					onClick={copyToClipboard}
					className="secondary-btn"
					style={{ padding: "14px" }}
					title="Copy Pairing Code"
				>
					{copied ? <Check size={18} color="var(--status-green)" /> : <Copy size={18} />}
				</button>
			</div>

			<div
				style={{
					background: "rgba(255, 255, 255, 0.03)",
					border: "1px solid var(--border-color)",
					borderRadius: "12px",
					padding: "14px",
					textAlign: "left",
					fontSize: "0.82rem",
					color: "var(--text-muted)",
				}}
			>
				<strong>How to Connect:</strong>
				<ol style={{ paddingLeft: "18px", marginTop: "6px" }}>
					<li>Open WhatsApp on your smartphone.</li>
					<li>Go to <strong>Settings ➔ Linked Devices</strong>.</li>
					<li>Tap <strong>Link a Device</strong>.</li>
					<li>Tap <strong>Link with phone number instead</strong>.</li>
					<li>Enter the 8-digit code shown above.</li>
				</ol>
			</div>
		</div>
	)
}
