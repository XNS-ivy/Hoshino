import React, { useEffect, useState } from "react"
import { ArrowLeft, Bot, MessageSquare, Settings } from "lucide-react"
import { useNavigate, useParams } from "react-router-dom"
import { AgentSettingsModal } from "../components/AgentSettingsModal"
import { ChatConsoleModal } from "../components/ChatConsoleModal"
import { fetchAgents } from "../services/api"
import type { Agent } from "../types"

export const AgentDetailPage: React.FC = () => {
	const { agentId } = useParams<{ agentId: string }>()
	const navigate = useNavigate()
	const [agent, setAgent] = useState<Agent | null>(null)
	const [loading, setLoading] = useState(true)
	const [isChatOpen, setIsChatOpen] = useState(false)
	const [isSettingsOpen, setIsSettingsOpen] = useState(false)

	useEffect(() => {
		async function load() {
			try {
				const list = await fetchAgents()
				const found = list.find((a) => a.agentId === agentId)
				if (found) setAgent(found)
			} catch {
				/* ignore */
			} finally {
				setLoading(false)
			}
		}
		load()
	}, [agentId])

	if (loading) {
		return (
			<div style={{ padding: "60px", textAlign: "center", color: "var(--text-muted)" }}>
				Loading agent details...
			</div>
		)
	}

	if (!agent) {
		return (
			<div style={{ padding: "60px", textAlign: "center", color: "var(--text-muted)" }}>
				<h3>Agent Not Found</h3>
				<button type="button" onClick={() => navigate("/")} className="secondary-btn" style={{ marginTop: "16px" }}>
					<ArrowLeft size={16} /> Back to Dashboard
				</button>
			</div>
		)
	}

	return (
		<div style={{ maxWidth: "1000px", margin: "40px auto", padding: "0 20px" }}>
			<button
				type="button"
				onClick={() => navigate("/")}
				className="secondary-btn"
				style={{ marginBottom: "20px" }}
			>
				<ArrowLeft size={16} /> Back to Dashboard
			</button>

			<div className="glass-card" style={{ padding: "32px" }}>
				<div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
					<div
						style={{
							width: "56px",
							height: "56px",
							borderRadius: "16px",
							background: "linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						<Bot size={32} color="#040914" />
					</div>
					<div>
						<h2 style={{ fontSize: "1.6rem", fontWeight: 700 }}>{agent.name}</h2>
						<span style={{ fontSize: "0.85rem", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
							Agent ID: {agent.agentId}
						</span>
					</div>
				</div>

				<div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
					{agent.status === "connected" && (
						<button type="button" onClick={() => setIsChatOpen(true)} className="gradient-btn">
							<MessageSquare size={18} /> Open Live Chat
						</button>
					)}

					<button type="button" onClick={() => setIsSettingsOpen(true)} className="secondary-btn">
						<Settings size={18} /> Open Settings
					</button>
				</div>
			</div>

			{isChatOpen && <ChatConsoleModal agent={agent} onClose={() => setIsChatOpen(false)} />}
			{isSettingsOpen && <AgentSettingsModal agent={agent} onClose={() => setIsSettingsOpen(false)} />}
		</div>
	)
}
