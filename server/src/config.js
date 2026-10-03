import 'dotenv/config';

// Comma-separated жагсаалт зөвшөөрнө, жишээ нь:
// CLIENT_ORIGIN=http://localhost:5173,https://squit-game.onrender.com
const clientOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const config = {
  port: Number(process.env.PORT || 3001),
  clientOrigin: clientOrigins.length > 1 ? clientOrigins : clientOrigins[0],
  // DATABASE_URL байхгүй бол тоглоом ажиллана, зөвхөн түүх хадгалагдахгүй
  databaseUrl: process.env.DATABASE_URL || null,
  // DB байхгүй үед өрөөний snapshot энд хадгалагдана (server restart-д тэсвэртэй)
  snapshotFile: process.env.SNAPSHOT_FILE || '.data/snapshots.json',
};
