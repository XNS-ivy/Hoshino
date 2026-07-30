# Features

Hoshino-Backend provides a rich set of features designed to make managing WhatsApp Agents robust, scalable, and developer-friendly.

## 1. Multi-Agent & Dynamic Cross-Connection Management
You can spin up and manage multiple WhatsApp numbers simultaneously in the same Node/Bun process.
- **Register via QR Code**: Standard authentication by scanning a QR code with the WhatsApp app.
- **Register via Pairing Code**: Authentication using a phone number and an 8-character pairing code (ideal for devices without cameras).
- **Dynamic Cross-Connecting (QR ↔ Pairing Code)**: Switch connection methods seamlessly for any agent at any time:
  - **QR ➔ Pairing Code**: Specify a phone number via UI prompt or REST API. The backend updates the database, purges existing session auth, and generates a pairing code.
  - **Pairing Code ➔ QR**: Reconnect via QR mode. The backend explicitly resets the agent's phone number to `null` in the database, clears credentials, and emits a live QR code.
- **Graceful Restart & Logout**: Cleanly destroy socket instances, clear authentication caches, and log out devices without process restarts.

## 2. Interactive Web Dashboard
Served out-of-the-box on the root route (`/`), a vanilla HTML/JS dashboard connects to the backend API and WebSockets to provide:
- **System Metrics**: Total active agents, running count, uptime, memory consumption.
- **Live WebSocket Feeds**: Instant updates on connection status, live QR code display, and pairing code reveals.
- **Always-Available Controls**: `Reconnect (Pairing Code)`, `Reconnect (QR Scan)`, `Restart`, `Disconnect WS`, `Logout`, and `Delete` are permanently accessible on every agent card.

## 3. Comprehensive REST API
Everything available on the dashboard is powered by an ElysiaJS REST API:
- `POST /agent/register` - Create new agents (via QR or phone number).
- `POST /agent/reregister` - Switch connection modes (QR or Pairing Code) and reconnect existing agents.
- `POST /agent/:userId/send-message` - Send text messages to target JIDs or phone numbers.
- `POST /agent/:userId/presence` - Update typing/recording/online status.
- `GET /agent/:userId/profile` - Fetch display name, JID, LID, and profile picture.
- `GET /agent/:userId/groups/fetch` - Retrieve metadata of all participating WhatsApp groups.

## 4. Fine-Grained Permissions
- **Owner Roles (`owner` vs `master`)**: Designate specific WhatsApp users (using LID) as owners or masters. Masters have absolute authority and cannot be deleted by standard owners.
- **Group Allowlisting**: Control which WhatsApp groups the agent is permitted to operate in via `databases/groups.json`.
- **Command Management**: Individually enable or disable commands for each agent.

## 5. Configuration & State Persistence
- **Agent Config**: Configurable command prefixes (e.g., `/`, `!`), auto-delete schedules, and command blacklists.
- **File-Based Storage**: All stores (`AgentStore`, `GroupDatabase`, `OwnerDatabase`) use local JSON files. No external RDBMS is required.
