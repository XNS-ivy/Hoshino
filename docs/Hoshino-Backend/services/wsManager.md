---
tags: [memory, backend, services, websocket, realtime]
aliases: [WebSocketManager, wsManager.ts, Realtime Events]
updated: 2026-10-15
---

# 🌐 Real-Time WebSocket Manager (`src/services/wsManager.ts`)

> [!NOTE]
> This file manages real-time WebSocket client connections and event broadcasting from backend agents to the frontend dashboard.

---

## 📋 Class Overview: `WebSocketManager` (Singleton)

- **Workspace Path**: `Hoshino-Backend/src/services/wsManager.ts`
- **Global Instance**: `wsManager = WebSocketManager.getInstance()`
- **Event Types**: `WSEvent`
  - `"message_new"`: Inbound or outbound message persisted.
  - `"status_change"`: Agent connection state change (`connecting`, `connected`, `disconnected`).
  - `"qr_code"`: Updated raw QR string for WhatsApp Web authentication.
  - `"pairing_code"`: Updated 8-digit pairing code for phone-number authentication.

---

## 🛠️ Methods & Implementation Details

### 1. `subscribe(agentId: string, ws: { send: (msg: string) => void }): void`
- Subscribes a client WebSocket connection to events for a specific `agentId`.

### 2. `unsubscribe(agentId: string, ws: { send: (msg: string) => void }): void`
- Removes a subscriber upon client disconnection or view unmount. Purges empty agent subscriber sets.

### 3. `broadcast(event: WSEvent): void`
- Serializes event payload as JSON and pushes to all active WebSocket subscribers of `event.agentId`. Individual client write errors are caught safely.
