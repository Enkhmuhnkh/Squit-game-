import pg from 'pg';
import { config } from '../config.js';

export const pool = config.databaseUrl
  ? new pg.Pool({ connectionString: config.databaseUrl })
  : null;

if (!pool) {
  console.warn('[db] DATABASE_URL тохируулаагүй — тоглолтын түүх хадгалагдахгүй.');
}
