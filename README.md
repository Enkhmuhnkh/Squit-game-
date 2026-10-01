# Party Game Hub

Бүртгэлгүй (nickname + guest session) multiplayer тоглоомын платформ. Эхний тоглоом: **30 шаттай Шилэн гүүр**.
Архитектурын дэлгэрэнгүйг [ARCHITECTURE.md](./ARCHITECTURE.md)-аас үзнэ үү.

## Ажиллуулах

```bash
# 1. PostgreSQL (заавал биш — DATABASE_URL байхгүй бол зөвхөн түүх хадгалагдахгүй)
docker compose up -d

# 2. Server (Node.js 18+)
cd server
cp .env.example .env
npm install
npm test        # engine unit test
npm run dev     # http://localhost:3001

# 3. Client (өөр terminal)
cd client
npm install
npm run dev     # http://localhost:5173
```

Өөр өөр browser (эсвэл incognito) цонхоор 2+ тоглогч нэвтэрч, нэг нь өрөө үүсгээд кодыг нь бусад нь оруулна.

**Refresh / server restart:** тоглолт алга болохгүй. Өрөө, тоглолтын snapshot нь `DATABASE_URL` байвал PostgreSQL-д, үгүй бол `server/.data/snapshots.json` файлд хадгалагдана. Үүнийг шалгахад: тоглолт эхлүүлээд browser-аа refresh хийх, эсвэл server-ээ (Ctrl+C → `npm run dev`) дахин асаах.

**3D:** Шилэн гүүр 3D-ээр харагдана (three.js). WebGL ажиллахгүй бол автоматаар 2D болно; баруун дээд буланд 2D/3D товч бий.

## Бүтэц

- `db/schema.sql` — PostgreSQL schema
- `server/src/games/glassBridge/` — тоглоомын дүрэм (pure engine, unit test-тэй)
- `server/src/hub/` — өрөө, session, socket handler
- `client/src/games/glassBridge/` — гүүр, shop, HUD

## Шинэ тоглоом нэмэх

1. `server/src/games/<name>/` дотор `GameEngine` интерфэйсийг хэрэгжүүлсэн класс бич
2. `server/src/games/registry.js`-д бүртгэ
3. `client/src/games/<name>/` дотор дэлгэцийн компонент бич
4. `client/src/games/index.js`-д бүртгэ
