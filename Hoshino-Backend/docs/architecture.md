## Connecting Flow
```mermaid
flowchart TD
    subgraph Client [Frontend]
        UI[Web Console]
    end

    subgraph Backend [Hoshino Backend - Bun & Elysia]
        API[Elysia API Routes]
        SM[SocketManager]
        A1[WASocket Agent 1]
        A2[WASocket Agent 2]
        AN[WASocket Agent N]
    end

    subgraph Storage [Database]
        DB[(PostgreSQL - Auth Schema)]
    end

    subgraph External [WhatsApp]
        WA[WhatsApp Web Servers]
    end

    UI -- Start/Manage Agent 1..N --> API
    API --> SM
    SM <-->|Read/Write Creds & Keys| DB
    SM -- Spawn Instance --> A1
    SM -- Spawn Instance --> A2
    SM -- Spawn Instance --> AN

    A1 <-->|WebSocket| WA
    A2 <-->|WebSocket| WA
    AN <-->|WebSocket| WA
```

## Agent Authentication Flow (Pairing Code vs QR Code)
```mermaid
flowchart TD
    subgraph Backend [Hoshino Backend Server]
        START["startSock(agentId, phoneNumber?)"]
        CHECK_REG{"Is Already Registered?"}
        CHECK_PHONE{"Phone Number Provided?"}
        REQ_PAIRING["sock.requestPairingCode(phoneNumber)"]
        EV_QR["qr string from connection.update"]
    end

    subgraph Client [Web Console - Frontend UI]
        UI_PAIRING["Display 8-Digit Pairing Code (e.g. 1234-5678)"]
        UI_QR["Render QR Code Image"]
    end

    subgraph UserMobile [User Phone - WhatsApp App]
        PHONE_PAIRING["Settings ➔ Linked Devices ➔ Link with phone number ➔ Enter Code"]
        PHONE_QR["Settings ➔ Linked Devices ➔ Link a Device ➔ Scan QR Code"]
    end

    START --> CHECK_REG
    CHECK_REG -- Yes (Session Exists) --> OPEN["Connection Open (Reusing Postgres Auth)"]
    CHECK_REG -- No (New Session) --> CHECK_PHONE

    %% Pairing Code Flow
    CHECK_PHONE -- Yes (With Phone) --> REQ_PAIRING
    REQ_PAIRING -->|HTTP API / WebSocket Response| UI_PAIRING
    UI_PAIRING -->|User reads code on screen & enters into phone| PHONE_PAIRING

    %% QR Code Flow
    CHECK_PHONE -- No (No Phone) --> EV_QR
    EV_QR -->|WebSocket Event / SSE Stream| UI_QR
    UI_QR -->|User scans screen with phone camera| PHONE_QR

    PHONE_PAIRING --> CONNECTED["Connection Open & Authenticated"]
    PHONE_QR --> CONNECTED
    CONNECTED --> SAVE["Save Creds to PostgreSQL (auth.credentials)"]
```


## Agent CRUD Flow
```mermaid
flowchart TD
    subgraph Operations [Client Request]
        CREATE[Create Agent]
        READ[Read / List Agents]
        UPDATE[Update / Reconnect]
        DELETE[Delete / Logout Agent]
    end

    subgraph API [Elysia API Handlers]
        EP_CREATE["POST /api/agents"]
        EP_READ["GET /api/agents / GET /api/agents/:id"]
        EP_UPDATE["PATCH /api/agents/:id / POST /api/agents/:id/reconnect"]
        EP_DELETE["DELETE /api/agents/:id"]
    end

    subgraph SocketService [SocketManager]
        SM_START["startSock(agentId, phoneNumber?)"]
        SM_STATUS["getSock(agentId) / Get Connection State"]
        SM_RESTART["stopSock(agentId) ➔ startSock(agentId)"]
        SM_STOP["stopSock(agentId) ➔ clearSession()"]
    end

    subgraph Database [PostgreSQL Storage]
        DB_AUTH[("auth.credentials & auth.keys")]
        DB_AGENTS[("public.agents metadata")]
    end

    %% Create Flow
    CREATE --> EP_CREATE --> SM_START
    SM_START <-->|Init / Save Creds| DB_AUTH
    SM_START -->|Save Record| DB_AGENTS
    SM_START -->|Phone Provided?| PAIRING["Return Pairing Code"]
    SM_START -->|No Phone?| QR["Return QR Code"]

    %% Read Flow
    READ --> EP_READ --> SM_STATUS
    SM_STATUS <-->|Read Info| DB_AGENTS

    %% Update Flow
    UPDATE --> EP_UPDATE --> SM_RESTART
    SM_RESTART <-->|Update State| DB_AUTH

    %% Delete Flow
    DELETE --> EP_DELETE --> SM_STOP
    SM_STOP -->|Delete Creds & Keys| DB_AUTH
    SM_STOP -->|Delete Record| DB_AGENTS
```

## Production-Ready Socket Architecture Highlights
1. **Event Batching (`ev.process`)**: Combines all WebSocket events per tick to prevent callback flooding and partial state updates.
2. **Desktop Client Emulation (`Browsers.macOS("Desktop")`)**: Registers agents as official WhatsApp Desktop clients for high connection stability and extended history sync.
3. **Exponential Backoff Reconnecting**: Retries network disconnects with delays `1s -> 2s -> 4s -> 8s -> ... -> 30s max` to prevent rate-limiting.
4. **Group & Message Caching**: Automatically updates in-memory `NodeCache` for group metadata (`groups.update`, `group-participants.update`) and message keys for message retry handling (`getMessage`).