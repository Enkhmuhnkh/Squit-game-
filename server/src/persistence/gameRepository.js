import { pool } from '../db/pool.js';

/**
 * Дууссан тоглолтыг PostgreSQL-д нэг transaction-оор хадгална.
 * pool байхгүй (DATABASE_URL тохируулаагүй) бол чимээгүй алгасна.
 */
export async function saveFinishedGame({ room, players, result, startedAt }) {
  if (!pool) return null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Guest тоглогчдыг upsert
    for (const p of players) {
      await client.query(
        `INSERT INTO players (id, session_token, nickname)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname, last_seen_at = now()`,
        [p.id, p.token, p.nickname],
      );
    }

    const hostId = players.find((p) => p.id === room.hostId)?.id ?? players[0].id;
    const roomRes = await client.query(
      `INSERT INTO rooms (code, host_id, game_id, status)
       VALUES ($1, $2, $3, 'lobby')
       ON CONFLICT (code) DO UPDATE SET game_id = EXCLUDED.game_id
       RETURNING id`,
      [room.code, hostId, room.gameId],
    );

    const sessionRes = await client.query(
      `INSERT INTO game_sessions (room_id, game_id, status, death_pool, started_at, finished_at)
       VALUES ($1, $2, 'finished', $3, $4, now())
       RETURNING id`,
      [roomRes.rows[0].id, room.gameId, result.deathPool, startedAt],
    );
    const sessionId = sessionRes.rows[0].id;

    // Зөвхөн Glass Bridge шиг нууц map-тай тоглоомд байна (ж: Red Light-д байхгүй)
    if (result.bridge) {
      for (let i = 0; i < result.bridge.length; i++) {
        await client.query(
          'INSERT INTO bridge_maps (session_id, step, safe_side) VALUES ($1, $2, $3)',
          [sessionId, i + 1, result.bridge[i]],
        );
      }
    }

    for (const p of result.players) {
      await client.query(
        `INSERT INTO session_players
           (session_id, player_id, nickname, turn_order, final_step, final_balance, eliminated_at, is_winner, payout)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          sessionId, p.id, p.nickname, p.turnOrder, p.finalStep, p.finalBalance,
          p.eliminatedAt ? new Date(p.eliminatedAt) : null, p.isWinner, p.payout,
        ],
      );
    }

    for (const t of result.ledger) {
      await client.query(
        'INSERT INTO transactions (session_id, player_id, kind, item, amount) VALUES ($1, $2, $3, $4, $5)',
        [sessionId, t.playerId, t.kind, t.item, t.amount],
      );
    }

    await client.query('COMMIT');
    return sessionId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
