---
tags: [memory, backend, repositories, messages, chats]
aliases: [MessageRepository, message.repository.ts]
updated: 2026-10-15
---

# 💬 Message & Chat Repository (`src/repositories/message.repository.ts`)

> [!NOTE]
> This file manages logging of inbound and outbound messages (`public.messages`), grouped chat threads (`public.chats`), unread counter tracking, and contact resolution.

---

## 📋 Class Overview: `MessageRepository` (Singleton)

- **Workspace Path**: `Hoshino-Backend/src/repositories/message.repository.ts`
- **Global Instance**: `messageRepository = MessageRepository.getInstance()`
- **Primary Tables**: `public.messages`, `public.chats`

---

## 🛠️ Complete Method Reference

### 1. `saveMessage(msg: MessageRecord, groupSubject?: string): Promise<void>`
- **Description**: Persists message record and automatically upserts corresponding chat record.
- **Logic**:
  - `INSERT INTO public.messages`: Stores id, agent_id, jid, from_me, sender, push_name, message_type, content (JSONB), status, timestamp.
  - `INSERT INTO public.chats`: Determines name from `groupSubject || pushName || jid`, increments `unread_count` for incoming messages (`from_me = false`), and updates `last_message_at`.

### 2. `getPushName(agentId: string, senderJid: string): Promise<string | null>`
- Looks up the latest push name recorded for a given user JID/phone number.

### 3. `getChatsByAgent(agentId: string): Promise<ChatRecord[]>`
- Retrieves all active chat threads for an agent ordered by recent activity (`ORDER BY last_message_at DESC`).

### 4. `getMessagesByChat(agentId: string, jid: string, limit = 50, offset = 0): Promise<MessageRecord[]>`
- Fetches paginated chat messages returned in chronological ascending order for UI rendering.

### 5. `markChatAsRead(agentId: string, jid: string): Promise<void>`
- Resets `unread_count = 0` for a specific chat thread.

### 6. `findContactsByAgent(agentId: string): Promise<{ jid: string, pushName: string | null, phoneNumber: string }[]>`
- Returns unique individual WhatsApp contacts (`@s.whatsapp.net`) that have messaged the bot for UI contact selector components.

### 7. `getMessageById(agentId: string, messageId: string): Promise<MessageRecord | null>`
- Fetches a single message record by ID for quoted message context and media re-downloading.
