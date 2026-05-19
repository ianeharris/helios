import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export const connectDb = async (): Promise<void> => {
  pool = new Pool({
    connectionString: process.env['DATABASE_URL'],
    max: 10,
  });
  await pool.query('SELECT 1'); // verify connectivity on start
};

export const getDb = (): pg.Pool => {
  if (!pool) throw new Error('Database not connected');
  return pool;
};
