import React from "react"
import { QRCodeSVG } from "qrcode.react"

interface QRCodeGuideProps {
	qrCode: string
}

export const QRCodeGuide: React.FC<QRCodeGuideProps> = ({ qrCode }) => {
	return (
		<div>
			<p style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginBottom: "16px" }}>
				Scan this QR Code using WhatsApp on your phone:
			</p>

			<div
				style={{
					background: "#ffffff",
					padding: "16px",
					borderRadius: "16px",
					display: "inline-block",
					marginBottom: "20px",
				}}
			>
				<QRCodeSVG value={qrCode} size={220} />
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
				<strong>How to Scan:</strong>
				<ol style={{ paddingLeft: "18px", marginTop: "6px" }}>
					<li>Open WhatsApp on your smartphone.</li>
					<li>Go to <strong>Settings ➔ Linked Devices</strong>.</li>
					<li>Tap <strong>Link a Device</strong> and point your camera at the QR Code above.</li>
				</ol>
			</div>
		</div>
	)
}
