import React, { useState } from "react"
import { Plus } from "lucide-react"
import { ContactSelector, type ContactItem } from "./ContactSelector"

export interface BlacklistItem {
	agentId: string
	userJid: string
	reason: string | null
	createdAt: string
}

interface BlacklistTabProps {
	blacklist: BlacklistItem[]
	contacts: ContactItem[]
	onAddBlacklist: (userJid: string, reason?: string) => Promise<void>
	onRemoveBlacklist: (userJid: string) => Promise<void>
}

export const BlacklistTab: React.FC<BlacklistTabProps> = ({
	blacklist,
	contacts,
	onAddBlacklist,
	onRemoveBlacklist,
}) => {
	const [newBlacklistJid, setNewBlacklistJid] = useState("")
	const [newBlacklistReason, setNewBlacklistReason] = useState("")

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!newBlacklistJid.trim()) return
		await onAddBlacklist(newBlacklistJid.trim(), newBlacklistReason.trim() || undefined)
		setNewBlacklistJid("")
		setNewBlacklistReason("")
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
					onSelectJid={(jid) => setNewBlacklistJid(jid)}
					themeColor="#fb7185"
				/>

				<div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-end" }}>
					<div style={{ flex: 1, minWidth: "200px" }}>
						<label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "6px" }}>
							Target User JID
						</label>
						<input
							type="text"
							value={newBlacklistJid}
							onChange={(e) => setNewBlacklistJid(e.target.value)}
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

					<div style={{ flex: 1, minWidth: "180px" }}>
						<label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "6px" }}>
							Reason (Optional)
						</label>
						<input
							type="text"
							value={newBlacklistReason}
							onChange={(e) => setNewBlacklistReason(e.target.value)}
							placeholder="Spamming command"
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

					<button type="submit" className="danger-btn" style={{ fontSize: "0.85rem", padding: "8px 16px" }}>
						<Plus size={15} /> Blacklist User
					</button>
				</div>
			</form>

			<div>
				<h4 style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-main)", marginBottom: "10px" }}>
					Blacklisted Users ({blacklist.length})
				</h4>
				{blacklist.length === 0 ? (
					<p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "20px" }}>
						No blacklisted users currently.
					</p>
				) : (
					<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
						{blacklist.map((item) => (
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
								<div>
									<div style={{ fontFamily: "monospace", fontSize: "0.85rem", fontWeight: 600, color: "#fb7185" }}>
										{item.userJid}
									</div>
									{item.reason && (
										<div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
											Reason: {item.reason}
										</div>
									)}
								</div>

								<button
									type="button"
									onClick={() => onRemoveBlacklist(item.userJid)}
									className="secondary-btn"
									style={{ fontSize: "0.75rem", padding: "5px 10px" }}
								>
									Unblock
								</button>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	)
}
