import React, { useState, useEffect } from "react"
import {
	AlertCircle,
	Bot,
	CheckCircle2,
	Crown,
	Plus,
	Search,
	Settings,
	ShieldAlert,
	Trash2,
	Users,
	X,
} from "lucide-react"
import type { Agent } from "../types"

const API_BASE_URL = "http://localhost:3000"

interface AgentSettingsModalProps {
	agent: Agent
	onClose: () => void
}

interface OwnerItem {
	agentId: string
	userJid: string
	role: string
	createdAt: string
}

interface BlacklistItem {
	agentId: string
	userJid: string
	reason: string | null
	createdAt: string
}

interface AutoDeleteItem {
	agentId: string
	userJid: string
	createdAt: string
}

interface CommandToggleItem {
	name: string
	aliases: string[]
	category: string
	description?: string
	access: string
	needAdminRegisterThisCommand: boolean
	status: "enabled" | "disabled"
}

interface GroupSettingsItem {
	agentId: string
	jid: string
	subject?: string | null
	botEnabled: boolean
	welcomeEnabled: boolean
	goodbyeEnabled: boolean
	customPrefix?: string | null
}

interface ContactItem {
	jid: string
	pushName: string | null
	phoneNumber: string
}

type TabType = "owners" | "blacklist" | "autodelete" | "commands" | "groups"

export const AgentSettingsModal: React.FC<AgentSettingsModalProps> = ({
	agent,
	onClose,
}) => {
	const [activeTab, setActiveTab] = useState<TabType>("owners")
	const [loading, setLoading] = useState<boolean>(false)
	const [toast, setToast] = useState<{
		type: "success" | "error"
		message: string
	} | null>(null)

	// Tab States
	const [owners, setOwners] = useState<OwnerItem[]>([])
	const [blacklist, setBlacklist] = useState<BlacklistItem[]>([])
	const [autoDeleteList, setAutoDeleteList] = useState<AutoDeleteItem[]>([])
	const [commands, setCommands] = useState<CommandToggleItem[]>([])
	const [groups, setGroups] = useState<GroupSettingsItem[]>([])
	const [contacts, setContacts] = useState<ContactItem[]>([])
	const [cmdSearch, setCmdSearch] = useState<string>("")
	const [groupSearch, setGroupSearch] = useState<string>("")

	// Input States
	const [newOwnerJid, setNewOwnerJid] = useState<string>("")
	const [newOwnerRole, setNewOwnerRole] = useState<string>("owner")
	const [newBlacklistJid, setNewBlacklistJid] = useState<string>("")
	const [newBlacklistReason, setNewBlacklistReason] = useState<string>("")
	const [newAutoDeleteJid, setNewAutoDeleteJid] = useState<string>("")
	const [newGroupJid, setNewGroupJid] = useState<string>("")

	const showToast = (type: "success" | "error", message: string) => {
		setToast({ type, message })
		setTimeout(() => setToast(null), 3000)
	}

	useEffect(() => {
		fetchContacts()
	}, [agent.agentId])

	useEffect(() => {
		fetchTabData(activeTab)
	}, [activeTab, agent.agentId])

	const fetchContacts = async () => {
		try {
			const res = await fetch(`${API_BASE_URL}/api/agents/${agent.agentId}/contacts`)
			const json = await res.json()
			if (json.success) {
				setContacts(json.data)
			}
		} catch {
			/* ignore contacts load error */
		}
	}

	const fetchTabData = async (tab: TabType) => {
		setLoading(true)
		try {
			const res = await fetch(`${API_BASE_URL}/api/agents/${agent.agentId}/${tab}`)
			const json = await res.json()
			if (json.success) {
				if (tab === "owners") setOwners(json.data)
				if (tab === "blacklist") setBlacklist(json.data)
				if (tab === "autodelete") setAutoDeleteList(json.data)
				if (tab === "commands") setCommands(json.data)
				if (tab === "groups") setGroups(json.data)
			}
		} catch (err) {
			showToast("error", `Failed to load ${tab}: ${err}`)
		} finally {
			setLoading(false)
		}
	}

	// Owner Handlers
	const handleAddOwner = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!newOwnerJid.trim()) return
		try {
			const res = await fetch(`${API_BASE_URL}/api/agents/${agent.agentId}/owners`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					userJid: newOwnerJid.trim(),
					role: newOwnerRole,
				}),
			})
			const json = await res.json()
			if (json.success) {
				showToast("success", "Owner added successfully")
				setNewOwnerJid("")
				fetchTabData("owners")
			} else {
				showToast("error", json.message)
			}
		} catch (err) {
			showToast("error", `Failed to add owner: ${err}`)
		}
	}

	const handleRemoveOwner = async (userJid: string) => {
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/agents/${agent.agentId}/owners/${encodeURIComponent(userJid)}`,
				{ method: "DELETE" },
			)
			const json = await res.json()
			if (json.success) {
				showToast("success", "Owner removed successfully")
				fetchTabData("owners")
			} else {
				showToast("error", json.message)
			}
		} catch (err) {
			showToast("error", `Failed to remove owner: ${err}`)
		}
	}

	// Blacklist Handlers
	const handleAddBlacklist = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!newBlacklistJid.trim()) return
		try {
			const res = await fetch(`${API_BASE_URL}/api/agents/${agent.agentId}/blacklist`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					userJid: newBlacklistJid.trim(),
					reason: newBlacklistReason.trim() || undefined,
				}),
			})
			const json = await res.json()
			if (json.success) {
				showToast("success", "User blacklisted successfully")
				setNewBlacklistJid("")
				setNewBlacklistReason("")
				fetchTabData("blacklist")
			} else {
				showToast("error", json.message)
			}
		} catch (err) {
			showToast("error", `Failed to blacklist user: ${err}`)
		}
	}

	const handleRemoveBlacklist = async (userJid: string) => {
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/agents/${agent.agentId}/blacklist/${encodeURIComponent(userJid)}`,
				{ method: "DELETE" },
			)
			const json = await res.json()
			if (json.success) {
				showToast("success", "User removed from blacklist")
				fetchTabData("blacklist")
			} else {
				showToast("error", json.message)
			}
		} catch (err) {
			showToast("error", `Failed to remove user: ${err}`)
		}
	}

	// AutoDelete Handlers
	const handleAddAutoDelete = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!newAutoDeleteJid.trim()) return
		try {
			const res = await fetch(`${API_BASE_URL}/api/agents/${agent.agentId}/autodelete`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ userJid: newAutoDeleteJid.trim() }),
			})
			const json = await res.json()
			if (json.success) {
				showToast("success", "User added to auto-delete list")
				setNewAutoDeleteJid("")
				fetchTabData("autodelete")
			} else {
				showToast("error", json.message)
			}
		} catch (err) {
			showToast("error", `Failed to add user: ${err}`)
		}
	}

	const handleRemoveAutoDelete = async (userJid: string) => {
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/agents/${agent.agentId}/autodelete/${encodeURIComponent(userJid)}`,
				{ method: "DELETE" },
			)
			const json = await res.json()
			if (json.success) {
				showToast("success", "User removed from auto-delete list")
				fetchTabData("autodelete")
			} else {
				showToast("error", json.message)
			}
		} catch (err) {
			showToast("error", `Failed to remove user: ${err}`)
		}
	}

	// Command Toggle Handler
	const handleToggleCommand = async (
		commandName: string,
		currentStatus: "enabled" | "disabled",
	) => {
		const newStatus = currentStatus === "enabled" ? "disabled" : "enabled"
		setCommands((prev) =>
			prev.map((c) => (c.name === commandName ? { ...c, status: newStatus } : c)),
		)

		try {
			const res = await fetch(
				`${API_BASE_URL}/api/agents/${agent.agentId}/commands/${commandName}`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ status: newStatus }),
				},
			)
			const json = await res.json()
			if (!json.success) {
				showToast("error", json.message)
				fetchTabData("commands")
			}
		} catch (err) {
			showToast("error", `Failed to toggle command: ${err}`)
			fetchTabData("commands")
		}
	}

	// Group Settings Update Handler
	const handleUpdateGroupSettings = async (
		groupJid: string,
		partialSettings: Partial<GroupSettingsItem>,
	) => {
		setGroups((prev) =>
			prev.map((g) => (g.jid === groupJid ? { ...g, ...partialSettings } : g)),
		)

		try {
			const res = await fetch(
				`${API_BASE_URL}/api/agents/${agent.agentId}/groups/${encodeURIComponent(groupJid)}`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(partialSettings),
				},
			)
			const json = await res.json()
			if (json.success) {
				showToast("success", "Group settings updated")
			} else {
				showToast("error", json.message)
				fetchTabData("groups")
			}
		} catch (err) {
			showToast("error", `Failed to update group: ${err}`)
			fetchTabData("groups")
		}
	}

	const handleAddGroupManually = async (e: React.FormEvent) => {
		e.preventDefault()
		let jid = newGroupJid.trim()
		if (!jid) return
		if (!jid.includes("@")) {
			jid = `${jid}@g.us`
		}
		await handleUpdateGroupSettings(jid, { botEnabled: true })
		setNewGroupJid("")
		fetchTabData("groups")
	}

	const filteredCommands = commands.filter(
		(c) =>
			c.name.toLowerCase().includes(cmdSearch.toLowerCase()) ||
			c.category.toLowerCase().includes(cmdSearch.toLowerCase()) ||
			c.description?.toLowerCase().includes(cmdSearch.toLowerCase()),
	)

	const filteredGroups = groups.filter(
		(g) =>
			g.jid.toLowerCase().includes(groupSearch.toLowerCase()) ||
			(g.subject || "").toLowerCase().includes(groupSearch.toLowerCase()),
	)

	return (
		<div
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				background: "rgba(0, 0, 0, 0.75)",
				backdropFilter: "blur(8px)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 120,
				padding: "20px",
			}}
		>
			<div
				className="glass-panel"
				style={{
					width: "100%",
					maxWidth: "860px",
					height: "85vh",
					display: "flex",
					flexDirection: "column",
					background: "var(--bg-card)",
					borderRadius: "16px",
					border: "1px solid var(--border-color)",
					overflow: "hidden",
					boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
				}}
			>
				{/* Modal Top Bar */}
				<div
					style={{
						padding: "18px 24px",
						borderBottom: "1px solid var(--border-color)",
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						background: "rgba(15, 23, 42, 0.6)",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
						<div
							style={{
								width: "40px",
								height: "40px",
								borderRadius: "12px",
								background: "linear-gradient(135deg, #a855f7 0%, #6366f1 100%)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
							}}
						>
							<Settings size={22} color="#ffffff" />
						</div>
						<div>
							<h3 style={{ fontSize: "1.15rem", fontWeight: 600, color: "var(--text-main)" }}>
								Agent Settings: {agent.name}
							</h3>
							<p style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
								ID: {agent.agentId}
							</p>
						</div>
					</div>

					<button
						type="button"
						onClick={onClose}
						style={{
							background: "rgba(255, 255, 255, 0.05)",
							border: "1px solid var(--border-color)",
							color: "var(--text-muted)",
							borderRadius: "8px",
							width: "32px",
							height: "32px",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							cursor: "pointer",
						}}
					>
						<X size={18} />
					</button>
				</div>

				{/* Toast Banner */}
				{toast && (
					<div
						style={{
							padding: "10px 24px",
							fontSize: "0.85rem",
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							background:
								toast.type === "success"
									? "rgba(16, 185, 129, 0.15)"
									: "rgba(239, 68, 68, 0.15)",
							color: toast.type === "success" ? "#34d399" : "#f87171",
							borderBottom: `1px solid ${
								toast.type === "success"
									? "rgba(16, 185, 129, 0.3)"
									: "rgba(239, 68, 68, 0.3)"
							}`,
						}}
					>
						<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
							{toast.type === "success" ? (
								<CheckCircle2 size={16} />
							) : (
								<AlertCircle size={16} />
							)}
							<span>{toast.message}</span>
						</div>
						<button
							type="button"
							onClick={() => setToast(null)}
							style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}
						>
							<X size={14} />
						</button>
					</div>
				)}

				{/* Tab Navigation */}
				<div
					style={{
						display: "flex",
						borderBottom: "1px solid var(--border-color)",
						background: "rgba(10, 15, 26, 0.4)",
						padding: "6px 16px 0 16px",
						gap: "8px",
						overflowX: "auto",
					}}
				>
					<button
						type="button"
						onClick={() => setActiveTab("owners")}
						style={{
							padding: "10px 16px",
							fontSize: "0.85rem",
							fontWeight: 600,
							borderRadius: "10px 10px 0 0",
							border: "none",
							borderBottom: activeTab === "owners" ? "2px solid #a855f7" : "2px solid transparent",
							background: activeTab === "owners" ? "rgba(168, 85, 247, 0.12)" : "transparent",
							color: activeTab === "owners" ? "#c084fc" : "var(--text-muted)",
							cursor: "pointer",
							display: "flex",
							alignItems: "center",
							gap: "6px",
						}}
					>
						<Crown size={15} />
						Owners & Admins
					</button>

					<button
						type="button"
						onClick={() => setActiveTab("blacklist")}
						style={{
							padding: "10px 16px",
							fontSize: "0.85rem",
							fontWeight: 600,
							borderRadius: "10px 10px 0 0",
							border: "none",
							borderBottom: activeTab === "blacklist" ? "2px solid #f43f5e" : "2px solid transparent",
							background: activeTab === "blacklist" ? "rgba(244, 63, 94, 0.12)" : "transparent",
							color: activeTab === "blacklist" ? "#fb7185" : "var(--text-muted)",
							cursor: "pointer",
							display: "flex",
							alignItems: "center",
							gap: "6px",
						}}
					>
						<ShieldAlert size={15} />
						Blacklist
					</button>

					<button
						type="button"
						onClick={() => setActiveTab("autodelete")}
						style={{
							padding: "10px 16px",
							fontSize: "0.85rem",
							fontWeight: 600,
							borderRadius: "10px 10px 0 0",
							border: "none",
							borderBottom: activeTab === "autodelete" ? "2px solid #f59e0b" : "2px solid transparent",
							background: activeTab === "autodelete" ? "rgba(245, 158, 11, 0.12)" : "transparent",
							color: activeTab === "autodelete" ? "#fbbf24" : "var(--text-muted)",
							cursor: "pointer",
							display: "flex",
							alignItems: "center",
							gap: "6px",
						}}
					>
						<Trash2 size={15} />
						Auto-Delete
					</button>

					<button
						type="button"
						onClick={() => setActiveTab("commands")}
						style={{
							padding: "10px 16px",
							fontSize: "0.85rem",
							fontWeight: 600,
							borderRadius: "10px 10px 0 0",
							border: "none",
							borderBottom: activeTab === "commands" ? "2px solid #06b6d4" : "2px solid transparent",
							background: activeTab === "commands" ? "rgba(6, 182, 212, 0.12)" : "transparent",
							color: activeTab === "commands" ? "#22d3ee" : "var(--text-muted)",
							cursor: "pointer",
							display: "flex",
							alignItems: "center",
							gap: "6px",
						}}
					>
						<Settings size={15} />
						Command Toggles
					</button>

					<button
						type="button"
						onClick={() => setActiveTab("groups")}
						style={{
							padding: "10px 16px",
							fontSize: "0.85rem",
							fontWeight: 600,
							borderRadius: "10px 10px 0 0",
							border: "none",
							borderBottom: activeTab === "groups" ? "2px solid #10b981" : "2px solid transparent",
							background: activeTab === "groups" ? "rgba(16, 185, 129, 0.12)" : "transparent",
							color: activeTab === "groups" ? "#34d399" : "var(--text-muted)",
							cursor: "pointer",
							display: "flex",
							alignItems: "center",
							gap: "6px",
						}}
					>
						<Users size={15} />
						Group Settings
					</button>
				</div>

				{/* Tab Content */}
				<div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
					{loading && (
						<div style={{ padding: "30px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
							Memuat data pengaturan...
						</div>
					)}

					{/* TAB 1: OWNERS */}
					{!loading && activeTab === "owners" && (
						<div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
							<form
								onSubmit={handleAddOwner}
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
								{contacts.length > 0 && (
									<div>
										<label style={{ display: "block", fontSize: "0.75rem", color: "var(--primary-cyan)", marginBottom: "4px" }}>
											📋 Pilih dari Kontak Tersimpan (Opsional)
										</label>
										<select
											onChange={(e) => {
												if (e.target.value) setNewOwnerJid(e.target.value)
											}}
											style={{
												width: "100%",
												background: "rgba(0, 242, 254, 0.05)",
												border: "1px solid rgba(0, 242, 254, 0.3)",
												borderRadius: "8px",
												padding: "8px 12px",
												fontSize: "0.85rem",
												color: "var(--primary-cyan)",
											}}
										>
											<option value="">-- Pilih Kontak Tersimpan --</option>
											{contacts.map((c) => (
												<option key={c.jid} value={c.jid}>
													{c.pushName ? `${c.pushName} (${c.phoneNumber})` : c.jid}
												</option>
											))}
										</select>
									</div>
								)}

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
										<Plus size={15} /> Tambah Owner
									</button>
								</div>
							</form>

							<div>
								<h4 style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-main)", marginBottom: "10px" }}>
									Current Registered Owners ({owners.length})
								</h4>
								{owners.length === 0 ? (
									<p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "20px" }}>
										Belum ada owner terdaftar untuk agent ini.
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
													onClick={() => handleRemoveOwner(owner.userJid)}
													className="danger-btn"
													style={{ fontSize: "0.75rem", padding: "5px 10px" }}
												>
													Hapus
												</button>
											</div>
										))}
									</div>
								)}
							</div>
						</div>
					)}

					{/* TAB 2: BLACKLIST */}
					{!loading && activeTab === "blacklist" && (
						<div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
							<form
								onSubmit={handleAddBlacklist}
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
								{contacts.length > 0 && (
									<div>
										<label style={{ display: "block", fontSize: "0.75rem", color: "#fb7185", marginBottom: "4px" }}>
											📋 Pilih dari Kontak Tersimpan (Opsional)
										</label>
										<select
											onChange={(e) => {
												if (e.target.value) setNewBlacklistJid(e.target.value)
											}}
											style={{
												width: "100%",
												background: "rgba(244, 63, 94, 0.05)",
												border: "1px solid rgba(244, 63, 94, 0.3)",
												borderRadius: "8px",
												padding: "8px 12px",
												fontSize: "0.85rem",
												color: "#fb7185",
											}}
										>
											<option value="">-- Pilih Kontak Tersimpan --</option>
											{contacts.map((c) => (
												<option key={c.jid} value={c.jid}>
													{c.pushName ? `${c.pushName} (${c.phoneNumber})` : c.jid}
												</option>
											))}
										</select>
									</div>
								)}

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
											Alasan (Opsional)
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
										Tidak ada pengguna ter-blacklist saat ini.
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
													onClick={() => handleRemoveBlacklist(item.userJid)}
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
					)}

					{/* TAB 3: AUTO-DELETE */}
					{!loading && activeTab === "autodelete" && (
						<div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
							<form
								onSubmit={handleAddAutoDelete}
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
								{contacts.length > 0 && (
									<div>
										<label style={{ display: "block", fontSize: "0.75rem", color: "#fbbf24", marginBottom: "4px" }}>
											📋 Pilih dari Kontak Tersimpan (Opsional)
										</label>
										<select
											onChange={(e) => {
												if (e.target.value) setNewAutoDeleteJid(e.target.value)
											}}
											style={{
												width: "100%",
												background: "rgba(245, 158, 11, 0.05)",
												border: "1px solid rgba(245, 158, 11, 0.3)",
												borderRadius: "8px",
												padding: "8px 12px",
												fontSize: "0.85rem",
												color: "#fbbf24",
											}}
										>
											<option value="">-- Pilih Kontak Tersimpan --</option>
											{contacts.map((c) => (
												<option key={c.jid} value={c.jid}>
													{c.pushName ? `${c.pushName} (${c.phoneNumber})` : c.jid}
												</option>
											))}
										</select>
									</div>
								)}

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
										<Plus size={15} /> Tambah Target
									</button>
								</div>
							</form>

							<div>
								<h4 style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-main)", marginBottom: "10px" }}>
									Auto-Delete Targets ({autoDeleteList.length})
								</h4>
								{autoDeleteList.length === 0 ? (
									<p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "20px" }}>
										Belum ada target auto-delete.
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
													onClick={() => handleRemoveAutoDelete(item.userJid)}
													className="danger-btn"
													style={{ fontSize: "0.75rem", padding: "5px 10px" }}
												>
													Hapus
												</button>
											</div>
										))}
									</div>
								)}
							</div>
						</div>
					)}

					{/* TAB 4: COMMAND TOGGLES */}
					{!loading && activeTab === "commands" && (
						<div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
							<div style={{ position: "relative" }}>
								<Search size={16} color="var(--text-muted)" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }} />
								<input
									type="text"
									value={cmdSearch}
									onChange={(e) => setCmdSearch(e.target.value)}
									placeholder="Cari perintah berdasarkan nama atau kategori..."
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

							<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
								{filteredCommands.length === 0 ? (
									<p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "20px" }}>
										Tidak ada perintah yang cocok dengan filter pencarian.
									</p>
								) : (
									filteredCommands.map((cmd) => (
										<div
											key={cmd.name}
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
											<div>
												<div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
													<span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#22d3ee" }}>
														.{cmd.name}
													</span>
													{cmd.aliases.length > 0 && (
														<span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
															({cmd.aliases.map((a) => `.${a}`).join(", ")})
														</span>
													)}
													<span
														style={{
															fontSize: "0.65rem",
															fontWeight: 700,
															textTransform: "uppercase",
															padding: "2px 6px",
															borderRadius: "4px",
															background: "rgba(6, 182, 212, 0.15)",
															color: "#22d3ee",
															border: "1px solid rgba(6, 182, 212, 0.3)",
														}}
													>
														{cmd.category}
													</span>
													{cmd.needAdminRegisterThisCommand && (
														<span
															style={{
																fontSize: "0.65rem",
																fontWeight: 600,
																padding: "2px 6px",
																borderRadius: "4px",
																background: "rgba(245, 158, 11, 0.15)",
																color: "#fbbf24",
																border: "1px solid rgba(245, 158, 11, 0.3)",
															}}
														>
															Group Reg Required
														</span>
													)}
												</div>
												{cmd.description && (
													<p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}>
														{cmd.description}
													</p>
												)}
											</div>

											{/* Switch Button */}
											<button
												type="button"
												onClick={() => handleToggleCommand(cmd.name, cmd.status)}
												style={{
													padding: "6px 14px",
													fontSize: "0.75rem",
													fontWeight: 600,
													borderRadius: "20px",
													border: "none",
													cursor: "pointer",
													background: cmd.status === "enabled" ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
													color: cmd.status === "enabled" ? "#34d399" : "#f87171",
													borderWidth: "1px",
													borderStyle: "solid",
													borderColor: cmd.status === "enabled" ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)",
													transition: "all 0.2s ease",
												}}
											>
												{cmd.status === "enabled" ? "ACTIVE" : "DISABLED"}
											</button>
										</div>
									))
								)}
							</div>
						</div>
					)}

					{/* TAB 5: GROUP SETTINGS */}
					{!loading && activeTab === "groups" && (
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
										Daftarkan / Izinkan Group JID Baru
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
									<Plus size={15} /> Izinkan Grup
								</button>
							</form>

							<div style={{ position: "relative" }}>
								<Search size={16} color="var(--text-muted)" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }} />
								<input
									type="text"
									value={groupSearch}
									onChange={(e) => setGroupSearch(e.target.value)}
									placeholder="Cari grup berdasarkan Nama atau JID..."
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
										Belum ada grup terdaftar. Ketik *!bot on* di grup WhatsApp atau daftarkan JID di atas.
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
															{group.subject && group.subject !== group.jid ? group.subject : "Grup WhatsApp"}
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
															handleUpdateGroupSettings(group.jid, {
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
																handleUpdateGroupSettings(group.jid, {
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
																handleUpdateGroupSettings(group.jid, {
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
					)}
				</div>
			</div>
		</div>
	)
}
