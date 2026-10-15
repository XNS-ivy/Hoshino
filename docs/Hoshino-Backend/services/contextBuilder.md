---
tags: [memory, backend, services, context, lazy-resolvers]
aliases: [ContextBuilder, contextBuilder.ts, CommandContext]
updated: 2026-10-15
---

# 🧩 High-Performance Context Builder (`src/services/contextBuilder.ts`)

> [!NOTE]
> This file constructs the `CommandContext` object passed into every `command.execute(args, ctx)`. It utilizes a **Lazy Resolvers** architecture with internal single-flight memoization to ensure zero-latency initial context construction.

---

## 📋 File Overview

- **Workspace Path**: `Hoshino-Backend/src/services/contextBuilder.ts`
- **Core Functions**:
  - `buildCommandContext(agentId, sock, rawMsg, prefix, commandName, args): CommandContext`
  - `detectMessageType(m: unknown): MessageKind`

---

## ⚡ Zero-Cost vs Lazy Fields

| Zero-Cost Property (0ms Memory) | Data Type | Description |
| :--- | :--- | :--- |
| `agentId` | `string` | ID of the agent executing the command |
| `sock` | `WASocket` | Active Baileys socket instance |
| `rawMsg` | `WAMessage` | Raw WhatsApp message payload from Baileys |
| `jid` | `string` | Target remote chat JID |
| `senderJid` | `string` | Normalized sender JID |
| `pushName` | `string \| undefined` | Push name of sender |
| `isGroup` | `boolean` | `true` if remote JID ends with `@g.us` |
| `body` | `string` | Clean message text (unwrapped from viewonce/ephemeral) |
| `prefix` | `string` | Matched prefix trigger (e.g., `.`, `!`) |
| `commandName` | `string` | Matched command keyword (lowercase) |
| `args` | `string[]` | Array of arguments following the command keyword |
| `messageType` | `MessageKind` | `"text" \| "image" \| "video" \| "audio" \| "document" \| "sticker" \| "other"` |
| `reply(content)` | `(content: string \| AnyMessageContent) => Promise<WAMessage>` | Fast shortcut to reply with automatic quoted message |

---

## 🔍 Lazy Resolvers (Invoked ONLY On-Demand)

Each resolver contains single-flight memoization per message instance to avoid redundant database or network queries:

### 1. `getOwnerRole(): Promise<"master" | "owner" | null>`
- Checks ownership in `public.agent_owners` via `commandRepository.isOwner()`.

### 2. `getGroupMetadata(): Promise<GroupMetadata | null>`
- Fetches group metadata (members, admins, subject) backed by `groupMetadataCache` (5-minute TTL).

### 3. `getSenderAdminStatus(): Promise<{ isAdmin: boolean; isBotAdmin: boolean }>`
- Evaluates sender admin status and bot admin status in the group chat.

### 4. `getQuotedMessage(): Promise<ParsedQuotedMessage | null>`
- Extracts quoted message details (text, sender JID, stanzaId, and `getMediaBuffer()` for quoted media).

### 5. `getMediaBuffer(): Promise<Buffer | null>`
- Decrypts and downloads the message's binary media buffer on demand via `downloadMediaMessage()`.

### 6. `getGroupInviteCode(): Promise<string | null>`
- Fetches group invite link code via socket RPC `sock.groupInviteCode(jid)`.

### 7. `getProfilePicUrl(targetJid?): Promise<string | null>`
- Fetches high-resolution avatar URL via `sock.profilePictureUrl()`.

### 8. `getMentions(): Promise<string[]>`
- Returns an array of normalized JIDs mentioned in the message.

### 9. `getBusinessProfile(targetJid?): Promise<unknown | null>`
- Retrieves WhatsApp Business profile details.

### 10. `getNewsletterMetadata(channelJid): Promise<unknown | null>`
- Fetches WhatsApp Channel / Newsletter metadata.
