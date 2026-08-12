# Command Processing & Group Registration Feature Specification

## Overview

Hoshino features a **two-layer permission and isolation system** designed for high responsiveness:

1. **Bot Sending Command Permission (`bot_enabled`)**:
   Controls whether an agent instance is allowed to process commands or respond in a group/chat.
2. **Group Command Registration (`needAdminRegisterThisCommand`)**:
   Controls whether specific heavy or sensitive commands (e.g. NSFW, AI Image, Downloader) require explicit Group Admin activation/registration before being usable in that group.

---

## Command Processing Pipeline

```mermaid
flowchart TD
    subgraph EventStream [Incoming Message Event]
        MSG[Event: messages.upsert]
    end

    subgraph Layer1 [Layer 1: Agent & Chat Status Checks]
        MSG --> CHK_BOT{Bot Enabled in Chat?}
        CHK_BOT -- No --> DROP[Drop / Do Nothing]
        CHK_BOT -- Yes --> CHK_BLACK{User in Blacklist?}
        
        CHK_BLACK -- Yes --> DROP
        CHK_BLACK -- No --> CHK_DEL{User in Auto-Delete?}
        
        CHK_DEL -- Yes --> ACT_DEL[Auto Delete Message] --> DROP
        CHK_DEL -- No --> CHK_PFX{Hit Custom Prefix?}
    end

    subgraph Layer2 [Layer 2: Command Matching & Global Toggle]
        CHK_PFX -- No --> SAVE_MSG[Save Chat History & Exit]
        CHK_PFX -- Yes --> CHK_CMD{Hit Registered Command?}
        
        CHK_CMD -- No --> DROP
        CHK_CMD -- Yes --> CHK_GLOBAL{Command Enabled Globally on Agent?}
        CHK_GLOBAL -- Disabled --> DROP
    end

    subgraph Layer3 [Layer 3: Group Registration & Access Validation]
        CHK_GLOBAL -- Enabled --> CHK_NEED_REG{needAdminRegisterThisCommand == true?}
        
        CHK_NEED_REG -- Yes & In Group --> CHK_GRP_REG{Registered by Group Admin?}
        CHK_GRP_REG -- Not Registered --> DROP
        
        CHK_NEED_REG -- No (Default Command) --> CHK_ACCESS{Passes ICommand Access Rules?}
        CHK_GRP_REG -- Registered --> CHK_ACCESS
        
        CHK_ACCESS -- Failed (e.g. Not Owner/Admin) --> DROP
        CHK_ACCESS -- Passed --> EXEC[Construct Lazy CommandContext & Execute]
    end
```

---

## Group Command Registration & Management Flow

```mermaid
flowchart TD
    subgraph AdminAction [Group Admin Management]
        CMD_REG["!enablecmd <command_name> / !disablecmd <command_name>"]
    end

    subgraph Validation [Permission Check]
        CMD_REG --> CHK_GRP{Is Group Chat?}
        CHK_GRP -- No --> ERR1[Reply: Can only be used in groups]
        CHK_GRP -- Yes --> CHK_ADM{Is Sender Group Admin or Bot Owner?}
        CHK_ADM -- No --> ERR2[Reply: Requires Group Admin permission]
    end

    subgraph Storage [Database Update]
        CHK_ADM -- Yes --> CHK_EXISTS{Command Exists in System?}
        CHK_EXISTS -- No --> ERR3[Reply: Command not found]
        CHK_EXISTS -- Yes --> DB_TOGGLE["Upsert public.agent_group_commands (agent_id, jid, command_name, status)"]
        DB_TOGGLE --> RESP[Reply: Command <command_name> is now enabled/disabled in this group]
    end
```

---

## Database Storage Specification

### 1. `public.agent_owners`
Stores owner JIDs/LIDs per agent instance.
```sql
CREATE TABLE IF NOT EXISTS public.agent_owners (
    agent_id VARCHAR(255) NOT NULL,
    user_jid VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'owner', -- 'master' | 'owner'
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (agent_id, user_jid)
);
```

### 2. `public.agent_blacklists`
Stores blacklisted user JIDs/LIDs per agent instance.
```sql
CREATE TABLE IF NOT EXISTS public.agent_blacklists (
    agent_id VARCHAR(255) NOT NULL,
    user_jid VARCHAR(255) NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (agent_id, user_jid)
);
```

### 3. `public.agent_autodeletes`
Stores target user JIDs/LIDs whose messages in groups are auto-deleted per agent instance.
```sql
CREATE TABLE IF NOT EXISTS public.agent_autodeletes (
    agent_id VARCHAR(255) NOT NULL,
    user_jid VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (agent_id, user_jid)
);
```

### 4. `public.agent_group_settings`
Stores group-level settings per agent instance.
```sql
CREATE TABLE IF NOT EXISTS public.agent_group_settings (
    agent_id VARCHAR(255) NOT NULL,
    jid VARCHAR(255) NOT NULL,
    bot_enabled BOOLEAN DEFAULT true,
    welcome_enabled BOOLEAN DEFAULT false,
    goodbye_enabled BOOLEAN DEFAULT false,
    custom_prefix VARCHAR(10),
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (agent_id, jid)
);
```

### 5. `public.agent_command_toggles`
Stores global command enable/disable matrix per agent instance.
```sql
CREATE TABLE IF NOT EXISTS public.agent_command_toggles (
    agent_id VARCHAR(255) NOT NULL,
    command_name VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'enabled', -- 'enabled' | 'disabled'
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (agent_id, command_name)
);
```

### 6. `public.agent_group_commands`
Stores group-level command registration matrix per agent instance.
```sql
CREATE TABLE IF NOT EXISTS public.agent_group_commands (
    agent_id VARCHAR(255) NOT NULL,
    jid VARCHAR(255) NOT NULL,
    command_name VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'enabled', -- 'enabled' | 'disabled'
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (agent_id, jid, command_name)
);
```
