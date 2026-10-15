---
tags: [memory, backend, routes, messaging, websocket, rest]
aliases: [MessageRoutes, messages.ts, Messaging API]
updated: 2026-10-15
---

# 💬 Messaging & Real-Time Endpoints (`src/routes/messages.ts`)

> [!NOTE]
> This file exposes Elysia routes under `/api/agents/:id` for sending WhatsApp messages (text, media, location, contact), reading chat histories, streaming decrypted media, and WebSocket event feeds.

---

## 📋 Complete Endpoint Reference

### 1. WebSocket Real-Time Stream
- `WS /api/agents/:id/ws`:
  - `open(ws)`: Registers client WebSocket to `[[Hoshino-Backend/services/wsManager#subscribe|wsManager.subscribe(id, ws)]]`.
  - `close(ws)`: Detaches client via `wsManager.unsubscribe(id, ws)`.
  - Streams events: `message_new`, `status_change`, `qr_code`, `pairing_code`.

### 2. Message Dispatch (`POST /api/agents/:id/messages`)
- **Supported Message Payloads**:
  - `text`: Plain text (`{ recipient, type: "text", text }`).
  - `image`: Image with optional caption (`{ recipient, type: "image", mediaUrl, text }`).
  - `video`: Video with optional caption (`{ recipient, type: "video", mediaUrl, text }`).
  - `document`: File attachment (`{ recipient, type: "document", mediaUrl, fileName, mimetype, text }`).
  - `location`: Map coordinates (`{ recipient, type: "location", location: { degreesLatitude, degreesLongitude, name?, address? } }`).
  - `contact`: vCard contact card (`{ recipient, type: "contact", contact: { displayName, phoneNumber, vcard? } }`).
- **Reply / Quote Support**: When `quotedMsgId` is passed, loads the original message from `messageRepository.getMessageById()` and attaches reply metadata.

### 3. Chat History & Read Receipts
- `GET /api/agents/:id/chats`: Returns all active conversation threads for this agent.
- `GET /api/agents/:id/chats/:jid/messages`: Returns paginated chat messages (`?limit=50&offset=0`) and automatically marks chat as read.
- `POST /api/agents/:id/chats/:jid/read`: Explicit mark-as-read endpoint.

### 4. Decrypted Media & Avatar Streaming
- `GET /api/agents/:id/messages/:msgId/media`: Decrypts and streams binary media directly from WhatsApp servers with appropriate `Content-Type` and `Cache-Control: public, max-age=86400`.
- `GET /api/agents/:id/avatar?jid=...`: Fetches high-resolution avatar URL for a contact or group.
