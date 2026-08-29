import React, { useState } from "react"
import {
	Gem,
	Heart,
	Layers,
	Plus,
	RefreshCw,
	Search,
	Sparkles,
	Trash2,
	User,
	Users,
	X,
} from "lucide-react"
import { API_BASE_URL } from "../../services/api"
import type {
	SenseiBondItem,
	SenseiProfileItem,
	SenseiStudentItem,
} from "../../types"

interface SenseiTabProps {
	agentId: string
	profiles: SenseiProfileItem[]
	loading: boolean
	onRefresh: () => void
	onShowToast: (type: "success" | "error", message: string) => void
}

export const SenseiTab: React.FC<SenseiTabProps> = ({
	agentId,
	profiles,
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
	const [_loadingDetail, setLoadingDetail] = useState(false)
	const [grantAmount, setGrantAmount] = useState<number>(1200)
	const [customJid, setCustomJid] = useState("")
	const [isGranting, setIsGranting] = useState(false)

	const filteredProfiles = profiles.filter((p) => {
		const q = search.toLowerCase()
		return (
			p.userJid.toLowerCase().includes(q) ||
			(p.pushName && p.pushName.toLowerCase().includes(q))
		)
	})

	const handleGrantPyroxenes = async (
		userJid: string,
		amount: number,
		isSet = false,
	) => {
		setIsGranting(true)
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/agents/${agentId}/sensei/${encodeURIComponent(userJid)}/pyroxenes`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(isSet ? { setAmount: amount } : { amount }),
				},
			)
			const json = await res.json()
			if (json.success) {
				onShowToast("success", `Pyroxenes updated: ${amount > 0 ? `+${amount}` : amount} 💎`)
				onRefresh()
				if (selectedSensei && selectedSensei.profile.userJid === userJid) {
					inspectSensei(userJid)
				}
			} else {
				onShowToast("error", json.message || "Failed to update Pyroxenes")
			}
		} catch (err) {
			onShowToast("error", `Error: ${err}`)
		} finally {
			setIsGranting(false)
		}
	}

	const handleDeleteSensei = async (userJid: string) => {
		if (
			!window.confirm(
				`Are you sure you want to reset and delete Sensei ${userJid}? All students and bond data will be deleted.`,
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
							Total Sensei
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

			{/* Manual Grant Box */}
			<div
				style={{
					background: "rgba(0, 242, 254, 0.03)",
					border: "1px solid rgba(0, 242, 254, 0.15)",
					borderRadius: "12px",
					padding: "14px 18px",
					display: "flex",
					flexWrap: "wrap",
					alignItems: "center",
					gap: "12px",
				}}
			>
				<span style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--primary-cyan)", display: "flex", alignItems: "center", gap: "6px" }}>
					<Gem size={16} /> Quick Pyroxene Grant:
				</span>
				<input
					type="text"
					placeholder="Phone or JID (e.g. 6283199219663)"
					value={customJid}
					onChange={(e) => setCustomJid(e.target.value)}
					style={{
						padding: "8px 12px",
						borderRadius: "6px",
						background: "rgba(255, 255, 255, 0.05)",
						border: "1px solid var(--border-color)",
						color: "var(--text-main)",
						fontSize: "0.85rem",
						width: "220px",
						outline: "none",
					}}
				/>
				<input
					type="number"
					value={grantAmount}
					onChange={(e) => setGrantAmount(Number(e.target.value))}
					style={{
						padding: "8px 12px",
						borderRadius: "6px",
						background: "rgba(255, 255, 255, 0.05)",
						border: "1px solid var(--border-color)",
						color: "var(--text-main)",
						fontSize: "0.85rem",
						width: "110px",
						outline: "none",
					}}
				/>
				<button
					type="button"
					disabled={!customJid || isGranting}
					onClick={() => {
						const jid = customJid.includes("@") ? customJid : `${customJid}@s.whatsapp.net`
						handleGrantPyroxenes(jid, grantAmount)
					}}
					style={{
						padding: "8px 14px",
						borderRadius: "6px",
						background: "linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)",
						border: "none",
						color: "#040914",
						fontWeight: 600,
						fontSize: "0.85rem",
						cursor: !customJid || isGranting ? "not-allowed" : "pointer",
						opacity: !customJid || isGranting ? 0.6 : 1,
						display: "flex",
						alignItems: "center",
						gap: "6px",
					}}
				>
					<Plus size={14} /> Send Pyroxenes
				</button>
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
													width: "32px",
													height: "32px",
													borderRadius: "50%",
													background: "rgba(255, 255, 255, 0.08)",
													display: "flex",
													alignItems: "center",
													justifyContent: "center",
													color: "var(--primary-cyan)",
												}}
											>
												<User size={16} />
											</div>
											<div>
												<span style={{ fontWeight: 600, display: "block" }}>
													{p.pushName || p.userJid.split("@")[0]}
												</span>
												<span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
													+{p.userJid.split("@")[0]}
												</span>
											</div>
										</div>
									</td>

									<td style={{ padding: "12px 16px", fontWeight: 700, color: "#38bdf8" }}>
										{p.pyroxenes.toLocaleString()} 💎
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
												title="Grant 1,200 Pyroxenes (10-pull)"
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
												onClick={() => handleDeleteSensei(p.userJid)}
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
									🌸 Sensei: {selectedSensei.profile.pushName || selectedSensei.profile.userJid.split("@")[0]}
								</h3>
								<span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
									ID: {selectedSensei.profile.userJid} • Balance: {selectedSensei.profile.pyroxenes.toLocaleString()} 💎 • Spark: {selectedSensei.profile.sparkPoints}/200
								</span>
							</div>

							<button
								type="button"
								onClick={() => setSelectedSensei(null)}
								style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
							>
								<X size={20} />
							</button>
						</div>

						{/* Drawer Content */}
						<div style={{ padding: "20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "20px" }}>
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
