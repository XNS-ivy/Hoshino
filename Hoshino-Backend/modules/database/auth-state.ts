import { db } from './connection'
import { redis } from './redis'
import type { AuthenticationCreds, AuthenticationState, SignalKeyStore } from 'baileys'
import { initAuthCreds } from 'baileys/lib/Utils'

export type { AuthenticationCreds, AuthenticationState, SignalKeyStore }

const CREDS_CACHE_KEY = (phone: string) => `whatsapp:creds:${phone}`
const SIGNAL_KEYS_CACHE_KEY = (phone: string, type: string) => `whatsapp:keys:${phone}:${type}`
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
      key_type VARCHAR(100) NOT NULL,
      key_id VARCHAR(100) NOT NULL,
      key_data TEXT NOT NULL,
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
    console.warn('Redis cache miss:', error)
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

  // 3. If still no credentials, generate new ones using Baileys' proper initialization
  if (!creds) {
    console.log(`⚙️ Generating new credentials for ${phoneNumber}`)
    creds = initAuthCreds()
  }

  const signalKeyStore: SignalKeyStore = {
    async get(type, ids) {
      const data: { [id: string]: any } = {}
      const keysKey = SIGNAL_KEYS_CACHE_KEY(phoneNumber, type)

      // Try Redis cache first
      try {
        const cachedKeys = await redis.get<{ [id: string]: any }>(keysKey)
        if (cachedKeys) {
          return cachedKeys
        }
      } catch (error) {
        console.warn(`Redis signal keys cache miss for ${type}:`, error)
      }

      // Load from PostgreSQL
      try {
        const result = await db.query(
          `SELECT key_id, key_data FROM signal_keys
           WHERE phone_number = $1 AND key_type = $2 AND key_id = ANY($3)`,
          [phoneNumber, type, ids],
        )

        for (const row of result.rows) {
          try {
            data[row.key_id] = JSON.parse(row.key_data)
          } catch {
            data[row.key_id] = row.key_data
          }
        }

        // Cache in Redis if we found keys
        if (Object.keys(data).length > 0) {
          try {
            await redis.set(keysKey, data, CACHE_TTL)
          } catch (redisError) {
            console.warn('Failed to cache signal keys in Redis:', redisError)
          }
        }
      } catch (error) {
        console.error(`Error getting signal keys (${type}):`, error)
      }

      return data
    },

    async set(data) {
      try {
        // data format: { [type]: { [id]: value } }
        for (const type in data) {
          const keysKey = SIGNAL_KEYS_CACHE_KEY(phoneNumber, type)

          // Save each key to PostgreSQL
          for (const id in data[type]) {
            const value = data[type][id]
            const keyData = typeof value === 'string' ? value : JSON.stringify(value)

            await db.query(
              `INSERT INTO signal_keys (phone_number, key_type, key_id, key_data)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (phone_number, key_type, key_id)
               DO UPDATE SET key_data = $4`,
              [phoneNumber, type, id, keyData],
            )
          }

          // Invalidate Redis cache for this type
          try {
            await redis.del(keysKey)
          } catch (redisError) {
            console.warn(`Failed to invalidate Redis cache for ${type}:`, redisError)
          }
        }
      } catch (error) {
        console.error('Error setting signal keys:', error)
      }
    },

    async clear() {
      try {
        // Clear from PostgreSQL
        await db.query('DELETE FROM signal_keys WHERE phone_number = $1', [phoneNumber])

        // Clear from Redis cache - clear all key types
        const keyTypes = ['pre-key', 'signed-pre-key', 'session', 'sender-key', 'app-state-sync-key', 'app-state-sync-version']
        for (const type of keyTypes) {
          const keysKey = SIGNAL_KEYS_CACHE_KEY(phoneNumber, type)
          try {
            await redis.del(keysKey)
          } catch (redisError) {
            console.warn(`Failed to clear Redis cache for ${type}:`, redisError)
          }
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
