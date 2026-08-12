import { useCallback, useEffect, useRef, useState } from "react"
import {
	Activity,
	AlertTriangle,
	Bot,
	Check,
	CheckCircle2,
	Clock,
	Copy,
	Key,
	MessageSquare,
	Plus,
	QrCode,
	RefreshCw,
	Server,
	Smartphone,
	Trash2,
	Wifi,
	WifiOff,
	X,
} from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { ChatConsoleModal } from "./components/ChatConsoleModal"
import type { Agent, ApiResponse } from "./types"

const API_BASE_URL = "http://localhost:3000"

export function App() {
	const [agents, setAgents] = useState<Agent[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [isBackendOnline, setIsBackendOnline] = useState(false)
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

	// Selected agent for Pairing Code / QR Code viewing modal
	const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
	const selectedAgentIdRef = useRef<string | null>(null)
	const [copied, setCopied] = useState(false)

	// Active chat console modal state
	const [activeChatAgent, setActiveChatAgent] = useState<Agent | null>(null)

	// Agent deletion modal state
	const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null)
	const [isDeleting, setIsDeleting] = useState(false)

	// Form inputs for creating agent
	const [agentNameInput, setAgentNameInput] = useState("")
	const [phoneNumberInput, setPhoneNumberInput] = useState("")
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [errorMessage, setErrorMessage] = useState<string | null>(null)

	// Helper to set selected agent and keep ref in sync
	const handleSetSelectedAgent = (agent: Agent | null) => {
		selectedAgentIdRef.current = agent ? agent.agentId : null
		setSelectedAgent(agent)
	}

	// Fetch agents list from backend
	const fetchAgents = useCallback(async () => {
		try {
			const res = await fetch(`${API_BASE_URL}/api/agents`)
			if (!res.ok) throw new Error("Backend non-200 response")

			const json: ApiResponse<Agent[]> = await res.json()
			if (json.success && json.data) {
				setAgents(json.data)
				setIsBackendOnline(true)

				// Synchronize selected agent only if user still has modal open
				const currentId = selectedAgentIdRef.current
				if (currentId) {
					const updated = json.data.find((a) => a.agentId === currentId)
					if (updated && selectedAgentIdRef.current === currentId) {
						setSelectedAgent(updated)
					}
				}
			}
		} catch {
			setIsBackendOnline(false)
		} finally {
			setIsLoading(false)
		}
	}, [])

	// Auto poll every 3 seconds
	useEffect(() => {
		fetchAgents()
		const interval = setInterval(fetchAgents, 3000)
		return () => clearInterval(interval)
	}, [fetchAgents])

	// Handle Agent Creation
	const handleCreateAgent = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!agentNameInput.trim()) return

		setIsSubmitting(true)
		setErrorMessage(null)

		try {
			const res = await fetch(`${API_BASE_URL}/api/agents`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: agentNameInput.trim(),
					phoneNumber: phoneNumberInput.trim() || undefined,
				}),
			})

			const json: ApiResponse<Agent> = await res.json()
			if (!res.ok || !json.success) {
				throw new Error(json.message || "Gagal membuat agent")
			}

			if (json.data) {
				handleSetSelectedAgent(json.data)
			}

			setAgentNameInput("")
			setPhoneNumberInput("")
			setIsCreateModalOpen(false)
			await fetchAgents()
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : "Terjadi kesalahan")
		} finally {
			setIsSubmitting(false)
		}
	}

	// Handle Agent Reconnect
	const handleReconnectAgent = async (agentId: string, phoneNumber?: string) => {
		try {
			await fetch(`${API_BASE_URL}/api/agents/${agentId}/reconnect`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ phoneNumber }),
			})
			await fetchAgents()
		} catch (err) {
			alert(`Gagal reconnect: ${err}`)
		}
	}

	// Handle Agent Deletion Confirmation
	const confirmDeleteAgent = async () => {
		if (!agentToDelete) return

		setIsDeleting(true)
		try {
			const res = await fetch(`${API_BASE_URL}/api/agents/${agentToDelete.agentId}`, {
				method: "DELETE",
			})

			if (!res.ok) {
				throw new Error("Gagal menghapus agent dari server")
			}

			if (
				selectedAgentIdRef.current === agentToDelete.agentId ||
				selectedAgent?.name === agentToDelete.name
			) {
				handleSetSelectedAgent(null)
			}

			setAgentToDelete(null)
			await fetchAgents()
		} catch (err) {
			alert(`Gagal menghapus agent: ${err}`)
		} finally {
			setIsDeleting(false)
		}
	}

	// Copy pairing code helper
	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text)
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}

	// Stats counters
	const totalAgents = agents.length
	const connectedCount = agents.filter((a) => a.status === "connected").length
	const authRequiredCount = agents.filter(
		(a) => a.status === "pairing_code" || a.status === "qr_code",
	).length
	const disconnectedCount = agents.filter(
		(a) => a.status === "disconnected",
	).length

	return (
		<div style={{ paddingBottom: "60px" }}>
			{/* Top Navbar */}
			<header
				className="glass-panel"
				style={{
					margin: "20px 24px",
					padding: "16px 28px",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					position: "sticky",
					top: "20px",
					zIndex: 50,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
					<div
						style={{
							width: "42px",
							height: "42px",
							borderRadius: "12px",
							background: "linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							boxShadow: "0 0 20px rgba(0, 242, 254, 0.4)",
						}}
					>
						<Bot size={24} color="#040914" />
					</div>
					<div>
						<h1 style={{ fontSize: "1.3rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
							Hoshino <span className="gradient-text">Web Console</span>
						</h1>
						<p style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
							Multi-Instance WhatsApp Agent Manager
						</p>
					</div>
				</div>

				<div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
					{/* Backend Status Indicator */}
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: "8px",
							padding: "6px 14px",
							borderRadius: "20px",
							background: isBackendOnline
								? "rgba(16, 185, 129, 0.1)"
								: "rgba(239, 68, 68, 0.1)",
							border: `1px solid ${
								isBackendOnline ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)"
							}`,
							fontSize: "0.85rem",
							fontWeight: 500,
						}}
					>
						{isBackendOnline ? (
							<>
								<Wifi size={14} color="var(--status-green)" />
								<span style={{ color: "var(--status-green)" }}>Backend Connected</span>
							</>
						) : (
							<>
								<WifiOff size={14} color="var(--status-red)" />
								<span style={{ color: "var(--status-red)" }}>Backend Offline</span>
							</>
						)}
					</div>

					<button
						type="button"
						onClick={fetchAgents}
						className="secondary-btn"
						style={{ padding: "8px 14px" }}
					>
						<RefreshCw size={14} className={isLoading ? "spin" : ""} />
						Refresh
					</button>

					<button
						type="button"
						onClick={() => setIsCreateModalOpen(true)}
						className="gradient-btn"
					>
						<Plus size={18} />
						Tambah Agent
					</button>
				</div>
			</header>

			{/* Main Content Layout */}
			<main style={{ maxWidth: "1280px", margin: "0 auto", padding: "0 24px" }}>
				{/* Metrics Summary Cards */}
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
						gap: "16px",
						marginBottom: "28px",
					}}
				>
					<div className="glass-card" style={{ padding: "20px 24px" }}>
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--text-muted)", marginBottom: "8px" }}>
							<span style={{ fontSize: "0.88rem", fontWeight: 500 }}>Total Agent</span>
							<Server size={18} />
						</div>
						<div style={{ fontSize: "2rem", fontWeight: 700 }}>{totalAgents}</div>
					</div>

					<div className="glass-card" style={{ padding: "20px 24px" }}>
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--status-green)", marginBottom: "8px" }}>
							<span style={{ fontSize: "0.88rem", fontWeight: 500 }}>Connected</span>
							<CheckCircle2 size={18} />
						</div>
						<div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--status-green)" }}>
							{connectedCount}
						</div>
					</div>

					<div className="glass-card" style={{ padding: "20px 24px" }}>
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--primary-cyan)", marginBottom: "8px" }}>
							<span style={{ fontSize: "0.88rem", fontWeight: 500 }}>Butuh Auth (Pairing/QR)</span>
							<Key size={18} />
						</div>
						<div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--primary-cyan)" }}>
							{authRequiredCount}
						</div>
					</div>

					<div className="glass-card" style={{ padding: "20px 24px" }}>
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--status-red)", marginBottom: "8px" }}>
							<span style={{ fontSize: "0.88rem", fontWeight: 500 }}>Disconnected</span>
							<Clock size={18} />
						</div>
						<div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--status-red)" }}>
							{disconnectedCount}
						</div>
					</div>
				</div>

				{/* Agent List Header */}
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						marginBottom: "16px",
					}}
				>
					<h2 style={{ fontSize: "1.2rem", fontWeight: 600 }}>Daftar Agent WhatsApp</h2>
					<span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
						Auto-refresh setiap 3 detik
					</span>
				</div>

				{/* Empty State */}
				{!isLoading && agents.length === 0 && (
					<div
						className="glass-panel"
						style={{
							padding: "60px 20px",
							textAlign: "center",
							color: "var(--text-muted)",
						}}
					>
						<Bot size={48} style={{ opacity: 0.3, marginBottom: "16px" }} />
						<h3 style={{ color: "var(--text-main)", marginBottom: "8px" }}>Belum Ada Agent</h3>
						<p style={{ fontSize: "0.9rem", marginBottom: "20px" }}>
							Klik tombol di bawah ini untuk membuat dan menghubungkan agent WhatsApp baru.
						</p>
						<button
							type="button"
							onClick={() => setIsCreateModalOpen(true)}
							className="gradient-btn"
						>
							<Plus size={18} /> Buat Agent Pertama
						</button>
					</div>
				)}

				{/* Agent Grid */}
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
						gap: "20px",
					}}
				>
					{agents.map((agent) => (
						<div key={agent.agentId} className="glass-card" style={{ padding: "20px" }}>
							{/* Card Header */}
							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "flex-start",
									marginBottom: "14px",
								}}
							>
								<div>
									<h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "4px" }}>
										{agent.name}
									</h3>
									<span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
										ID: {agent.agentId}
									</span>
								</div>

								{/* Status Badge */}
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: "6px",
										padding: "4px 10px",
										borderRadius: "12px",
										background: "rgba(255, 255, 255, 0.05)",
										border: "1px solid var(--border-color)",
										fontSize: "0.78rem",
										fontWeight: 500,
										textTransform: "capitalize",
									}}
								>
									<span className={`status-dot ${agent.status}`} />
									<span>{agent.status.replace("_", " ")}</span>
								</div>
							</div>

							{/* Card Info */}
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									gap: "8px",
									fontSize: "0.85rem",
									color: "var(--text-muted)",
									marginBottom: "20px",
								}}
							>
								<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
									<Smartphone size={15} />
									<span>{agent.phoneNumber || "No phone number attached"}</span>
								</div>

								<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
									<Activity size={15} />
									<span>
										Last update:{" "}
										{agent.updatedAt
											? new Date(agent.updatedAt).toLocaleTimeString()
											: "Just now"}
									</span>
								</div>
							</div>

							{/* Pairing Code / QR Code Quick View Action */}
							{(agent.status === "pairing_code" || agent.status === "qr_code") && (
								<div
									style={{
										background: "rgba(0, 242, 254, 0.05)",
										border: "1px dashed rgba(0, 242, 254, 0.3)",
										borderRadius: "10px",
										padding: "12px",
										marginBottom: "16px",
										textAlign: "center",
									}}
								>
									<p style={{ fontSize: "0.8rem", color: "var(--primary-cyan)", marginBottom: "8px", fontWeight: 500 }}>
										{agent.status === "pairing_code"
											? "🔑 Pairing Code Siap"
											: "📷 QR Code Siap"}
									</p>
									<button
										type="button"
										onClick={() => handleSetSelectedAgent(agent)}
										className="secondary-btn"
										style={{ width: "100%", justifyContent: "center", fontSize: "0.85rem" }}
									>
										{agent.status === "pairing_code" ? <Key size={15} /> : <QrCode size={15} />}
										Lihat Kode Login
									</button>
								</div>
							)}

							{/* Card Footer Actions */}
							<div
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									gap: "10px",
									borderTop: "1px solid var(--border-color)",
									paddingTop: "14px",
								}}
							>
								{agent.status === "connected" && (
									<button
										type="button"
										onClick={() => setActiveChatAgent(agent)}
										className="gradient-btn"
										style={{ fontSize: "0.8rem", padding: "6px 12px" }}
									>
										<MessageSquare size={13} />
										Chat Console
									</button>
								)}

								<button
									type="button"
									onClick={() => handleReconnectAgent(agent.agentId, agent.phoneNumber)}
									className="secondary-btn"
									style={{ fontSize: "0.8rem", padding: "6px 12px" }}
								>
									<RefreshCw size={13} />
									Reconnect
								</button>

								<button
									type="button"
									onClick={() => setAgentToDelete(agent)}
									className="danger-btn"
									style={{ fontSize: "0.8rem", padding: "6px 12px" }}
								>
									<Trash2 size={13} />
									Hapus
								</button>
							</div>
						</div>
					))}
				</div>
			</main>

			{/* Create Agent Modal */}
			{isCreateModalOpen && (
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
						zIndex: 100,
						padding: "20px",
					}}
				>
					<div
						className="glass-panel"
						style={{
							width: "100%",
							maxWidth: "460px",
							padding: "28px",
							background: "var(--bg-card)",
						}}
					>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								marginBottom: "20px",
							}}
						>
							<h3 style={{ fontSize: "1.2rem", fontWeight: 600 }}>Tambah Agent WhatsApp Baru</h3>
							<button
								type="button"
								onClick={() => setIsCreateModalOpen(false)}
								style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
							>
								<X size={20} />
							</button>
						</div>

						{errorMessage && (
							<div
								style={{
									background: "rgba(239, 68, 68, 0.1)",
									border: "1px solid rgba(239, 68, 68, 0.3)",
									color: "#f87171",
									padding: "10px 14px",
									borderRadius: "8px",
									fontSize: "0.85rem",
									marginBottom: "16px",
								}}
							>
								{errorMessage}
							</div>
						)}

						<form onSubmit={handleCreateAgent}>
							<div style={{ marginBottom: "16px" }}>
								<label
									htmlFor="agent-name"
									style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "6px" }}
								>
									Nama Agent / Session ID <span style={{ color: "var(--status-red)" }}>*</span>
								</label>
								<input
									id="agent-name"
									type="text"
									required
									placeholder="Contoh: CS_Agent_1"
									value={agentNameInput}
									onChange={(e) => setAgentNameInput(e.target.value)}
									style={{
										width: "100%",
										padding: "12px 14px",
										background: "rgba(0, 0, 0, 0.3)",
										border: "1px solid var(--border-color)",
										borderRadius: "10px",
										color: "var(--text-main)",
										outline: "none",
										fontSize: "0.95rem",
									}}
								/>
							</div>

							<div style={{ marginBottom: "24px" }}>
								<label
									htmlFor="phone-number"
									style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "6px" }}
								>
									Nomor HP WhatsApp (Opsional untuk Pairing Code)
								</label>
								<input
									id="phone-number"
									type="text"
									placeholder="Contoh: 628123456789 (Kosongkan jika ingin Scan QR)"
									value={phoneNumberInput}
									onChange={(e) => setPhoneNumberInput(e.target.value)}
									style={{
										width: "100%",
										padding: "12px 14px",
										background: "rgba(0, 0, 0, 0.3)",
										border: "1px solid var(--border-color)",
										borderRadius: "10px",
										color: "var(--text-main)",
										outline: "none",
										fontSize: "0.95rem",
									}}
								/>
								<span style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "6px", display: "block" }}>
									💡 Jika diisi, backend akan mengeluarkan 8-digit Pairing Code. Jika kosong, akan menghasilkan QR Code.
								</span>
							</div>

							<div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
								<button
									type="button"
									onClick={() => setIsCreateModalOpen(false)}
									className="secondary-btn"
								>
									Batal
								</button>

								<button
									type="submit"
									disabled={isSubmitting}
									className="gradient-btn"
								>
									{isSubmitting ? "Memproses..." : "Buat Agent"}
								</button>
							</div>
						</form>
					</div>
				</div>
			)}

			{/* Delete Confirmation Modal */}
			{agentToDelete && (
				<div
					onClick={(e) => {
						if (e.target === e.currentTarget && !isDeleting) setAgentToDelete(null)
					}}
					style={{
						position: "fixed",
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						background: "rgba(0, 0, 0, 0.8)",
						backdropFilter: "blur(8px)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						zIndex: 110,
						padding: "20px",
					}}
				>
					<div
						className="glass-panel"
						style={{
							width: "100%",
							maxWidth: "420px",
							padding: "28px",
							background: "var(--bg-card)",
							textAlign: "center",
						}}
					>
						<div
							style={{
								width: "54px",
								height: "54px",
								borderRadius: "50%",
								background: "rgba(239, 68, 68, 0.15)",
								border: "1px solid rgba(239, 68, 68, 0.3)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								margin: "0 auto 16px auto",
							}}
						>
							<AlertTriangle size={28} color="var(--status-red)" />
						</div>

						<h3 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "8px" }}>
							Hapus Agent Permanen?
						</h3>

						<p style={{ fontSize: "0.88rem", color: "var(--text-muted)", marginBottom: "24px", lineHeight: "1.4" }}>
							Agent <strong style={{ color: "var(--text-main)" }}>{agentToDelete.name}</strong> dan seluruh kunci autentikasi di database PostgreSQL akan dihapus permanen.
						</p>

						<div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
							<button
								type="button"
								disabled={isDeleting}
								onClick={() => setAgentToDelete(null)}
								className="secondary-btn"
								style={{ flex: 1, justifyContent: "center" }}
							>
								Batal
							</button>

							<button
								type="button"
								disabled={isDeleting}
								onClick={confirmDeleteAgent}
								className="danger-btn"
								style={{ flex: 1, justifyContent: "center", padding: "10px 18px", fontSize: "0.9rem" }}
							>
								{isDeleting ? "Menghapus..." : "Ya, Hapus Agent"}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* QR Code / Pairing Code Viewer Modal */}
			{selectedAgent && (
				<div
					onClick={(e) => {
						if (e.target === e.currentTarget) handleSetSelectedAgent(null)
					}}
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
						zIndex: 100,
						padding: "20px",
					}}
				>
					<div
						className="glass-panel"
						style={{
							width: "100%",
							maxWidth: "480px",
							padding: "28px",
							background: "var(--bg-card)",
							textAlign: "center",
						}}
					>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								marginBottom: "20px",
							}}
						>
							<h3 style={{ fontSize: "1.1rem", fontWeight: 600 }}>
								Autentikasi WhatsApp: {selectedAgent.name}
							</h3>
							<button
								type="button"
								onClick={() => handleSetSelectedAgent(null)}
								style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
							>
								<X size={20} />
							</button>
						</div>

						{/* Case 1: Pairing Code Available */}
						{selectedAgent.pairingCode && (
							<div>
								<p style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginBottom: "16px" }}>
									Masukkan 8-digit kode berikut pada aplikasi WhatsApp di HP kamu:
								</p>

								<div
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										gap: "12px",
										marginBottom: "20px",
									}}
								>
									<div className="pairing-code-box">{selectedAgent.pairingCode}</div>
									<button
										type="button"
										onClick={() => copyToClipboard(selectedAgent.pairingCode!)}
										className="secondary-btn"
										style={{ padding: "14px" }}
										title="Copy Pairing Code"
									>
										{copied ? <Check size={18} color="var(--status-green)" /> : <Copy size={18} />}
									</button>
								</div>

								<div
									style={{
										background: "rgba(255, 255, 255, 0.03)",
										border: "1px solid var(--border-color)",
										borderRadius: "12px",
										padding: "14px",
										textAlign: "left",
										fontSize: "0.82rem",
										color: "var(--text-muted)",
									}}
								>
									<strong>Cara Menghubungkan:</strong>
									<ol style={{ paddingLeft: "18px", marginTop: "6px" }}>
										<li>Buka WhatsApp di Smartphone kamu.</li>
										<li>Pergi ke <strong>Setelan (Settings) ➔ Perangkat Tertaut (Linked Devices)</strong>.</li>
										<li>Pilih <strong>Tautkan Perangkat (Link a Device)</strong>.</li>
										<li>Klik <strong>Tautkan dengan nomor telepon saja (Link with phone number instead)</strong>.</li>
										<li>Masukkan kode 8-digit di atas.</li>
									</ol>
								</div>
							</div>
						)}

						{/* Case 2: QR Code Available */}
						{selectedAgent.qrCode && !selectedAgent.pairingCode && (
							<div>
								<p style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginBottom: "16px" }}>
									Scan QR Code ini menggunakan aplikasi WhatsApp di Smartphone kamu:
								</p>

								<div
									style={{
										background: "#ffffff",
										padding: "16px",
										borderRadius: "16px",
										display: "inline-block",
										marginBottom: "20px",
									}}
								>
									<QRCodeSVG value={selectedAgent.qrCode} size={220} />
								</div>

								<div
									style={{
										background: "rgba(255, 255, 255, 0.03)",
										border: "1px solid var(--border-color)",
										borderRadius: "12px",
										padding: "14px",
										textAlign: "left",
										fontSize: "0.82rem",
										color: "var(--text-muted)",
									}}
								>
									<strong>Cara Scan:</strong>
									<ol style={{ paddingLeft: "18px", marginTop: "6px" }}>
										<li>Buka WhatsApp di Smartphone.</li>
										<li>Buka <strong>Setelan (Settings) ➔ Perangkat Tertaut (Linked Devices)</strong>.</li>
										<li>Klik <strong>Tautkan Perangkat</strong> lalu arahkan kamera ke QR Code di atas.</li>
									</ol>
								</div>
							</div>
						)}

						{/* Case 3: Already Connected or Waiting */}
						{!selectedAgent.pairingCode && !selectedAgent.qrCode && (
							<div style={{ padding: "30px 10px" }}>
								{selectedAgent.status === "connected" ? (
									<>
										<CheckCircle2 size={48} color="var(--status-green)" style={{ marginBottom: "12px" }} />
										<h4 style={{ color: "var(--status-green)", marginBottom: "8px" }}>Sudah Terhubung!</h4>
										<p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
											Agent {selectedAgent.name} sudah berhasil terkoneksi ke WhatsApp.
										</p>
									</>
								) : (
									<>
										<Clock size={48} color="var(--status-amber)" style={{ marginBottom: "12px" }} />
										<h4 style={{ color: "var(--status-amber)", marginBottom: "8px" }}>Sedang Menyiapkan...</h4>
										<p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
											Mohon tunggu sebentar, backend sedang memproses soket dan kode login...
										</p>
									</>
								)}
							</div>
						)}

						<div style={{ marginTop: "24px" }}>
							<button
								type="button"
								onClick={() => handleSetSelectedAgent(null)}
								className="secondary-btn"
								style={{ width: "100%", justifyContent: "center" }}
							>
								Tutup
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Real-Time Live Chat Console Modal */}
			{activeChatAgent && (
				<ChatConsoleModal
					agent={activeChatAgent}
					onClose={() => setActiveChatAgent(null)}
				/>
			)}
		</div>
	)
}
