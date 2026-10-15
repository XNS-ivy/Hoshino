---
tags: [memory, backend, repositories, database, agent]
aliases: [AgentRepository, agent.repository.ts]
updated: 2026-10-15
---

# 🗄️ Agent Repository (`src/repositories/agent.repository.ts`)

> [!NOTE]
> This file manages PostgreSQL database access for agent metadata in `public.agents`, authentication schema initialization, and multi-tenant cascade data purging.

---

## 📋 Class Overview: `AgentRepository` (Singleton)

- **Workspace Path**: `Hoshino-Backend/src/repositories/agent.repository.ts`
- **Global Instance**: `agentRepository = AgentRepository.getInstance()`
- **Primary Table**: `public.agents`

---

## 🏗️ Interface Definition: `AgentDbRecord`

```typescript
export interface AgentDbRecord {
    id: string;
    name: string;
    phoneNumber: string | null;
    status: AgentStatus;
    prefix?: string;
    welcomeMessage?: string | null;
    goodbyeMessage?: string | null;
    autoRead?: boolean;
    typingIndicator?: boolean;
    createdAt: Date;
    updatedAt: Date;
}
```

---

## 🛠️ Complete Method Reference

### 1. `initDatabase(): Promise<void>`
- Ensures `[[Hoshino-Backend/utils/utils#initauthdatabase|initAuthDatabase()]]` is executed idempotently on server startup.

### 2. `upsertAgentStatus(agentId, agentName, status, phoneNumber?): Promise<void>`
- Performs an `INSERT ... ON CONFLICT (id) DO UPDATE` query on `public.agents` to update connection state (`connecting`, `connected`, `disconnected`, `qr_code`, `pairing_code`).

### 3. `updateAgent(agentId, data): Promise<AgentDbRecord | null>`
- Updates agent behavior settings:
  - `prefix`: Default command prefix (default: `.`)
  - `welcomeMessage`: Welcome message template for group joiners
  - `goodbyeMessage`: Farewell message template for group departures
  - `autoRead`: Automatically marks incoming messages as read (blue ticks)
  - `typingIndicator`: Simulates typing state prior to sending replies

### 4. `findAllAgents(): Promise<AgentDbRecord[]>`
- Retrieves all registered agents from PostgreSQL ordered by creation time (`ORDER BY created_at DESC`).

### 5. `findAgentById(agentId: string): Promise<AgentDbRecord | null>`
- Retrieves a single agent record by ID.

### 6. `deleteAgentRecord(agentIdOrName: string): Promise<void>`
- **Cascade Purge Execution**:
  Permanently purges all data belonging to this agent across 13 PostgreSQL tables:
  1. `public.chats`
  2. `public.messages`
  3. `public.agent_owners`
  4. `public.agent_blacklists`
  5. `public.agent_autodeletes`
  6. `public.agent_group_settings`
  7. `public.agent_command_toggles`
  8. `public.agent_group_commands`
  9. `public.sensei_profiles`
  10. `public.sensei_students`
  11. `public.sensei_bonds`
  12. `auth.credentials` & `auth.keys`
  13. `public.agents`
