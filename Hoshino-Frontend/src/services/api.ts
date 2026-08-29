import type { Agent, ApiResponse } from "../types"

export const API_BASE_URL =
	typeof window !== "undefined"
		? `${window.location.protocol}//${window.location.hostname}:3040`
		: "http://localhost:3040"

export async function fetchAgents(): Promise<Agent[]> {
	const res = await fetch(`${API_BASE_URL}/api/agents`)
	if (!res.ok) throw new Error("Backend non-200 response")
	const json: ApiResponse<Agent[]> = await res.json()
	if (!json.success || !json.data) {
		throw new Error(json.message || "Failed to fetch agents")
	}
	return json.data
}

export async function createAgent(
	name: string,
	phoneNumber?: string,
): Promise<Agent> {
	const res = await fetch(`${API_BASE_URL}/api/agents`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name, phoneNumber }),
	})
	const json: ApiResponse<Agent> = await res.json()
	if (!res.ok || !json.success || !json.data) {
		throw new Error(json.message || "Failed to create agent")
	}
	return json.data
}

export async function reconnectAgent(
	agentId: string,
	phoneNumber?: string,
): Promise<void> {
	const res = await fetch(`${API_BASE_URL}/api/agents/${agentId}/reconnect`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ phoneNumber }),
	})
	if (!res.ok) throw new Error("Failed to reconnect agent")
}

export async function deleteAgent(agentId: string): Promise<void> {
	const res = await fetch(`${API_BASE_URL}/api/agents/${agentId}`, {
		method: "DELETE",
	})
	if (!res.ok) throw new Error("Failed to delete agent")
}
