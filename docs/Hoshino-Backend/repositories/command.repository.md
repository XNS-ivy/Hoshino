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
- `isAutoDelete(agentId, groupJid, userJid): Promise<boolean>`: Checks if messages from user should be automatically deleted in a specific group chat or global wildcard (`*`).
- `getAutoDeleteList(agentId, groupJid?): Promise<AutoDeleteRecord[]>`: Retrieves auto-delete targets for an agent, optionally filtered by group JID.
- `addAutoDelete(agentId, userJid, groupJid = "*"): Promise<void>`: Adds a user to the auto-delete target list for a specific group or globally.
- `removeAutoDelete(agentId, userJid, groupJid?): Promise<void>`: Removes a user from the auto-delete target list for a specific group or all groups.


### 5. Group Settings (`public.agent_group_settings`)
- `getGroupSettings(agentId, groupJid): Promise<GroupSettings>`: Retrieves `botEnabled`, `welcomeEnabled`, `goodbyeEnabled`, and `customPrefix` for a group.
- `getAllGroupSettings(agentId): Promise<GroupSettings[]>`: Retrieves settings for all known group chats (union of chats, settings, and group command overrides) along with `customizedCommandsCount`.
- `updateGroupSettings(agentId, groupJid, settings): Promise<GroupSettings>`: Upserts group settings.

### 6. Command Toggles Matrix & Group Policies
- `isCommandEnabledGlobally(agentId, commandName: string | string[]): Promise<boolean>`: Checks global enabled status across command primary name and all aliases (returns `false` if any alias is disabled; default: true).
- `setGlobalCommandStatus(agentId, commandName, status)`: Sets global command toggle per agent with lowercase normalization.
- `isCommandEnabledInGroup(agentId, groupJid, commandName: string | string[]): Promise<boolean>`: Checks if command or any alias is enabled inside a specific group.
- `isCommandAllowedInGroup(agentId, groupJid, commandName: string | string[], needAdminRegisterThisCommand): Promise<boolean>`: Checks if a command (or any of its aliases) is permitted in a group, preventing bypasses via alternative trigger names. Priority: 1. If any alias is disabled -> `false`. 2. If any alias is enabled -> `true`. 3. Fallback to `!needAdminRegisterThisCommand`.
- `getGroupCommands(agentId, groupJid): Promise<GroupCommandRecord[]>`: Retrieves all command overrides for a specific group.
- `setGroupCommandStatus(agentId, groupJid, commandName, status)`: Registers/enables or disables a command inside a specific group with lowercase normalization (`public.agent_group_commands`).
- `resetGroupCommandStatus(agentId, groupJid, commandName: string | string[])`: Removes command override(s) in a group for canonical name and all aliases, reverting to default policy.
- `resetAllGroupCommands(agentId, groupJid)`: Clears all command overrides for a group back to defaults.

