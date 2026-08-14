import React, { useState } from "react"
import { Send } from "lucide-react"
import { QuotedPreviewBar, type QuotedTarget } from "./QuotedPreviewBar"

interface ChatInputFooterProps {
	isSending: boolean
	quotedTarget: QuotedTarget | null
	onCancelReply: () => void
	onSendMessage: (payload: Record<string, unknown>) => Promise<void>
}

export const ChatInputFooter: React.FC<ChatInputFooterProps> = ({
	isSending,
	quotedTarget,
	onCancelReply,
	onSendMessage,
}) => {
	const [sendType, setSendType] = useState<"text" | "image" | "location" | "contact">("text")
	const [textInput, setTextInput] = useState("")
	const [mediaUrlInput, setMediaUrlInput] = useState("")
	const [latInput, setLatInput] = useState("")
	const [lngInput, setLngInput] = useState("")
	const [contactNameInput, setContactNameInput] = useState("")
	const [contactPhoneInput, setContactPhoneInput] = useState("")

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()

		const payload: Record<string, unknown> = { type: sendType }
		if (quotedTarget?.id) {
			payload.quotedMsgId = quotedTarget.id
		}

		if (sendType === "text") {
			if (!textInput.trim()) return
			payload.text = textInput.trim()
		} else if (sendType === "image") {
			if (!mediaUrlInput.trim()) return
			payload.mediaUrl = mediaUrlInput.trim()
			payload.text = textInput.trim() || undefined
		} else if (sendType === "location") {
			payload.location = {
				degreesLatitude: Number.parseFloat(latInput) || -6.2,
				degreesLongitude: Number.parseFloat(lngInput) || 106.81,
			}
		} else if (sendType === "contact") {
			payload.contact = {
				displayName: contactNameInput.trim() || "Contact",
				phoneNumber: contactPhoneInput.trim(),
			}
		}

		await onSendMessage(payload)
		setTextInput("")
		setMediaUrlInput("")
		onCancelReply()
	}

	return (
		<div style={{ borderTop: "1px solid var(--border-color)", background: "rgba(0,0,0,0.2)" }}>
			{/* Quoted Message Preview Bar */}
			<QuotedPreviewBar quotedTarget={quotedTarget} onCancelReply={onCancelReply} />

			<form onSubmit={handleSubmit} style={{ padding: "16px" }}>
				{/* Message Type Selector Buttons */}
				<div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
					{(["text", "image", "location", "contact"] as const).map((type) => (
						<button
							key={type}
							type="button"
							onClick={() => setSendType(type)}
							style={{
								padding: "4px 10px",
								borderRadius: "6px",
								fontSize: "0.75rem",
								textTransform: "capitalize",
								background: sendType === type ? "var(--primary-cyan)" : "rgba(255,255,255,0.05)",
								color: sendType === type ? "#000" : "var(--text-muted)",
								border: "none",
								cursor: "pointer",
							}}
						>
							{type === "image" ? "Image URL" : type}
						</button>
					))}
				</div>

				{/* Form Inputs based on selected type */}
				{sendType === "text" && (
					<div style={{ display: "flex", gap: "10px" }}>
						<input
							type="text"
							placeholder="Type a message..."
							value={textInput}
							onChange={(e) => setTextInput(e.target.value)}
							style={{
								flex: 1,
								padding: "12px 14px",
								background: "rgba(0,0,0,0.4)",
								border: "1px solid var(--border-color)",
								borderRadius: "10px",
								color: "var(--text-main)",
								outline: "none",
							}}
						/>
						<button type="submit" disabled={isSending} className="gradient-btn" style={{ padding: "12px 20px" }}>
							<Send size={18} />
						</button>
					</div>
				)}

				{sendType === "image" && (
					<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
						<input
							type="text"
							placeholder="Image URL (http://...)"
							value={mediaUrlInput}
							onChange={(e) => setMediaUrlInput(e.target.value)}
							style={{ padding: "10px", background: "rgba(0,0,0,0.4)", border: "1px solid var(--border-color)", borderRadius: "8px", color: "#fff" }}
						/>
						<div style={{ display: "flex", gap: "8px" }}>
							<input
								type="text"
								placeholder="Photo caption..."
								value={textInput}
								onChange={(e) => setTextInput(e.target.value)}
								style={{ flex: 1, padding: "10px", background: "rgba(0,0,0,0.4)", border: "1px solid var(--border-color)", borderRadius: "8px", color: "#fff" }}
							/>
							<button type="submit" disabled={isSending} className="gradient-btn">Send Image</button>
						</div>
					</div>
				)}

				{sendType === "location" && (
					<div style={{ display: "flex", gap: "8px" }}>
						<input
							type="text"
							placeholder="Latitude (-6.2)"
							value={latInput}
							onChange={(e) => setLatInput(e.target.value)}
							style={{ flex: 1, padding: "10px", background: "rgba(0,0,0,0.4)", border: "1px solid var(--border-color)", borderRadius: "8px", color: "#fff" }}
						/>
						<input
							type="text"
							placeholder="Longitude (106.8)"
							value={lngInput}
							onChange={(e) => setLngInput(e.target.value)}
							style={{ flex: 1, padding: "10px", background: "rgba(0,0,0,0.4)", border: "1px solid var(--border-color)", borderRadius: "8px", color: "#fff" }}
						/>
						<button type="submit" disabled={isSending} className="gradient-btn">Send Location</button>
					</div>
				)}

				{sendType === "contact" && (
					<div style={{ display: "flex", gap: "8px" }}>
						<input
							type="text"
							placeholder="Contact Name"
							value={contactNameInput}
							onChange={(e) => setContactNameInput(e.target.value)}
							style={{ flex: 1, padding: "10px", background: "rgba(0,0,0,0.4)", border: "1px solid var(--border-color)", borderRadius: "8px", color: "#fff" }}
						/>
						<input
							type="text"
							placeholder="Phone Number (628...)"
							value={contactPhoneInput}
							onChange={(e) => setContactPhoneInput(e.target.value)}
							style={{ flex: 1, padding: "10px", background: "rgba(0,0,0,0.4)", border: "1px solid var(--border-color)", borderRadius: "8px", color: "#fff" }}
						/>
						<button type="submit" disabled={isSending} className="gradient-btn">Send Contact</button>
					</div>
				)}
			</form>
		</div>
	)
}
