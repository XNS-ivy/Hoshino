---
tags: [memory, backend, auth, baileys, postgresql]
aliases: [PostgresAuth, auth.ts, usePostgresAuthState]
updated: 2026-10-15
---

# 🔐 Baileys Authentication & State (`src/modules/baileys/auth.ts`)

> [!NOTE]
> This file provides a **PostgreSQL-backed** authentication adapter (`PostgresAuth`) with in-memory write-back buffering and `NodeCache` caching. It also provides a fallback file-system implementation (`ImprovedAuth`).

---

## 📋 Overview & Exports

- **Workspace Path**: `Hoshino-Backend/src/modules/baileys/auth.ts`
- **Main Helper**: `usePostgresAuthState(agentId: string)`
- **Core Classes**:
  - `PostgresAuth`: PostgreSQL auth state driver (`auth.credentials` & `auth.keys`).
  - `ImprovedAuth`: Local folder-based auth driver (legacy/fallback).

---

## 🛠️ Class Detail: `PostgresAuth`

### Properties & Internal State
- `agentId: string`: Unique agent identifier owning this session.
- `creds: AuthenticationCreds`: Active Baileys credentials (key pairs, identity, registration ID, etc.).
- `cache: NodeCache`: In-memory cache for signal keys (stdTTL: 1800s / 30 minutes).
- `pendingWrites: Map<string, unknown | null>`: Batch write buffer preventing SQL query spam.
- `writeTimer: NodeJS.Timeout | null`: 50ms debounce timer for batch flushing.

### Methods & Logic

#### 1. `static async init(agentId: string): Promise<PostgresAuth>`
- **Description**: Factory method reading `auth.credentials` from PostgreSQL.
- **Logic**:
  - If existing record found, revives JSON using `BufferJSON.reviver`.
  - If no record exists, invokes Baileys `initAuthCreds()` to generate new keys and immediately saves to DB.

#### 2. `saveCreds = async (): Promise<void>`
- **Description**: Serializes `this.creds` using `BufferJSON.replacer` and executes an `UPSERT` on `auth.credentials`:
  ```sql
  INSERT INTO auth.credentials (agent_id, creds, updated_at)
  VALUES (${this.agentId}, ${jsonStr}::jsonb, CURRENT_TIMESTAMP)
  ON CONFLICT (agent_id) DO UPDATE SET creds = EXCLUDED.creds, updated_at = CURRENT_TIMESTAMP;
  ```

#### 3. `keys.get(type, ids)`
- **Signature**: `get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => Promise<Record<string, SignalDataTypeMap[T]>>`
- **Logic**:
  - Checks in-memory cache first.
  - Queries missing keys from PostgreSQL via `key_id = ANY(${pgArrayStr}::text[])`.
  - Parses values with `BufferJSON.reviver` and stores back into memory cache.

#### 4. `keys.set(data: SignalDataSet)`
- **Signature**: `set: async (data: SignalDataSet) => Promise<void>`
- **Logic**:
  - Updates in-memory cache immediately.
  - Enqueues values (or `null` for deletions) into `pendingWrites`.
  - Calls `scheduleFlushKeys()` to flush batch to DB after 50ms debounce.

#### 5. `flushKeysToDb(): Promise<void>`
- **Description**: Flushes pending key writes into `auth.keys` using `ON CONFLICT (agent_id, key_id) DO UPDATE`.

#### 6. `clearSession(): Promise<void>`
- **Description**: Deletes all credentials and keys for this `agentId` from `auth.credentials` and `auth.keys`, and flushes in-memory cache.

---

## 🚀 Helper Function: `usePostgresAuthState`

```typescript
export async function usePostgresAuthState(agentId: string): Promise<{
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
    clearSession: () => Promise<void>;
    authInstance: PostgresAuth;
}>
```

Used directly by `[[Hoshino-Backend/modules/baileys/socket|SocketManager.startSock()]]` to bind Baileys socket state to PostgreSQL.
