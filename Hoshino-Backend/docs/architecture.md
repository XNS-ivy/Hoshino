# System Architecture

Hoshino-Backend is a multi-agent WhatsApp backend built on top of [Baileys](https://github.com/WhiskeySockets/Baileys), utilizing the [Bun](https://bun.sh/) runtime and [ElysiaJS](https://elysiajs.com/) for building high-performance REST APIs and WebSocket endpoints. 

This architecture allows the system to manage multiple WhatsApp agents (numbers/accounts) simultaneously from a single instance, each with its own connection, storage, and event handlers.

## Core Components

### 1. BaileysManager (`src/modules/baileys/socket.ts`)
The `BaileysManager` acts as the central coordinator for all WhatsApp socket connections. It maintains:
- `runningSockets`: A Map of active Baileys `WASocket` instances keyed by `userId`.
- `agentModes`: Tracks whether an agent is in QR mode (`qr`) or Pairing Code mode (`pairing-code`).
- `qrStore` & `pairingStore`: Temporary stores for authentication codes before the agent is connected.
- `wsClients`: Connected WebSocket clients for pushing realtime frontend updates.

The manager is responsible for spawning sockets with cleanly scoped authentication states, attaching event handlers, and exposing a safe lifecycle API (start, stop, logout, remove).

### 2. Elysia Web Server & API (`src/server.ts`, `src/routes/`)
The web server runs on port `3031` (by default) using ElysiaJS.
- **`agent-routes.ts`**: Provides REST endpoints for agent management (`/register`, `/reregister`, `/logout`, `/delete`), messaging (`/send-message`), presence updates (`/presence`), configuration, and fetching WhatsApp Groups and Profiles.
- **`ws-routes.ts`**: Provides a WebSocket endpoint (`/ws/agent/:userId`) that allows the frontend to receive real-time updates for QR code changes, Pairing codes, and connection state (`connected`/`disconnected`).
- **Dashboard (`index.html`)**: Served at the root `/` endpoint, providing a vanilla HTML/JS GUI to visualize and control agent states, with permanently accessible Reconnect controls for cross-mode switching.

### 3. File-Based Databases (`src/modules/databases-handler/`)
Hoshino uses lightweight, file-based JSON databases to manage configurations without needing an external RDBMS.
- **`AgentStore`** (`store/agents.json`): Manages the list of registered agents, their connection modes, phone numbers, status (`active` vs `loggedOut`), prefix strings, and enabled/disabled commands.
- **`GroupDatabase`** (`databases/groups.json`): Manages an allowlist of WhatsApp group JIDs permitted per agent.
- **`OwnerDatabase`** (`databases/owner.json`): Manages bot owners, mapping LIDs (WhatsApp Linked Device IDs) to authorization roles (`owner`, `master`) per agent.

### 4. Modular Event Handlers (`src/modules/baileys/handlers/`)
To prevent the main socket class from ballooning in size, Baileys events are delegated to specific handler functions:
- `connection-handler.ts`: Listens to `connection.update`, manages QR/Pairing dispatches, reconnects upon failure, and orchestrates clean logout cleanups.
- `message-handler.ts`: Intercepts incoming messages, executes dynamic commands, logs messages, and checks prefixes.
- `group-handler.ts`: Watches for group participant updates and metadata changes.
- `pairing-handler.ts`: Specifically handles the delay and fetching mechanism for the Pairing Code API.

## Data Flow
1. **Registration**: An admin uses the `/agent/register` REST endpoint to register an agent via QR or phone number.
2. **Socket Boot**: `AgentLifecycle` triggers `BaileysManager` to spin up a new `WASocket`.
3. **Authentication**: `connection.update` yields a QR or pairing code, which is pushed to the frontend via WebSocket. Admin authenticates via the WhatsApp App.
4. **Cross-Connection Mode Switch**: Admin uses `/agent/reregister` or UI buttons to switch between QR and Pairing Code mode. The server updates `phoneNumber` in `store/agents.json`, purges old auth credentials, re-initializes socket mode, and emits the new authentication challenge.
5. **Operation**: Once connected, Baileys fires events which are caught by the handlers. The agent status becomes `connected`, and APIs like `/send-message` become fully available.
