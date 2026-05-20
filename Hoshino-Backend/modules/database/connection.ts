import pg from 'pg'

const { Pool } = pg

export class Database {
  private pool: pg.Pool | null = null

  async connect() {
    this.pool = new Pool({
      user: process.env.DB_USER || 'hoshino',
      password: process.env.DB_PASSWORD || 'hoshino_pass_dev',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'hoshino_auth',
    })

    await this.pool.query('SELECT 1')
    console.log('Database connected successfully')
  }

  async query(sql: string, params?: any[]) {
    if (!this.pool) throw new Error('Database not connected')
    return this.pool.query(sql, params)
  }

  async close() {
    if (this.pool) {
      await this.pool.end()
    }
  }
}

export const db = new Database()
