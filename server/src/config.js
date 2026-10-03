import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 3001),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  // DATABASE_URL байхгүй бол тоглоом ажиллана, зөвхөн түүх хадгалагдахгүй
  databaseUrl: process.env.DATABASE_URL || null,
  // DB байхгүй үед өрөөний snapshot энд хадгалагдана (server restart-д тэсвэртэй)
  snapshotFile: process.env.SNAPSHOT_FILE || '.data/snapshots.json',
};
