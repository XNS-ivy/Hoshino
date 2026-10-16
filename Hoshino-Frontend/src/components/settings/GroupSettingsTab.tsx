import React, { useState } from "react"
import {
	Bot,
	Check,
	Edit2,
	Plus,
	Search,
	Sliders,
	Users,
	X,
	Zap,
} from "lucide-react"
import { InGroupCommandModal } from "./InGroupCommandModal"

export interface GroupSettingsItem {
	agentId: string
	jid: string
	subject?: string | null
	botEnabled: boolean
	welcomeEnabled: boolean
	goodbyeEnabled: boolean
	customPrefix?: string | null
	customizedCommandsCount?: number
}

interface GroupSettingsTabProps {
	agentId: string
	groups: GroupSettingsItem[]
	onUpdateGroupSettings: (
		groupJid: string,
		settings: Partial<GroupSettingsItem>,
	) => Promise<void>
	onShowToast: (type: "success" | "error", message: string) => void
	onRefreshGroups?: () => void
}

export const GroupSettingsTab: React.FC<GroupSettingsTabProps> = ({
	agentId,
	groups,
	onUpdateGroupSettings,
	onShowToast,
	onRefreshGroups,
}) => {
	const [newGroupJid, setNewGroupJid] = useState("")
	const [groupSearch, setGroupSearch] = useState("")
	const [managingGroupJid, setManagingGroupJid] = useState<string | null>(null)
	const [editingPrefixJid, setEditingPrefixJid] = useState<string | null>(null)
	const [tempPrefix, setTempPrefix] = useState<string>("")

	const handleAddGroupManually = async (e: React.FormEvent) => {
		e.preventDefault()
		let jid = newGroupJid.trim()
		if (!jid) return
		if (!jid.includes("@")) {
			jid = `${jid}@g.us`
		}
		await onUpdateGroupSettings(jid, { botEnabled: true })
		setNewGroupJid("")
		if (onRefreshGroups) onRefreshGroups()
	}

	const handleStartEditPrefix = (group: GroupSettingsItem) => {
		setEditingPrefixJid(group.jid)
		setTempPrefix(group.customPrefix || "")
	}

	const handleSavePrefix = async (groupJid: string) => {
		const prefixValue = tempPrefix.trim() || null
		await onUpdateGroupSettings(groupJid, { customPrefix: prefixValue })
		setEditingPrefixJid(null)
		onShowToast(
			"success",
			prefixValue
				? `Custom prefix set to "${prefixValue}" for group`
				: "Custom prefix cleared (using agent default)",
		)
		if (onRefreshGroups) onRefreshGroups()
	}

	const handleCancelEditPrefix = () => {
		setEditingPrefixJid(null)
		setTempPrefix("")
	}

	const filteredGroups = groups.filter(
		(g) =>
			g.jid.toLowerCase().includes(groupSearch.toLowerCase()) ||
			(g.subject || "").toLowerCase().includes(groupSearch.toLowerCase()),
	)

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
			{/* Top Feature Banner */}
			<div
				style={{
					background:
						"linear-gradient(135deg, rgba(0, 242, 254, 0.08) 0%, rgba(79, 172, 254, 0.08) 100%)",
					border: "1px solid rgba(0, 242, 254, 0.25)",
					borderRadius: "14px",
					padding: "16px 20px",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "16px",
					flexWrap: "wrap",
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, flex: 1 }}>
					<div
						style={{
							width: "38px",
							height: "38px",
							borderRadius: "10px",
							background: "rgba(0, 242, 254, 0.15)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							flexShrink: 0,
						}}
					>
						<Sliders size={20} color="var(--primary-cyan)" />
					</div>
					<div>
						<h4 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-main)" }}>
							In-Group Command Management
						</h4>
						<p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "2px" }}>
							Configure command permissions, toggles, and registration policies per WhatsApp group.
						</p>
					</div>
				</div>

				{groups.length > 0 && (
					<button
						type="button"
						onClick={() => setManagingGroupJid(groups[0]?.jid || null)}
						className="gradient-btn"
						style={{ fontSize: "0.8rem", padding: "8px 16px" }}
					>
						<Zap size={14} /> Open Command Manager
					</button>
				)}
			</div>

			{/* Register Group Form */}
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
					<label
						style={{
							display: "block",
							fontSize: "0.75rem",
							color: "var(--text-muted)",
							marginBottom: "6px",
						}}
					>
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

				<button
					type="submit"
					className="gradient-btn"
					style={{ fontSize: "0.85rem", padding: "8px 16px" }}
				>
					<Plus size={15} /> Allow Group
				</button>
			</form>

			{/* Search Groups */}
			<div style={{ position: "relative" }}>
				<Search
					size={16}
					color="var(--text-muted)"
					style={{
						position: "absolute",
						left: "12px",
						top: "50%",
						transform: "translateY(-50%)",
					}}
				/>
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

			{/* Groups List */}
			<div>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						marginBottom: "12px",
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
						<Users size={16} color="var(--primary-cyan)" />
						Registered Groups ({filteredGroups.length})
					</h4>
					<span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
						Click "Manage Commands" on any group to customize features
					</span>
				</div>

				{filteredGroups.length === 0 ? (
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
						No registered groups yet. Type *!bot on* in a WhatsApp group or register a JID above.
					</p>
				) : (
					<div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
						{filteredGroups.map((group) => {
							const isEditingPrefix = editingPrefixJid === group.jid
							const customOverrides = group.customizedCommandsCount || 0

							return (
								<div
									key={group.jid}
									style={{
										padding: "16px 20px",
										background: "rgba(255, 255, 255, 0.02)",
										border: "1px solid var(--border-color)",
										borderRadius: "14px",
										display: "flex",
										flexDirection: "column",
										gap: "14px",
										transition: "all 0.2s ease",
									}}
								>
									{/* Group Top Row */}
									<div
										style={{
											display: "flex",
											alignItems: "center",
											justifyContent: "space-between",
											gap: "14px",
											flexWrap: "wrap",
										}}
									>
										<div style={{ minWidth: 0, flex: 1 }}>
											<div
												style={{
													fontSize: "0.98rem",
													fontWeight: 600,
													color: "var(--text-main)",
													display: "flex",
													alignItems: "center",
													gap: "8px",
													flexWrap: "wrap",
												}}
											>
												<Bot size={17} color="#34d399" />
												<span>
													{group.subject && group.subject !== group.jid
														? group.subject
														: "WhatsApp Group"}
												</span>

												{/* Customized Commands Pill */}
												{customOverrides > 0 ? (
													<span
														style={{
															fontSize: "0.68rem",
															fontWeight: 600,
															padding: "2px 8px",
															borderRadius: "10px",
															background: "rgba(0, 242, 254, 0.15)",
															color: "#22d3ee",
															border: "1px solid rgba(0, 242, 254, 0.3)",
														}}
													>
														⚡ {customOverrides} commands customized
													</span>
												) : (
													<span
														style={{
															fontSize: "0.68rem",
															padding: "2px 8px",
															borderRadius: "10px",
															background: "rgba(255, 255, 255, 0.05)",
															color: "var(--text-dim)",
														}}
													>
														Default Commands
													</span>
												)}
											</div>

											<div
												style={{
													fontFamily: "var(--font-mono)",
													fontSize: "0.75rem",
													color: "var(--text-muted)",
													marginTop: "4px",
												}}
											>
												{group.jid}
											</div>
										</div>

										{/* Primary Action Buttons */}
										<div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
											{/* Manage Commands Trigger */}
											<button
												type="button"
												onClick={() => setManagingGroupJid(group.jid)}
												className="secondary-btn"
												style={{
													fontSize: "0.78rem",
													padding: "7px 14px",
													borderColor: "rgba(0, 242, 254, 0.3)",
													color: "#22d3ee",
													background: "rgba(0, 242, 254, 0.08)",
												}}
											>
												<Sliders size={14} color="var(--primary-cyan)" />
												Manage Commands
											</button>

											{/* Bot Listen State Toggle */}
											<button
												type="button"
												onClick={() =>
													onUpdateGroupSettings(group.jid, {
														botEnabled: !group.botEnabled,
													})
												}
												style={{
													padding: "7px 16px",
													fontSize: "0.78rem",
													fontWeight: 600,
													borderRadius: "20px",
													border: "none",
													cursor: "pointer",
													background: group.botEnabled
														? "rgba(16, 185, 129, 0.2)"
														: "rgba(239, 68, 68, 0.2)",
													color: group.botEnabled ? "#34d399" : "#f87171",
													borderWidth: "1px",
													borderStyle: "solid",
													borderColor: group.botEnabled
														? "rgba(16, 185, 129, 0.4)"
														: "rgba(239, 68, 68, 0.4)",
													transition: "all 0.2s ease",
												}}
											>
												{group.botEnabled ? "LISTEN ON" : "LISTEN OFF"}
											</button>
										</div>
									</div>

									{/* Group Details & Secondary Toggles */}
									<div
										style={{
											display: "flex",
											alignItems: "center",
											justifyContent: "space-between",
											gap: "16px",
											borderTop: "1px solid rgba(255, 255, 255, 0.05)",
											paddingTop: "10px",
											flexWrap: "wrap",
										}}
									>
										{/* Custom Prefix Inline Editor */}
										<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
											<span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
												Prefix:
											</span>
											{isEditingPrefix ? (
												<div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
													<input
														type="text"
														value={tempPrefix}
														onChange={(e) => setTempPrefix(e.target.value)}
														placeholder="Default"
														maxLength={5}
														style={{
															width: "70px",
															background: "rgba(0, 0, 0, 0.4)",
															border: "1px solid rgba(0, 242, 254, 0.4)",
															borderRadius: "6px",
															padding: "3px 8px",
															fontSize: "0.78rem",
															color: "#22d3ee",
															fontFamily: "var(--font-mono)",
														}}
													/>
													<button
														type="button"
														onClick={() => handleSavePrefix(group.jid)}
														style={{
															background: "rgba(16, 185, 129, 0.2)",
															border: "1px solid rgba(16, 185, 129, 0.4)",
															color: "#34d399",
															borderRadius: "6px",
															padding: "3px 6px",
															cursor: "pointer",
														}}
														title="Save prefix"
													>
														<Check size={12} />
													</button>
													<button
														type="button"
														onClick={handleCancelEditPrefix}
														style={{
															background: "rgba(255, 255, 255, 0.05)",
															border: "1px solid var(--border-color)",
															color: "var(--text-muted)",
															borderRadius: "6px",
															padding: "3px 6px",
															cursor: "pointer",
														}}
														title="Cancel"
													>
														<X size={12} />
													</button>
												</div>
											) : (
												<div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
													<span
														style={{
															fontSize: "0.78rem",
															fontWeight: 600,
															color: group.customPrefix ? "#22d3ee" : "var(--text-dim)",
															fontFamily: "var(--font-mono)",
														}}
													>
														{group.customPrefix ? group.customPrefix : "Default (.)"}
													</span>
													<button
														type="button"
														onClick={() => handleStartEditPrefix(group)}
														style={{
															background: "transparent",
															border: "none",
															color: "var(--text-muted)",
															cursor: "pointer",
															display: "flex",
															alignItems: "center",
															padding: "2px",
														}}
														title="Edit group prefix"
													>
														<Edit2 size={11} />
													</button>
												</div>
											)}
										</div>

										{/* Welcome & Goodbye Toggles */}
										<div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
											<label
												style={{
													display: "flex",
													alignItems: "center",
													gap: "6px",
													fontSize: "0.75rem",
													color: "var(--text-muted)",
													cursor: "pointer",
												}}
											>
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

											<label
												style={{
													display: "flex",
													alignItems: "center",
													gap: "6px",
													fontSize: "0.75rem",
													color: "var(--text-muted)",
													cursor: "pointer",
												}}
											>
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
								</div>
							)
						})}
					</div>
				)}
			</div>

			{/* In-Group Command Management Modal */}
			{managingGroupJid && (
				<InGroupCommandModal
					agentId={agentId}
					groups={groups}
					selectedGroupJid={managingGroupJid}
					onClose={() => setManagingGroupJid(null)}
					onGroupChanged={(newJid) => setManagingGroupJid(newJid)}
					onShowToast={onShowToast}
					onRefreshGroups={onRefreshGroups}
				/>
			)}
		</div>
	)
}
