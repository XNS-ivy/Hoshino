# Hoshino Backend Setup Guide

## Prerequisites
- Docker & Docker Compose
- Bun runtime
- Node.js (for type checking)

## Quick Start

### Option 1: Full Docker (Recommended)
Run everything in containers:
```bash
docker-compose up -d
```

This will automatically:
- Start **PostgreSQL** (port 5432)
- Start **Redis** (port 6379)
- Build and start **Hoshino-Backend** (port 3000)
- Initialize database schema
- Wait for databases to be healthy before starting

View logs:
```bash
docker-compose logs -f hoshino-backend
```

### Option 2: Local Development
Run databases in Docker, backend locally:

```bash
# Start only databases
docker-compose up -d postgres redis

# Install dependencies
cd Hoshino-Backend
bun install

# Setup env
cp .env.example .env
```

Edit `.env` with your configuration:
```env
PHONE_NUMBER=your_phone_number
DB_USER=hoshino
DB_PASSWORD=hoshino_pass_dev
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hoshino_auth
REDIS_HOST=localhost
REDIS_PORT=6379
```

Run the application:
```bash
bun run index.ts
```

## Architecture

### Authentication System
The project uses a PostgreSQL-backed authentication state manager similar to Baileys' `useMultiFileAuthState`, but with the following improvements:

- **Credentials Storage**: Stores WhatsApp credentials securely in PostgreSQL
- **Signal Keys**: Manages encryption keys in a dedicated table
- **Automatic Sync**: Credentials are automatically saved on connection updates

### Database Schema
```sql
whatsapp_creds
├── id (PRIMARY KEY)
├── phone_number (UNIQUE)
├── creds (JSONB)
├── created_at
└── updated_at

signal_keys
├── id (PRIMARY KEY)
├── phone_number (FK)
├── key_type (pre-key, session, etc.)
├── key_id
├── key_data (BYTEA)
└── created_at
```

### Key Files
- `modules/database/connection.ts` - PostgreSQL connection pool
- `modules/database/auth-state.ts` - Authentication state management
- `modules/baileys/main.ts` - WhatsApp bot main logic

## Development Commands

### View Database
```bash
docker exec -it hoshino-postgres psql -U hoshino -d hoshino_auth
```

### View Redis
```bash
docker exec -it hoshino-redis redis-cli
```

### Stop Containers
```bash
docker-compose down
```

### Clean Everything
```bash
docker-compose down -v
```

## Features

✅ PostgreSQL-backed credential storage
✅ Signal key management
✅ Automatic credential persistence
✅ Redis integration ready
✅ Docker Compose with all services
✅ Service health checks & auto-restart
✅ Type-safe authentication

## Next Steps

1. Implement message handlers in `modules/baileys/main.ts`
2. Add Redis caching for performance
3. Implement command system
4. Add error logging and monitoring
5. Deploy to production (update DB credentials)

