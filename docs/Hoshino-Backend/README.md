---
tags: [moc, backend, internal-memory]
aliases: [Backend Architecture Hub]
updated: 2026-10-31
---

# ⚙️ Hoshino Backend - Internal Memory MOC

> [!NOTE]
> The Hoshino Backend is built using the **Bun runtime** and **Elysia.js**, interfacing with WhatsApp multi-instance sockets via **Baileys** and **PostgreSQL** for isolated multi-tenant session storage.

---

## 🏛️ Core Architectural Principles

> [!IMPORTANT]
> **Single-Responsibility Command Architecture (`src/commands/<category>/<command>.ts`)**:
> - **1 Purpose = 1 Command File**: Every distinct user-facing command MUST live in its own dedicated `.ts` file (e.g., `gacha.ts`, `daily.ts`, `spark.ts`, `mystudent.ts`, `eleph.ts`, `upgrade.ts`, `inventory.ts`, `squad.ts`, `raid.ts`, `weeklyboss.ts`).
> - **Synonyms Only in `name: string[]`**: Triggers inside a single `ICommand` must strictly be synonyms of the **same** action (`["gacha", "pull"]`, `["squad", "party"]`). Never bundle unrelated commands into one file that branches on `ctx.commandName`.
> - **Shared Domain Helpers**: Common domain helpers (such as `resolveCanonicalSensei`, `findOwnedStudentByQuery`, `resolveSenseiSquad`, or `getRaidBosses`) are exported as named functions and imported cleanly across sibling command modules.

---

## 🗂️ Module & File Reference Map

### 1. Core & Entrypoint
- [[Hoshino-Backend/index|src/index.ts]]: Server bootstrap, port listening, database schema initialization, and agent autostart.

### 2. Baileys Engine (`src/modules/baileys/`)
- [[Hoshino-Backend/modules/baileys/socket|src/modules/baileys/socket.ts]]: Singleton `SocketManager` managing the complete lifecycle of multi-tenant WhatsApp sockets.
- [[Hoshino-Backend/modules/baileys/auth|src/modules/baileys/auth.ts]]: Multi-tenant PostgreSQL session storage adapter (`usePostgresAuthState`).
- [[Hoshino-Backend/modules/baileys/handlers|src/modules/baileys/handlers/]]: Modular handlers for `connection.update`, `messages.upsert`, and `group-participants.update`.
- [[Hoshino-Backend/modules/baileys/utils|src/modules/baileys/utils/]]: Outgoing content parser (`messageParser.ts`) & group subject helper (`groupHelper.ts`).

### 3. Business Services (`src/services/`)
- [[Hoshino-Backend/services/commandLoader|src/services/commandLoader.ts]]: Dynamic loader and 3-layer execution pipeline (Shields: anti-spam, timeout, deduplication).
- [[Hoshino-Backend/services/contextBuilder|src/services/contextBuilder.ts]]: High-performance `CommandContext` builder with **Lazy Resolvers** for expensive DB/RPC operations.
- [[Hoshino-Backend/services/wsManager|src/services/wsManager.ts]]: Real-time WebSocket connection manager & multi-agent event broadcaster.
- [[Hoshino-Backend/services/databaseMaintenance|src/services/databaseMaintenance.ts]]: Automated background maintenance scheduler (6-hour loop) for message pruning and storage reclamation.

### 4. Database Repositories (`src/repositories/`)
- [[Hoshino-Backend/repositories/agent.repository|src/repositories/agent.repository.ts]]: Database migration, agent statuses, and behavior settings.
- [[Hoshino-Backend/repositories/command.repository|src/repositories/command.repository.ts]]: Per-agent settings: owners, blacklist, autodelete, command toggles, prefix.
- [[Hoshino-Backend/repositories/message.repository|src/repositories/message.repository.ts]]: Chat storage & message history, unread tracking, unique contacts.
- [[Hoshino-Backend/repositories/database.repository|src/repositories/database.repository.ts]]: PostgreSQL storage health, table sizing, message pruning, media bloat purging, and VACUUM FULL.
- [[Hoshino-Backend/repositories/gacha_momo.repository|src/repositories/gacha.repository.ts & momo.repository.ts]]: Sensei profile, Blue Archive student inventory, and MomoTalk logs.

### 5. API Routes (`src/routes/`)
- [[Hoshino-Backend/routes/agents|src/routes/agents.ts]]: REST Endpoints `/api/agents` for session CRUD & isolated agent settings.
- [[Hoshino-Backend/routes/messages|src/routes/messages.ts]]: Endpoints `/api/agents/:id/messages` & WebSocket `/api/agents/:id/ws`.
- [[Hoshino-Backend/routes/database|src/routes/database.ts]]: Endpoints `/api/database/stats`, `/settings`, `/clean`, `/vacuum` for storage health & retention management.

### 6. Commands & Utilities
- [[Hoshino-Backend/commands/commands|src/commands/]]: Complete catalog of bot commands (Blue Archive, Downloader, Group Admin, Owner, Utility).
- [[Hoshino-Backend/utils/utils|src/utils/]]: Database client (`db.ts`), auto stack-trace logger (`logger.ts`), downloader scrapers, and sticker builder.
