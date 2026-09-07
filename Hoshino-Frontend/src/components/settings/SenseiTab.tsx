import React, { useState, useMemo } from "react"
import {
	Check,
	Edit3,
	Gem,
	Heart,
	Layers,
	Plus,
	RefreshCw,
	Search,
	Sparkles,
	Trash2,
	User,
	UserCheck,
	Users,
	X,
} from "lucide-react"
import { API_BASE_URL } from "../../services/api"
import type {
	SenseiBondItem,
	SenseiProfileItem,
	SenseiStudentItem,
} from "../../types"
import type { ContactItem } from "./ContactSelector"

interface SenseiTabProps {
	agentId: string
	profiles: SenseiProfileItem[]
	contacts?: ContactItem[]
	loading: boolean
	onRefresh: () => void
	onShowToast: (type: "success" | "error", message: string) => void
}

export const SenseiTab: React.FC<SenseiTabProps> = ({
	agentId,
	profiles,
	contacts = [],
	loading,
	onRefresh,
	onShowToast,
}) => {
	const [search, setSearch] = useState("")
	const [selectedSensei, setSelectedSensei] = useState<{
		profile: SenseiProfileItem
		students: SenseiStudentItem[]
		bonds: SenseiBondItem[]
	} | null>(null)
	const [loadingDetail, setLoadingDetail] = useState(false)

	// Quick Grant Form States
	const [targetType, setTargetType] = useState<"existing" | "contact" | "custom">("existing")
	const [selectedProfileJid, setSelectedProfileJid] = useState<string>("")
	const [selectedContactJid, setSelectedContactJid] = useState<string>("")
	const [customJid, setCustomJid] = useState("")
	const [grantMode, setGrantMode] = useState<"add" | "set">("add")
	const [grantAmount, setGrantAmount] = useState<number>(1200)
	const [isGranting, setIsGranting] = useState(false)

	// Inline Edit Modal
	const [editingSensei, setEditingSensei] = useState<SenseiProfileItem | null>(null)
	const [editAmount, setEditAmount] = useState<number>(0)
	const [isEditing, setIsEditing] = useState(false)

	// Helper to format clean phone display
	const formatPhone = (jid: string) => {
		const raw = jid.split("@")[0].replace(/[^0-9]/g, "")
		return raw ? `+${raw}` : jid
	}

	// Active targeted JID for quick grant
	const resolvedTargetJid = useMemo(() => {
		if (targetType === "existing") {
			return selectedProfileJid || (profiles[0]?.userJid ?? "")
		}
		if (targetType === "contact") {
			return selectedContactJid
		}
		return customJid.trim()
	}, [targetType, selectedProfileJid, selectedContactJid, customJid, profiles])

	// Target profile for live preview
	const targetProfile = useMemo(() => {
		if (!resolvedTargetJid) return null
		const cleanTarget = resolvedTargetJid.replace(/@.*$/, "").replace(/[^0-9]/g, "")
		return (
			profiles.find(
				(p) =>
					p.userJid === resolvedTargetJid ||
					p.userJid.replace(/@.*$/, "").replace(/[^0-9]/g, "") === cleanTarget,
			) || null
		)
	}, [resolvedTargetJid, profiles])

	const filteredProfiles = useMemo(() => {
		const q = search.toLowerCase().trim()
		if (!q) return profiles
		const digits = q.replace(/[^0-9]/g, "")
		return profiles.filter((p) => {
			const jidMatch = p.userJid.toLowerCase().includes(q)
			const nameMatch = p.pushName && p.pushName.toLowerCase().includes(q)
			const phoneMatch =
				digits && p.userJid.replace(/@.*$/, "").replace(/[^0-9]/g, "").includes(digits)
			return jidMatch || nameMatch || phoneMatch
		})
	}, [profiles, search])

	const handleGrantPyroxenes = async (
		userJid: string,
		amount: number,
		isSet = false,
	) => {
		if (!userJid.trim()) {
			onShowToast("error", "Please select or enter a Sensei JID/Phone number")
			return
		}
		setIsGranting(true)
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/agents/${agentId}/sensei/${encodeURIComponent(userJid.trim())}/pyroxenes`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(isSet ? { setAmount: amount } : { amount }),
				},
			)
			const json = await res.json()
			if (json.success) {
				const verb = isSet ? `set to ${amount.toLocaleString()}` : `+${amount.toLocaleString()}`
				onShowToast("success", `Pyroxenes successfully ${verb} 💎`)
				onRefresh()
				if (selectedSensei && selectedSensei.profile.userJid === userJid) {
					inspectSensei(userJid)
				}
			} else {
				onShowToast("error", json.message || "Failed to update Pyroxenes")
			}
		} catch (err) {
			onShowToast("error", `Network error: ${err}`)
		} finally {
			setIsGranting(false)
		}
	}

	const handleInlineSave = async () => {
		if (!editingSensei) return
		setIsEditing(true)
		try {
			await handleGrantPyroxenes(editingSensei.userJid, editAmount, true)
			setEditingSensei(null)
		} finally {
			setIsEditing(false)
		}
	}

	const handleDeleteSensei = async (userJid: string, name: string) => {
		if (
			!window.confirm(
				`Are you sure you want to reset and delete Sensei "${name}" (${userJid})?\n\nAll student collection and bond progress will be permanently erased.`,
			)
		) {
			return
		}

		try {
			const res = await fetch(
				`${API_BASE_URL}/api/agents/${agentId}/sensei/${encodeURIComponent(userJid)}`,
				{ method: "DELETE" },
			)
			const json = await res.json()
			if (json.success) {
				onShowToast("success", "Sensei profile reset successfully")
				setSelectedSensei(null)
				onRefresh()
			} else {
				onShowToast("error", json.message || "Failed to delete Sensei")
			}
		} catch (err) {
			onShowToast("error", `Error: ${err}`)
		}
	}

	const inspectSensei = async (userJid: string) => {
		setLoadingDetail(true)
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/agents/${agentId}/sensei/${encodeURIComponent(userJid)}`,
			)
			const json = await res.json()
			if (json.success && json.data) {
				setSelectedSensei({
					profile: json.data,
					students: json.data.students || [],
					bonds: json.data.bonds || [],
				})
			} else {
				onShowToast("error", "Failed to load Sensei details")
			}
		} catch (err) {
			onShowToast("error", `Error: ${err}`)
		} finally {
			setLoadingDetail(false)
		}
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
			{/* Top Summary Bar */}
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
					gap: "12px",
				}}
			>
				<div
					style={{
						background: "rgba(255, 255, 255, 0.04)",
						border: "1px solid var(--border-color)",
						borderRadius: "12px",
						padding: "14px 18px",
						display: "flex",
						alignItems: "center",
						gap: "12px",
					}}
				>
					<div
						style={{
							width: "40px",
							height: "40px",
							borderRadius: "10px",
							background: "rgba(0, 242, 254, 0.15)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							color: "var(--primary-cyan)",
						}}
					>
						<Users size={20} />
					</div>
					<div>
						<span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>
							Total Sensei Players
						</span>
						<span style={{ fontSize: "1.2rem", fontWeight: 700 }}>
							{profiles.length} Players
						</span>
					</div>
				</div>

				<div
					style={{
						background: "rgba(255, 255, 255, 0.04)",
						border: "1px solid var(--border-color)",
						borderRadius: "12px",
						padding: "14px 18px",
						display: "flex",
						alignItems: "center",
						gap: "12px",
					}}
				>
					<div
						style={{
							width: "40px",
							height: "40px",
							borderRadius: "10px",
							background: "rgba(56, 189, 248, 0.15)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							color: "#38bdf8",
						}}
					>
						<Gem size={20} />
					</div>
					<div>
						<span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>
							Circulating Pyroxenes
						</span>
						<span style={{ fontSize: "1.2rem", fontWeight: 700, color: "#38bdf8" }}>
							{profiles.reduce((acc, p) => acc + (p.pyroxenes || 0), 0).toLocaleString()} 💎
						</span>
					</div>
				</div>

				<div
					style={{
						background: "rgba(255, 255, 255, 0.04)",
						border: "1px solid var(--border-color)",
						borderRadius: "12px",
						padding: "14px 18px",
						display: "flex",
						alignItems: "center",
						gap: "12px",
					}}
				>
					<div
						style={{
							width: "40px",
							height: "40px",
							borderRadius: "10px",
							background: "rgba(236, 72, 153, 0.15)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							color: "#ec4899",
						}}
					>
						<Sparkles size={20} />
					</div>
					<div>
						<span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>
							Total Gacha Pulls
						</span>
						<span style={{ fontSize: "1.2rem", fontWeight: 700, color: "#ec4899" }}>
							{profiles.reduce((acc, p) => acc + (p.totalPulls || 0), 0).toLocaleString()} Pulls
						</span>
					</div>
				</div>
			</div>

			{/* Quick Pyroxene Grant Panel */}
			<div
				style={{
					background: "linear-gradient(135deg, rgba(0, 242, 254, 0.05) 0%, rgba(236, 72, 153, 0.05) 100%)",
					border: "1px solid rgba(0, 242, 254, 0.25)",
					borderRadius: "14px",
					padding: "18px 20px",
					display: "flex",
					flexDirection: "column",
					gap: "14px",
				}}
			>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
					<span style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--primary-cyan)", display: "flex", alignItems: "center", gap: "8px" }}>
						<Gem size={18} /> Quick Pyroxene Grant & Management
					</span>

					{/* Target Mode Selector Tabs */}
					<div
						style={{
							display: "flex",
							background: "rgba(0, 0, 0, 0.3)",
							padding: "3px",
							borderRadius: "8px",
							border: "1px solid var(--border-color)",
							gap: "4px",
						}}
					>
						<button
							type="button"
							onClick={() => setTargetType("existing")}
							style={{
								padding: "4px 10px",
								borderRadius: "6px",
								border: "none",
								background: targetType === "existing" ? "var(--primary-cyan)" : "transparent",
								color: targetType === "existing" ? "#040914" : "var(--text-muted)",
								fontWeight: 600,
								fontSize: "0.75rem",
								cursor: "pointer",
								transition: "all 0.15s ease",
							}}
						>
							Existing Sensei ({profiles.length})
						</button>
						{contacts.length > 0 && (
							<button
								type="button"
								onClick={() => setTargetType("contact")}
								style={{
									padding: "4px 10px",
									borderRadius: "6px",
									border: "none",
									background: targetType === "contact" ? "var(--primary-cyan)" : "transparent",
									color: targetType === "contact" ? "#040914" : "var(--text-muted)",
									fontWeight: 600,
									fontSize: "0.75rem",
									cursor: "pointer",
									transition: "all 0.15s ease",
								}}
							>
								Saved Contacts
							</button>
						)}
						<button
							type="button"
							onClick={() => setTargetType("custom")}
							style={{
								padding: "4px 10px",
								borderRadius: "6px",
								border: "none",
								background: targetType === "custom" ? "var(--primary-cyan)" : "transparent",
								color: targetType === "custom" ? "#040914" : "var(--text-muted)",
								fontWeight: 600,
								fontSize: "0.75rem",
								cursor: "pointer",
								transition: "all 0.15s ease",
							}}
						>
							Custom Phone / JID
						</button>
					</div>
				</div>

				<div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
					{/* Target Selector Control */}
					<div style={{ flex: 2, minWidth: "260px" }}>
						{targetType === "existing" && (
							<select
								value={selectedProfileJid || (profiles[0]?.userJid ?? "")}
								onChange={(e) => setSelectedProfileJid(e.target.value)}
								style={{
									width: "100%",
									padding: "9px 12px",
									borderRadius: "8px",
									background: "rgba(0, 0, 0, 0.4)",
									border: "1px solid rgba(0, 242, 254, 0.3)",
									color: "var(--text-main)",
									fontSize: "0.85rem",
									outline: "none",
								}}
							>
								{profiles.length === 0 ? (
									<option value="">No existing Sensei registered yet</option>
								) : (
									profiles.map((p) => (
										<option key={p.userJid} value={p.userJid}>
											🌸 {p.pushName || formatPhone(p.userJid)} ({formatPhone(p.userJid)}) • {p.pyroxenes.toLocaleString()} 💎
										</option>
									))
								)}
							</select>
						)}

						{targetType === "contact" && (
							<select
								value={selectedContactJid}
								onChange={(e) => setSelectedContactJid(e.target.value)}
								style={{
									width: "100%",
									padding: "9px 12px",
									borderRadius: "8px",
									background: "rgba(0, 0, 0, 0.4)",
									border: "1px solid rgba(0, 242, 254, 0.3)",
									color: "var(--text-main)",
									fontSize: "0.85rem",
									outline: "none",
								}}
							>
								<option value="">-- Select Saved Contact --</option>
								{contacts.map((c) => (
									<option key={c.jid} value={c.jid}>
										{c.pushName ? `${c.pushName} (${c.phoneNumber})` : c.jid}
									</option>
								))}
							</select>
						)}

						{targetType === "custom" && (
							<input
								type="text"
								placeholder="Enter phone or JID (e.g. 6283199219663 or +55955454697708)"
								value={customJid}
								onChange={(e) => setCustomJid(e.target.value)}
								style={{
									width: "100%",
									padding: "9px 12px",
									borderRadius: "8px",
									background: "rgba(0, 0, 0, 0.4)",
									border: "1px solid rgba(0, 242, 254, 0.3)",
									color: "var(--text-main)",
									fontSize: "0.85rem",
									outline: "none",
								}}
							/>
						)}
					</div>

					{/* Grant Mode Toggle: Add (+) vs Set (=) */}
					<div
						style={{
							display: "flex",
							background: "rgba(0, 0, 0, 0.3)",
							padding: "3px",
							borderRadius: "8px",
							border: "1px solid var(--border-color)",
						}}
					>
						<button
							type="button"
							onClick={() => setGrantMode("add")}
							style={{
								padding: "6px 12px",
								borderRadius: "6px",
								border: "none",
								background: grantMode === "add" ? "rgba(56, 189, 248, 0.25)" : "transparent",
								color: grantMode === "add" ? "#38bdf8" : "var(--text-muted)",
								fontWeight: 700,
								fontSize: "0.8rem",
								cursor: "pointer",
							}}
						>
							+ Add
						</button>
						<button
							type="button"
							onClick={() => setGrantMode("set")}
							style={{
								padding: "6px 12px",
								borderRadius: "6px",
								border: "none",
								background: grantMode === "set" ? "rgba(236, 72, 153, 0.25)" : "transparent",
								color: grantMode === "set" ? "#ec4899" : "var(--text-muted)",
								fontWeight: 700,
								fontSize: "0.8rem",
								cursor: "pointer",
							}}
						>
							= Set Exact
						</button>
					</div>

					{/* Amount Input */}
					<div style={{ width: "130px" }}>
						<input
							type="number"
							value={grantAmount}
							onChange={(e) => setGrantAmount(Number(e.target.value))}
							style={{
								width: "100%",
								padding: "9px 12px",
								borderRadius: "8px",
								background: "rgba(0, 0, 0, 0.4)",
								border: "1px solid var(--border-color)",
								color: "#38bdf8",
								fontWeight: 700,
								fontSize: "0.9rem",
								outline: "none",
							}}
						/>
					</div>

					{/* Submit Action Button */}
					<button
						type="button"
						disabled={!resolvedTargetJid || isGranting}
						onClick={() => handleGrantPyroxenes(resolvedTargetJid, grantAmount, grantMode === "set")}
						style={{
							padding: "9px 18px",
							borderRadius: "8px",
							background: "linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)",
							border: "none",
							color: "#040914",
							fontWeight: 700,
							fontSize: "0.88rem",
							cursor: !resolvedTargetJid || isGranting ? "not-allowed" : "pointer",
							opacity: !resolvedTargetJid || isGranting ? 0.6 : 1,
							display: "flex",
							alignItems: "center",
							gap: "6px",
							boxShadow: "0 4px 12px rgba(0, 242, 254, 0.25)",
						}}
					>
						<Plus size={16} /> {isGranting ? "Sending..." : "Send Pyroxenes"}
					</button>
				</div>

				{/* Quick Presets & Target Balance Preview */}
				<div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "10px", paddingTop: "4px" }}>
					<div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
						<span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginRight: "4px" }}>
							Presets:
						</span>
						{[
							{ label: "+1.2k (10-Pull)", val: 1200 },
							{ label: "+6k (50-Pull)", val: 6000 },
							{ label: "+12k (100-Pull)", val: 12000 },
							{ label: "+24k (Spark 200)", val: 24000 },
						].map((preset) => (
							<button
								key={preset.val}
								type="button"
								onClick={() => {
									setGrantAmount(preset.val)
									setGrantMode("add")
								}}
								style={{
									padding: "4px 9px",
									borderRadius: "6px",
									background: grantAmount === preset.val && grantMode === "add" ? "rgba(0, 242, 254, 0.2)" : "rgba(255, 255, 255, 0.05)",
									border: `1px solid ${grantAmount === preset.val && grantMode === "add" ? "var(--primary-cyan)" : "var(--border-color)"}`,
									color: grantAmount === preset.val && grantMode === "add" ? "var(--primary-cyan)" : "var(--text-muted)",
									fontSize: "0.75rem",
									cursor: "pointer",
								}}
							>
								{preset.label}
							</button>
						))}
					</div>

					{/* Live Target Projected Balance Preview */}
					{targetProfile && (
						<div
							style={{
								fontSize: "0.78rem",
								color: "var(--text-muted)",
								background: "rgba(0, 0, 0, 0.3)",
								padding: "4px 10px",
								borderRadius: "6px",
								border: "1px solid rgba(255, 255, 255, 0.08)",
								display: "flex",
								alignItems: "center",
								gap: "6px",
							}}
						>
							<UserCheck size={13} color="var(--primary-cyan)" />
							<span>
								Target: <strong style={{ color: "var(--text-main)" }}>{targetProfile.pushName || formatPhone(targetProfile.userJid)}</strong>
							</span>
							<span>•</span>
							<span>
								Current: <strong style={{ color: "#38bdf8" }}>{targetProfile.pyroxenes.toLocaleString()} 💎</strong>
							</span>
							<span>➔</span>
							<span>
								Projected:{" "}
								<strong style={{ color: "#34d399" }}>
									{(grantMode === "set"
										? grantAmount
										: Math.max(0, targetProfile.pyroxenes + grantAmount)
									).toLocaleString()}{" "}
									💎
								</strong>
							</span>
						</div>
					)}
				</div>
			</div>

			{/* Action Toolbar */}
			<div
				style={{
					display: "flex",
					gap: "12px",
					flexWrap: "wrap",
					alignItems: "center",
					justifyContent: "space-between",
				}}
			>
				<div style={{ position: "relative", minWidth: "260px", flex: 1 }}>
					<Search
						size={16}
						style={{
							position: "absolute",
							left: "12px",
							top: "50%",
							transform: "translateY(-50%)",
							color: "var(--text-muted)",
						}}
					/>
					<input
						type="text"
						placeholder="Search by Sensei name or phone number..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						style={{
							width: "100%",
							padding: "10px 14px 10px 36px",
							borderRadius: "8px",
							background: "rgba(255, 255, 255, 0.05)",
							border: "1px solid var(--border-color)",
							color: "var(--text-main)",
							fontSize: "0.88rem",
							outline: "none",
						}}
					/>
				</div>

				<div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
					<button
						type="button"
						onClick={onRefresh}
						disabled={loading}
						style={{
							display: "flex",
							alignItems: "center",
							gap: "6px",
							padding: "9px 14px",
							borderRadius: "8px",
							background: "rgba(255, 255, 255, 0.06)",
							border: "1px solid var(--border-color)",
							color: "var(--text-main)",
							cursor: "pointer",
							fontSize: "0.85rem",
						}}
					>
						<RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
					</button>
				</div>
			</div>

			{/* Sensei Profiles Table */}
			<div
				style={{
					border: "1px solid var(--border-color)",
					borderRadius: "12px",
					overflow: "hidden",
					background: "rgba(0, 0, 0, 0.2)",
				}}
			>
				<table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.88rem" }}>
					<thead>
						<tr style={{ background: "rgba(255, 255, 255, 0.04)", borderBottom: "1px solid var(--border-color)" }}>
							<th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-muted)" }}>Sensei Player</th>
							<th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-muted)" }}>Pyroxenes 💎</th>
							<th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-muted)" }}>Total Pulls</th>
							<th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-muted)" }}>Spark Pity</th>
							<th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-muted)" }}>Collection</th>
							<th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-muted)", textAlign: "right" }}>Actions</th>
						</tr>
					</thead>
					<tbody>
						{filteredProfiles.length === 0 ? (
							<tr>
								<td colSpan={6} style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>
									{loading ? "Loading Sensei records..." : "No Sensei profiles found."}
								</td>
							</tr>
						) : (
							filteredProfiles.map((p) => (
								<tr
									key={p.userJid}
									style={{
										borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
										transition: "background 0.15s ease",
									}}
								>
									<td style={{ padding: "12px 16px" }}>
										<div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
											<div
												style={{
													width: "34px",
													height: "34px",
													borderRadius: "50%",
													background: "rgba(0, 242, 254, 0.12)",
													border: "1px solid rgba(0, 242, 254, 0.25)",
													display: "flex",
													alignItems: "center",
													justifyContent: "center",
													color: "var(--primary-cyan)",
													fontWeight: 700,
													fontSize: "0.85rem",
												}}
											>
												<User size={16} />
											</div>
											<div>
												<span style={{ fontWeight: 600, display: "block" }}>
													{p.pushName || formatPhone(p.userJid)}
												</span>
												<div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
													<span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
														{formatPhone(p.userJid)}
													</span>
													{p.userJid.includes("@lid") && (
														<span
															style={{
																fontSize: "0.65rem",
																padding: "1px 5px",
																borderRadius: "4px",
																background: "rgba(168, 85, 247, 0.2)",
																color: "#c084fc",
																fontWeight: 600,
															}}
														>
															LID
														</span>
													)}
												</div>
											</div>
										</div>
									</td>

									<td style={{ padding: "12px 16px" }}>
										<div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
											<span style={{ fontWeight: 700, color: "#38bdf8", fontSize: "0.95rem" }}>
												{p.pyroxenes.toLocaleString()} 💎
											</span>
											<button
												type="button"
												title="Edit balance"
												onClick={() => {
													setEditingSensei(p)
													setEditAmount(p.pyroxenes)
												}}
												style={{
													background: "none",
													border: "none",
													color: "var(--text-muted)",
													cursor: "pointer",
													padding: "2px",
													opacity: 0.7,
												}}
											>
												<Edit3 size={13} />
											</button>
										</div>
									</td>

									<td style={{ padding: "12px 16px" }}>
										{p.totalPulls} pulls
									</td>

									<td style={{ padding: "12px 16px" }}>
										<span
											style={{
												padding: "3px 8px",
												borderRadius: "6px",
												background: p.sparkPoints >= 200 ? "rgba(234, 179, 8, 0.2)" : "rgba(255, 255, 255, 0.06)",
												color: p.sparkPoints >= 200 ? "#eab308" : "inherit",
												fontWeight: p.sparkPoints >= 200 ? 700 : 400,
												fontSize: "0.8rem",
											}}
										>
											{p.sparkPoints}/200 ⭐
										</span>
									</td>

									<td style={{ padding: "12px 16px" }}>
										<span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
											{p.totalStudents ?? 0} Students (Rank {p.highestBondLevel ?? 1} ❤️)
										</span>
									</td>

									<td style={{ padding: "12px 16px", textAlign: "right" }}>
										<div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
											<button
												type="button"
												title="Quick Grant +1,200 Pyroxenes (10-pull)"
												onClick={() => handleGrantPyroxenes(p.userJid, 1200)}
												style={{
													padding: "5px 9px",
													borderRadius: "6px",
													background: "rgba(56, 189, 248, 0.15)",
													border: "1px solid rgba(56, 189, 248, 0.3)",
													color: "#38bdf8",
													cursor: "pointer",
													fontSize: "0.78rem",
													fontWeight: 600,
												}}
											>
												+1.2k 💎
											</button>

											<button
												type="button"
												title="Inspect recruited students & bonds"
												onClick={() => inspectSensei(p.userJid)}
												style={{
													padding: "5px 10px",
													borderRadius: "6px",
													background: "rgba(0, 242, 254, 0.12)",
													border: "1px solid rgba(0, 242, 254, 0.25)",
													color: "var(--primary-cyan)",
													cursor: "pointer",
													fontSize: "0.78rem",
													fontWeight: 600,
													display: "flex",
													alignItems: "center",
													gap: "4px",
												}}
											>
												<Layers size={13} /> View Roster
											</button>

											<button
												type="button"
												title="Reset Sensei Profile"
												onClick={() => handleDeleteSensei(p.userJid, p.pushName || formatPhone(p.userJid))}
												style={{
													padding: "5px 8px",
													borderRadius: "6px",
													background: "rgba(239, 68, 68, 0.12)",
													border: "1px solid rgba(239, 68, 68, 0.25)",
													color: "#ef4444",
													cursor: "pointer",
												}}
											>
												<Trash2 size={13} />
											</button>
										</div>
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>

			{/* Inline Edit Balance Modal */}
			{editingSensei && (
				<div
					style={{
						position: "fixed",
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						background: "rgba(0, 0, 0, 0.75)",
						backdropFilter: "blur(4px)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						zIndex: 1200,
						padding: "20px",
					}}
				>
					<div
						style={{
							background: "var(--card-bg, #0b1329)",
							border: "1px solid var(--border-color)",
							borderRadius: "16px",
							width: "100%",
							maxWidth: "420px",
							padding: "20px",
							display: "flex",
							flexDirection: "column",
							gap: "16px",
							boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
						}}
					>
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
							<h3 style={{ fontSize: "1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
								<Gem size={18} color="#38bdf8" /> Edit Sensei Pyroxenes
							</h3>
							<button
								type="button"
								onClick={() => setEditingSensei(null)}
								style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
							>
								<X size={18} />
							</button>
						</div>

						<p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
							Setting exact balance for{" "}
							<strong style={{ color: "var(--text-main)" }}>
								{editingSensei.pushName || formatPhone(editingSensei.userJid)}
							</strong>
						</p>

						<div>
							<label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "6px" }}>
								Pyroxenes Amount (💎)
							</label>
							<input
								type="number"
								value={editAmount}
								onChange={(e) => setEditAmount(Number(e.target.value))}
								style={{
									width: "100%",
									padding: "10px 14px",
									borderRadius: "8px",
									background: "rgba(0, 0, 0, 0.4)",
									border: "1px solid var(--border-color)",
									color: "#38bdf8",
									fontSize: "1rem",
									fontWeight: 700,
									outline: "none",
								}}
							/>
						</div>

						<div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
							<button
								type="button"
								onClick={() => setEditingSensei(null)}
								style={{
									padding: "8px 14px",
									borderRadius: "8px",
									background: "rgba(255, 255, 255, 0.05)",
									border: "1px solid var(--border-color)",
									color: "var(--text-muted)",
									cursor: "pointer",
								}}
							>
								Cancel
							</button>
							<button
								type="button"
								disabled={isEditing}
								onClick={handleInlineSave}
								style={{
									padding: "8px 16px",
									borderRadius: "8px",
									background: "linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)",
									border: "none",
									color: "#040914",
									fontWeight: 700,
									cursor: isEditing ? "not-allowed" : "pointer",
									display: "flex",
									alignItems: "center",
									gap: "6px",
								}}
							>
								<Check size={16} /> {isEditing ? "Saving..." : "Save Balance"}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Detail Drawer / Modal */}
			{selectedSensei && (
				<div
					style={{
						position: "fixed",
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						background: "rgba(0, 0, 0, 0.75)",
						backdropFilter: "blur(4px)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						zIndex: 1100,
						padding: "20px",
					}}
				>
					<div
						style={{
							background: "var(--card-bg, #0b1329)",
							border: "1px solid var(--border-color)",
							borderRadius: "16px",
							width: "100%",
							maxWidth: "700px",
							maxHeight: "85vh",
							display: "flex",
							flexDirection: "column",
							overflow: "hidden",
							boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
						}}
					>
						{/* Drawer Header */}
						<div
							style={{
								padding: "16px 20px",
								borderBottom: "1px solid var(--border-color)",
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
							}}
						>
							<div>
								<h3 style={{ fontSize: "1.1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
									🌸 Sensei: {selectedSensei.profile.pushName || formatPhone(selectedSensei.profile.userJid)}
								</h3>
								<span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
									ID: {selectedSensei.profile.userJid} • Balance: {selectedSensei.profile.pyroxenes.toLocaleString()} 💎 • Spark: {selectedSensei.profile.sparkPoints}/200 ⭐
								</span>
							</div>

							<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
								<button
									type="button"
									onClick={() => handleGrantPyroxenes(selectedSensei.profile.userJid, 1200)}
									style={{
										padding: "6px 10px",
										borderRadius: "6px",
										background: "rgba(56, 189, 248, 0.15)",
										border: "1px solid rgba(56, 189, 248, 0.3)",
										color: "#38bdf8",
										fontSize: "0.78rem",
										fontWeight: 600,
										cursor: "pointer",
									}}
								>
									+1.2k 💎
								</button>
								<button
									type="button"
									onClick={() => setSelectedSensei(null)}
									style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
								>
									<X size={20} />
								</button>
							</div>
						</div>

						{/* Drawer Content */}
						<div style={{ padding: "20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "20px" }}>
							{loadingDetail && (
								<div style={{ textAlign: "center", padding: "20px", color: "var(--text-muted)" }}>
									Loading sensei details...
								</div>
							)}

							{/* Recruited Students Grid */}
							<div>
								<h4 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
									<Users size={16} color="var(--primary-cyan)" /> Recruited Students ({selectedSensei.students.length})
								</h4>

								{selectedSensei.students.length === 0 ? (
									<p style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontStyle: "italic" }}>
										No students recruited yet.
									</p>
								) : (
									<div
										style={{
											display: "grid",
											gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
											gap: "10px",
										}}
									>
										{selectedSensei.students.map((s) => (
											<div
												key={s.studentId}
												style={{
													background: "rgba(255, 255, 255, 0.04)",
													border: `1px solid ${s.starGrade === 3 ? "rgba(234, 179, 8, 0.4)" : "var(--border-color)"}`,
													borderRadius: "10px",
													padding: "10px",
													textAlign: "center",
													position: "relative",
												}}
											>
												<img
													src={`https://schaledb.com/images/student/icon/${s.studentId}.webp`}
													alt={s.studentName}
													style={{ width: "48px", height: "48px", borderRadius: "50%", margin: "0 auto 6px", display: "block" }}
													onError={(e) => {
														e.currentTarget.style.display = "none"
													}}
												/>
												<span style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
													{s.studentName}
												</span>
												<span style={{ fontSize: "0.72rem", color: "#eab308", display: "block" }}>
													{"★".repeat(s.starGrade)}
												</span>
												{s.count > 1 && (
													<span style={{ fontSize: "0.68rem", color: "var(--primary-cyan)", display: "block", marginTop: "2px" }}>
														+{(s.count - 1) * (s.starGrade === 3 ? 30 : s.starGrade === 2 ? 10 : 1)} Eleph
													</span>
												)}
											</div>
										))}
									</div>
								)}
							</div>

							{/* MomoTalk Bonds */}
							<div>
								<h4 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
									<Heart size={16} color="#ec4899" /> MomoTalk Bond Levels ({selectedSensei.bonds.length})
								</h4>

								{selectedSensei.bonds.length === 0 ? (
									<p style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontStyle: "italic" }}>
										No MomoTalk interactions recorded yet.
									</p>
								) : (
									<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
										{selectedSensei.bonds.map((b) => (
											<div
												key={b.studentId}
												style={{
													background: "rgba(255, 255, 255, 0.03)",
													border: "1px solid var(--border-color)",
													borderRadius: "8px",
													padding: "10px 14px",
													display: "flex",
													alignItems: "center",
													justifyContent: "space-between",
												}}
											>
												<div>
													<span style={{ fontWeight: 600, fontSize: "0.88rem" }}>
														{b.studentName}
													</span>
													<span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>
														Total Talks: {b.totalTalks}
													</span>
												</div>
												<div style={{ textAlign: "right" }}>
													<span style={{ fontWeight: 700, color: "#ec4899", fontSize: "0.9rem" }}>
														Rank {b.bondLevel} {"❤️".repeat(Math.min(b.bondLevel, 5))}
													</span>
													<span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>
														{b.bondExp} EXP
													</span>
												</div>
											</div>
										))}
									</div>
								)}
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
