import { db } from './connection'
import { redis } from './redis'
import type { AuthenticationCreds, AuthenticationState, SignalKeyStore } from 'baileys'

export type { AuthenticationCreds, AuthenticationState, SignalKeyStore }

const CREDS_CACHE_KEY = (phone: string) => `whatsapp:creds:${phone}`
const SIGNAL_KEYS_CACHE_KEY = (phone: string) => `whatsapp:keys:${phone}`
const CACHE_TTL = 24 * 60 * 60 // 24 hours

export async function initDatabase() {
  const query = `
    CREATE TABLE IF NOT EXISTS whatsapp_creds (
      id SERIAL PRIMARY KEY,
      phone_number VARCHAR(20) UNIQUE NOT NULL,
      creds JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS signal_keys (
      id SERIAL PRIMARY KEY,
      phone_number VARCHAR(20) NOT NULL,
      key_type VARCHAR(50) NOT NULL,
      key_id VARCHAR(100) NOT NULL,
      key_data BYTEA NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(phone_number, key_type, key_id),
      FOREIGN KEY (phone_number) REFERENCES whatsapp_creds(phone_number) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_signal_keys_phone ON signal_keys(phone_number, key_type);
  `

  try {
    for (const stmt of query.split(';').filter((s) => s.trim())) {
      await db.query(stmt)
    }
    console.log('Database schema initialized')
  } catch (error) {
    console.error('Database initialization error:', error)
  }
}

export async function usePostgresAuthState(
  phoneNumber: string,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  let creds: AuthenticationCreds | null = null
  const credsKey = CREDS_CACHE_KEY(phoneNumber)

  // 1. Try to load from Redis cache first (fastest)
  try {
    const cachedCreds = await redis.get<AuthenticationCreds>(credsKey)
    if (cachedCreds) {
      console.log(`✓ Credentials loaded from Redis cache for ${phoneNumber}`)
      creds = cachedCreds
    }
  } catch (error) {
    console.warn('Redis cache miss, checking PostgreSQL:', error)
  }

  // 2. If not in Redis, try PostgreSQL
  if (!creds) {
    try {
      const result = await db.query('SELECT creds FROM whatsapp_creds WHERE phone_number = $1', [
        phoneNumber,
      ])
      if (result.rows.length > 0) {
        creds = result.rows[0].creds as AuthenticationCreds
        console.log(`✓ Credentials loaded from PostgreSQL for ${phoneNumber}`)

        // Cache in Redis for future use
        try {
          await redis.set(credsKey, creds, CACHE_TTL)
        } catch (redisError) {
          console.warn('Failed to cache credentials in Redis:', redisError)
        }
      }
    } catch (error) {
      console.error('Error loading credentials from PostgreSQL:', error)
    }
  }

  // 3. If still no credentials, return empty state (Baileys will generate new ones)
  if (!creds) {
    console.log(`⚙️ Creating new credentials for ${phoneNumber}`)
    creds = {
      noiseKey: undefined,
      pairingEphemeralKeyPair: undefined,
      advSecretKey: '',
      firstUnuploadedPreKeyId: 1,
      nextPreKeyId: 1,
      processedHistoryMessages: [],
      accountSyncCounter: 0,
      accountSettings: {},
      registered: false,
      pairingCode: undefined,
      lastPropHash: undefined,
      routingInfo: undefined,
    } as any
  }

  const signalKeyStore: SignalKeyStore = {
    async get(type, ids) {
      const data: { [id: string]: any } = {}
      const keysKey = SIGNAL_KEYS_CACHE_KEY(phoneNumber)

      // Try Redis cache first
      try {
        const cachedKeys = await redis.get<{ [id: string]: any }>(keysKey)
        if (cachedKeys) {
          console.log(`✓ Signal keys loaded from Redis cache (${type})`)
          return cachedKeys
        }
      } catch (error) {
        console.warn('Redis signal keys cache miss:', error)
      }

      // Load from PostgreSQL
      try {
        const result = await db.query(
          `SELECT key_id, key_data FROM signal_keys
           WHERE phone_number = $1 AND key_type = $2 AND key_id = ANY($3)`,
          [phoneNumber, type, ids],
        )

        for (const row of result.rows) {
          data[row.key_id] = Buffer.from(row.key_data, 'binary')
        }

        // Cache in Redis
        if (Object.keys(data).length > 0) {
          try {
            await redis.set(keysKey, data, CACHE_TTL)
          } catch (redisError) {
            console.warn('Failed to cache signal keys in Redis:', redisError)
          }
        }
      } catch (error) {
        console.error('Error getting signal keys:', error)
      }

      return data
    },

    async set(data) {
      const keysKey = SIGNAL_KEYS_CACHE_KEY(phoneNumber)

      try {
        // Save to PostgreSQL
        for (const [keyId, keyData] of Object.entries(data)) {
          const keyBuffer = Buffer.isBuffer(keyData)
            ? keyData
            : Buffer.from(JSON.stringify(keyData))

          await db.query(
            `INSERT INTO signal_keys (phone_number, key_type, key_id, key_data)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (phone_number, key_type, key_id)
             DO UPDATE SET key_data = $4`,
            [phoneNumber, 'session', keyId, keyBuffer],
          )
        }

        // Invalidate Redis cache (will be re-populated on next get)
        try {
          await redis.del(keysKey)
        } catch (redisError) {
          console.warn('Failed to invalidate Redis cache:', redisError)
        }
      } catch (error) {
        console.error('Error setting signal keys:', error)
      }
    },

    async clear() {
      const keysKey = SIGNAL_KEYS_CACHE_KEY(phoneNumber)

      try {
        // Clear from PostgreSQL
        await db.query('DELETE FROM signal_keys WHERE phone_number = $1', [phoneNumber])

        // Clear from Redis cache
        try {
          await redis.del(keysKey)
        } catch (redisError) {
          console.warn('Failed to clear Redis cache:', redisError)
        }

        console.log(`✓ Signal keys cleared for ${phoneNumber}`)
      } catch (error) {
        console.error('Error clearing signal keys:', error)
      }
    },
  }

  return {
    state: {
      creds: creds as AuthenticationCreds,
      keys: signalKeyStore,
    },
    saveCreds: async () => {
      try {
        // Save to PostgreSQL
        await db.query(
          `INSERT INTO whatsapp_creds (phone_number, creds)
           VALUES ($1, $2)
           ON CONFLICT (phone_number)
           DO UPDATE SET creds = $2, updated_at = CURRENT_TIMESTAMP`,
          [phoneNumber, JSON.stringify(creds)],
        )

        // Update Redis cache
        try {
          await redis.set(credsKey, creds, CACHE_TTL)
        } catch (redisError) {
          console.warn('Failed to update Redis cache:', redisError)
        }

        console.log(`✓ Credentials saved for ${phoneNumber}`)
      } catch (error) {
        console.error('Error saving credentials:', error)
      }
    },
  }
}
