import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { config } from './config.js';
import { attachHub } from './hub/socketHandlers.js';
import { listGames } from './games/registry.js';
import { createSnapshotStore } from './persistence/snapshotStore.js';
import { runMigrations } from './db/migrate.js';
import { getLeaderboard, getPlayerStats } from './persistence/statsRepository.js';

await runMigrations();

const app = express();
app.use(cors({ origin: config.clientOrigin }));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/api/games', (_req, res) => res.json(listGames()));

// DB алдаа (тасарсан холболт, буруу credential гэх мэт) хэзээ ч бүх серверийг
// унагаж болохгүй — Express 4 нь async route-ийн throw-г автоматаар барьдаггүй
// тул энд гараар try/catch хийнэ (идэвхтэй тоглолтууд үргэлжилсээр байх ёстой).
app.get('/api/stats/leaderboard', async (req, res) => {
  try {
    const rows = await getLeaderboard({ gameId: req.query.gameId || null, limit: Number(req.query.limit) || 20 });
    res.json(rows === null ? { available: false } : { available: true, players: rows });
  } catch (err) {
    console.error('[stats] leaderboard авахад алдаа:', err.message);
    res.json({ available: false });
  }
});

app.get('/api/stats/player/:playerId', async (req, res) => {
  try {
    const stats = await getPlayerStats(req.params.playerId);
    res.json(stats === null ? { available: false } : { available: true, ...stats });
  } catch (err) {
    console.error('[stats] player stats авахад алдаа:', err.message);
    res.json({ available: false });
  }
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: config.clientOrigin },
});

// Өрөө, тоглолтыг хадгалалтаас сэргээгээд дараа нь л холболт хүлээн авна
const store = await createSnapshotStore();
const hub = attachHub(io, { store });
const restored = await hub.restore();
console.log(`[hub] snapshot: ${store.kind}, сэргээсэн өрөө: ${restored}`);

httpServer.listen(config.port, () => {
  console.log(`[server] http://localhost:${config.port}`);
});

// Зөв унтраахад сүүлийн төлөвийг хадгална
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await hub.shutdown().catch(() => {});
    process.exit(0);
  });
}
