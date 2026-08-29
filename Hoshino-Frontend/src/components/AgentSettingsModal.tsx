import React, { useCallback, useEffect, useState } from "react"
import {
	AlertCircle,
	CheckCircle2,
	Crown,
	Settings,
	ShieldAlert,
	Sliders,
	Sparkles,
	Trash2,
	Users,
	X,
} from "lucide-react"
import { API_BASE_URL } from "../services/api"
import type { Agent, SenseiProfileItem } from "../types"
import { AutoDeleteTab, type AutoDeleteItem } from "./settings/AutoDeleteTab"
import { BlacklistTab, type BlacklistItem } from "./settings/BlacklistTab"
import {
	CommandTogglesTab,
	type CommandToggleItem,
} from "./settings/CommandTogglesTab"
import type { ContactItem } from "./settings/ContactSelector"
import { GeneralSettingsTab } from "./settings/GeneralSettingsTab"
import {
	GroupSettingsTab,
	type GroupSettingsItem,
} from "./settings/GroupSettingsTab"
import { OwnersTab, type OwnerItem } from "./settings/OwnersTab"
import { SenseiTab } from "./settings/SenseiTab"

interface AgentSettingsModalProps {
	agent: Agent
	onClose: () => void
}

type TabType =
	| "general"
	| "sensei"
	| "owners"
	| "blacklist"
	| "autodelete"
	| "commands"
	| "groups"

export const AgentSettingsModal: React.FC<AgentSettingsModalProps> = ({
	agent,
	onClose,
}) => {
	const [activeTab, setActiveTab] = useState<TabType>("general")
	const [loading, setLoading] = useState<boolean>(false)
	const [toast, setToast] = useState<{
		type: "success" | "error"
		message: string
	} | null>(null)

	// Tab States
	const [senseiProfiles, setSenseiProfiles] = useState<SenseiProfileItem[]>([])
	const [owners, setOwners] = useState<OwnerItem[]>([])
	const [blacklist, setBlacklist] = useState<BlacklistItem[]>([])
	const [autoDeleteList, setAutoDeleteList] = useState<AutoDeleteItem[]>([])
	const [commands, setCommands] = useState<CommandToggleItem[]>([])
	const [groups, setGroups] = useState<GroupSettingsItem[]>([])
	const [contacts, setContacts] = useState<ContactItem[]>([])

	const showToast = useCallback(
		(type: "success" | "error", message: string) => {
			setToast({ type, message })
			setTimeout(() => setToast(null), 3000)
		},
		[],
	)

	const fetchContacts = useCallback(async () => {
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/agents/${agent.agentId}/contacts`,
			)
			const json = await res.json()
			if (json.success) setContacts(json.data)
		} catch {
			/* ignore contacts fetch error */
		}
	}, [agent.agentId])

	const fetchTabData = useCallback(
		async (tab: TabType) => {
			if (tab === "general") return // handled inside GeneralSettingsTab
			setLoading(true)
			try {
				const res = await fetch(
					`${API_BASE_URL}/api/agents/${agent.agentId}/${tab}`,
				)
				const json = await res.json()
				if (json.success) {
					if (tab === "sensei") setSenseiProfiles(json.data)
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
		},
		[agent.agentId, showToast],
	)

	useEffect(() => {
		fetchContacts()
	}, [fetchContacts])

	useEffect(() => {
		fetchTabData(activeTab)
	}, [activeTab, fetchTabData])

	// Owner Handlers
	const handleAddOwner = async (userJid: string, role: string) => {
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/agents/${agent.agentId}/owners`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ userJid, role }),
				},
			)
			const json = await res.json()
			if (json.success) {
				showToast("success", "Owner added successfully")
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
	const handleAddBlacklist = async (userJid: string, reason?: string) => {
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/agents/${agent.agentId}/blacklist`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ userJid, reason }),
				},
			)
			const json = await res.json()
			if (json.success) {
				showToast("success", "User blacklisted successfully")
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
			showToast("error", `Failed to remove from blacklist: ${err}`)
		}
	}

	// AutoDelete Handlers
	const handleAddAutoDelete = async (userJid: string) => {
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/agents/${agent.agentId}/autodelete`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ userJid }),
				},
			)
			const json = await res.json()
			if (json.success) {
				showToast("success", "User added to auto-delete list")
				fetchTabData("autodelete")
			} else {
				showToast("error", json.message)
			}
		} catch (err) {
			showToast("error", `Failed to add auto-delete: ${err}`)
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
			showToast("error", `Failed to remove auto-delete: ${err}`)
		}
	}

	// Command Toggle Handlers
	const handleToggleCommand = async (
		commandName: string,
		status: "enabled" | "disabled",
	) => {
		try {
			setCommands((prev) =>
				prev.map((c) => (c.name === commandName ? { ...c, status } : c)),
			)

			const res = await fetch(
				`${API_BASE_URL}/api/agents/${agent.agentId}/commands/${encodeURIComponent(commandName)}`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ status }),
				},
			)
			const json = await res.json()
			if (json.success) {
				showToast(
					"success",
					`Command ${commandName} ${status === "enabled" ? "enabled" : "disabled"}`,
				)
			} else {
				showToast("error", json.message)
				fetchTabData("commands")
			}
		} catch (err) {
			showToast("error", `Failed to toggle command: ${err}`)
			fetchTabData("commands")
		}
	}

	// Group Settings Handlers
	const handleUpdateGroupSettings = async (
		jid: string,
		data: {
			botEnabled?: boolean
			welcomeEnabled?: boolean
			goodbyeEnabled?: boolean
			customPrefix?: string | null
		},
	) => {
		try {
			setGroups((prev) =>
				prev.map((g) => (g.jid === jid ? { ...g, ...data } : g)),
			)

			const res = await fetch(
				`${API_BASE_URL}/api/agents/${agent.agentId}/groups/${encodeURIComponent(jid)}`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(data),
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
					maxWidth: "920px",
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
								background:
									"linear-gradient(135deg, #a855f7 0%, #6366f1 100%)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
							}}
						>
							<Settings size={22} color="#ffffff" />
						</div>
						<div>
							<h3
								style={{
									fontSize: "1.15rem",
									fontWeight: 600,
									color: "var(--text-main)",
								}}
							>
								Agent Settings: {agent.name}
							</h3>
							<p
								style={{
									fontSize: "0.78rem",
									color: "var(--text-muted)",
									fontFamily: "monospace",
								}}
							>
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
						<div
							style={{ display: "flex", alignItems: "center", gap: "8px" }}
						>
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
							style={{
								background: "none",
								border: "none",
								color: "inherit",
								cursor: "pointer",
							}}
						>
							<X size={14} />
						</button>
					</div>
				)}

				{/* Tab Navigation Bar */}
				<div
					style={{
						display: "flex",
						borderBottom: "1px solid var(--border-color)",
						background: "rgba(10, 15, 26, 0.4)",
						padding: "6px 16px 0 16px",
						gap: "6px",
						overflowX: "auto",
					}}
				>
					<button
						type="button"
						onClick={() => setActiveTab("general")}
						style={{
							padding: "10px 14px",
							fontSize: "0.85rem",
							fontWeight: 600,
							borderRadius: "10px 10px 0 0",
							border: "none",
							borderBottom:
								activeTab === "general"
									? "2px solid var(--primary-cyan)"
									: "2px solid transparent",
							background:
								activeTab === "general"
									? "rgba(0, 242, 254, 0.12)"
									: "transparent",
							color:
								activeTab === "general"
									? "var(--primary-cyan)"
									: "var(--text-muted)",
							cursor: "pointer",
							display: "flex",
							alignItems: "center",
							gap: "6px",
							whiteSpace: "nowrap",
						}}
					>
						<Sliders size={15} />
						General
					</button>

					<button
						type="button"
						onClick={() => setActiveTab("sensei")}
						style={{
							padding: "10px 14px",
							fontSize: "0.85rem",
							fontWeight: 600,
							borderRadius: "10px 10px 0 0",
							border: "none",
							borderBottom:
								activeTab === "sensei"
									? "2px solid #ec4899"
									: "2px solid transparent",
							background:
								activeTab === "sensei"
									? "rgba(236, 72, 153, 0.12)"
									: "transparent",
							color: activeTab === "sensei" ? "#f472b6" : "var(--text-muted)",
							cursor: "pointer",
							display: "flex",
							alignItems: "center",
							gap: "6px",
							whiteSpace: "nowrap",
						}}
					>
						<Sparkles size={15} />
						Sensei & Gacha
					</button>

					<button
						type="button"
						onClick={() => setActiveTab("owners")}
						style={{
							padding: "10px 14px",
							fontSize: "0.85rem",
							fontWeight: 600,
							borderRadius: "10px 10px 0 0",
							border: "none",
							borderBottom:
								activeTab === "owners"
									? "2px solid #a855f7"
									: "2px solid transparent",
							background:
								activeTab === "owners"
									? "rgba(168, 85, 247, 0.12)"
									: "transparent",
							color: activeTab === "owners" ? "#c084fc" : "var(--text-muted)",
							cursor: "pointer",
							display: "flex",
							alignItems: "center",
							gap: "6px",
							whiteSpace: "nowrap",
						}}
					>
						<Crown size={15} />
						Owners
					</button>

					<button
						type="button"
						onClick={() => setActiveTab("blacklist")}
						style={{
							padding: "10px 14px",
							fontSize: "0.85rem",
							fontWeight: 600,
							borderRadius: "10px 10px 0 0",
							border: "none",
							borderBottom:
								activeTab === "blacklist"
									? "2px solid #f43f5e"
									: "2px solid transparent",
							background:
								activeTab === "blacklist"
									? "rgba(244, 63, 94, 0.12)"
									: "transparent",
							color: activeTab === "blacklist" ? "#fb7185" : "var(--text-muted)",
							cursor: "pointer",
							display: "flex",
							alignItems: "center",
							gap: "6px",
							whiteSpace: "nowrap",
						}}
					>
						<ShieldAlert size={15} />
						Blacklist
					</button>

					<button
						type="button"
						onClick={() => setActiveTab("autodelete")}
						style={{
							padding: "10px 14px",
							fontSize: "0.85rem",
							fontWeight: 600,
							borderRadius: "10px 10px 0 0",
							border: "none",
							borderBottom:
								activeTab === "autodelete"
									? "2px solid #f59e0b"
									: "2px solid transparent",
							background:
								activeTab === "autodelete"
									? "rgba(245, 158, 11, 0.12)"
									: "transparent",
							color:
								activeTab === "autodelete" ? "#fbbf24" : "var(--text-muted)",
							cursor: "pointer",
							display: "flex",
							alignItems: "center",
							gap: "6px",
							whiteSpace: "nowrap",
						}}
					>
						<Trash2 size={15} />
						Auto-Delete
					</button>

					<button
						type="button"
						onClick={() => setActiveTab("commands")}
						style={{
							padding: "10px 14px",
							fontSize: "0.85rem",
							fontWeight: 600,
							borderRadius: "10px 10px 0 0",
							border: "none",
							borderBottom:
								activeTab === "commands"
									? "2px solid #06b6d4"
									: "2px solid transparent",
							background:
								activeTab === "commands"
									? "rgba(6, 182, 212, 0.12)"
									: "transparent",
							color: activeTab === "commands" ? "#22d3ee" : "var(--text-muted)",
							cursor: "pointer",
							display: "flex",
							alignItems: "center",
							gap: "6px",
							whiteSpace: "nowrap",
						}}
					>
						<Settings size={15} />
						Commands
					</button>

					<button
						type="button"
						onClick={() => setActiveTab("groups")}
						style={{
							padding: "10px 14px",
							fontSize: "0.85rem",
							fontWeight: 600,
							borderRadius: "10px 10px 0 0",
							border: "none",
							borderBottom:
								activeTab === "groups"
									? "2px solid #10b981"
									: "2px solid transparent",
							background:
								activeTab === "groups"
									? "rgba(16, 185, 129, 0.12)"
									: "transparent",
							color: activeTab === "groups" ? "#34d399" : "var(--text-muted)",
							cursor: "pointer",
							display: "flex",
							alignItems: "center",
							gap: "6px",
							whiteSpace: "nowrap",
						}}
					>
						<Users size={15} />
						Groups
					</button>
				</div>

				{/* Tab Content */}
				<div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
					{loading && (
						<div
							style={{
								padding: "30px",
								textAlign: "center",
								color: "var(--text-muted)",
								fontSize: "0.85rem",
							}}
						>
							Loading settings data...
						</div>
					)}

					{!loading && activeTab === "general" && (
						<GeneralSettingsTab
							agentId={agent.agentId}
							onShowToast={showToast}
						/>
					)}

					{!loading && activeTab === "sensei" && (
						<SenseiTab
							agentId={agent.agentId}
							profiles={senseiProfiles}
							loading={loading}
							onRefresh={() => fetchTabData("sensei")}
							onShowToast={showToast}
						/>
					)}

					{!loading && activeTab === "owners" && (
						<OwnersTab
							owners={owners}
							contacts={contacts}
							onAddOwner={handleAddOwner}
							onRemoveOwner={handleRemoveOwner}
						/>
					)}

					{!loading && activeTab === "blacklist" && (
						<BlacklistTab
							blacklist={blacklist}
							contacts={contacts}
							onAddBlacklist={handleAddBlacklist}
							onRemoveBlacklist={handleRemoveBlacklist}
						/>
					)}

					{!loading && activeTab === "autodelete" && (
						<AutoDeleteTab
							autoDeleteList={autoDeleteList}
							contacts={contacts}
							onAddAutoDelete={handleAddAutoDelete}
							onRemoveAutoDelete={handleRemoveAutoDelete}
						/>
					)}

					{!loading && activeTab === "commands" && (
						<CommandTogglesTab
							commands={commands}
							onToggleCommand={handleToggleCommand}
						/>
					)}

					{!loading && activeTab === "groups" && (
						<GroupSettingsTab
							groups={groups}
							onUpdateGroupSettings={handleUpdateGroupSettings}
						/>
					)}
				</div>
			</div>
		</div>
	)
}
