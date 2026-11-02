import React, { useEffect, useState } from "react"
import {
	Gamepad2,
	Gift,
	Heart,
	Info,
	RotateCcw,
	Save,
	Sparkles,
	Swords,
	Trophy,
} from "lucide-react"
import { API_BASE_URL } from "../../services/api"
import type { AgentBlueArchiveSettings } from "../../types"

interface BlueArchiveSettingsTabProps {
	agentId: string
	onShowToast: (type: "success" | "error", message: string) => void
}

const DEFAULT_SETTINGS: AgentBlueArchiveSettings = {
	agentId: "",
	gacha3StarRate: 3.0,
	gacha2StarRate: 18.5,
	gacha1StarRate: 78.5,
	gachaSingleCost: 120,
	gachaTenCost: 1200,
	sparkCost: 200,
	dailyPyroxenes: 1200,
	dailyCredits: 250000,
	dailyResetHour: 6,
	dailyRaidTickets: 3,
	dailyBountyTickets: 3,
	duelEnabled: true,
	duelMinBet: 10,
	duelMaxBet: 5000000,
	duelFeePercent: 0,
	raidTicketsMax: 3,
	bountyTicketsMax: 3,
	raidCreditMultiplier: 1.0,
	bountyDropMultiplier: 1.0,
	bondXpMultiplier: 1.0,
	relationshipRewardPyroxenes: 20,
}

export const BlueArchiveSettingsTab: React.FC<BlueArchiveSettingsTabProps> = ({
	agentId,
	onShowToast,
}) => {
	const [settings, setSettings] = useState<AgentBlueArchiveSettings>({
		...DEFAULT_SETTINGS,
		agentId,
	})
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const [resetting, setResetting] = useState(false)

	const fetchSettings = async () => {
		setLoading(true)
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/agents/${agentId}/bluearchive/settings`,
			)
			const json = await res.json()
			if (json.success && json.data) {
				setSettings(json.data)
			}
		} catch (err) {
			onShowToast("error", `Failed to load Blue Archive settings: ${err}`)
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		fetchSettings()
	}, [agentId])

	const handleSave = async () => {
		setSaving(true)
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/agents/${agentId}/bluearchive/settings`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(settings),
				},
			)
			const json = await res.json()
			if (json.success) {
				setSettings(json.data)
				onShowToast("success", "Blue Archive settings saved successfully")
			} else {
				onShowToast("error", json.message || "Failed to save settings")
			}
		} catch (err) {
			onShowToast("error", `Error: ${err}`)
		} finally {
			setSaving(false)
		}
	}

	const handleReset = async () => {
		if (
			!window.confirm(
				"Are you sure you want to reset all Blue Archive settings to official SchaleDB defaults?",
			)
		) {
			return
		}

		setResetting(true)
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/agents/${agentId}/bluearchive/settings/reset`,
				{
					method: "POST",
				},
			)
			const json = await res.json()
			if (json.success) {
				setSettings(json.data)
				onShowToast(
					"success",
					"Blue Archive settings reset to defaults successfully",
				)
			} else {
				onShowToast("error", json.message || "Failed to reset settings")
			}
		} catch (err) {
			onShowToast("error", `Error: ${err}`)
		} finally {
			setResetting(false)
		}
	}

	const totalRates = (
		(settings.gacha3StarRate || 0) +
		(settings.gacha2StarRate || 0) +
		(settings.gacha1StarRate || 0)
	).toFixed(1)

	if (loading) {
		return (
			<div
				style={{
					padding: "40px",
					textAlign: "center",
					color: "var(--text-muted)",
				}}
			>
				Loading Blue Archive game settings...
			</div>
		)
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
			{/* Banner */}
			<div
				style={{
					background:
						"linear-gradient(135deg, rgba(0, 242, 254, 0.08) 0%, rgba(244, 114, 182, 0.08) 100%)",
					border: "1px solid rgba(0, 242, 254, 0.25)",
					borderRadius: "14px",
					padding: "16px 20px",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "14px",
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
					<Gamepad2 size={24} color="#00f2fe" />
					<div>
						<h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>
							Blue Archive Game Economy & Mechanics
						</h3>
						<span
							style={{
								fontSize: "0.78rem",
								color: "var(--text-muted)",
								marginTop: "2px",
								display: "block",
							}}
						>
							Sesuaikan rate gacha, biaya recruit, bonus daily Arona, tiket
							raid, dan arena duel PvP.
						</span>
					</div>
				</div>

				<button
					type="button"
					onClick={handleReset}
					disabled={resetting}
					style={{
						padding: "8px 14px",
						borderRadius: "8px",
						background: "rgba(255, 255, 255, 0.05)",
						border: "1px solid var(--border-color)",
						color: "var(--text-dim)",
						fontSize: "0.8rem",
						fontWeight: 600,
						cursor: resetting ? "not-allowed" : "pointer",
						display: "flex",
						alignItems: "center",
						gap: "6px",
					}}
					title="Reset to official Blue Archive rates and values"
				>
					<RotateCcw size={14} />{" "}
					{resetting ? "Resetting..." : "Reset Defaults"}
				</button>
			</div>

			{/* Section 1: Gacha Rates & Pull Costs */}
			<div
				style={{
					background: "rgba(255, 255, 255, 0.03)",
					border: "1px solid var(--border-color)",
					borderRadius: "14px",
					padding: "18px",
					display: "flex",
					flexDirection: "column",
					gap: "14px",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
					}}
				>
					<h4
						style={{
							fontSize: "0.95rem",
							fontWeight: 600,
							display: "flex",
							alignItems: "center",
							gap: "8px",
							margin: 0,
						}}
					>
						<Sparkles size={18} color="#facc15" /> Recruitment Gacha Rates &
						Costs
					</h4>
					<span
						style={{
							fontSize: "0.75rem",
							color:
								Math.abs(Number.parseFloat(totalRates) - 100) < 0.2
									? "#34d399"
									: "#f87171",
							fontWeight: 600,
						}}
					>
						Total Probabilitas: {totalRates}%{" "}
						{Math.abs(Number.parseFloat(totalRates) - 100) >= 0.2 &&
							"(Idealnya 100%)"}
					</span>
				</div>

				{/* Visual Rate Bar */}
				<div
					style={{
						width: "100%",
						height: "10px",
						borderRadius: "5px",
						overflow: "hidden",
						display: "flex",
						background: "rgba(255, 255, 255, 0.1)",
					}}
				>
					<div
						style={{
							width: `${Math.min(100, settings.gacha3StarRate || 0)}%`,
							background:
								"linear-gradient(90deg, #facc15 0%, #fbbf24 100%)",
						}}
						title={`3★ Rate: ${settings.gacha3StarRate}%`}
					/>
					<div
						style={{
							width: `${Math.min(100, settings.gacha2StarRate || 0)}%`,
							background:
								"linear-gradient(90deg, #f472b6 0%, #ec4899 100%)",
						}}
						title={`2★ Rate: ${settings.gacha2StarRate}%`}
					/>
					<div
						style={{
							width: `${Math.min(100, settings.gacha1StarRate || 0)}%`,
							background:
								"linear-gradient(90deg, #60a5fa 0%, #3b82f6 100%)",
						}}
						title={`1★ Rate: ${settings.gacha1StarRate}%`}
					/>
				</div>

				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
						gap: "12px",
					}}
				>
					<div>
						<label
							style={{
								fontSize: "0.78rem",
								fontWeight: 600,
								display: "block",
								marginBottom: "4px",
								color: "#facc15",
							}}
						>
							Rate 3★ (Bintang 3):
						</label>
						<input
							type="number"
							step="0.1"
							min={0.1}
							max={100}
							value={settings.gacha3StarRate}
							onChange={(e) =>
								setSettings((prev) => ({
									...prev,
									gacha3StarRate:
										Number.parseFloat(e.target.value) || 0,
								}))
							}
							style={{
								width: "100%",
								padding: "8px 12px",
								borderRadius: "6px",
								background: "rgba(255, 255, 255, 0.05)",
								border: "1px solid var(--border-color)",
								color: "var(--text-main)",
								fontSize: "0.85rem",
							}}
						/>
						<span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
							Default: 3.0%
						</span>
					</div>

					<div>
						<label
							style={{
								fontSize: "0.78rem",
								fontWeight: 600,
								display: "block",
								marginBottom: "4px",
								color: "#f472b6",
							}}
						>
							Rate 2★ (Bintang 2):
						</label>
						<input
							type="number"
							step="0.1"
							min={0.1}
							max={100}
							value={settings.gacha2StarRate}
							onChange={(e) =>
								setSettings((prev) => ({
									...prev,
									gacha2StarRate:
										Number.parseFloat(e.target.value) || 0,
								}))
							}
							style={{
								width: "100%",
								padding: "8px 12px",
								borderRadius: "6px",
								background: "rgba(255, 255, 255, 0.05)",
								border: "1px solid var(--border-color)",
								color: "var(--text-main)",
								fontSize: "0.85rem",
							}}
						/>
						<span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
							Default: 18.5%
						</span>
					</div>

					<div>
						<label
							style={{
								fontSize: "0.78rem",
								fontWeight: 600,
								display: "block",
								marginBottom: "4px",
								color: "#60a5fa",
							}}
						>
							Rate 1★ (Bintang 1):
						</label>
						<input
							type="number"
							step="0.1"
							min={0.1}
							max={100}
							value={settings.gacha1StarRate}
							onChange={(e) =>
								setSettings((prev) => ({
									...prev,
									gacha1StarRate:
										Number.parseFloat(e.target.value) || 0,
								}))
							}
							style={{
								width: "100%",
								padding: "8px 12px",
								borderRadius: "6px",
								background: "rgba(255, 255, 255, 0.05)",
								border: "1px solid var(--border-color)",
								color: "var(--text-main)",
								fontSize: "0.85rem",
							}}
						/>
						<span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
							Default: 78.5%
						</span>
					</div>

					<div>
						<label
							style={{
								fontSize: "0.78rem",
								fontWeight: 600,
								display: "block",
								marginBottom: "4px",
							}}
						>
							Biaya 1x Pull (Pyroxene):
						</label>
						<input
							type="number"
							min={1}
							value={settings.gachaSingleCost}
							onChange={(e) =>
								setSettings((prev) => ({
									...prev,
									gachaSingleCost:
										Number.parseInt(e.target.value, 10) || 120,
								}))
							}
							style={{
								width: "100%",
								padding: "8px 12px",
								borderRadius: "6px",
								background: "rgba(255, 255, 255, 0.05)",
								border: "1px solid var(--border-color)",
								color: "var(--text-main)",
								fontSize: "0.85rem",
							}}
						/>
						<span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
							Default: 120 Pyroxenes
						</span>
					</div>

					<div>
						<label
							style={{
								fontSize: "0.78rem",
								fontWeight: 600,
								display: "block",
								marginBottom: "4px",
							}}
						>
							Biaya 10x Pull (Pyroxene):
						</label>
						<input
							type="number"
							min={10}
							value={settings.gachaTenCost}
							onChange={(e) =>
								setSettings((prev) => ({
									...prev,
									gachaTenCost:
										Number.parseInt(e.target.value, 10) || 1200,
								}))
							}
							style={{
								width: "100%",
								padding: "8px 12px",
								borderRadius: "6px",
								background: "rgba(255, 255, 255, 0.05)",
								border: "1px solid var(--border-color)",
								color: "var(--text-main)",
								fontSize: "0.85rem",
							}}
						/>
						<span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
							Default: 1,200 Pyroxenes
						</span>
					</div>

					<div>
						<label
							style={{
								fontSize: "0.78rem",
								fontWeight: 600,
								display: "block",
								marginBottom: "4px",
							}}
						>
							Spark Pity Guarantee:
						</label>
						<input
							type="number"
							min={10}
							value={settings.sparkCost}
							onChange={(e) =>
								setSettings((prev) => ({
									...prev,
									sparkCost:
										Number.parseInt(e.target.value, 10) || 200,
								}))
							}
							style={{
								width: "100%",
								padding: "8px 12px",
								borderRadius: "6px",
								background: "rgba(255, 255, 255, 0.05)",
								border: "1px solid var(--border-color)",
								color: "var(--text-main)",
								fontSize: "0.85rem",
							}}
						/>
						<span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
							Default: 200 pulls (.spark)
						</span>
					</div>
				</div>
			</div>

			{/* Section 2: Daily Work Bonus (Arona) */}
			<div
				style={{
					background: "rgba(255, 255, 255, 0.03)",
					border: "1px solid var(--border-color)",
					borderRadius: "14px",
					padding: "18px",
					display: "flex",
					flexDirection: "column",
					gap: "14px",
				}}
			>
				<h4
					style={{
						fontSize: "0.95rem",
						fontWeight: 600,
						display: "flex",
						alignItems: "center",
						gap: "8px",
						margin: 0,
					}}
				>
					<Gift size={18} color="#00f2fe" /> Daily Work Bonus (.daily / Arona)
				</h4>

				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
						gap: "12px",
					}}
				>
					<div>
						<label
							style={{
								fontSize: "0.78rem",
								fontWeight: 600,
								display: "block",
								marginBottom: "4px",
							}}
						>
							Daily Pyroxenes:
						</label>
						<input
							type="number"
							min={0}
							value={settings.dailyPyroxenes}
							onChange={(e) =>
								setSettings((prev) => ({
									...prev,
									dailyPyroxenes:
										Number.parseInt(e.target.value, 10) || 0,
								}))
							}
							style={{
								width: "100%",
								padding: "8px 12px",
								borderRadius: "6px",
								background: "rgba(255, 255, 255, 0.05)",
								border: "1px solid var(--border-color)",
								color: "var(--text-main)",
								fontSize: "0.85rem",
							}}
						/>
						<span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
							Default: 1,200 Pyroxenes
						</span>
					</div>

					<div>
						<label
							style={{
								fontSize: "0.78rem",
								fontWeight: 600,
								display: "block",
								marginBottom: "4px",
							}}
						>
							Daily Credits:
						</label>
						<input
							type="number"
							min={0}
							value={settings.dailyCredits}
							onChange={(e) =>
								setSettings((prev) => ({
									...prev,
									dailyCredits:
										Number.parseInt(e.target.value, 10) || 0,
								}))
							}
							style={{
								width: "100%",
								padding: "8px 12px",
								borderRadius: "6px",
								background: "rgba(255, 255, 255, 0.05)",
								border: "1px solid var(--border-color)",
								color: "var(--text-main)",
								fontSize: "0.85rem",
							}}
						/>
						<span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
							Default: 250,000 Credits
						</span>
					</div>

					<div>
						<label
							style={{
								fontSize: "0.78rem",
								fontWeight: 600,
								display: "block",
								marginBottom: "4px",
							}}
						>
							Reset Hour (WIB / GMT+7):
						</label>
						<input
							type="number"
							min={0}
							max={23}
							value={settings.dailyResetHour}
							onChange={(e) =>
								setSettings((prev) => ({
									...prev,
									dailyResetHour:
										Number.parseInt(e.target.value, 10) || 6,
								}))
							}
							style={{
								width: "100%",
								padding: "8px 12px",
								borderRadius: "6px",
								background: "rgba(255, 255, 255, 0.05)",
								border: "1px solid var(--border-color)",
								color: "var(--text-main)",
								fontSize: "0.85rem",
							}}
						/>
						<span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
							Default: 06:00 WIB
						</span>
					</div>

					<div>
						<label
							style={{
								fontSize: "0.78rem",
								fontWeight: 600,
								display: "block",
								marginBottom: "4px",
							}}
						>
							Daily Raid Tickets:
						</label>
						<input
							type="number"
							min={1}
							max={10}
							value={settings.dailyRaidTickets}
							onChange={(e) =>
								setSettings((prev) => ({
									...prev,
									dailyRaidTickets:
										Number.parseInt(e.target.value, 10) || 3,
								}))
							}
							style={{
								width: "100%",
								padding: "8px 12px",
								borderRadius: "6px",
								background: "rgba(255, 255, 255, 0.05)",
								border: "1px solid var(--border-color)",
								color: "var(--text-main)",
								fontSize: "0.85rem",
							}}
						/>
						<span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
							Default: 3 tickets
						</span>
					</div>

					<div>
						<label
							style={{
								fontSize: "0.78rem",
								fontWeight: 600,
								display: "block",
								marginBottom: "4px",
							}}
						>
							Daily Bounty Tickets:
						</label>
						<input
							type="number"
							min={1}
							max={10}
							value={settings.dailyBountyTickets}
							onChange={(e) =>
								setSettings((prev) => ({
									...prev,
									dailyBountyTickets:
										Number.parseInt(e.target.value, 10) || 3,
								}))
							}
							style={{
								width: "100%",
								padding: "8px 12px",
								borderRadius: "6px",
								background: "rgba(255, 255, 255, 0.05)",
								border: "1px solid var(--border-color)",
								color: "var(--text-main)",
								fontSize: "0.85rem",
							}}
						/>
						<span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
							Default: 3 tickets
						</span>
					</div>
				</div>
			</div>

			{/* Section 3: Tactical PvP Duel */}
			<div
				style={{
					background: "rgba(255, 255, 255, 0.03)",
					border: "1px solid var(--border-color)",
					borderRadius: "14px",
					padding: "18px",
					display: "flex",
					flexDirection: "column",
					gap: "14px",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
					}}
				>
					<div>
						<h4
							style={{
								fontSize: "0.95rem",
								fontWeight: 600,
								display: "flex",
								alignItems: "center",
								gap: "8px",
								margin: 0,
							}}
						>
							<Swords size={18} color="#f87171" /> Tactical PvP Duel Arena
							(.duel)
						</h4>
						<span
							style={{
								fontSize: "0.75rem",
								color: "var(--text-muted)",
								marginTop: "2px",
								display: "block",
							}}
						>
							Pertarungan taktis antarsensei (4 Striker + 2 Special) dengan
							taruhan Pyroxene atau Credit.
						</span>
					</div>

					<input
						type="checkbox"
						checked={settings.duelEnabled}
						onChange={(e) =>
							setSettings((prev) => ({
								...prev,
								duelEnabled: e.target.checked,
							}))
						}
						style={{ width: "20px", height: "20px", cursor: "pointer" }}
					/>
				</div>

				{settings.duelEnabled && (
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
							gap: "12px",
						}}
					>
						<div>
							<label
								style={{
									fontSize: "0.78rem",
									fontWeight: 600,
									display: "block",
									marginBottom: "4px",
								}}
							>
								Minimum Bet:
							</label>
							<input
								type="number"
								min={1}
								value={settings.duelMinBet}
								onChange={(e) =>
									setSettings((prev) => ({
										...prev,
										duelMinBet:
											Number.parseInt(e.target.value, 10) || 10,
									}))
								}
								style={{
									width: "100%",
									padding: "8px 12px",
									borderRadius: "6px",
									background: "rgba(255, 255, 255, 0.05)",
									border: "1px solid var(--border-color)",
									color: "var(--text-main)",
									fontSize: "0.85rem",
								}}
							/>
							<span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
								Default: 10
							</span>
						</div>

						<div>
							<label
								style={{
									fontSize: "0.78rem",
									fontWeight: 600,
									display: "block",
									marginBottom: "4px",
								}}
							>
								Maximum Bet:
							</label>
							<input
								type="number"
								min={100}
								value={settings.duelMaxBet}
								onChange={(e) =>
									setSettings((prev) => ({
										...prev,
										duelMaxBet:
											Number.parseInt(e.target.value, 10) || 5000000,
									}))
								}
								style={{
									width: "100%",
									padding: "8px 12px",
									borderRadius: "6px",
									background: "rgba(255, 255, 255, 0.05)",
									border: "1px solid var(--border-color)",
									color: "var(--text-main)",
									fontSize: "0.85rem",
								}}
							/>
							<span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
								Default: 5,000,000
							</span>
						</div>

						<div>
							<label
								style={{
									fontSize: "0.78rem",
									fontWeight: 600,
									display: "block",
									marginBottom: "4px",
								}}
							>
								House Fee (%):
							</label>
							<input
								type="number"
								step="0.5"
								min={0}
								max={50}
								value={settings.duelFeePercent}
								onChange={(e) =>
									setSettings((prev) => ({
										...prev,
										duelFeePercent:
											Number.parseFloat(e.target.value) || 0,
									}))
								}
								style={{
									width: "100%",
									padding: "8px 12px",
									borderRadius: "6px",
									background: "rgba(255, 255, 255, 0.05)",
									border: "1px solid var(--border-color)",
									color: "var(--text-main)",
									fontSize: "0.85rem",
								}}
							/>
							<span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
								Potongan pemenang (Default: 0%)
							</span>
						</div>
					</div>
				)}
			</div>

			{/* Section 4: Raids & Progression */}
			<div
				style={{
					background: "rgba(255, 255, 255, 0.03)",
					border: "1px solid var(--border-color)",
					borderRadius: "14px",
					padding: "18px",
					display: "flex",
					flexDirection: "column",
					gap: "14px",
				}}
			>
				<h4
					style={{
						fontSize: "0.95rem",
						fontWeight: 600,
						display: "flex",
						alignItems: "center",
						gap: "8px",
						margin: 0,
					}}
				>
					<Trophy size={18} color="#a78bfa" /> Raids, MomoTalk & Multipliers
				</h4>

				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
						gap: "12px",
					}}
				>
					<div>
						<label
							style={{
								fontSize: "0.78rem",
								fontWeight: 600,
								display: "block",
								marginBottom: "4px",
							}}
						>
							Raid Credit Multiplier:
						</label>
						<input
							type="number"
							step="0.1"
							min={0.1}
							max={10}
							value={settings.raidCreditMultiplier}
							onChange={(e) =>
								setSettings((prev) => ({
									...prev,
									raidCreditMultiplier:
										Number.parseFloat(e.target.value) || 1.0,
								}))
							}
							style={{
								width: "100%",
								padding: "8px 12px",
								borderRadius: "6px",
								background: "rgba(255, 255, 255, 0.05)",
								border: "1px solid var(--border-color)",
								color: "var(--text-main)",
								fontSize: "0.85rem",
							}}
						/>
						<span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
							Default: 1.0x
						</span>
					</div>

					<div>
						<label
							style={{
								fontSize: "0.78rem",
								fontWeight: 600,
								display: "block",
								marginBottom: "4px",
							}}
						>
							Bounty Drop Multiplier:
						</label>
						<input
							type="number"
							step="0.1"
							min={0.1}
							max={10}
							value={settings.bountyDropMultiplier}
							onChange={(e) =>
								setSettings((prev) => ({
									...prev,
									bountyDropMultiplier:
										Number.parseFloat(e.target.value) || 1.0,
								}))
							}
							style={{
								width: "100%",
								padding: "8px 12px",
								borderRadius: "6px",
								background: "rgba(255, 255, 255, 0.05)",
								border: "1px solid var(--border-color)",
								color: "var(--text-main)",
								fontSize: "0.85rem",
							}}
						/>
						<span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
							Default: 1.0x
						</span>
					</div>

					<div>
						<label
							style={{
								fontSize: "0.78rem",
								fontWeight: 600,
								display: "block",
								marginBottom: "4px",
							}}
						>
							MomoTalk Bond XP Multiplier:
						</label>
						<input
							type="number"
							step="0.1"
							min={0.1}
							max={10}
							value={settings.bondXpMultiplier}
							onChange={(e) =>
								setSettings((prev) => ({
									...prev,
									bondXpMultiplier:
										Number.parseFloat(e.target.value) || 1.0,
								}))
							}
							style={{
								width: "100%",
								padding: "8px 12px",
								borderRadius: "6px",
								background: "rgba(255, 255, 255, 0.05)",
								border: "1px solid var(--border-color)",
								color: "var(--text-main)",
								fontSize: "0.85rem",
							}}
						/>
						<span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
							Default: 1.0x
						</span>
					</div>

					<div>
						<label
							style={{
								fontSize: "0.78rem",
								fontWeight: 600,
								display: "block",
								marginBottom: "4px",
							}}
						>
							MomoTalk Episode Pyroxenes:
						</label>
						<input
							type="number"
							min={0}
							value={settings.relationshipRewardPyroxenes}
							onChange={(e) =>
								setSettings((prev) => ({
									...prev,
									relationshipRewardPyroxenes:
										Number.parseInt(e.target.value, 10) || 0,
								}))
							}
							style={{
								width: "100%",
								padding: "8px 12px",
								borderRadius: "6px",
								background: "rgba(255, 255, 255, 0.05)",
								border: "1px solid var(--border-color)",
								color: "var(--text-main)",
								fontSize: "0.85rem",
							}}
						/>
						<span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
							Default: 20 Pyroxenes
						</span>
					</div>
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
					background:
						"linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)",
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
				<Save size={18} />{" "}
				{saving ? "Saving Changes..." : "Save Blue Archive Settings"}
			</button>
		</div>
	)
}

