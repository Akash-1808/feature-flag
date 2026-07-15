import { Pool } from 'pg';
import { config } from '../config.js';

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected database error on idle client', err);
});
