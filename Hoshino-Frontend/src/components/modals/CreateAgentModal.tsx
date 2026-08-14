import React, { useState } from "react"
import { X } from "lucide-react"

interface CreateAgentModalProps {
	isOpen: boolean
	onClose: () => void
	onSubmit: (name: string, phoneNumber?: string) => Promise<void>
}

export const CreateAgentModal: React.FC<CreateAgentModalProps> = ({
	isOpen,
	onClose,
	onSubmit,
}) => {
	const [name, setName] = useState("")
	const [phoneNumber, setPhoneNumber] = useState("")
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [errorMessage, setErrorMessage] = useState<string | null>(null)

	if (!isOpen) return null

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!name.trim()) return

		setIsSubmitting(true)
		setErrorMessage(null)

		try {
			await onSubmit(name.trim(), phoneNumber.trim() || undefined)
			setName("")
			setPhoneNumber("")
			onClose()
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : "An error occurred")
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<div
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
					maxWidth: "460px",
					padding: "28px",
					background: "var(--bg-card)",
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
					<h3 style={{ fontSize: "1.2rem", fontWeight: 600 }}>Create New WhatsApp Agent</h3>
					<button
						type="button"
						onClick={onClose}
						style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
					>
						<X size={20} />
					</button>
				</div>

				{errorMessage && (
					<div
						style={{
							background: "rgba(239, 68, 68, 0.1)",
							border: "1px solid rgba(239, 68, 68, 0.3)",
							color: "#f87171",
							padding: "10px 14px",
							borderRadius: "8px",
							fontSize: "0.85rem",
							marginBottom: "16px",
						}}
					>
						{errorMessage}
					</div>
				)}

				<form onSubmit={handleSubmit}>
					<div style={{ marginBottom: "16px" }}>
						<label
							htmlFor="agent-name"
							style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "6px" }}
						>
							Agent Name / Session ID <span style={{ color: "var(--status-red)" }}>*</span>
						</label>
						<input
							id="agent-name"
							type="text"
							required
							placeholder="e.g. CS_Agent_1"
							value={name}
							onChange={(e) => setName(e.target.value)}
							style={{
								width: "100%",
								padding: "12px 14px",
								background: "rgba(0, 0, 0, 0.3)",
								border: "1px solid var(--border-color)",
								borderRadius: "10px",
								color: "var(--text-main)",
								outline: "none",
								fontSize: "0.95rem",
							}}
						/>
					</div>

					<div style={{ marginBottom: "24px" }}>
						<label
							htmlFor="phone-number"
							style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "6px" }}
						>
							WhatsApp Phone Number (Optional for Pairing Code)
						</label>
						<input
							id="phone-number"
							type="text"
							placeholder="e.g. 628123456789 (Leave blank to Scan QR)"
							value={phoneNumber}
							onChange={(e) => setPhoneNumber(e.target.value)}
							style={{
								width: "100%",
								padding: "12px 14px",
								background: "rgba(0, 0, 0, 0.3)",
								border: "1px solid var(--border-color)",
								borderRadius: "10px",
								color: "var(--text-main)",
								outline: "none",
								fontSize: "0.95rem",
							}}
						/>
						<span style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "6px", display: "block" }}>
							💡 If specified, the backend will generate an 8-digit Pairing Code. If left empty, a QR Code will be generated.
						</span>
					</div>

					<div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
						<button
							type="button"
							onClick={onClose}
							className="secondary-btn"
						>
							Cancel
						</button>

						<button
							type="submit"
							disabled={isSubmitting}
							className="gradient-btn"
						>
							{isSubmitting ? "Processing..." : "Create Agent"}
						</button>
					</div>
				</form>
			</div>
		</div>
	)
}
