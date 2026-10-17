import type {
	Agent,
	ApiResponse,
	DatabaseCleanResult,
	DatabaseSettings,
	DatabaseStats,
	DatabaseVacuumResult,
	FlushLogsResult,
	LogStats,
} from "../types"

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

// ── Database Management APIs ──
export async function fetchDatabaseStats(): Promise<DatabaseStats> {
	const res = await fetch(`${API_BASE_URL}/api/database/stats`)
	if (!res.ok) throw new Error("Failed to fetch database metrics")
	const json: ApiResponse<DatabaseStats> = await res.json()
	if (!json.success || !json.data) {
		throw new Error(json.message || "Failed to fetch database metrics")
	}
	return json.data
}

export async function fetchDatabaseSettings(): Promise<DatabaseSettings> {
	const res = await fetch(`${API_BASE_URL}/api/database/settings`)
	if (!res.ok) throw new Error("Failed to fetch database settings")
	const json: ApiResponse<DatabaseSettings> = await res.json()
	if (!json.success || !json.data) {
		throw new Error(json.message || "Failed to fetch database settings")
	}
	return json.data
}

export async function updateDatabaseSettings(
	settings: Partial<DatabaseSettings>,
): Promise<DatabaseSettings> {
	const res = await fetch(`${API_BASE_URL}/api/database/settings`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(settings),
	})
	const json: ApiResponse<DatabaseSettings> = await res.json()
	if (!res.ok || !json.success || !json.data) {
		throw new Error(json.message || "Failed to update database settings")
	}
	return json.data
}

export async function cleanDatabaseMessages(options: {
	retentionDays?: number
	maxMessagesPerChat?: number
	purgeMediaOnly?: boolean
}): Promise<DatabaseCleanResult> {
	const res = await fetch(`${API_BASE_URL}/api/database/clean`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(options),
	})
	const json: ApiResponse<DatabaseCleanResult> = await res.json()
	if (!res.ok || !json.success || !json.data) {
		throw new Error(json.message || "Failed to clean database messages")
	}
	return json.data
}

export async function runDatabaseVacuum(table?: string): Promise<DatabaseVacuumResult> {
	const res = await fetch(`${API_BASE_URL}/api/database/vacuum`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ table }),
	})
	const json: ApiResponse<DatabaseVacuumResult> = await res.json()
	if (!res.ok || !json.success || !json.data) {
		throw new Error(json.message || "Failed to run database VACUUM")
	}
	return json.data
}

// ── Log Management APIs ──
export async function fetchLogStats(): Promise<LogStats> {
	const res = await fetch(`${API_BASE_URL}/api/database/logs`)
	if (!res.ok) throw new Error("Failed to fetch log statistics")
	const json: ApiResponse<LogStats> = await res.json()
	if (!json.success || !json.data) {
		throw new Error(json.message || "Failed to fetch log statistics")
	}
	return json.data
}

export async function flushLogs(options: {
	retentionDays?: number
	flushAll?: boolean
}): Promise<FlushLogsResult> {
	const res = await fetch(`${API_BASE_URL}/api/database/logs/flush`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(options),
	})
	const json: ApiResponse<FlushLogsResult> = await res.json()
	if (!res.ok || !json.success || !json.data) {
		throw new Error(json.message || "Failed to flush log files")
	}
	return json.data
}


