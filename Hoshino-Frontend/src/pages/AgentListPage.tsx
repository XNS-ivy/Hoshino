import React, { useCallback, useEffect, useRef, useState } from "react"
import { AgentSettingsModal } from "../components/AgentSettingsModal"
import { ChatConsoleModal } from "../components/ChatConsoleModal"
import { AgentGrid } from "../components/dashboard/AgentGrid"
import { MetricsSummary } from "../components/dashboard/MetricsSummary"
import { Navbar } from "../components/dashboard/Navbar"
import { AuthModal } from "../components/modals/AuthModal"
import { CreateAgentModal } from "../components/modals/CreateAgentModal"
import { DeleteAgentModal } from "../components/modals/DeleteAgentModal"
import { createAgent, deleteAgent, fetchAgents, reconnectAgent } from "../services/api"
import type { Agent } from "../types"

export const AgentListPage: React.FC = () => {
	const [agents, setAgents] = useState<Agent[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [isBackendOnline, setIsBackendOnline] = useState(false)
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

	const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
	const selectedAgentIdRef = useRef<string | null>(null)

	const [activeChatAgent, setActiveChatAgent] = useState<Agent | null>(null)
	const [settingsAgent, setSettingsAgent] = useState<Agent | null>(null)
	const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null)

	const handleSetSelectedAgent = (agent: Agent | null) => {
		selectedAgentIdRef.current = agent ? agent.agentId : null
		setSelectedAgent(agent)
	}

	const loadAgents = useCallback(async () => {
		try {
			const data = await fetchAgents()
			setAgents(data)
			setIsBackendOnline(true)

			// Keep selected agent synced with auto-polling data
			const currentSelectedId = selectedAgentIdRef.current
			if (currentSelectedId) {
				const updated = data.find((a) => a.agentId === currentSelectedId)
				if (updated) {
					setSelectedAgent(updated)
				}
			}
		} catch {
			setIsBackendOnline(false)
		} finally {
			setIsLoading(false)
		}
	}, [])

	useEffect(() => {
		loadAgents()
		const interval = setInterval(loadAgents, 3000)
		return () => clearInterval(interval)
	}, [loadAgents])

	const handleCreateAgent = async (name: string, phoneNumber?: string) => {
		const newAgent = await createAgent(name, phoneNumber)
		handleSetSelectedAgent(newAgent)
		await loadAgents()
	}

	const handleReconnect = async (agentId: string, phoneNumber?: string) => {
		try {
			await reconnectAgent(agentId, phoneNumber)
			await loadAgents()
		} catch (err) {
			alert(`Failed to reconnect: ${err}`)
		}
	}

	const handleConfirmDelete = async () => {
		if (!agentToDelete) return
		try {
			await deleteAgent(agentToDelete.agentId)
			if (selectedAgentIdRef.current === agentToDelete.agentId) {
				handleSetSelectedAgent(null)
			}
			setAgentToDelete(null)
			await loadAgents()
		} catch (err) {
			alert(`Failed to delete agent: ${err}`)
		}
	}

	return (
		<div style={{ paddingBottom: "60px" }}>
			<Navbar
				isOnline={isBackendOnline}
				isLoading={isLoading}
				onRefresh={loadAgents}
				onOpenCreateModal={() => setIsCreateModalOpen(true)}
			/>

			<main style={{ maxWidth: "1280px", margin: "0 auto", padding: "0 24px" }}>
				<MetricsSummary agents={agents} />

				<AgentGrid
					agents={agents}
					isLoading={isLoading}
					onSelect={(agent) => handleSetSelectedAgent(agent)}
					onOpenChat={(agent) => setActiveChatAgent(agent)}
					onOpenSettings={(agent) => setSettingsAgent(agent)}
					onReconnect={handleReconnect}
					onDeleteConfirm={(agent) => setAgentToDelete(agent)}
					onOpenCreateModal={() => setIsCreateModalOpen(true)}
				/>
			</main>

			<CreateAgentModal
				isOpen={isCreateModalOpen}
				onClose={() => setIsCreateModalOpen(false)}
				onSubmit={handleCreateAgent}
			/>

			<DeleteAgentModal
				agent={agentToDelete}
				onClose={() => setAgentToDelete(null)}
				onConfirmDelete={handleConfirmDelete}
			/>

			<AuthModal
				agent={selectedAgent}
				onClose={() => handleSetSelectedAgent(null)}
			/>

			{activeChatAgent && (
				<ChatConsoleModal
					agent={activeChatAgent}
					onClose={() => setActiveChatAgent(null)}
				/>
			)}

			{settingsAgent && (
				<AgentSettingsModal
					agent={settingsAgent}
					onClose={() => setSettingsAgent(null)}
				/>
			)}
		</div>
	)
}
