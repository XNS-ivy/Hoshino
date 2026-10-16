import React, { useState } from "react"
import { Globe, Plus, Trash2, Users } from "lucide-react"
import { ContactSelector, type ContactItem } from "./ContactSelector"
import type { GroupSettingsItem } from "./GroupSettingsTab"

export interface AutoDeleteItem {
	agentId: string
	jid?: string
	userJid: string
	createdAt: string
	groupSubject?: string | null
}

interface AutoDeleteTabProps {
	autoDeleteList: AutoDeleteItem[]
	contacts: ContactItem[]
	groups?: GroupSettingsItem[]
	onAddAutoDelete: (userJid: string, groupJid?: string) => Promise<void>
	onRemoveAutoDelete: (userJid: string, groupJid?: string) => Promise<void>
}

export const AutoDeleteTab: React.FC<AutoDeleteTabProps> = ({
	autoDeleteList,
	contacts,
	groups = [],
	onAddAutoDelete,
	onRemoveAutoDelete,
}) => {
	const [newAutoDeleteJid, setNewAutoDeleteJid] = useState("")
	const [selectedTargetGroup, setSelectedTargetGroup] = useState<string>("*")
	const [scopeFilter, setScopeFilter] = useState<string>("all")

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!newAutoDeleteJid.trim()) return
		await onAddAutoDelete(newAutoDeleteJid.trim(), selectedTargetGroup)
		setNewAutoDeleteJid("")
	}

	const filteredList = autoDeleteList.filter((item) => {
		if (scopeFilter === "all") return true
		if (scopeFilter === "*") return !item.jid || item.jid === "*"
		return item.jid === scopeFilter
	})

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
			{/* Informational Scope Banner */}
			<div
				style={{
					padding: "12px 16px",
					background: "rgba(245, 158, 11, 0.08)",
					border: "1px solid rgba(245, 158, 11, 0.25)",
					borderRadius: "12px",
					fontSize: "0.8rem",
					color: "var(--text-muted)",
					lineHeight: 1.5,
				}}
			>
				<strong style={{ color: "#fbbf24" }}>Per-Group Auto-Delete Policy:</strong> You can
				now restrict message auto-deletion to a <strong>specific WhatsApp group</strong>, or
				apply it across <strong>all groups (global)</strong>. When an admin executes{" "}
				<code>!autodelete @user</code> in WhatsApp, it will be strictly confined to that group.
			</div>

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

				<div style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
					{/* Target User Input */}
					<div style={{ flex: "1 1 240px" }}>
						<label
							style={{
								display: "block",
								fontSize: "0.75rem",
								color: "var(--text-muted)",
								marginBottom: "6px",
							}}
						>
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

					{/* Group Scope Selector */}
					<div style={{ flex: "1 1 200px" }}>
						<label
							style={{
								display: "block",
								fontSize: "0.75rem",
								color: "var(--text-muted)",
								marginBottom: "6px",
							}}
						>
							Target Scope
						</label>
						<select
							value={selectedTargetGroup}
							onChange={(e) => setSelectedTargetGroup(e.target.value)}
							style={{
								width: "100%",
								background: "rgba(15, 20, 32, 0.9)",
								border: "1px solid var(--border-color)",
								borderRadius: "8px",
								padding: "8px 12px",
								fontSize: "0.85rem",
								color: "var(--text-main)",
								cursor: "pointer",
							}}
						>
							<option value="*" style={{ background: "#0f1420", color: "#f8fafc" }}>
								🌍 All Groups (Global *)
							</option>
							{groups.map((g) => (
								<option
									key={g.jid}
									value={g.jid}
									style={{ background: "#0f1420", color: "#f8fafc" }}
								>
									👥 {g.subject && g.subject !== g.jid ? g.subject : g.jid.split("@")[0]}
								</option>
							))}
						</select>
					</div>

					<button
						type="submit"
						className="secondary-btn"
						style={{
							fontSize: "0.85rem",
							padding: "8px 16px",
							borderColor: "#f59e0b",
							color: "#fbbf24",
							whiteSpace: "nowrap",
						}}
					>
						<Plus size={15} /> Add Target
					</button>
				</div>
			</form>

			<div>
				{/* Header & Filter Row */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						marginBottom: "12px",
						gap: "12px",
						flexWrap: "wrap",
					}}
				>
					<h4
						style={{
							fontSize: "0.9rem",
							fontWeight: 600,
							color: "var(--text-main)",
							display: "flex",
							alignItems: "center",
							gap: "6px",
						}}
					>
						<Trash2 size={16} color="#fbbf24" />
						Auto-Delete Targets ({filteredList.length})
					</h4>

					{/* Filter Dropdown */}
					{autoDeleteList.length > 0 && (
						<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
							<span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Filter:</span>
							<select
								value={scopeFilter}
								onChange={(e) => setScopeFilter(e.target.value)}
								style={{
									background: "rgba(0, 0, 0, 0.3)",
									border: "1px solid var(--border-color)",
									borderRadius: "6px",
									padding: "4px 8px",
									fontSize: "0.75rem",
									color: "var(--text-main)",
									cursor: "pointer",
								}}
							>
								<option value="all">All Targets</option>
								<option value="*">Global Only (*)</option>
								{groups.map((g) => (
									<option key={g.jid} value={g.jid}>
										{g.subject && g.subject !== g.jid ? g.subject : g.jid.split("@")[0]}
									</option>
								))}
							</select>
						</div>
					)}
				</div>

				{filteredList.length === 0 ? (
					<p
						style={{
							fontSize: "0.8rem",
							color: "var(--text-muted)",
							textAlign: "center",
							padding: "24px",
							background: "rgba(255, 255, 255, 0.01)",
							borderRadius: "12px",
							border: "1px dashed var(--border-color)",
						}}
					>
						No auto-delete targets matching this filter.
					</p>
				) : (
					<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
						{filteredList.map((item) => {
							const isGlobal = !item.jid || item.jid === "*"
							return (
								<div
									key={`${item.jid || "*"}_${item.userJid}`}
									style={{
										padding: "12px 16px",
										background: "rgba(255, 255, 255, 0.02)",
										border: "1px solid var(--border-color)",
										borderRadius: "10px",
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										gap: "12px",
									}}
								>
									<div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
										<div
											style={{
												fontFamily: "var(--font-mono)",
												fontSize: "0.85rem",
												fontWeight: 600,
												color: "#fbbf24",
											}}
										>
											{item.userJid}
										</div>

										{/* Scope Badge */}
										{isGlobal ? (
											<span
												style={{
													fontSize: "0.68rem",
													fontWeight: 600,
													padding: "2px 8px",
													borderRadius: "6px",
													background: "rgba(245, 158, 11, 0.15)",
													color: "#fbbf24",
													border: "1px solid rgba(245, 158, 11, 0.3)",
													display: "inline-flex",
													alignItems: "center",
													gap: "4px",
												}}
											>
												<Globe size={11} /> Global (*)
											</span>
										) : (
											<span
												style={{
													fontSize: "0.68rem",
													fontWeight: 600,
													padding: "2px 8px",
													borderRadius: "6px",
													background: "rgba(0, 242, 254, 0.12)",
													color: "#22d3ee",
													border: "1px solid rgba(0, 242, 254, 0.25)",
													display: "inline-flex",
													alignItems: "center",
													gap: "4px",
												}}
											>
												<Users size={11} /> Group:{" "}
												{item.groupSubject || item.jid?.split("@")[0]}
											</span>
										)}
									</div>

									<button
										type="button"
										onClick={() => onRemoveAutoDelete(item.userJid, item.jid)}
										className="danger-btn"
										style={{ fontSize: "0.75rem", padding: "5px 10px" }}
									>
										Delete
									</button>
								</div>
							)
						})}
					</div>
				)}
			</div>
		</div>
	)
}
