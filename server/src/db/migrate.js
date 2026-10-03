import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './pool.js';

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../../db/schema.sql');

/**
 * `DATABASE_URL` тохируулсан үед эхлэхийн өмнө schema.sql-ийг ажиллуулна.
 * Бүх CREATE TABLE нь `IF NOT EXISTS` тул хэд ч дахин ажиллуулахад аюулгүй —
 * хэрэглэгч гараар `psql -f db/schema.sql` ажиллуулах шаардлагагүй болгоно.
 */
export async function runMigrations() {
  if (!pool) return;
  try {
    const sql = readFileSync(SCHEMA_PATH, 'utf8');
    await pool.query(sql);
    console.log('[db] migration шалгагдлаа (schema.sql)');
  } catch (err) {
    console.error('[db] migration ажиллуулахад алдаа:', err.message);
  }
}
