---
tags: [memory, backend, routes, api, elysia, rest]
aliases: [AgentRoutes, agents.ts, Agent Endpoints]
updated: 2026-10-15
---

# 🚪 Agent Management REST Endpoints (`src/routes/agents.ts`)

> [!NOTE]
> This file exposes Elysia routes under `/api/agents` for managing WhatsApp bot sessions and isolated per-agent settings.

---

## 📋 Endpoint Matrix

### 1. Agent Lifecycle & Session Management
| Method | Endpoint | Description | Handler / Service |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/agents` | Starts new agent session (name & optional phone number) | `socketManager.startSock()` |
| `GET` | `/api/agents` | Lists all agents with live connection statuses | `agentRepository.findAllAgents()` |
| `GET` | `/api/agents/:id` | Fetches details for a single agent | `agentRepository.findAgentById()` |
| `POST` | `/api/agents/:id/reconnect` | Restarts WhatsApp socket connection | `socketManager.reconnectAgent()` |
| `DELETE` | `/api/agents/:id` | Permanently deletes agent and purges all DB records | `socketManager.deleteAgent()` |

### 2. Owners (`/api/agents/:id/owners`)
- `GET /`: Lists owners and administrators for this agent.
- `POST /`: Adds a new owner (`body: { userJid, role? }`).
- `DELETE /:userJid`: Revokes owner status.

### 3. Blacklist (`/api/agents/:id/blacklist`)
- `GET /`: Lists blacklisted users.
- `POST /`: Adds user to blacklist (`body: { userJid, reason? }`).
- `DELETE /:userJid`: Removes user from blacklist.

### 4. Auto-Delete Targets (`/api/agents/:id/autodelete`)
- `GET /`: Lists target users whose group messages are automatically deleted (optional `query: { groupJid? }`).
- `POST /`: Adds user to auto-delete list (`body: { userJid, groupJid? }`).
- `DELETE /:userJid`: Removes user from auto-delete list (optional `query: { groupJid? }`).

### 5. Command Toggles (`/api/agents/:id/commands`)
- `GET /`: Lists all loaded commands and their global enabled status for this agent.
- `PATCH /:commandName`: Sets command toggle state (`body: { status: 'enabled' | 'disabled' }`).

### 6. Contacts & Groups
- `GET /api/agents/:id/contacts`: Lists unique WhatsApp contacts for UI selection.
- `GET /api/agents/:id/groups`: Lists known group chats and listening configurations with `customizedCommandsCount`.
- `GET /api/agents/:id/groups/:jid`: Fetches configuration for a specific group.
- `PATCH /api/agents/:id/groups/:jid`: Updates group configuration (`botEnabled`, `welcomeEnabled`, `goodbyeEnabled`, `customPrefix`).
- `GET /api/agents/:id/groups/:jid/commands`: Lists all bot commands and effective group statuses (`status`, `isCustomized`, `globalStatus`, `needAdminRegisterThisCommand`).
- `PATCH /api/agents/:id/groups/:jid/commands/:commandName`: Sets command status for that group (`body: { status: 'enabled' | 'disabled' }`).
- `DELETE /api/agents/:id/groups/:jid/commands/:commandName`: Resets command status for that group to default policy.
- `POST /api/agents/:id/groups/:jid/commands/batch`: Batch updates or resets group commands (`body: { action: 'enable_all' | 'disable_all' | 'reset_all', category? }`).
- `GET /api/agents/:id/groups/:jid/autodelete`: Lists auto-delete targets for this specific group.
- `POST /api/agents/:id/groups/:jid/autodelete`: Adds user to auto-delete for this specific group (`body: { userJid }`).
- `DELETE /api/agents/:id/groups/:jid/autodelete/:userJid`: Removes user from auto-delete for this specific group.



### 7. Sensei & Blue Archive Management (`/api/agents/:id/sensei`)
- `GET /`: Lists all Sensei user profiles.
- `GET /:userJid`: Fetches detailed profile, student roster, bond levels, and `elephSummary` (total duplicate counts, Elephs, and exchangeable Pyroxene yields).
- `POST /:userJid/claim-eleph`: Converts duplicate student Elephs into Pyroxenes (`body: { filter?, starGrade?, studentNameOrId? }`). Resets student `count = 1` while preserving base roster ownership.
- `PATCH /:userJid/pyroxenes`: Adjusts Pyroxenes balance (`body: { amount?, setAmount? }`).
- `DELETE /:userJid`: Resets Sensei profile and student roster.

### 8. General Settings (`/api/agents/:id/settings`)
- `GET /`: Fetches `prefix`, `welcomeMessage`, `goodbyeMessage`, `autoRead`, `typingIndicator`.
- `PATCH /`: Updates general settings.
