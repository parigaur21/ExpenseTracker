import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://spreetail:spreetail@localhost:5432/shared_expenses'
});

export async function query<T = any>(text: string, params: unknown[] = []) {
  const result = await pool.query<T>(text, params);
  return result;
}

export async function tx<T>(work: (client: pg.PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

