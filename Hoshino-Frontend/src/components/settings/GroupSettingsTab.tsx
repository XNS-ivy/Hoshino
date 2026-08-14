import React, { useState } from "react"
import { Bot, Plus, Search } from "lucide-react"

export interface GroupSettingsItem {
	agentId: string
	jid: string
	subject?: string | null
	botEnabled: boolean
	welcomeEnabled: boolean
	goodbyeEnabled: boolean
	customPrefix?: string | null
}

interface GroupSettingsTabProps {
	groups: GroupSettingsItem[]
	onUpdateGroupSettings: (
		groupJid: string,
		settings: Partial<GroupSettingsItem>,
	) => Promise<void>
}

export const GroupSettingsTab: React.FC<GroupSettingsTabProps> = ({
	groups,
	onUpdateGroupSettings,
}) => {
	const [newGroupJid, setNewGroupJid] = useState("")
	const [groupSearch, setGroupSearch] = useState("")

	const handleAddGroupManually = async (e: React.FormEvent) => {
		e.preventDefault()
		let jid = newGroupJid.trim()
		if (!jid) return
		if (!jid.includes("@")) {
			jid = `${jid}@g.us`
		}
		await onUpdateGroupSettings(jid, { botEnabled: true })
		setNewGroupJid("")
	}

	const filteredGroups = groups.filter(
		(g) =>
			g.jid.toLowerCase().includes(groupSearch.toLowerCase()) ||
			(g.subject || "").toLowerCase().includes(groupSearch.toLowerCase()),
	)

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
			<form
				onSubmit={handleAddGroupManually}
				style={{
					background: "rgba(255, 255, 255, 0.03)",
					border: "1px solid var(--border-color)",
					borderRadius: "12px",
					padding: "16px",
					display: "flex",
					gap: "12px",
					alignItems: "flex-end",
				}}
			>
				<div style={{ flex: 1 }}>
					<label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "6px" }}>
						Register / Allow New Group JID
					</label>
					<input
						type="text"
						value={newGroupJid}
						onChange={(e) => setNewGroupJid(e.target.value)}
						placeholder="e.g. 120363123456789012@g.us"
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

				<button type="submit" className="gradient-btn" style={{ fontSize: "0.85rem", padding: "8px 16px" }}>
					<Plus size={15} /> Allow Group
				</button>
			</form>

			<div style={{ position: "relative" }}>
				<Search size={16} color="var(--text-muted)" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }} />
				<input
					type="text"
					value={groupSearch}
					onChange={(e) => setGroupSearch(e.target.value)}
					placeholder="Search groups by Name or JID..."
					style={{
						width: "100%",
						background: "rgba(0, 0, 0, 0.3)",
						border: "1px solid var(--border-color)",
						borderRadius: "10px",
						padding: "8px 12px 8px 36px",
						fontSize: "0.85rem",
						color: "var(--text-main)",
					}}
				/>
			</div>

			<div>
				<h4 style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-main)", marginBottom: "10px" }}>
					Registered Group Permissions ({filteredGroups.length})
				</h4>
				{filteredGroups.length === 0 ? (
					<p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "20px" }}>
						No registered groups yet. Type *!bot on* in a WhatsApp group or register a JID above.
					</p>
				) : (
					<div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
						{filteredGroups.map((group) => (
							<div
								key={group.jid}
								style={{
									padding: "14px 18px",
									background: "rgba(255, 255, 255, 0.02)",
									border: "1px solid var(--border-color)",
									borderRadius: "12px",
									display: "flex",
									flexDirection: "column",
									gap: "12px",
								}}
							>
								<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
									<div>
										<div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-main)", display: "flex", alignItems: "center", gap: "6px" }}>
											<Bot size={16} color="#34d399" />
											{group.subject && group.subject !== group.jid ? group.subject : "WhatsApp Group"}
										</div>
										<div style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
											{group.jid}
										</div>
										{group.customPrefix && (
											<div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
												Custom Prefix: <strong style={{ color: "#22d3ee" }}>{group.customPrefix}</strong>
											</div>
										)}
									</div>

									<button
										type="button"
										onClick={() =>
											onUpdateGroupSettings(group.jid, {
												botEnabled: !group.botEnabled,
											})
										}
										style={{
											padding: "6px 14px",
											fontSize: "0.75rem",
											fontWeight: 600,
											borderRadius: "20px",
											border: "none",
											cursor: "pointer",
											background: group.botEnabled ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
											color: group.botEnabled ? "#34d399" : "#f87171",
											borderWidth: "1px",
											borderStyle: "solid",
											borderColor: group.botEnabled ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)",
										}}
									>
										{group.botEnabled ? "LISTEN ON" : "LISTEN OFF"}
									</button>
								</div>

								{/* Additional Toggles (Welcome & Goodbye) */}
								<div style={{ display: "flex", gap: "12px", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "8px" }}>
									<label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.75rem", color: "var(--text-muted)", cursor: "pointer" }}>
										<input
											type="checkbox"
											checked={group.welcomeEnabled}
											onChange={(e) =>
												onUpdateGroupSettings(group.jid, {
													welcomeEnabled: e.target.checked,
												})
											}
										/>
										Welcome Msg
									</label>

									<label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.75rem", color: "var(--text-muted)", cursor: "pointer" }}>
										<input
											type="checkbox"
											checked={group.goodbyeEnabled}
											onChange={(e) =>
												onUpdateGroupSettings(group.jid, {
													goodbyeEnabled: e.target.checked,
												})
											}
										/>
										Goodbye Msg
									</label>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	)
}
