// backend/src/db.ts
import { Pool } from 'pg'
import 'dotenv/config'

const connectionString =
  process.env.DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/lemon_uno'

// Log mínimo para debug (ocultando user/pass)
const safeConnectionString = connectionString.replace(
  /\/\/(.*)@/,
  '//***:***@',
)
console.log('[DB] Using connection string:', safeConnectionString)

export const pool = new Pool({
  connectionString,
})

export async function testDbConnection(): Promise<void> {
  try {
    const res = await pool.query('SELECT NOW() as now')
    console.log('[DB] Test query OK at:', res.rows[0].now)
  } catch (err) {
    console.error('[DB] Connection ERROR:', err)
    throw err
  }
}
