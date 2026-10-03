import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { config } from './config.js';
import { attachHub } from './hub/socketHandlers.js';
import { listGames } from './games/registry.js';
import { createSnapshotStore } from './persistence/snapshotStore.js';

const app = express();
app.use(cors({ origin: config.clientOrigin }));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/api/games', (_req, res) => res.json(listGames()));

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
