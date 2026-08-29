import React, { useEffect, useState } from "react"
import {
	CheckCircle2,
	MessageSquare,
	Save,
	Sliders,
} from "lucide-react"
import { API_BASE_URL } from "../../services/api"
import type { AgentGeneralSettings } from "../../types"

interface GeneralSettingsTabProps {
	agentId: string
	onShowToast: (type: "success" | "error", message: string) => void
}

export const GeneralSettingsTab: React.FC<GeneralSettingsTabProps> = ({
	agentId,
	onShowToast,
}) => {
	const [settings, setSettings] = useState<AgentGeneralSettings>({
		prefix: ".",
		welcomeMessage: "Selamat datang di grup @user!",
		goodbyeMessage: "Selamat tinggal @user!",
		autoRead: false,
		typingIndicator: true,
	})
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)

	useEffect(() => {
		const fetchSettings = async () => {
			setLoading(true)
			try {
				const res = await fetch(`${API_BASE_URL}/api/agents/${agentId}/settings`)
				const json = await res.json()
				if (json.success && json.data) {
					setSettings(json.data)
				}
			} catch (err) {
				onShowToast("error", `Failed to load general settings: ${err}`)
			} finally {
				setLoading(false)
			}
		}

		fetchSettings()
	}, [agentId, onShowToast])

	const handleSave = async () => {
		setSaving(true)
		try {
			const res = await fetch(`${API_BASE_URL}/api/agents/${agentId}/settings`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(settings),
			})
			const json = await res.json()
			if (json.success) {
				onShowToast("success", "General settings saved successfully")
			} else {
				onShowToast("error", json.message || "Failed to save settings")
			}
		} catch (err) {
			onShowToast("error", `Error: ${err}`)
		} finally {
			setSaving(false)
		}
	}

	if (loading) {
		return (
			<div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
				Loading general settings...
			</div>
		)
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
			{/* Command Prefix Setting */}
			<div
				style={{
					background: "rgba(255, 255, 255, 0.04)",
					border: "1px solid var(--border-color)",
					borderRadius: "12px",
					padding: "18px",
				}}
			>
				<h4 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
					<Sliders size={18} color="var(--primary-cyan)" /> Default Command Prefix
				</h4>
				<p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "14px" }}>
					Karakter awalan untuk memicu perintah bot (contoh: <code>.</code> atau <code>!</code>).
				</p>
				<input
					type="text"
					value={settings.prefix}
					maxLength={3}
					onChange={(e) => setSettings((prev) => ({ ...prev, prefix: e.target.value }))}
					style={{
						width: "120px",
						padding: "10px 14px",
						borderRadius: "8px",
						background: "rgba(255, 255, 255, 0.06)",
						border: "1px solid var(--border-color)",
						color: "var(--text-main)",
						fontSize: "1.1rem",
						fontWeight: 700,
						textAlign: "center",
						outline: "none",
					}}
				/>
			</div>

			{/* Welcome & Goodbye Messages */}
			<div
				style={{
					background: "rgba(255, 255, 255, 0.04)",
					border: "1px solid var(--border-color)",
					borderRadius: "12px",
					padding: "18px",
					display: "flex",
					flexDirection: "column",
					gap: "16px",
				}}
			>
				<h4 style={{ fontSize: "0.95rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
					<MessageSquare size={18} color="var(--primary-cyan)" /> Group Greeting Templates
				</h4>

				<div>
					<label style={{ fontSize: "0.82rem", fontWeight: 600, display: "block", marginBottom: "6px" }}>
						Welcome Message Template:
					</label>
					<textarea
						rows={3}
						value={settings.welcomeMessage || ""}
						placeholder="Selamat datang @user di grup @group!"
						onChange={(e) => setSettings((prev) => ({ ...prev, welcomeMessage: e.target.value }))}
						style={{
							width: "100%",
							padding: "10px 14px",
							borderRadius: "8px",
							background: "rgba(255, 255, 255, 0.05)",
							border: "1px solid var(--border-color)",
							color: "var(--text-main)",
							fontSize: "0.88rem",
							outline: "none",
							resize: "vertical",
						}}
					/>
					<span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
						Gunakan tag <code>@user</code> untuk mention member dan <code>@group</code> untuk nama grup.
					</span>
				</div>

				<div>
					<label style={{ fontSize: "0.82rem", fontWeight: 600, display: "block", marginBottom: "6px" }}>
						Goodbye Message Template:
					</label>
					<textarea
						rows={3}
						value={settings.goodbyeMessage || ""}
						placeholder="Selamat tinggal @user!"
						onChange={(e) => setSettings((prev) => ({ ...prev, goodbyeMessage: e.target.value }))}
						style={{
							width: "100%",
							padding: "10px 14px",
							borderRadius: "8px",
							background: "rgba(255, 255, 255, 0.05)",
							border: "1px solid var(--border-color)",
							color: "var(--text-main)",
							fontSize: "0.88rem",
							outline: "none",
							resize: "vertical",
						}}
					/>
				</div>
			</div>

			{/* Feature Toggles */}
			<div
				style={{
					background: "rgba(255, 255, 255, 0.04)",
					border: "1px solid var(--border-color)",
					borderRadius: "12px",
					padding: "18px",
					display: "flex",
					flexDirection: "column",
					gap: "14px",
				}}
			>
				<h4 style={{ fontSize: "0.95rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
					<CheckCircle2 size={18} color="var(--primary-cyan)" /> Behavior Preferences
				</h4>

				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
					<div>
						<span style={{ fontSize: "0.88rem", fontWeight: 600, display: "block" }}>
							Typing Indicator (Sedang Mengetik...)
						</span>
						<span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
							Menampilkan status "typing..." saat bot sedang memproses perintah atau AI.
						</span>
					</div>
					<input
						type="checkbox"
						checked={settings.typingIndicator}
						onChange={(e) => setSettings((prev) => ({ ...prev, typingIndicator: e.target.checked }))}
						style={{ width: "20px", height: "20px", cursor: "pointer" }}
					/>
				</div>

				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
					<div>
						<span style={{ fontSize: "0.88rem", fontWeight: 600, display: "block" }}>
							Auto-Read Incoming Messages
						</span>
						<span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
							Otomatis centang biru pada pesan WhatsApp yang diterima.
						</span>
					</div>
					<input
						type="checkbox"
						checked={settings.autoRead}
						onChange={(e) => setSettings((prev) => ({ ...prev, autoRead: e.target.checked }))}
						style={{ width: "20px", height: "20px", cursor: "pointer" }}
					/>
				</div>
			</div>

			{/* Save Button */}
			<button
				type="button"
				onClick={handleSave}
				disabled={saving}
				style={{
					padding: "12px 24px",
					borderRadius: "10px",
					background: "linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)",
					border: "none",
					color: "#040914",
					fontWeight: 700,
					fontSize: "0.95rem",
					cursor: saving ? "not-allowed" : "pointer",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					gap: "8px",
					boxShadow: "0 4px 15px rgba(0, 242, 254, 0.2)",
				}}
			>
				<Save size={18} /> {saving ? "Saving Changes..." : "Save Settings"}
			</button>
		</div>
	)
}
