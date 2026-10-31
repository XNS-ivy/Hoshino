---
tags: [memory, backend, services, context, lazy-resolvers]
aliases: [ContextBuilder, contextBuilder.ts, CommandContext]
updated: 2026-10-24
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
  - `extractSenderIdentities(sock, rawMsg): { senderJid: string; directSender: string; senderIdentities: string[] }`
  - `resolveUserIdentities(sock, initialJids, groupMeta?, includeUSyncPnLookup?): Promise<string[]>`
  - `findGroupParticipants(participants, targetIdentities): GroupParticipant[]`
  - `findGroupParticipant(participants, targetIdentities): GroupParticipant | undefined`
  - `getParticipantIdentities(p): string[]`
  - `isParticipantAdmin(p): boolean`
  - `syncGroupLidMappings(sock, meta): void`
  - `setCachedGroupMetadata(jid, meta, sock?): void`
  - `invalidateCachedGroupMetadata(jid): void`

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
- Enriches `senderIdentities` from local `authState.keys` and cached/live `GroupMetadata` participants, then checks ownership in `public.agent_owners` across all `senderIdentities` (`@lid` and `@s.whatsapp.net`), falling back to Baileys Signal `lidMapping` resolution (`getPNForLID` / `getLIDForPN`) and auto-persisting mapped identities.

### 2. `getGroupMetadata(): Promise<GroupMetadata | null>`
- Fetches group metadata (members, admins, subject) backed by `groupMetadataCache` (5-minute TTL, synchronized with `groupHelper.ts`) and persists participant/owner LID<->PN pairs via `syncGroupLidMappings()`.

### 3. `getSenderAdminStatus(): Promise<{ isAdmin: boolean; isBotAdmin: boolean }>`
- Evaluates sender admin status and bot admin status in the group chat by resolving all sender identities (`key.participant`, `key.participantAlt`, `authState.keys`, and `lidMapping`) and all bot identities (`sock.user.id`, `sock.user.lid`, `sock.authState.creds.me.id`, `sock.authState.creds.me.lid`) against all participant fields (`p.id`, `p.lid`, `p.phoneNumber`). If sender or bot could NOT be found in participants (e.g. unlinked LID), it resolves admin identities via `lidMapping.getLIDsForPNs()` / `getPNForLID()`. Relies on reactive cache invalidation from `groupHelper.ts` (`invalidateCachedGroupMetadata` on participant updates) to ensure 0ms cached evaluations without redundant live network round-trips.

### 4. `getQuotedMessage(): Promise<ParsedQuotedMessage | null>`
- Extracts quoted message details (text, sender JID, stanzaId, and `getMediaBuffer()` for quoted media) from unwrapped `rawContent` and `m`. Checks both `participantAlt` and `participant`, prevents `@g.us` group JID fallback when `isGroup` is true, and resolves `@lid` quoted participants to `@s.whatsapp.net` via `resolveUserIdentities`.

### 5. `getMediaBuffer(): Promise<Buffer | null>`
- Decrypts and downloads the message's binary media buffer on demand via `downloadMediaMessage()`.

### 6. `getGroupInviteCode(): Promise<string | null>`
- Fetches group invite link code via socket RPC `sock.groupInviteCode(jid)`.

### 7. `getProfilePicUrl(targetJid?): Promise<string | null>`
- Fetches high-resolution avatar URL via `sock.profilePictureUrl()`.

### 8. `getMentions(): Promise<string[]>`
- Returns an array of normalized user JIDs mentioned in the message (extracted across all `contextInfo` message layers in `rawContent`/`m`, plus fallback inline `@\d{6,16}` mentions from `body` matched against `GroupMetadata` participants so `@lid` vs `@s.whatsapp.net` domains are preserved, excluding `@g.us`).

### 9. `getBusinessProfile(targetJid?): Promise<unknown | null>`
- Retrieves WhatsApp Business profile details.

### 10. `getNewsletterMetadata(channelJid): Promise<unknown | null>`
- Fetches WhatsApp Channel / Newsletter metadata.
