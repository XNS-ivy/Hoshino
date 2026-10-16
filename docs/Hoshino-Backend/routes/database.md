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
| `GET` | `/api/database/stats` | Fetches total DB disk size, table breakdown, row counts, and current settings | None | `{ success: true, data: DatabaseStats }` |
| `GET` | `/api/database/settings` | Fetches current message retention policy | None | `{ success: true, data: DatabaseSettings }` |
| `PUT` | `/api/database/settings` | Updates automated pruning and retention settings | `{ autoPruneEnabled?, retentionDays?, maxMessagesPerChat?, cleanMediaBloat? }` | `{ success: true, data: DatabaseSettings }` |
| `POST` | `/api/database/clean` | Triggers manual message pruning or media bloat purge | `{ retentionDays?, maxMessagesPerChat?, purgeMediaOnly? }` | `{ success: true, data: PruneResult }` |
| `POST` | `/api/database/vacuum` | Runs `VACUUM FULL` to physically shrink table files on disk | `{ table?: string }` | `{ success: true, data: { success, durationMs, message } }` |

---

## 2. Dependencies & Subsystems
- `[[Hoshino-Backend/repositories/database.repository|DatabaseRepository]]`: Performs SQL queries, window CTE deletions, and `VACUUM` executions.
