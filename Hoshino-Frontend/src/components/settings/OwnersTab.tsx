import React, { useState } from "react"
import { Plus } from "lucide-react"
import { ContactSelector, type ContactItem } from "./ContactSelector"

export interface OwnerItem {
	agentId: string
	userJid: string
	role: string
	createdAt: string
}

interface OwnersTabProps {
	owners: OwnerItem[]
	contacts: ContactItem[]
	onAddOwner: (userJid: string, role: string) => Promise<void>
	onRemoveOwner: (userJid: string) => Promise<void>
}

export const OwnersTab: React.FC<OwnersTabProps> = ({
	owners,
	contacts,
	onAddOwner,
	onRemoveOwner,
}) => {
	const [newOwnerJid, setNewOwnerJid] = useState("")
	const [newOwnerRole, setNewOwnerRole] = useState("owner")

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!newOwnerJid.trim()) return
		await onAddOwner(newOwnerJid.trim(), newOwnerRole)
		setNewOwnerJid("")
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
					onSelectJid={(jid) => setNewOwnerJid(jid)}
					themeColor="#c084fc"
				/>

				<div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-end" }}>
					<div style={{ flex: 1, minWidth: "220px" }}>
						<label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "6px" }}>
							User JID / Phone Number
						</label>
						<input
							type="text"
							value={newOwnerJid}
							onChange={(e) => setNewOwnerJid(e.target.value)}
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

					<div style={{ width: "120px" }}>
						<label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "6px" }}>
							Role
						</label>
						<select
							value={newOwnerRole}
							onChange={(e) => setNewOwnerRole(e.target.value)}
							style={{
								width: "100%",
								background: "rgba(0, 0, 0, 0.3)",
								border: "1px solid var(--border-color)",
								borderRadius: "8px",
								padding: "8px 12px",
								fontSize: "0.85rem",
								color: "var(--text-main)",
							}}
						>
							<option value="owner">Owner</option>
							<option value="master">Master</option>
						</select>
					</div>

					<button type="submit" className="gradient-btn" style={{ fontSize: "0.85rem", padding: "8px 16px" }}>
						<Plus size={15} /> Add Owner
					</button>
				</div>
			</form>

			<div>
				<h4 style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-main)", marginBottom: "10px" }}>
					Current Registered Owners ({owners.length})
				</h4>
				{owners.length === 0 ? (
					<p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "20px" }}>
						No registered owners for this agent.
					</p>
				) : (
					<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
						{owners.map((owner) => (
							<div
								key={owner.userJid}
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
								<div>
									<div style={{ fontFamily: "monospace", fontSize: "0.85rem", fontWeight: 600, color: "#c084fc" }}>
										{owner.userJid}
									</div>
									<div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
										Role: <strong style={{ color: "#a855f7", textTransform: "uppercase" }}>{owner.role}</strong>
									</div>
								</div>

								<button
									type="button"
									onClick={() => onRemoveOwner(owner.userJid)}
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
