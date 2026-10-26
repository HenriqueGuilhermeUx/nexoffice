import pg from 'pg';
import {personalPgConnection} from './personal-preview-db-config.js';
import {lifeosProductionPgConnection} from './nexa-lifeos-prod-db.js';

const {Pool} = pg;
const connectionString = process.env.DATABASE_URL;
// In the isolated personal preview TLS/hostname verification is mandatory.
// Business/PJ pool configuration is deliberately unchanged.
const options = connectionString ? (process.env.NEXA_LIFEOS_ENV==='production'
  ? lifeosProductionPgConnection(connectionString,process.env)
  : personalPgConnection(connectionString,process.env)) : null;

export const db = options ? new Pool({
  ...options,
  max: 10,
  idleTimeoutMillis: 30_000,
  // Only PF staging: fail a broken remote connection predictably and preserve
  // errors for retry instead of waiting forever. PJ pool stays unchanged.
  ...(process.env.NEX_PERSONAL_PREVIEW==='true'?{connectionTimeoutMillis:30_000}:{})
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

export async function withAdvisoryLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!db) throw new Error('DATABASE_URL is not configured');
  const client = await db.connect();
  try {
    await client.query('select pg_advisory_lock(hashtext($1))', [key]);
    return await fn();
  } finally {
    try {
      await client.query('select pg_advisory_unlock(hashtext($1))', [key]);
    } finally {
      client.release();
    }
  }
}
