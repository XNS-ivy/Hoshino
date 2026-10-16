---
tags: [memory, backend, services, maintenance, cron, database]
aliases: [DatabaseMaintenanceService, Database Maintenance Service]
updated: 2026-10-16
---

# ⚙️ Database Maintenance Service (`src/services/databaseMaintenance.ts`)

> [!NOTE]
> Autonomous background maintenance service that enforces message retention policies every 6 hours, preventing database bloat over long-term multi-group bot operations.

---

## 1. Architectural Scope & Lifecycle
- **Boot Sequence**: Started inside `src/index.ts` immediately after `socketManager.initDatabase()`.
- **Initial Execution**: Triggers an initial check 15 seconds after server start.
- **Interval Loop**: Executes every 6 hours (`6 * 60 * 60 * 1000` ms).
- **Graceful Concurrency Guard**: Uses `isRunning` flag to prevent overlapping pruning operations if previous run is still executing.

---

## 2. Execution Logic
1. Checks `autoPruneEnabled` in `public.database_settings`. If disabled, exits immediately.
2. Calls `databaseRepository.pruneMessages({ retentionDays, maxMessagesPerChat, purgeMediaOnly: false })`.
3. Logs system metrics when expired records or media payloads are pruned.
