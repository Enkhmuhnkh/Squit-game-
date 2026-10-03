import { pool } from '../db/pool.js';
import { createFileSnapshotStore } from './fileSnapshotStore.js';
import { createPgSnapshotStore } from './pgSnapshotStore.js';
import { config } from '../config.js';

/** DB байвал PostgreSQL, үгүй (эсвэл холбогдохгүй) бол файл. */
export async function createSnapshotStore() {
  if (pool) {
    try {
      const store = createPgSnapshotStore(pool);
      await store.init();
      return store;
    } catch (err) {
      console.warn('[snapshot] PostgreSQL ашиглаж чадсангүй, файл руу шилжлээ:', err.message);
    }
  }
  return createFileSnapshotStore(config.snapshotFile);
}
