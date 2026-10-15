---
tags: [memory, backend, repositories, settings, permissions]
aliases: [CommandRepository, command.repository.ts]
updated: 2026-10-15
---

# 🛡️ Command & Security Repository (`src/repositories/command.repository.ts`)

> [!NOTE]
> This file manages isolated per-agent configuration records in PostgreSQL: Owners (`agent_owners`), Blacklist (`agent_blacklists`), Auto-Delete (`agent_autodeletes`), Group Settings (`agent_group_settings`), Global Command Toggles (`agent_command_toggles`), and Group Command Registration (`agent_group_commands`).

---

## 📋 Class Overview: `CommandRepository` (Singleton)

- **Workspace Path**: `Hoshino-Backend/src/repositories/command.repository.ts`
- **Global Instance**: `commandRepository = CommandRepository.getInstance()`

---

## 🛠️ Complete Method Reference

### 1. `normalizeJid(jid: string): string`
- Strips device IDs and port suffixes from WhatsApp JIDs (e.g., `628123:1@s.whatsapp.net` ➔ `628123@s.whatsapp.net`).

### 2. Owners (`public.agent_owners`)
- `isOwner(agentId, userJid): Promise<boolean>`: Checks if sender JID has owner or master role.
- `getOwners(agentId): Promise<OwnerRecord[]>`: Retrieves all owners for an agent.
- `addOwner(agentId, userJid, role = "owner"): Promise<void>`: Adds or updates an owner role.
- `removeOwner(agentId, userJid): Promise<void>`: Revokes owner privileges.

### 3. Blacklist (`public.agent_blacklists`)
- `isBlacklisted(agentId, userJid): Promise<boolean>`: Checks if user is blocked from bot interactions.
- `getBlacklist(agentId): Promise<BlacklistRecord[]>`: Retrieves blacklist entries.
- `addBlacklist(agentId, userJid, reason?): Promise<void>`: Adds a user to the blacklist.
- `removeBlacklist(agentId, userJid): Promise<void>`: Removes user from blacklist.

### 4. Auto-Delete Targets (`public.agent_autodeletes`)
- `isAutoDelete(agentId, userJid): Promise<boolean>`: Checks if messages from user should be automatically deleted in group chats.
- `getAutoDeleteList(agentId): Promise<AutoDeleteRecord[]>`: Retrieves all auto-delete targets.
- `addAutoDelete(agentId, userJid): Promise<void>`: Adds a user to the auto-delete target list.
- `removeAutoDelete(agentId, userJid): Promise<void>`: Removes a user from the auto-delete target list.

### 5. Group Settings (`public.agent_group_settings`)
- `getGroupSettings(agentId, groupJid): Promise<GroupSettings>`: Retrieves `botEnabled`, `welcomeEnabled`, `goodbyeEnabled`, and `customPrefix` for a group.
- `getAllGroupSettings(agentId): Promise<GroupSettings[]>`: Retrieves settings for all known group chats.
- `updateGroupSettings(agentId, groupJid, settings): Promise<GroupSettings>`: Upserts group settings.

### 6. Command Toggles Matrix
- `isCommandEnabledGlobally(agentId, commandName): Promise<boolean>`: Checks global enabled status for a command (default: true).
- `setGlobalCommandStatus(agentId, commandName, status)`: Sets global command toggle per agent.
- `isCommandEnabledInGroup(agentId, groupJid, commandName): Promise<boolean>`: Checks if admin-registered command is enabled in a specific group.
- `setGroupCommandStatus(agentId, groupJid, commandName, status)`: Registers or unregisters a command in a specific group.
