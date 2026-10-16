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

### 6. `fetchDatabaseStats(): Promise<DatabaseStats>`
- Fetches database disk usage, active connection count, and table-level statistics from `GET /api/database/stats`.

### 7. `fetchDatabaseSettings(): Promise<DatabaseSettings>`
- Retrieves auto-maintenance and message retention settings from `GET /api/database/settings`.

### 8. `updateDatabaseSettings(settings: Partial<DatabaseSettings>): Promise<DatabaseSettings>`
- Updates maintenance schedule and retention policies via `PUT /api/database/settings`.

### 9. `cleanDatabaseMessages(options): Promise<DatabaseCleanResult>`
- Dispatches manual message pruning task to `POST /api/database/clean` with retention and media purge options.

### 10. `runDatabaseVacuum(table?: string): Promise<DatabaseVacuumResult>`
- Dispatches manual `VACUUM` / `VACUUM FULL` optimization task to `POST /api/database/vacuum`.
