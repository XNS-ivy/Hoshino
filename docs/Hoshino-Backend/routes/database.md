---
tags: [memory, backend, routes, elysia, database, storage]
aliases: [Database Routes, /api/database/]
updated: 2026-10-16
---

# 🛣️ Database Routes (`src/routes/database.ts`)

> [!NOTE]
> REST API endpoints under `/api/database` providing storage metrics, retention configurations, on-demand pruning, and VACUUM disk space reclamation.

---

## 1. Endpoints Specification

| Method | Endpoint | Description | Request Body | Response |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/database/stats` | Fetches total DB disk size, table breakdown, row counts, log storage size, and active settings | None | `{ success: true, data: DatabaseStats }` |
| `GET` | `/api/database/settings` | Fetches current message & log retention policy | None | `{ success: true, data: DatabaseSettings }` |
| `PUT` | `/api/database/settings` | Updates automated message & log retention settings | `{ autoPruneEnabled?, retentionDays?, maxMessagesPerChat?, cleanMediaBloat?, autoCleanLogsEnabled?, logRetentionDays? }` | `{ success: true, data: DatabaseSettings }` |
| `GET` | `/api/database/logs` | Returns aggregated file log storage metrics and active files list | None | `{ success: true, data: LogStats }` |
| `POST` | `/api/database/logs/flush` | Prunes expired log files or flushes all historical logs | `{ retentionDays?: number, flushAll?: boolean }` | `{ success: true, data: FlushLogsResult, message: string }` |
| `POST` | `/api/database/clean` | Triggers manual message pruning or media bloat purge | `{ retentionDays?, maxMessagesPerChat?, purgeMediaOnly? }` | `{ success: true, data: PruneResult }` |
| `POST` | `/api/database/vacuum` | Runs `VACUUM FULL` to physically shrink table files on disk | `{ table?: string }` | `{ success: true, data: { success, durationMs, message } }` |

---

## 2. Dependencies & Subsystems
- `[[Hoshino-Backend/repositories/database.repository|DatabaseRepository]]`: Performs SQL queries, window CTE deletions, schema migrations, and `VACUUM` executions.
- `[[Hoshino-Backend/utils/utils#2. Global Logger|Logger]]`: Provides `getLogStats()` and `flushLogs()` for system daily log files.

