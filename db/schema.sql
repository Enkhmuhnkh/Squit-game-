-- Party Game Hub — PostgreSQL schema
-- Ажиллуулах: psql "$DATABASE_URL" -f db/schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Guest session: бүртгэлгүй тоглогч (localStorage дахь token-оор таньгдана)
CREATE TABLE IF NOT EXISTS players (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token  UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  nickname       VARCHAR(16) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          CHAR(5) NOT NULL UNIQUE,
  host_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  game_id       VARCHAR(32) NOT NULL DEFAULT 'glass-bridge',
  status        VARCHAR(16) NOT NULL DEFAULT 'lobby'
                CHECK (status IN ('lobby', 'playing', 'closed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at     TIMESTAMPTZ
);

-- Нэг өрөөнд олон тоглолт явагдаж болно
CREATE TABLE IF NOT EXISTS game_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  game_id       VARCHAR(32) NOT NULL,
  status        VARCHAR(16) NOT NULL DEFAULT 'running'
                CHECK (status IN ('running', 'finished', 'aborted')),
  config        JSONB NOT NULL DEFAULT '{}',
  death_pool    INTEGER NOT NULL DEFAULT 0,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_game_sessions_room ON game_sessions(room_id);

-- Шилэн гүүрийн нууц map: шат бүрт аль тал нь Safe
-- Тоглоом дуустал клиентэд ХЭЗЭЭ Ч явуулахгүй
CREATE TABLE IF NOT EXISTS bridge_maps (
  session_id    UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  step          SMALLINT NOT NULL CHECK (step BETWEEN 1 AND 30),
  safe_side     CHAR(1) NOT NULL CHECK (safe_side IN ('L', 'R')),
  PRIMARY KEY (session_id, step)
);

CREATE TABLE IF NOT EXISTS session_players (
  session_id     UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  player_id      UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  nickname       VARCHAR(16) NOT NULL,
  turn_order     SMALLINT NOT NULL,
  final_step     SMALLINT NOT NULL DEFAULT 0,
  final_balance  INTEGER NOT NULL DEFAULT 0,
  eliminated_at  TIMESTAMPTZ,
  is_winner      BOOLEAN NOT NULL DEFAULT FALSE,
  payout         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, player_id)
);

-- Мөнгөний бүх хөдөлгөөн (аудит)
CREATE TABLE IF NOT EXISTS transactions (
  id          BIGSERIAL PRIMARY KEY,
  session_id  UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  player_id   UUID REFERENCES players(id) ON DELETE SET NULL,
  kind        VARCHAR(24) NOT NULL
              CHECK (kind IN ('initial', 'step_reward', 'item_purchase', 'death_pool_in', 'payout')),
  item        VARCHAR(16),
  amount      INTEGER NOT NULL,   -- + орлого, - зарлага
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transactions_session ON transactions(session_id);

-- Идэвхтэй өрөө/тоглолтын snapshot (server restart, refresh-д тоглолт алга болохгүй байлгах).
-- Нууц bridge болон sessionToken агуулдаг тул клиентэд хэзээ ч ил гаргахгүй.
CREATE TABLE IF NOT EXISTS room_snapshots (
  code        CHAR(5) PRIMARY KEY,
  state       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
