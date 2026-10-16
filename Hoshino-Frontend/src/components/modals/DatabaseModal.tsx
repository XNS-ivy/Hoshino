import React, { useCallback, useEffect, useState } from "react"
import {
	AlertTriangle,
	Check,
	Clock,
	Database,
	HardDrive,
	Layers,
	MessageSquare,
	RefreshCw,
	Save,
	ShieldAlert,
	Trash2,
	X,
	Zap,
} from "lucide-react"
import {
	cleanDatabaseMessages,
	fetchDatabaseStats,
	runDatabaseVacuum,
	updateDatabaseSettings,
} from "../../services/api"
import type { DatabaseSettings, DatabaseStats } from "../../types"

interface DatabaseModalProps {
	isOpen: boolean
	onClose: () => void
}

export const DatabaseModal: React.FC<DatabaseModalProps> = ({
	isOpen,
	onClose,
}) => {
	const [stats, setStats] = useState<DatabaseStats | null>(null)
	const [loading, setLoading] = useState(false)
	const [actionLoading, setActionLoading] = useState<string | null>(null)
	const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null)

	// Editable settings state
	const [autoPrune, setAutoPrune] = useState(true)
	const [retentionDays, setRetentionDays] = useState(7)
	const [maxPerChat, setMaxPerChat] = useState(500)
	const [cleanMediaBloat, setCleanMediaBloat] = useState(true)

	const showToast = (type: "success" | "error", message: string) => {
		setToast({ type, message })
		setTimeout(() => setToast(null), 4000)
	}

	const loadStats = useCallback(async () => {
		try {
			setLoading(true)
			const data = await fetchDatabaseStats()
			setStats(data)
			if (data.settings) {
				setAutoPrune(data.settings.autoPruneEnabled)
				setRetentionDays(data.settings.retentionDays)
				setMaxPerChat(data.settings.maxMessagesPerChat)
				setCleanMediaBloat(data.settings.cleanMediaBloat)
			}
		} catch (err) {
			showToast("error", `Failed to load database stats: ${err}`)
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		if (isOpen) {
			loadStats()
		}
	}, [isOpen, loadStats])

	if (!isOpen) return null

	const handleSaveSettings = async () => {
		try {
			setActionLoading("settings")
			const updated = await updateDatabaseSettings({
				autoPruneEnabled: autoPrune,
				retentionDays,
				maxMessagesPerChat: maxPerChat,
				cleanMediaBloat,
			})
			if (stats) {
				setStats({ ...stats, settings: updated })
			}
			showToast("success", "Retention policy settings saved successfully!")
		} catch (err) {
			showToast("error", `Failed to save settings: ${err}`)
		} finally {
			setActionLoading(null)
		}
	}

	const handlePruneMessages = async (days: number) => {
		if (!confirm(`Are you sure you want to prune messages older than ${days} days?`)) {
			return
		}
		try {
			setActionLoading("prune")
			const res = await cleanDatabaseMessages({
				retentionDays: days,
				maxMessagesPerChat: maxPerChat,
				purgeMediaOnly: false,
			})
			showToast("success", `Pruned ${res.deletedMessages} messages & ${res.strippedMedia} media payloads!`)
			await loadStats()
		} catch (err) {
			showToast("error", `Prune failed: ${err}`)
		} finally {
			setActionLoading(null)
		}
	}

	const handlePurgeMediaBloat = async () => {
		if (
			!confirm(
				"This will strip all heavy base64 sticker/image payloads from stored messages. Chat text and message metadata will remain 100% intact. Continue?",
			)
		) {
			return
		}
		try {
			setActionLoading("purgeMedia")
			const res = await cleanDatabaseMessages({ purgeMediaOnly: true })
			showToast("success", `Stripped ${res.strippedMedia} base64 media payloads from database!`)
			await loadStats()
		} catch (err) {
			showToast("error", `Media purge failed: ${err}`)
		} finally {
			setActionLoading(null)
		}
	}

	const handleVacuumFull = async () => {
		if (
			!confirm(
				"Execute VACUUM FULL on public.messages? This physically reclaims disk space back to the OS and rebuilds indexes. It may take several seconds.",
			)
		) {
			return
		}
		try {
			setActionLoading("vacuum")
			const res = await runDatabaseVacuum("messages")
			showToast("success", res.message || "VACUUM FULL completed successfully!")
			await loadStats()
		} catch (err) {
			showToast("error", `VACUUM FULL failed: ${err}`)
		} finally {
			setActionLoading(null)
		}
	}

	const isSizeHigh = (stats?.totalSizeBytes || 0) > 1024 * 1024 * 1024 // > 1 GB

	return (
		<div
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				background: "rgba(0, 0, 0, 0.75)",
				backdropFilter: "blur(6px)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 1000,
				padding: "20px",
			}}
			onClick={onClose}
		>
			<div
				className="glass-panel"
				style={{
					width: "100%",
					maxWidth: "880px",
					maxHeight: "90vh",
					display: "flex",
					flexDirection: "column",
					borderRadius: "16px",
					background: "rgba(10, 15, 26, 0.95)",
					border: "1px solid rgba(0, 242, 254, 0.3)",
					boxShadow: "0 25px 60px rgba(0, 0, 0, 0.7), 0 0 30px rgba(0, 242, 254, 0.15)",
					overflow: "hidden",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div
					style={{
						padding: "18px 24px",
						borderBottom: "1px solid var(--border-color)",
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						background: "rgba(0, 0, 0, 0.2)",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
						<div
							style={{
								width: "40px",
								height: "40px",
								borderRadius: "10px",
								background: "linear-gradient(135deg, rgba(0, 242, 254, 0.2) 0%, rgba(79, 172, 254, 0.2) 100%)",
								border: "1px solid rgba(0, 242, 254, 0.4)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
							}}
						>
							<Database size={22} color="#00f2fe" />
						</div>
						<div>
							<h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
								Database Management <span className="gradient-text">& Storage Health</span>
							</h3>
							<p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>
								PostgreSQL auto-cleanup, message pruning, and physical disk space reclamation
							</p>
						</div>
					</div>

					<div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
						<button
							type="button"
							onClick={loadStats}
							disabled={loading}
							className="secondary-btn"
							style={{ padding: "6px 12px", fontSize: "0.8rem" }}
							title="Refresh metrics"
						>
							<RefreshCw size={14} className={loading ? "spin" : ""} />
							Refresh
						</button>
						<button
							type="button"
							onClick={onClose}
							style={{
								background: "transparent",
								border: "none",
								color: "var(--text-muted)",
								cursor: "pointer",
								padding: "6px",
								borderRadius: "6px",
								display: "flex",
							}}
						>
							<X size={20} />
						</button>
					</div>
				</div>

				{/* Toast notification banner */}
				{toast && (
					<div
						style={{
							padding: "10px 24px",
							background:
								toast.type === "success" ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
							borderBottom:
								toast.type === "success"
									? "1px solid rgba(16, 185, 129, 0.4)"
									: "1px solid rgba(239, 68, 68, 0.4)",
							color: toast.type === "success" ? "#34d399" : "#f87171",
							fontSize: "0.85rem",
							display: "flex",
							alignItems: "center",
							gap: "8px",
						}}
					>
						{toast.type === "success" ? <Check size={16} /> : <AlertTriangle size={16} />}
						{toast.message}
					</div>
				)}

				{/* Body Content */}
				<div
					style={{
						padding: "24px",
						overflowY: "auto",
						display: "flex",
						flexDirection: "column",
						gap: "24px",
					}}
				>
					{/* Storage Gauge Metric Cards */}
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
							gap: "14px",
						}}
					>
						{/* Total Size */}
						<div
							style={{
								background: "rgba(255, 255, 255, 0.03)",
								border: isSizeHigh ? "1px solid rgba(245, 158, 11, 0.4)" : "1px solid var(--border-color)",
								borderRadius: "12px",
								padding: "14px 16px",
								position: "relative",
								overflow: "hidden",
							}}
						>
							<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
								<span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>TOTAL DISK SIZE</span>
								<HardDrive size={16} color={isSizeHigh ? "#fbbf24" : "#00f2fe"} />
							</div>
							<div
								style={{
									fontSize: "1.45rem",
									fontWeight: 800,
									color: isSizeHigh ? "#fbbf24" : "var(--text-main)",
									fontFamily: "var(--font-mono)",
								}}
							>
								{stats?.totalSize || "..."}
							</div>
							<div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "4px" }}>
								Database: <strong>{stats?.databaseName || "hoshino"}</strong>
							</div>
						</div>

						{/* Messages Table */}
						<div
							style={{
								background: "rgba(255, 255, 255, 0.03)",
								border: "1px solid var(--border-color)",
								borderRadius: "12px",
								padding: "14px 16px",
							}}
						>
							<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
								<span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>MESSAGES STORED</span>
								<MessageSquare size={16} color="#60a5fa" />
							</div>
							<div
								style={{
									fontSize: "1.45rem",
									fontWeight: 800,
									color: "var(--text-main)",
									fontFamily: "var(--font-mono)",
								}}
							>
								{stats ? stats.messagesCount.toLocaleString() : "..."}
							</div>
							<div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "4px" }}>
								Across {stats?.chatsCount || 0} chats
							</div>
						</div>

						{/* Media Bloat Count */}
						<div
							style={{
								background: stats && stats.mediaBloatCount > 0 ? "rgba(239, 68, 68, 0.08)" : "rgba(255, 255, 255, 0.03)",
								border: stats && stats.mediaBloatCount > 0 ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid var(--border-color)",
								borderRadius: "12px",
								padding: "14px 16px",
							}}
						>
							<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
								<span style={{ fontSize: "0.75rem", color: stats && stats.mediaBloatCount > 0 ? "#f87171" : "var(--text-muted)", fontWeight: 600 }}>
									BASE64 MEDIA BLOAT
								</span>
								<ShieldAlert size={16} color={stats && stats.mediaBloatCount > 0 ? "#f87171" : "var(--text-muted)"} />
							</div>
							<div
								style={{
									fontSize: "1.45rem",
									fontWeight: 800,
									color: stats && stats.mediaBloatCount > 0 ? "#f87171" : "var(--text-main)",
									fontFamily: "var(--font-mono)",
								}}
							>
								{stats ? stats.mediaBloatCount.toLocaleString() : "..."}
							</div>
							<div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "4px" }}>
								{stats && stats.mediaBloatCount > 0 ? "Heavy sticker/photo blobs" : "0 bloat payloads detected"}
							</div>
						</div>

						{/* Auth Signal Keys */}
						<div
							style={{
								background: "rgba(255, 255, 255, 0.03)",
								border: "1px solid var(--border-color)",
								borderRadius: "12px",
								padding: "14px 16px",
							}}
						>
							<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
								<span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>SIGNAL AUTH KEYS</span>
								<Layers size={16} color="#34d399" />
							</div>
							<div
								style={{
									fontSize: "1.45rem",
									fontWeight: 800,
									color: "var(--text-main)",
									fontFamily: "var(--font-mono)",
								}}
							>
								{stats ? stats.authKeysCount.toLocaleString() : "..."}
							</div>
							<div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "4px" }}>
								Baileys E2EE pre-keys & sessions
							</div>
						</div>
					</div>

					{/* One-Click Maintenance & Space Reclamation Bar */}
					<div
						style={{
							background: "rgba(0, 242, 254, 0.04)",
							border: "1px solid rgba(0, 242, 254, 0.2)",
							borderRadius: "14px",
							padding: "18px 20px",
							display: "flex",
							flexDirection: "column",
							gap: "14px",
						}}
					>
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
							<div>
								<h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "var(--text-main)", display: "flex", alignItems: "center", gap: "8px" }}>
									<Zap size={18} color="#00f2fe" />
									One-Click Disk Space Reclamation
								</h4>
								<p style={{ margin: "4px 0 0 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>
									Instantly purge heavy media payloads and reclaim GBs of dead space back to Windows
								</p>
							</div>

							<div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
								{/* Purge Media Bloat Button */}
								<button
									type="button"
									onClick={handlePurgeMediaBloat}
									disabled={actionLoading !== null}
									className="secondary-btn"
									style={{
										fontSize: "0.8rem",
										padding: "8px 14px",
										borderColor: stats && stats.mediaBloatCount > 0 ? "rgba(239, 68, 68, 0.4)" : "var(--border-color)",
										color: stats && stats.mediaBloatCount > 0 ? "#f87171" : "var(--text-main)",
									}}
								>
									<Trash2 size={14} />
									{actionLoading === "purgeMedia" ? "Purging..." : "Purge Base64 Media"}
								</button>

								{/* VACUUM FULL Reclaim Space Button */}
								<button
									type="button"
									onClick={handleVacuumFull}
									disabled={actionLoading !== null}
									className="gradient-btn"
									style={{
										fontSize: "0.8rem",
										padding: "8px 16px",
									}}
								>
									<HardDrive size={14} />
									{actionLoading === "vacuum" ? "Running VACUUM..." : "Reclaim Disk Space (VACUUM)"}
								</button>
							</div>
						</div>
					</div>

					{/* Retention Policy Configuration Card */}
					<div
						style={{
							background: "rgba(255, 255, 255, 0.02)",
							border: "1px solid var(--border-color)",
							borderRadius: "14px",
							padding: "20px",
							display: "flex",
							flexDirection: "column",
							gap: "16px",
						}}
					>
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
							<div>
								<h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "var(--text-main)", display: "flex", alignItems: "center", gap: "8px" }}>
									<Clock size={17} color="#fbbf24" />
									Automated Message Retention Policy
								</h4>
								<p style={{ margin: "4px 0 0 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>
									Background worker automatically prunes expired messages every 6 hours
								</p>
							</div>

							<button
								type="button"
								onClick={handleSaveSettings}
								disabled={actionLoading !== null}
								className="secondary-btn"
								style={{
									fontSize: "0.82rem",
									padding: "7px 16px",
									borderColor: "#00f2fe",
									color: "#00f2fe",
								}}
							>
								<Save size={14} />
								{actionLoading === "settings" ? "Saving..." : "Save Settings"}
							</button>
						</div>

						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
								gap: "16px",
								paddingTop: "10px",
							}}
						>
							{/* Auto-Prune Switch */}
							<div>
								<label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "8px" }}>
									Auto-Prune Status
								</label>
								<button
									type="button"
									onClick={() => setAutoPrune(!autoPrune)}
									style={{
										width: "100%",
										padding: "10px 14px",
										borderRadius: "8px",
										background: autoPrune ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
										border: autoPrune ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid rgba(239, 68, 68, 0.4)",
										color: autoPrune ? "#34d399" : "#f87171",
										fontSize: "0.85rem",
										fontWeight: 600,
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										cursor: "pointer",
									}}
								>
									<span>{autoPrune ? "Enabled (Active)" : "Disabled (Off)"}</span>
									<span style={{ fontSize: "0.75rem", opacity: 0.8 }}>Click to toggle</span>
								</button>
							</div>

							{/* Retention Days Selector */}
							<div>
								<label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "8px" }}>
									Message Retention Days
								</label>
								<select
									value={retentionDays}
									onChange={(e) => setRetentionDays(Number(e.target.value))}
									style={{
										width: "100%",
										padding: "10px 12px",
										borderRadius: "8px",
										background: "rgba(0, 0, 0, 0.4)",
										border: "1px solid var(--border-color)",
										color: "var(--text-main)",
										fontSize: "0.85rem",
										cursor: "pointer",
									}}
								>
									<option value={3}>3 Days (Maximum compactness)</option>
									<option value={7}>7 Days (Recommended for bots)</option>
									<option value={14}>14 Days (2 Weeks)</option>
									<option value={30}>30 Days (1 Month)</option>
									<option value={60}>60 Days (2 Months)</option>
									<option value={90}>90 Days (3 Months)</option>
								</select>
							</div>

							{/* Max Messages Per Chat */}
							<div>
								<label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "8px" }}>
									Max History Per Chat
								</label>
								<select
									value={maxPerChat}
									onChange={(e) => setMaxPerChat(Number(e.target.value))}
									style={{
										width: "100%",
										padding: "10px 12px",
										borderRadius: "8px",
										background: "rgba(0, 0, 0, 0.4)",
										border: "1px solid var(--border-color)",
										color: "var(--text-main)",
										fontSize: "0.85rem",
										cursor: "pointer",
									}}
								>
									<option value={100}>Last 100 messages</option>
									<option value={300}>Last 300 messages</option>
									<option value={500}>Last 500 messages (Balanced)</option>
									<option value={1000}>Last 1,000 messages</option>
									<option value={0}>Unlimited</option>
								</select>
							</div>
						</div>

						{/* Manual Prune Trigger Buttons */}
						<div
							style={{
								borderTop: "1px dashed var(--border-color)",
								paddingTop: "14px",
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								flexWrap: "wrap",
								gap: "10px",
							}}
						>
							<div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
								Last auto-pruned:{" "}
								<strong>
									{stats?.settings?.lastPrunedAt
										? new Date(stats.settings.lastPrunedAt).toLocaleString()
										: "Never"}
								</strong>
							</div>

							<div style={{ display: "flex", gap: "8px" }}>
								<button
									type="button"
									onClick={() => handlePruneMessages(retentionDays)}
									disabled={actionLoading !== null}
									className="secondary-btn"
									style={{
										fontSize: "0.78rem",
										padding: "6px 12px",
										color: "#fbbf24",
										borderColor: "rgba(245, 158, 11, 0.4)",
									}}
								>
									<Trash2 size={13} />
									Prune Messages &gt; {retentionDays} Days Now
								</button>
							</div>
						</div>
					</div>

					{/* Table Storage Breakdown */}
					<div>
						<h4
							style={{
								margin: "0 0 12px 0",
								fontSize: "0.9rem",
								fontWeight: 700,
								color: "var(--text-main)",
								display: "flex",
								alignItems: "center",
								gap: "8px",
							}}
						>
							<Database size={16} color="var(--primary-cyan)" />
							PostgreSQL Table Storage Breakdown
						</h4>

						<div
							style={{
								border: "1px solid var(--border-color)",
								borderRadius: "12px",
								overflow: "hidden",
								background: "rgba(0, 0, 0, 0.2)",
							}}
						>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr",
									padding: "10px 16px",
									background: "rgba(255, 255, 255, 0.04)",
									borderBottom: "1px solid var(--border-color)",
									fontSize: "0.75rem",
									fontWeight: 700,
									color: "var(--text-muted)",
									letterSpacing: "0.03em",
								}}
							>
								<div>TABLE NAME</div>
								<div>TOTAL SIZE</div>
								<div>DATA SIZE</div>
								<div>INDEX SIZE</div>
								<div style={{ textAlign: "right" }}>ROWS (EST.)</div>
							</div>

							<div style={{ maxHeight: "260px", overflowY: "auto" }}>
								{stats?.tables.map((t) => (
									<div
										key={`${t.tableSchema}.${t.tableName}`}
										style={{
											display: "grid",
											gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr",
											padding: "10px 16px",
											borderBottom: "1px solid rgba(255, 255, 255, 0.03)",
											fontSize: "0.8rem",
											alignItems: "center",
										}}
									>
										<div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-main)" }}>
											<span style={{ color: "var(--text-dim)", fontSize: "0.72rem" }}>{t.tableSchema}.</span>
											{t.tableName}
										</div>
										<div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "#00f2fe" }}>
											{t.totalSize}
										</div>
										<div style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontSize: "0.78rem" }}>
											{t.tableSize}
										</div>
										<div style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)", fontSize: "0.78rem" }}>
											{t.indexSize}
										</div>
										<div style={{ fontFamily: "var(--font-mono)", textAlign: "right", color: "var(--text-main)" }}>
											{t.rowCount.toLocaleString()}
										</div>
									</div>
								))}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
