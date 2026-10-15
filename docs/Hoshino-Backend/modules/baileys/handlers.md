---
tags: [memory, backend, handlers, baileys, events]
aliases: [Baileys Handlers, connection.handler, group.handler, message.handler]
updated: 2026-10-15
---

# 📡 Baileys Event Handlers (`src/modules/baileys/handlers/`)

> [!NOTE]
> This folder separates raw Baileys event dispatching logic into modular, isolated, and maintainable handler units.

---

## 1. Connection Handler (`connection.handler.ts`)

Handles WhatsApp socket lifecycle changes (`connection.update`), QR code generation, and 8-digit pairing code requests.

### Methods & Functions:

#### `requestPairingCode(sock, safeAgentId, agentName, agentPhoneNumber, sessionInfo, isStopping): Promise<void>`
- **Description**: Generates an 8-digit pairing code (e.g. `1234-5678`) for a provided phone number during initialization without QR scanning.
- **Logic**:
  - Sanitizes the phone number to digits.
  - Calls `sock.requestPairingCode(cleanPhone)`.
  - Sets `sessionInfo.pairingCode` & `pairing_code` status.
  - Updates PostgreSQL via `[[Hoshino-Backend/repositories/agent.repository#upsertagentstatus|agentRepository.upsertAgentStatus()]]`.
  - Broadcasts `{ type: "pairing_code", payload: { pairingCode } }` via `wsManager`.

#### `handleConnectionUpdate(update, ctx): Promise<void>`
- **Description**: Main router for `connection.update` events.
- **Logic**:
  - On QR string received: calls `handleQrUpdate()` (updates `qr_code` status, broadcasts to UI).
  - On `connection === "open"`: calls `handleConnectionOpen()` (updates status to `connected`, resets retry count, persists bot JID from `sock.user`).
  - On `connection === "close"`: calls `handleConnectionClose()`.

#### `handleConnectionClose(lastDisconnect, ctx): Promise<void>`
- **Description**: Manages disconnections, evaluating reconnect backoff vs logged-out session cleanup.
- **Logic**:
  - If manually stopped (`isStopping` is active): skips reconnection.
  - Evaluates Boom error status code (`DisconnectReason`):
    - `loggedOut` (401): Purges credentials in PostgreSQL via `clearSession()` and sets status to `disconnected`.
    - Other errors (network glitches, stream resets): Schedules reconnect with exponential backoff (up to 10 attempts).

---

## 2. Group Handler (`group.handler.ts`)

Handles WhatsApp group events, including group metadata updates and participant join/leave announcements.

### Methods & Functions:

#### `handleGroupsUpdate(groups, sock, groupCache): Promise<void>`
- **Description**: Refreshes the in-memory group metadata cache (`groupCache`) upon changes to group subject, description, or settings.

#### `handleGroupParticipantsUpdate(update, ctx): Promise<void>`
- **Description**: Handles `group-participants.update` when members join (`action: 'add'`) or leave/get removed (`action: 'remove'`).
- **Logic**:
  - Immediately calls `refreshGroupCache()` to keep metadata up to date.
  - Queries group settings via `[[Hoshino-Backend/repositories/command.repository#getgroupsettings|commandRepository.getGroupSettings()]]`.
  - If `action === 'add'` and `groupSettings.welcomeEnabled`: invokes `sendWelcomeMessage()`.
  - If `action === 'remove'` and `groupSettings.goodbyeEnabled`: invokes `sendGoodbyeMessage()`.

---

## 3. Message Handler (`message.handler.ts`)

Gateway for all incoming WhatsApp messages (`messages.upsert`).

### Methods & Functions:

#### `handleMessagesUpsert(upsert, ctx): Promise<void>`
- **Description**: Iterates through each incoming `WAMessage`, persists records to PostgreSQL, and feeds them into the command pipeline.
- **Workflow**:
  1. Validates message ID and payload existence.
  2. Caches raw message in `messageStore.set(`${jid}:${id}`, msg.message)`.
  3. Parses payload via `parseIncomingMessage()` and extracts quoted message context.
  4. Auto-downloads media previews for stickers & images as Base64 data-URLs via `autoDownloadMediaPreview()`.
  5. Persists to PostgreSQL via `[[Hoshino-Backend/repositories/message.repository#savemessage|messageRepository.saveMessage()]]`.
  6. Broadcasts to Web Console via `wsManager.broadcast({ type: "message_new", ... })`.
  7. Passes message to `[[Hoshino-Backend/services/commandLoader#executemessage|commandLoader.executeMessage()]]` for command dispatch.
