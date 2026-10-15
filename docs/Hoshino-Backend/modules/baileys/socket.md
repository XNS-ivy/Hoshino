---
tags: [memory, backend, socket, baileys]
aliases: [SocketManager, socket.ts, Baileys Manager]
updated: 2026-10-15
---

# 🔌 Baileys Socket Engine (`src/modules/baileys/socket.ts`)

> [!NOTE]
> This file is the core multi-tenant WhatsApp communication engine in Hoshino. It manages `WASocket` instances, connection lifecycles, pairing code/QR sessions, message caching, and Baileys event dispatching.

---

## 📋 File Overview & Exports

- **Workspace Path**: `Hoshino-Backend/src/modules/baileys/socket.ts`
- **Main Class**: `SocketManager` (Singleton)
- **Additional Exports**:
  - `groupCache`: `NodeCache` in-memory group metadata cache (stdTTL: 5 minutes).
  - `messageStore`: `Map<string, WAMessage>` in-memory raw Baileys messages (key: `${remoteJid}:${id}`).
  - `socketManager`: Singleton instance of `SocketManager`.

---

## 🏗️ `SocketManager` Internal State

| Member Variable | Type | Description |
| :--- | :--- | :--- |
| `sessions` | `Map<string, WASocket>` | Stores active Baileys sockets keyed by `safeAgentId` |
| `sessionStates` | `Map<string, AgentSession>` | In-memory session state (status, pairingCode, qrCode, phoneNumber) |
| `isStopping` | `Set<string>` | Flags agents stopped manually to prevent unwanted automatic reconnects |
| `reconnectAttempts` | `Map<string, number>` | Per-agent retry counter for exponential backoff |
| `cachedVersion` | `[number, number, number] \| null` | Cached Baileys Web version to avoid redundant external fetches |

---

## 🛠️ Complete Method Reference

### 1. `getInstance(): SocketManager`
- **Signature**: `public static getInstance(): SocketManager`
- **Description**: Returns the singleton instance of `SocketManager`.

### 2. `initDatabase(): Promise<void>`
- **Signature**: `public async initDatabase(): Promise<void>`
- **Description**: Ensures database migration is run via `[[Hoshino-Backend/repositories/agent.repository|agentRepository.initDatabase()]]` and initializes `[[Hoshino-Backend/services/commandLoader|commandLoader.init()]]`.

### 3. `sanitizeAgentId(agentId: string): string`
- **Signature**: `public sanitizeAgentId(agentId: string): string`
- **Description**: Replaces non-alphanumeric characters (`[^a-zA-Z0-9_-]`) with underscores to prevent key and path conflicts.

### 4. `startSock(agentName: string, agentPhoneNumber?: string): Promise<{ sock: WASocket; session: AgentSession }>`
- **Signature**: `async startSock(agentName: string, agentPhoneNumber?: string): Promise<{ sock: WASocket; session: AgentSession }>`
- **Workflow**:
  1. Sanitizes the agent name using `sanitizeAgentId()`.
  2. Checks if an active socket already exists in `this.sessions`. If so, returns the existing socket to prevent duplicates.
  3. Loads credentials from PostgreSQL via `[[Hoshino-Backend/modules/baileys/auth|usePostgresAuthState(safeAgentId)]]`.
  4. Spawns `WASocket` via `makeWASocket(...)` with:
     - `auth.creds` & `auth.keys` integrated with cacheable signal keystore.
     - `Browser`: Chrome on Ubuntu.
     - Custom DNS host fallback for connection stability.
     - `getMessage` pulling cached messages from `messageStore`.
  5. Initiates pairing code flow if `agentPhoneNumber` is provided and credentials are unregistered (`sock.authState.creds.registered == false`).
  6. Attaches `sock.ev.process` listeners:
     - `creds.update`: Saves credentials to PostgreSQL via `saveCreds()`.
     - `connection.update`: Forwarded to `[[Hoshino-Backend/modules/baileys/handlers#connection-handler|handleConnectionUpdate]]`.
     - `messages.upsert`: Forwarded to `[[Hoshino-Backend/modules/baileys/handlers#message-handler|handleMessagesUpsert]]`.
     - `groups.update`: Forwarded to `handleGroupsUpdate`.
     - `group-participants.update`: Forwarded to `handleGroupParticipantsUpdate`.
  7. Updates agent status to `connecting` in PostgreSQL and broadcasts status via WebSocket (`wsManager.broadcast`).

### 5. `sendMessage(agentName: string, recipientJid: string, content: AnyMessageContent, options?: MiscMessageGenerationOptions): Promise<WAMessage>`
- **Signature**: `async sendMessage(agentName: string, recipientJid: string, content: AnyMessageContent, options?: MiscMessageGenerationOptions): Promise<WAMessage>`
- **Workflow**:
  1. Verifies that the agent socket is connected; throws error if disconnected.
  2. Normalizes `recipientJid` to a valid WhatsApp JID format.
  3. Sends message via `sock.sendMessage(...)`.
  4. Parses outgoing content via `parseOutgoingContent(content)`.
  5. Saves message record to PostgreSQL via `[[Hoshino-Backend/repositories/message.repository#savemessage|messageRepository.saveMessage()]]`.
  6. Broadcasts `message_new` event to web console subscribers.
  7. Returns the sent raw `WAMessage`.

### 6. `getSock(agentName: string): WASocket | undefined`
- **Signature**: `getSock(agentName: string): WASocket | undefined`
- **Description**: Returns the active `WASocket` instance for the given agent.

### 7. `getAgentSession(agentName: string): AgentSession | undefined`
- **Signature**: `getAgentSession(agentName: string): AgentSession | undefined`
- **Description**: Retrieves in-memory session metadata for the given agent.

### 8. `getAllAgentSessions(): AgentSession[]`
- **Signature**: `getAllAgentSessions(): AgentSession[]`
- **Description**: Returns all in-memory active agent sessions as an array.

### 9. `stopSock(agentName: string): Promise<void>`
- **Signature**: `async stopSock(agentName: string): Promise<void>`
- **Workflow**:
  1. Adds agent ID to `isStopping` to suppress reconnection attempts.
  2. Deletes reconnect timers in `reconnectAttempts`.
  3. Invokes `sock.end(undefined)` and deletes from `this.sessions`.
  4. Sets session status to `disconnected`.
  5. Updates PostgreSQL and broadcasts `disconnected` status via WebSocket.

### 10. `reconnectAgent(agentName: string, phoneNumber?: string): Promise<{ sock: WASocket; session: AgentSession }>`
- **Signature**: `async reconnectAgent(agentName: string, phoneNumber?: string): Promise<{ sock: WASocket; session: AgentSession }>`
- **Description**: Calls `stopSock(agentName)`, waits 500ms, and calls `startSock(agentName, phoneNumber)`.

### 11. `bootAllAgents(): Promise<void>`
- **Signature**: `async bootAllAgents(): Promise<void>`
- **Workflow**:
  1. Queries all records from `public.agents` via `agentRepository.findAllAgents()`.
  2. Filters agents with status `connected` or `connecting`.
  3. Boots each socket session asynchronously on server startup.

### 12. `deleteAgent(agentName: string): Promise<void>`
- **Signature**: `async deleteAgent(agentName: string): Promise<void>`
- **Workflow**:
  1. Shuts down active socket via `stopSock(agentName)`.
  2. Purges authentication credentials and keys from `auth.credentials` & `auth.keys` via `clearSession()`.
  3. Purges agent record and cascade relations via `agentRepository.deleteAgentRecord(agentName)`.
  4. Removes session state from memory.

### 13. `downloadMessageMedia(agentName: string, msgId: string): Promise<{ buffer: Buffer; mimetype: string } | null>`
- **Signature**: `async downloadMessageMedia(agentName: string, msgId: string): Promise<{ buffer: Buffer; mimetype: string } | null>`
- **Description**: Fetches raw `WAMessage` from `messageStore`, decrypts media stream via Baileys `downloadMediaMessage`, and returns the binary buffer with its mimetype.

### 14. `getProfilePictureUrl(agentName: string, jid: string): Promise<string | null>`
- **Signature**: `async getProfilePictureUrl(agentName: string, jid: string): Promise<string | null>`
- **Description**: Fetches WhatsApp profile/group avatar URL via Baileys RPC `sock.profilePictureUrl(jid, "preview")`.
