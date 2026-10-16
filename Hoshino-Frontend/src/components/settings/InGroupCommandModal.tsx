import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
	AlertTriangle,
	Check,
	ChevronDown,
	RefreshCw,
	RotateCcw,
	Search,
	Sliders,
	X,
	Zap,
} from "lucide-react"
import { API_BASE_URL } from "../../services/api"
import type { GroupCommandItem } from "../../types"
import type { GroupSettingsItem } from "./GroupSettingsTab"

interface InGroupCommandModalProps {
	agentId: string
	groups: GroupSettingsItem[]
	selectedGroupJid: string
	onClose: () => void
	onGroupChanged?: (newGroupJid: string) => void
	onShowToast: (type: "success" | "error", message: string) => void
	onRefreshGroups?: () => void
}

const CATEGORY_NAMES: Record<string, string> = {
	all: "All Categories",
	bluearchive: "Blue Archive",
	downloaders: "Media Downloaders",
	utility: "Utility & Tools",
	waifuImages: "Anime Waifu",
	group: "Group Admin",
	owner: "Owner & Bot Admin",
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
	bluearchive: { bg: "rgba(236, 72, 153, 0.15)", text: "#f472b6", border: "rgba(236, 72, 153, 0.3)" },
	downloaders: { bg: "rgba(59, 130, 246, 0.15)", text: "#60a5fa", border: "rgba(59, 130, 246, 0.3)" },
	utility: { bg: "rgba(16, 185, 129, 0.15)", text: "#34d399", border: "rgba(16, 185, 129, 0.3)" },
	waifuImages: { bg: "rgba(168, 85, 247, 0.15)", text: "#c084fc", border: "rgba(168, 85, 247, 0.3)" },
	group: { bg: "rgba(245, 158, 11, 0.15)", text: "#fbbf24", border: "rgba(245, 158, 11, 0.3)" },
	owner: { bg: "rgba(239, 68, 68, 0.15)", text: "#f87171", border: "rgba(239, 68, 68, 0.3)" },
}

export const InGroupCommandModal: React.FC<InGroupCommandModalProps> = ({
	agentId,
	groups,
	selectedGroupJid,
	onClose,
	onGroupChanged,
	onShowToast,
	onRefreshGroups,
}) => {
	const [activeJid, setActiveJid] = useState<string>(selectedGroupJid)
	const [commands, setCommands] = useState<GroupCommandItem[]>([])
	const [loading, setLoading] = useState<boolean>(true)
	const [togglingMap, setTogglingMap] = useState<Record<string, boolean>>({})
	const [batchLoading, setBatchLoading] = useState<boolean>(false)

	// Filter states
	const [searchQuery, setSearchQuery] = useState<string>("")
	const [selectedCategory, setSelectedCategory] = useState<string>("all")
	const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled" | "customized">("all")

	const currentGroup = useMemo(() => {
		return (
			groups.find((g) => g.jid === activeJid) || {
				agentId,
				jid: activeJid,
				subject: activeJid,
				botEnabled: false,
				welcomeEnabled: false,
				goodbyeEnabled: false,
			}
		)
	}, [groups, activeJid, agentId])

	// Fetch commands for selected group
	const fetchGroupCommands = useCallback(
		async (jid: string, silent = false) => {
			if (!jid) return
			if (!silent) setLoading(true)
			try {
				const res = await fetch(
					`${API_BASE_URL}/api/agents/${agentId}/groups/${encodeURIComponent(jid)}/commands`,
				)
				const json = await res.json()
				if (json.success && Array.isArray(json.data)) {
					setCommands(json.data)
				} else {
					onShowToast("error", json.message || "Failed to load group commands")
				}
			} catch (err) {
				onShowToast("error", `Network error loading group commands: ${err}`)
			} finally {
				if (!silent) setLoading(false)
			}
		},
		[agentId, onShowToast],
	)

	useEffect(() => {
		fetchGroupCommands(activeJid)
	}, [activeJid, fetchGroupCommands])

	// Switch group handler
	const handleSelectGroup = (jid: string) => {
		setActiveJid(jid)
		if (onGroupChanged) {
			onGroupChanged(jid)
		}
	}

	// Toggle individual command status
	const handleToggleCommand = async (commandName: string, currentStatus: "enabled" | "disabled") => {
		const newStatus = currentStatus === "enabled" ? "disabled" : "enabled"
		setTogglingMap((prev) => ({ ...prev, [commandName]: true }))

		// Optimistic UI update
		setCommands((prev) =>
			prev.map((c) =>
				c.name === commandName ? { ...c, status: newStatus, isCustomized: true } : c,
			),
		)

		try {
			const res = await fetch(
				`${API_BASE_URL}/api/agents/${agentId}/groups/${encodeURIComponent(activeJid)}/commands/${encodeURIComponent(commandName)}`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ status: newStatus }),
				},
			)
			const json = await res.json()
			if (json.success) {
				onShowToast("success", `.${commandName} ${newStatus === "enabled" ? "enabled" : "disabled"} for this group`)
				if (onRefreshGroups) onRefreshGroups()
			} else {
				onShowToast("error", json.message || "Failed to toggle command")
				fetchGroupCommands(activeJid, true)
			}
		} catch (err) {
			onShowToast("error", `Failed to toggle command: ${err}`)
			fetchGroupCommands(activeJid, true)
		} finally {
			setTogglingMap((prev) => ({ ...prev, [commandName]: false }))
		}
	}

	// Reset command override to default policy
	const handleResetCommand = async (commandName: string) => {
		setTogglingMap((prev) => ({ ...prev, [commandName]: true }))
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/agents/${agentId}/groups/${encodeURIComponent(activeJid)}/commands/${encodeURIComponent(commandName)}`,
				{ method: "DELETE" },
			)
			const json = await res.json()
			if (json.success) {
				onShowToast("success", `.${commandName} reset to default policy`)
				await fetchGroupCommands(activeJid, true)
				if (onRefreshGroups) onRefreshGroups()
			} else {
				onShowToast("error", json.message || "Failed to reset command")
			}
		} catch (err) {
			onShowToast("error", `Failed to reset command: ${err}`)
		} finally {
			setTogglingMap((prev) => ({ ...prev, [commandName]: false }))
		}
	}

	// Batch actions
	const handleBatchAction = async (action: "enable_all" | "disable_all" | "reset_all") => {
		const actionLabel =
			action === "enable_all"
				? "Enable All"
				: action === "disable_all"
					? "Disable All"
					: "Reset All to Defaults"

		const confirmMsg =
			action === "reset_all"
				? "Are you sure you want to reset all command overrides for this group back to defaults?"
				: `Are you sure you want to ${actionLabel.toLowerCase()} commands for this group?`

		if (!window.confirm(confirmMsg)) return

		setBatchLoading(true)
		try {
			const categoryPayload = selectedCategory !== "all" ? selectedCategory : undefined
			const res = await fetch(
				`${API_BASE_URL}/api/agents/${agentId}/groups/${encodeURIComponent(activeJid)}/commands/batch`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ action, category: categoryPayload }),
				},
			)
			const json = await res.json()
			if (json.success) {
				onShowToast("success", json.message || `Successfully executed ${actionLabel}`)
				await fetchGroupCommands(activeJid, true)
				if (onRefreshGroups) onRefreshGroups()
			} else {
				onShowToast("error", json.message || "Failed to execute batch action")
			}
		} catch (err) {
			onShowToast("error", `Failed to execute batch action: ${err}`)
		} finally {
			setBatchLoading(false)
		}
	}

	// Categories list derived from loaded commands
	const categories = useMemo(() => {
		const cats = new Set<string>()
		for (const cmd of commands) {
			if (cmd.category) cats.add(cmd.category)
		}
		return ["all", ...Array.from(cats)]
	}, [commands])

	// Filtered commands
	const filteredCommands = useMemo(() => {
		return commands.filter((cmd) => {
			// Search filter
			const matchesSearch =
				searchQuery === "" ||
				cmd.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				cmd.aliases.some((a) => a.toLowerCase().includes(searchQuery.toLowerCase())) ||
				(cmd.description || "").toLowerCase().includes(searchQuery.toLowerCase())

			// Category filter
			const matchesCategory = selectedCategory === "all" || cmd.category === selectedCategory

			// Status filter
			let matchesStatus = true
			if (statusFilter === "enabled") matchesStatus = cmd.status === "enabled"
			if (statusFilter === "disabled") matchesStatus = cmd.status === "disabled"
			if (statusFilter === "customized") matchesStatus = cmd.isCustomized

			return matchesSearch && matchesCategory && matchesStatus
		})
	}, [commands, searchQuery, selectedCategory, statusFilter])

	// Metrics
	const totalCommands = commands.length
	const enabledCount = commands.filter((c) => c.status === "enabled").length
	const disabledCount = commands.filter((c) => c.status === "disabled").length
	const customizedCount = commands.filter((c) => c.isCustomized).length

	return (
		<div
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				backgroundColor: "rgba(4, 9, 20, 0.85)",
				backdropFilter: "blur(12px)",
				WebkitBackdropFilter: "blur(12px)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 1100,
				padding: "16px",
			}}
		>
			<div
				className="glass-panel"
				style={{
					width: "100%",
					maxWidth: "880px",
					height: "90vh",
					maxHeight: "850px",
					display: "flex",
					flexDirection: "column",
					borderRadius: "18px",
					boxShadow: "0 24px 60px rgba(0, 0, 0, 0.7)",
					border: "1px solid rgba(0, 242, 254, 0.2)",
					overflow: "hidden",
					background: "linear-gradient(180deg, rgba(15, 20, 32, 0.95) 0%, rgba(10, 14, 24, 0.98) 100%)",
				}}
			>
				{/* Modal Header */}
				<div
					style={{
						padding: "18px 24px",
						borderBottom: "1px solid var(--border-color)",
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: "16px",
						background: "rgba(255, 255, 255, 0.02)",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
						<div
							style={{
								width: "42px",
								height: "42px",
								borderRadius: "12px",
								background: "linear-gradient(135deg, rgba(0, 242, 254, 0.15) 0%, rgba(79, 172, 254, 0.15) 100%)",
								border: "1px solid rgba(0, 242, 254, 0.3)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								flexShrink: 0,
							}}
						>
							<Sliders size={22} color="var(--primary-cyan)" />
						</div>
						<div style={{ minWidth: 0 }}>
							<h3
								style={{
									fontSize: "1.15rem",
									fontWeight: 700,
									color: "var(--text-main)",
									letterSpacing: "-0.01em",
									display: "flex",
									alignItems: "center",
									gap: "8px",
								}}
							>
								In-Group Command Management
								<span
									style={{
										fontSize: "0.68rem",
										padding: "2px 8px",
										borderRadius: "6px",
										background: "rgba(0, 242, 254, 0.15)",
										color: "#22d3ee",
										border: "1px solid rgba(0, 242, 254, 0.3)",
										fontWeight: 600,
									}}
								>
									Group Policy
								</span>
							</h3>
							<p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "2px" }}>
								Granular control over bot features & command permissions per WhatsApp group
							</p>
						</div>
					</div>

					<button
						type="button"
						onClick={onClose}
						style={{
							background: "rgba(255, 255, 255, 0.05)",
							border: "1px solid var(--border-color)",
							borderRadius: "10px",
							padding: "8px",
							color: "var(--text-muted)",
							cursor: "pointer",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							transition: "all 0.2s ease",
						}}
						aria-label="Close modal"
					>
						<X size={18} />
					</button>
				</div>

				{/* Group Selector & Context Banner */}
				<div
					style={{
						padding: "14px 24px",
						background: "rgba(0, 0, 0, 0.25)",
						borderBottom: "1px solid var(--border-color)",
						display: "flex",
						flexWrap: "wrap",
						alignItems: "center",
						justifyContent: "space-between",
						gap: "14px",
					}}
				>
					{/* Group Dropdown Switcher */}
					<div style={{ display: "flex", alignItems: "center", gap: "10px", flex: "1 1 320px" }}>
						<label style={{ fontSize: "0.8rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
							Target Group:
						</label>
						<div style={{ position: "relative", flex: 1, maxWidth: "420px" }}>
							<select
								value={activeJid}
								onChange={(e) => handleSelectGroup(e.target.value)}
								style={{
									width: "100%",
									background: "rgba(15, 20, 32, 0.9)",
									border: "1px solid rgba(0, 242, 254, 0.3)",
									borderRadius: "8px",
									padding: "8px 32px 8px 12px",
									fontSize: "0.85rem",
									color: "var(--text-main)",
									fontWeight: 500,
									appearance: "none",
									cursor: "pointer",
								}}
							>
								{groups.map((g) => (
									<option key={g.jid} value={g.jid} style={{ background: "#0f1420", color: "#f8fafc" }}>
										{g.subject && g.subject !== g.jid ? g.subject : g.jid} ({g.jid.split("@")[0]})
									</option>
								))}
							</select>
							<ChevronDown
								size={16}
								color="var(--primary-cyan)"
								style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
							/>
						</div>
					</div>

					{/* Quick Stats Badges */}
					<div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
						<div
							style={{
								padding: "4px 10px",
								borderRadius: "6px",
								fontSize: "0.72rem",
								fontWeight: 600,
								background: currentGroup.botEnabled ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
								color: currentGroup.botEnabled ? "#34d399" : "#f87171",
								border: `1px solid ${currentGroup.botEnabled ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
								display: "flex",
								alignItems: "center",
								gap: "5px",
							}}
						>
							<span
								style={{
									width: "6px",
									height: "6px",
									borderRadius: "50%",
									backgroundColor: currentGroup.botEnabled ? "#34d399" : "#f87171",
								}}
							/>
							{currentGroup.botEnabled ? "Bot Active" : "Bot Muted"}
						</div>

						<div
							style={{
								padding: "4px 10px",
								borderRadius: "6px",
								fontSize: "0.72rem",
								fontWeight: 600,
								background: "rgba(255, 255, 255, 0.05)",
								color: "var(--text-main)",
								border: "1px solid var(--border-color)",
							}}
						>
							Total: <strong style={{ color: "#38bdf8" }}>{totalCommands}</strong>
						</div>

						<div
							style={{
								padding: "4px 10px",
								borderRadius: "6px",
								fontSize: "0.72rem",
								fontWeight: 600,
								background: "rgba(16, 185, 129, 0.1)",
								color: "#34d399",
								border: "1px solid rgba(16, 185, 129, 0.2)",
							}}
						>
							Enabled: <strong>{enabledCount}</strong>
						</div>

						<div
							style={{
								padding: "4px 10px",
								borderRadius: "6px",
								fontSize: "0.72rem",
								fontWeight: 600,
								background: "rgba(239, 68, 68, 0.1)",
								color: "#f87171",
								border: "1px solid rgba(239, 68, 68, 0.2)",
							}}
						>
							Disabled: <strong>{disabledCount}</strong>
						</div>

						{customizedCount > 0 && (
							<div
								style={{
								padding: "4px 10px",
								borderRadius: "6px",
								fontSize: "0.72rem",
								fontWeight: 600,
								background: "rgba(0, 242, 254, 0.12)",
								color: "#22d3ee",
								border: "1px solid rgba(0, 242, 254, 0.3)",
							}}
						>
							Overrides: <strong>{customizedCount}</strong>
						</div>
					)}
					</div>
				</div>

				{/* Filters & Batch Toolbar */}
				<div
					style={{
						padding: "14px 24px",
						borderBottom: "1px solid var(--border-color)",
						display: "flex",
						flexDirection: "column",
						gap: "12px",
						background: "rgba(255, 255, 255, 0.01)",
					}}
				>
					{/* Top Search & Actions Row */}
					<div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
						{/* Search Bar */}
						<div style={{ position: "relative", flex: "1 1 240px" }}>
							<Search
								size={16}
								color="var(--text-muted)"
								style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }}
							/>
							<input
								type="text"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								placeholder="Search commands by name, alias, or description..."
								style={{
									width: "100%",
									background: "rgba(0, 0, 0, 0.35)",
									border: "1px solid var(--border-color)",
									borderRadius: "8px",
									padding: "8px 12px 8px 36px",
									fontSize: "0.85rem",
									color: "var(--text-main)",
								}}
							/>
						</div>

						{/* Status Filter Buttons */}
						<div style={{ display: "flex", gap: "6px" }}>
							{(["all", "enabled", "disabled", "customized"] as const).map((mode) => (
								<button
									key={mode}
									type="button"
									onClick={() => setStatusFilter(mode)}
									style={{
										padding: "6px 12px",
										fontSize: "0.75rem",
										fontWeight: 600,
										borderRadius: "6px",
										border: "none",
										cursor: "pointer",
										textTransform: "capitalize",
										background:
											statusFilter === mode
												? "rgba(0, 242, 254, 0.15)"
												: "rgba(255, 255, 255, 0.04)",
										color: statusFilter === mode ? "#22d3ee" : "var(--text-muted)",
										borderWidth: "1px",
										borderStyle: "solid",
										borderColor:
											statusFilter === mode ? "rgba(0, 242, 254, 0.35)" : "var(--border-color)",
									}}
								>
									{mode === "all" ? "All Status" : mode}
								</button>
							))}
						</div>

						{/* Batch Controls */}
						<div style={{ display: "flex", gap: "6px", marginLeft: "auto" }}>
							<button
								type="button"
								disabled={batchLoading || loading}
								onClick={() => handleBatchAction("enable_all")}
								style={{
									padding: "6px 12px",
									fontSize: "0.75rem",
									fontWeight: 600,
									borderRadius: "6px",
									border: "1px solid rgba(16, 185, 129, 0.3)",
									background: "rgba(16, 185, 129, 0.12)",
									color: "#34d399",
									cursor: "pointer",
									display: "flex",
									alignItems: "center",
									gap: "5px",
								}}
							>
								<Check size={13} /> Enable All
							</button>

							<button
								type="button"
								disabled={batchLoading || loading}
								onClick={() => handleBatchAction("disable_all")}
								style={{
									padding: "6px 12px",
									fontSize: "0.75rem",
									fontWeight: 600,
									borderRadius: "6px",
									border: "1px solid rgba(239, 68, 68, 0.3)",
									background: "rgba(239, 68, 68, 0.12)",
									color: "#f87171",
									cursor: "pointer",
									display: "flex",
									alignItems: "center",
									gap: "5px",
								}}
							>
								<X size={13} /> Disable All
							</button>

							<button
								type="button"
								disabled={batchLoading || loading}
								onClick={() => handleBatchAction("reset_all")}
								style={{
									padding: "6px 12px",
									fontSize: "0.75rem",
									fontWeight: 600,
									borderRadius: "6px",
									border: "1px solid rgba(245, 158, 11, 0.3)",
									background: "rgba(245, 158, 11, 0.12)",
									color: "#fbbf24",
									cursor: "pointer",
									display: "flex",
									alignItems: "center",
									gap: "5px",
								}}
							>
								<RotateCcw size={13} /> Reset Defaults
							</button>
						</div>
					</div>

					{/* Category Filter Pills */}
					<div
						style={{
							display: "flex",
							gap: "8px",
							overflowX: "auto",
							paddingBottom: "4px",
						}}
					>
						{categories.map((cat) => {
							const label = CATEGORY_NAMES[cat] || cat
							const isSelected = selectedCategory === cat
							return (
								<button
									key={cat}
									type="button"
									onClick={() => setSelectedCategory(cat)}
									style={{
										padding: "4px 12px",
										fontSize: "0.74rem",
										fontWeight: isSelected ? 600 : 500,
										borderRadius: "20px",
										border: "none",
										cursor: "pointer",
										whiteSpace: "nowrap",
										background: isSelected ? "var(--primary-cyan)" : "rgba(255, 255, 255, 0.05)",
										color: isSelected ? "#040914" : "var(--text-muted)",
										transition: "all 0.15s ease",
									}}
								>
									{label}
								</button>
							)
						})}
					</div>
				</div>

				{/* Command List Area */}
				<div style={{ flex: 1, overflowY: "auto", padding: "18px 24px" }}>
					{loading ? (
						<div
							style={{
								padding: "40px",
								textAlign: "center",
								color: "var(--text-muted)",
								fontSize: "0.85rem",
								display: "flex",
								flexDirection: "column",
								alignItems: "center",
								gap: "12px",
							}}
						>
							<RefreshCw size={24} className="spin" color="var(--primary-cyan)" />
							Loading group commands...
						</div>
					) : filteredCommands.length === 0 ? (
						<div
							style={{
								padding: "40px",
								textAlign: "center",
								color: "var(--text-muted)",
								fontSize: "0.85rem",
							}}
						>
							No commands match your search query or filter.
						</div>
					) : (
						<div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
							{filteredCommands.map((cmd) => {
								const isToggling = togglingMap[cmd.name]
								const catColor = CATEGORY_COLORS[cmd.category] || {
									bg: "rgba(255, 255, 255, 0.08)",
									text: "var(--text-muted)",
									border: "var(--border-color)",
								}

								return (
									<div
										key={cmd.name}
										style={{
											padding: "14px 18px",
											background: "rgba(255, 255, 255, 0.02)",
											border: "1px solid var(--border-color)",
											borderRadius: "12px",
											display: "flex",
											alignItems: "center",
											justifyContent: "space-between",
											gap: "16px",
											transition: "all 0.2s ease",
										}}
									>
										{/* Command Metadata */}
										<div style={{ flex: 1, minWidth: 0 }}>
											<div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
												<span
													style={{
														fontSize: "0.95rem",
														fontWeight: 700,
														color: "#22d3ee",
														fontFamily: "var(--font-mono)",
													}}
												>
													.{cmd.name}
												</span>

												{cmd.aliases.length > 0 && (
													<span style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
														({cmd.aliases.map((a) => `.${a}`).join(", ")})
													</span>
												)}

												{/* Category Badge */}
												<span
													style={{
														fontSize: "0.65rem",
														fontWeight: 700,
														textTransform: "uppercase",
														padding: "2px 7px",
														borderRadius: "4px",
														background: catColor.bg,
														color: catColor.text,
														border: `1px solid ${catColor.border}`,
													}}
												>
													{cmd.category}
												</span>

												{/* Registration Required Badge */}
												{cmd.needAdminRegisterThisCommand && (
													<span
														style={{
															fontSize: "0.65rem",
															fontWeight: 600,
															padding: "2px 7px",
															borderRadius: "4px",
															background: "rgba(245, 158, 11, 0.15)",
															color: "#fbbf24",
															border: "1px solid rgba(245, 158, 11, 0.3)",
															display: "flex",
															alignItems: "center",
															gap: "4px",
														}}
													>
														<Zap size={10} />
														Registration Required
													</span>
												)}

												{/* Custom Override Badge */}
												{cmd.isCustomized && (
													<span
														style={{
															fontSize: "0.65rem",
															fontWeight: 600,
															padding: "2px 7px",
															borderRadius: "4px",
															background: "rgba(0, 242, 254, 0.12)",
															color: "#22d3ee",
															border: "1px solid rgba(0, 242, 254, 0.3)",
														}}
													>
														Group Override
													</span>
												)}

												{/* Globally Disabled Notice */}
												{cmd.globalStatus === "disabled" && (
													<span
														style={{
															fontSize: "0.65rem",
															fontWeight: 600,
															padding: "2px 7px",
															borderRadius: "4px",
															background: "rgba(239, 68, 68, 0.15)",
															color: "#f87171",
															border: "1px solid rgba(239, 68, 68, 0.3)",
															display: "flex",
															alignItems: "center",
															gap: "4px",
														}}
														title="Disabled at the agent level; this command will not run globally until enabled."
													>
														<AlertTriangle size={10} />
														Globally Disabled
													</span>
												)}
											</div>

											{cmd.description && (
												<p
													style={{
														fontSize: "0.8rem",
														color: "var(--text-muted)",
														marginTop: "5px",
														lineHeight: 1.4,
													}}
												>
													{cmd.description}
												</p>
											)}
										</div>

										{/* Controls: Reset + Status Button */}
										<div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
											{/* Reset to Default Button */}
											{cmd.isCustomized && (
												<button
													type="button"
													disabled={isToggling}
													onClick={(e) => {
														e.stopPropagation()
														handleResetCommand(cmd.name)
													}}
													title="Reset override back to default policy"
													style={{
														padding: "6px 10px",
														fontSize: "0.72rem",
														borderRadius: "8px",
														border: "1px solid var(--border-color)",
														background: "rgba(255, 255, 255, 0.05)",
														color: "var(--text-muted)",
														cursor: "pointer",
														display: "flex",
														alignItems: "center",
														gap: "4px",
														transition: "all 0.15s ease",
													}}
												>
													<RotateCcw size={12} />
													Reset
												</button>
											)}

											{/* Toggle Switch Button */}
											<button
												type="button"
												disabled={isToggling}
												onClick={(e) => {
													e.stopPropagation()
													handleToggleCommand(cmd.name, cmd.status)
												}}
												style={{
													minWidth: "100px",
													padding: "7px 16px",
													fontSize: "0.78rem",
													fontWeight: 700,
													borderRadius: "20px",
													border: "none",
													cursor: isToggling ? "not-allowed" : "pointer",
													opacity: isToggling ? 0.6 : 1,
													background:
														cmd.status === "enabled"
															? "rgba(16, 185, 129, 0.2)"
															: "rgba(239, 68, 68, 0.2)",
													color: cmd.status === "enabled" ? "#34d399" : "#f87171",
													borderWidth: "1px",
													borderStyle: "solid",
													borderColor:
														cmd.status === "enabled"
															? "rgba(16, 185, 129, 0.45)"
															: "rgba(239, 68, 68, 0.45)",
													transition: "all 0.2s ease",
													boxShadow:
														cmd.status === "enabled"
															? "0 0 12px rgba(16, 185, 129, 0.15)"
															: "none",
												}}
											>
												{cmd.status === "enabled" ? "ENABLED" : "DISABLED"}
											</button>
										</div>
									</div>
								)
							})}
						</div>
					)}
				</div>

				{/* Modal Footer */}
				<div
					style={{
						padding: "14px 24px",
						borderTop: "1px solid var(--border-color)",
						background: "rgba(255, 255, 255, 0.02)",
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						fontSize: "0.78rem",
						color: "var(--text-dim)",
					}}
				>
					<span>
						Showing <strong>{filteredCommands.length}</strong> of {totalCommands} commands
					</span>
					<button
						type="button"
						onClick={onClose}
						className="secondary-btn"
						style={{ padding: "6px 16px", fontSize: "0.8rem" }}
					>
						Done
					</button>
				</div>
			</div>
		</div>
	)
}
