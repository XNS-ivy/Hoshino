---
tags: [memory, frontend, api, fetch, client]
aliases: [Frontend API, api.ts]
updated: 2026-10-15
---

# 🌐 Frontend API Client (`src/services/api.ts`)

> [!NOTE]
> This file acts as the HTTP client between the browser frontend and the Hoshino Backend Server (`http://localhost:3040`).

---

## 📋 Function Reference

### 1. `API_BASE_URL: string`
- Automatically resolves browser protocol (`http:` / `https:`) and hostname on port `3040`. Fallback to `http://localhost:3040`.

### 2. `fetchAgents(): Promise<Agent[]>`
- Retrieves all agents from `GET /api/agents`.
- Throws error if `res.ok === false` or `json.success === false`.

### 3. `createAgent(name: string, phoneNumber?: string): Promise<Agent>`
- Sends `POST /api/agents` request to spawn a new agent session. Returns initial session data (including QR code or pairing code).

### 4. `reconnectAgent(agentId: string, phoneNumber?: string): Promise<void>`
- Sends `POST /api/agents/${agentId}/reconnect` to restart the WhatsApp socket connection.

### 5. `deleteAgent(agentId: string): Promise<void>`
- Sends `DELETE /api/agents/${agentId}` to permanently delete the agent and cascade delete all associated database records.
