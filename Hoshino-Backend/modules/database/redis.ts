import { createClient } from 'redis'

export type RedisClientType = ReturnType<typeof createClient>

export class RedisConnection {
  private client: RedisClientType | null = null

  async connect() {
    this.client = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    })

    this.client.on('error', (err) => console.error('Redis Client Error', err))

    await this.client.connect()
    console.log('Redis connected successfully')
  }

  async get<T = any>(key: string): Promise<T | null> {
    if (!this.client) throw new Error('Redis not connected')
    const data = await this.client.get(key)
    if (!data) return null
    return JSON.parse(data) as T
  }

  async set<T = any>(key: string, value: T, expiresIn?: number): Promise<void> {
    if (!this.client) throw new Error('Redis not connected')
    const options = expiresIn ? { EX: expiresIn } : undefined
    await this.client.set(key, JSON.stringify(value), options)
  }

  async del(key: string): Promise<void> {
    if (!this.client) throw new Error('Redis not connected')
    await this.client.del(key)
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client) throw new Error('Redis not connected')
    return (await this.client.exists(key)) === 1
  }

  async close() {
    if (this.client) {
      await this.client.quit()
    }
  }
}

export const redis = new RedisConnection()
