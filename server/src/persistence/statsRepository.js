import { pool } from '../db/pool.js';

/** Тоглогчдыг ялалт/орлогоор эрэмбэлсэн жагсаалт. `pool` байхгүй бол `null`. */
export async function getLeaderboard({ gameId = null, limit = 20 } = {}) {
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT p.id AS player_id, p.nickname,
            COUNT(*)::int AS games_played,
            COUNT(*) FILTER (WHERE sp.is_winner)::int AS wins,
            COALESCE(SUM(sp.payout), 0)::int AS total_payout,
            MAX(sp.final_step)::int AS best_step
       FROM session_players sp
       JOIN players p ON p.id = sp.player_id
       JOIN game_sessions gs ON gs.id = sp.session_id
      WHERE gs.status = 'finished' AND ($1::varchar IS NULL OR gs.game_id = $1)
      GROUP BY p.id, p.nickname
      ORDER BY wins DESC, total_payout DESC
      LIMIT $2`,
    [gameId, limit],
  );
  return rows;
}

/** Нэг тоглогчийн нийт статистик + сүүлийн тоглолтууд. `pool` байхгүй бол `null`. */
export async function getPlayerStats(playerId) {
  if (!pool) return null;
  const totalsRes = await pool.query(
    `SELECT COUNT(*)::int AS games_played,
            COUNT(*) FILTER (WHERE sp.is_winner)::int AS wins,
            COALESCE(SUM(sp.payout), 0)::int AS total_payout,
            MAX(sp.final_step)::int AS best_step
       FROM session_players sp
       JOIN game_sessions gs ON gs.id = sp.session_id
      WHERE sp.player_id = $1 AND gs.status = 'finished'`,
    [playerId],
  );
  const recentRes = await pool.query(
    `SELECT gs.game_id, gs.finished_at, sp.final_step, sp.final_balance, sp.is_winner, sp.payout
       FROM session_players sp
       JOIN game_sessions gs ON gs.id = sp.session_id
      WHERE sp.player_id = $1 AND gs.status = 'finished'
      ORDER BY gs.finished_at DESC
      LIMIT 10`,
    [playerId],
  );
  const totals = totalsRes.rows[0];
  const gamesPlayed = totals?.games_played ?? 0;
  const wins = totals?.wins ?? 0;
  return {
    gamesPlayed,
    wins,
    winRate: gamesPlayed > 0 ? wins / gamesPlayed : 0,
    totalPayout: totals?.total_payout ?? 0,
    bestStep: totals?.best_step ?? 0,
    recentGames: recentRes.rows,
  };
}
