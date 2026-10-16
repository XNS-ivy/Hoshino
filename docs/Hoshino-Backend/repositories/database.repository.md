---
tags: [memory, backend, repository, database, storage, vacuum, maintenance]
aliases: [DatabaseRepository, Database Repository]
updated: 2026-10-16
---

# 🗄️ Database Repository (`src/repositories/database.repository.ts`)

> [!NOTE]
> Centralized manager for PostgreSQL storage health monitoring, table size breakdowns, automated message retention pruning, base64 media bloat purging, and physical disk space reclamation via `VACUUM FULL`.

---

## 1. Architectural Role & Responsibilities
- **Storage Metrics**: Inspects PostgreSQL database and table sizes (`pg_total_relation_size`, `pg_relation_size`, `pg_database_size`).
- **Retention Policy Management**: Stores and updates automated pruning rules in `public.database_settings`.
- **Message Pruning**: Cleans messages older than `retentionDays` and trims per-chat history past `maxMessagesPerChat`.
- **Media Bloat Purging**: Strips heavy base64 sticker/image payloads (`content - 'mediaData'`) while preserving full chat text and metadata.
- **Physical Disk Reclamation**: Invokes `VACUUM FULL` and `REINDEX` on PostgreSQL tables to release dead tuples back to the host operating system.

---

## 2. Exported Interfaces & Types

```typescript
export interface DatabaseSettings {
  id: string
  autoPruneEnabled: boolean
  retentionDays: number
  maxMessagesPerChat: number
  cleanMediaBloat: boolean
  lastPrunedAt: string | null
  updatedAt: string
}

export interface TableStat {
  tableSchema: string
  tableName: string
  totalSize: string
  tableSize: string
  indexSize: string
  rowCount: number
  rawSize: number
}

export interface DatabaseStats {
  databaseName: string
  totalSize: string
  totalSizeBytes: number
  messagesCount: number
  chatsCount: number
  authKeysCount: number
  mediaBloatCount: number
  tables: TableStat[]
  settings: DatabaseSettings
}

export interface PruneOptions {
  retentionDays?: number
  maxMessagesPerChat?: number
  purgeMediaOnly?: boolean
}

export interface PruneResult {
  deletedMessages: number
  strippedMedia: number
  remainingMessages: number
  durationMs: number
}
```

---

## 3. Method List & Execution Logic

### `getSettings(): Promise<DatabaseSettings>`
- Automatically ensures `public.database_settings` table exists via `ensureTable()`.
- Fetches active retention settings (defaults to 7-day retention, 500 max messages per chat, automated pruning enabled).

### `updateSettings(partial: Partial<DatabaseSettings>): Promise<DatabaseSettings>`
- Updates retention rules, minimum retention floor, and per-chat history bounds.

### `getDatabaseStats(): Promise<DatabaseStats>`
- Queries PostgreSQL catalogs:
  - Database disk footprint via `pg_database_size(current_database())`.
  - Relation sizes across schemas `public` and `auth` via `pg_total_relation_size`.
  - Row counts for `public.messages`, `public.chats`, `auth.keys`.
  - Detects messages with legacy `content.mediaData` payloads.

### `pruneMessages(options?: PruneOptions): Promise<PruneResult>`
- Strips `mediaData` blobs from `public.messages` if `cleanMediaBloat` is enabled.
- Deletes messages older than `retentionDays` (`timestamp < NOW() - INTERVAL 'X days'`).
- Enforces per-chat message caps using a window CTE (`ROW_NUMBER() OVER (PARTITION BY agent_id, jid ORDER BY timestamp DESC)`).
- Updates `last_pruned_at` timestamp.

### `runVacuum(tableName?: string): Promise<{ success: boolean; durationMs: number; message: string }>`
- Runs `VACUUM FULL <table name>` to reclaim physical disk allocation.
- Runs `REINDEX TABLE <table name>` to rebuild fragmented B-Tree indexes.
