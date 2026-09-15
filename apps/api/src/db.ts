import pg from 'pg';

const {Pool} = pg;
const connectionString = process.env.DATABASE_URL;

export const db = connectionString ? new Pool({
  connectionString,
  ssl: String(process.env.DATABASE_SSL || 'false') === 'true' ? {rejectUnauthorized: false} : undefined,
  max: 10,
  idleTimeoutMillis: 30_000
}) : null;

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  if (!db) throw new Error('DATABASE_URL is not configured');
  const result = await db.query(text, params);
  return result.rows as T[];
}

export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  if (!db) throw new Error('DATABASE_URL is not configured');
  const client = await db.connect();
  try {
    await client.query('begin');
    const value = await fn(client);
    await client.query('commit');
    return value;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
