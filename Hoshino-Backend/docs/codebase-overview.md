# Codebase Overview

This document maps out the `src` directory and key frontend templates to help developers navigate the Hoshino-Backend codebase.

## Directory Structure

```text
src/
├── index.ts                 # Main entrypoint; boots agents and starts the server
├── server.ts                # ElysiaJS server configuration and route registration
├── modules/                 # Core business logic and integrations
│   ├── axios/               # HTTP client utilities (if any)
│   ├── baileys/             # WhatsApp integration layer
│   └── databases-handler/   # Local JSON database wrappers
├── routes/                  # API endpoints definition
├── types/                   # Global TypeScript interfaces
└── utils/                   # Shared utilities (e.g., logger)
index.html                   # Interactive web dashboard (Vanilla JS/HTML)
```

## Key Files and Classes

### 1. `src/modules/baileys/socket.ts`
- **Class**: `BaileysManager`
- **Purpose**: A singleton class responsible for lifecycle management of Baileys `WASocket` instances. Maintains active sockets (`runningSockets`), active agent registration modes (`agentModes`), temporary QR/Pairing stores, and WebSocket clients (`wsClients`).

### 2. `src/modules/baileys/agent/store.ts`
- **Class**: `AgentStore`
- **Purpose**: Persists agent configurations to `store/agents.json`. Provides `updatePhone(userId, phoneNumber)` to dynamically set or reset (`null`) an agent's phone number during mode transitions.

### 3. `src/modules/baileys/agent/lifecycle.ts`
- **Class**: `AgentLifecycle`
- **Purpose**: High-level orchestrator. `reRegister(userId, phoneNumber, isFromTerminal)` cleanly removes running sockets, purges credentials directory (`./auth/:userId`), updates database records, and boots a fresh socket in the requested mode.

### 4. `src/modules/baileys/handlers/connection-handler.ts` & `pairing-handler.ts`
- **Functions**: `attachConnectionEvents`, `handlePairingCode`, `handleQrUpdate`
- **Purpose**: Listens to Baileys `connection.update` events. `handleQrUpdate` includes a guard clause `if (manager.getAgentMode(userId) === "pairing-code") return` to prevent QR dispatches when in pairing code mode. `handlePairingCode` handles requesting 8-character codes when in pairing code mode.

### 5. `src/routes/agent-routes.ts`
- **Endpoint**: `POST /agent/reregister`
- **Purpose**: Accepts `{ userId, method, phoneNumber }`. When switching to `pairing-code`, updates the phone number in `store/agents.json`. When switching to `qr`, explicitly sets `phoneNumber` to `null` in `store/agents.json`.

### 6. `index.html`
- **Frontend Dashboard**: Renders agent cards, health metrics, and live WebSocket feeds.
- **Controls**: `Reconnect (Pairing Code)` and `Reconnect (QR Scan)` buttons are permanently rendered for every agent card, triggering `handleReregister(userId, method, phone)` to handle prompt input and mode switches.
