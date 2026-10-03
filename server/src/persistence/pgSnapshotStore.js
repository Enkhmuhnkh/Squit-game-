/** Snapshot хадгалалтын PostgreSQL хувилбар (room_snapshots хүснэгт). */
export function createPgSnapshotStore(pool) {
  return {
    kind: 'postgres',

    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS room_snapshots (
          code        CHAR(5) PRIMARY KEY,
          state       JSONB NOT NULL,
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )`);
    },

    async load() {
      // 12 цагаас хуучин өрөөг сэргээхгүй
      const { rows } = await pool.query(
        `SELECT state FROM room_snapshots WHERE updated_at > now() - interval '12 hours'`,
      );
      return rows.map((r) => r.state);
    },

    async apply({ upserts, deletes }) {
      for (const [code, snap] of upserts) {
        await pool.query(
          `INSERT INTO room_snapshots (code, state, updated_at) VALUES ($1, $2, now())
           ON CONFLICT (code) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
          [code, JSON.stringify(snap)],
        );
      }
      if (deletes.length) {
        await pool.query('DELETE FROM room_snapshots WHERE code = ANY($1)', [deletes]);
      }
    },
  };
}
