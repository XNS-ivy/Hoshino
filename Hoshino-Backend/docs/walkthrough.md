# Hoshino Backend - Walkthrough

This walkthrough explains the end-to-end flow of how an agent is registered, authenticated, reconnected/cross-connected between modes, and becomes active within the Hoshino ecosystem.

## 1. Boot Sequence
When you start the server via `bun run dev`:
1. `src/index.ts` is executed.
2. `server.ts` spins up the ElysiaJS server on port `3031`.
3. `agentLifecycle.bootAll()` is called. It fetches all saved agents from `store/agents.json`.
4. For any agent whose status is `active`, `BaileysManager.startAgent()` is invoked to boot up the WhatsApp Socket. 
5. If the agent's authentication (`auth/` directory) is valid, the agent connects seamlessly.

## 2. Registering a New Agent
1. An admin opens the dashboard at `http://localhost:3031/`.
2. Under **Register Agent**, they enter a unique `User ID` (e.g., `agent-1`) and optionally a `Phone Number`.
3. The dashboard makes a `POST /agent/register` request.
4. `AgentLifecycle.register` saves the new agent to the JSON store and tells `BaileysManager` to start it.
5. If a phone number was provided, the agent mode is set to `pairing-code`. Otherwise, it defaults to `qr`.

## 3. Reconnecting & Cross-Connecting Modes (QR ↔ Pairing Code)
Agents can switch connection modes on-the-fly (e.g., from QR Mode to Pairing Code Mode, or vice versa) without restarting the entire server or deleting the agent:
1. **Unconditional Dashboard Controls**: The `Reconnect (Pairing Code)` and `Reconnect (QR Scan)` buttons are always visible on every agent card regardless of the current connection status.
2. **Switching to Pairing Code Mode**:
   - Admin clicks `Reconnect (Pairing Code)`.
   - A browser prompt asks for the target phone number.
   - The frontend issues a `POST /agent/reregister` with `{ userId, method: "pairing-code", phoneNumber: "628xxx" }`.
   - `agent-routes.ts` forces `phoneNumber` in `store/agents.json` to the specified number.
   - `BaileysManager` destroys the old socket, cleans the authentication directory (`./auth/:userId`), updates `agentModes` to `pairing-code`, and fetches an 8-character pairing code pushed via WebSocket.
3. **Switching to QR Scan Mode**:
   - Admin clicks `Reconnect (QR Scan)`.
   - The frontend issues a `POST /agent/reregister` with `{ userId, method: "qr", phoneNumber: null }`.
   - `agent-routes.ts` explicitly resets `phoneNumber` to `null` in `store/agents.json`.
   - `BaileysManager` destroys the old socket, clears authentication cache, sets `agentModes` to `qr`, and generates a fresh base64 QR code pushed via WebSocket.

## 4. The Authentication & Connection Lifecycle
- **WebSocket Feed**: The frontend maintains a WebSocket connection to `ws://localhost:3031/ws/agent/:userId`.
- **QR Dispatch**: `connection-handler.ts` intercepts incoming QR codes from Baileys. If the agent mode is `pairing-code`, QR dispatches are cleanly ignored. If `qr`, it encodes the string to base64 and emits it to the frontend.
- **Pairing Code Dispatch**: `pairing-handler.ts` waits for socket setup, requests the code from WhatsApp using `sock.requestPairingCode()`, and emits it to the frontend.
- **Connected State**: Once authenticated via WhatsApp:
  1. `connection.update` fires with state `open`.
  2. `handleOpenConnection` clears temporary QR/Pairing stores.
  3. The agent's phone number is parsed from `sock.user.id` and saved in `store/agents.json`.
  4. The frontend receives a `connected` WebSocket event, hides authentication elements, and updates the status badge to `connected`.

## 5. Daily Operations & Disconnections
- **Sending Messages**: `POST /agent/:userId/send-message` triggers `sock.sendMessage()`.
- **Handling Messages**: Incoming messages trigger `messages.upsert`. `message-handler.ts` checks prefixes, filters group allowlists (`GroupDatabase`), and checks owner permissions (`OwnerDatabase`).
- **Disconnections & Auto-Reconnect**: If the connection drops unexpectedly, `handleCloseConnection` intercepts the disconnect event. If it was not an explicit `loggedOut`, it waits 3 seconds and automatically reconnects using the saved agent mode and phone number.
