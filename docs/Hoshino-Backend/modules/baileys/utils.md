---
tags: [memory, backend, utils, baileys, parsing]
aliases: [Baileys Utils, messageParser, groupHelper]
updated: 2026-10-15
---

# 🛠️ Baileys Internal Utilities (`src/modules/baileys/utils/`)

> [!NOTE]
> Contains pure utility functions for parsing raw Baileys data structures, normalizing WhatsApp message types, extracting quotes, and reading cached group metadata.

---

## 1. Group Helper (`groupHelper.ts`)

### Methods & Functions:

#### `getOrFetchGroupMetadata(sock, jid, groupCache): Promise<GroupMetadata | undefined>`
- **Description**: Retrieves group metadata (name, description, participants) from the in-memory cache `groupCache`. If not cached, fetches from socket RPC `sock.groupMetadata(jid)` and stores in cache.

#### `resolveGroupSubject(jid, sock, groupCache): Promise<string | undefined>`
- **Description**: Returns the group subject for a given group JID. Returns `undefined` if target is not a group JID (`@g.us`).

#### `refreshGroupCache(sock, groupId, groupCache): Promise<GroupMetadata | undefined>`
- **Description**: Force-refreshes cached metadata for a given group JID over the network.

---

## 2. Message Parser (`messageParser.ts`)

### Methods & Functions:

#### `parseIncomingMessage(message: proto.IMessage): { messageType: MessageType, contentData: Record<string, unknown> }`
- **Description**: Maps raw Baileys `proto.IMessage` to the unified `MessageType` enum:
  - `conversation` / `extendedTextMessage` ➔ `"text"`
  - `imageMessage` ➔ `"image"`
  - `videoMessage` ➔ `"video"`
  - `audioMessage` ➔ `"audio"`
  - `documentMessage` ➔ `"document"`
  - `locationMessage` ➔ `"location"`
  - `stickerMessage` ➔ `"sticker"`
  - `contactMessage` ➔ `"contact"`
  - `reactionMessage` ➔ `"reaction"`

#### `extractQuotedContext(message: proto.IMessage): Record<string, unknown> | undefined`
- **Description**: Extracts text, participant JID, and stanzaId from replied/quoted messages (`contextInfo.quotedMessage`).

#### `parseOutgoingContent(content: AnyMessageContent): { messageType: MessageType, contentData: Record<string, unknown> }`
- **Description**: Normalizes outgoing message payloads in `sendMessage()` before database logging.
