import React, { useState } from "react"
import { Plus } from "lucide-react"
import { ContactSelector, type ContactItem } from "./ContactSelector"

export interface AutoDeleteItem {
	agentId: string
	userJid: string
	createdAt: string
}

interface AutoDeleteTabProps {
	autoDeleteList: AutoDeleteItem[]
	contacts: ContactItem[]
	onAddAutoDelete: (userJid: string) => Promise<void>
	onRemoveAutoDelete: (userJid: string) => Promise<void>
}

export const AutoDeleteTab: React.FC<AutoDeleteTabProps> = ({
	autoDeleteList,
	contacts,
	onAddAutoDelete,
	onRemoveAutoDelete,
}) => {
	const [newAutoDeleteJid, setNewAutoDeleteJid] = useState("")

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!newAutoDeleteJid.trim()) return
		await onAddAutoDelete(newAutoDeleteJid.trim())
		setNewAutoDeleteJid("")
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
			<form
				onSubmit={handleSubmit}
				style={{
					background: "rgba(255, 255, 255, 0.03)",
					border: "1px solid var(--border-color)",
					borderRadius: "12px",
					padding: "16px",
					display: "flex",
					flexDirection: "column",
					gap: "12px",
				}}
			>
				<ContactSelector
					contacts={contacts}
					onSelectJid={(jid) => setNewAutoDeleteJid(jid)}
					themeColor="#fbbf24"
				/>

				<div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
					<div style={{ flex: 1 }}>
						<label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "6px" }}>
							Target User JID / LID
						</label>
						<input
							type="text"
							value={newAutoDeleteJid}
							onChange={(e) => setNewAutoDeleteJid(e.target.value)}
							placeholder="e.g. 628123456789@s.whatsapp.net"
							style={{
								width: "100%",
								background: "rgba(0, 0, 0, 0.3)",
								border: "1px solid var(--border-color)",
								borderRadius: "8px",
								padding: "8px 12px",
								fontSize: "0.85rem",
								color: "var(--text-main)",
							}}
						/>
					</div>

					<button type="submit" className="secondary-btn" style={{ fontSize: "0.85rem", padding: "8px 16px", borderColor: "#f59e0b", color: "#fbbf24" }}>
						<Plus size={15} /> Add Target
					</button>
				</div>
			</form>

			<div>
				<h4 style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-main)", marginBottom: "10px" }}>
					Auto-Delete Targets ({autoDeleteList.length})
				</h4>
				{autoDeleteList.length === 0 ? (
					<p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "20px" }}>
						No auto-delete targets currently.
					</p>
				) : (
					<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
						{autoDeleteList.map((item) => (
							<div
								key={item.userJid}
								style={{
									padding: "12px 16px",
									background: "rgba(255, 255, 255, 0.02)",
									border: "1px solid var(--border-color)",
									borderRadius: "10px",
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
								}}
							>
								<div style={{ fontFamily: "monospace", fontSize: "0.85rem", fontWeight: 600, color: "#fbbf24" }}>
									{item.userJid}
								</div>

								<button
									type="button"
									onClick={() => onRemoveAutoDelete(item.userJid)}
									className="danger-btn"
									style={{ fontSize: "0.75rem", padding: "5px 10px" }}
								>
									Delete
								</button>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	)
}
