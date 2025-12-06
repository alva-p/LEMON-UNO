-- Habilitar uuid si lo necesitás (depende de la imagen)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ================== PLAYERS ==================
CREATE TABLE IF NOT EXISTS players (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address VARCHAR(255) UNIQUE NOT NULL,
  username       VARCHAR(50) NOT NULL,
  avatar_url     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================== GAMES ==================
CREATE TABLE IF NOT EXISTS games (
  id               UUID PRIMARY KEY,
  created_at       TIMESTAMPTZ NOT NULL,
  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ,
  status           VARCHAR(20) NOT NULL, -- CREATED | IN_PROGRESS | FINISHED
  bet_amount       NUMERIC(18,8) NOT NULL,
  currency         VARCHAR(10) NOT NULL, -- ARS | ETH | USDT | USDC
  network          VARCHAR(10),          -- ETH | BASE | NULL
  pot_amount       NUMERIC(18,8) NOT NULL,
  winner_player_id UUID REFERENCES players(id)
);

-- ================== GAME_PLAYERS ==================
CREATE TABLE IF NOT EXISTS game_players (
  game_id        UUID NOT NULL REFERENCES games(id)   ON DELETE CASCADE,
  player_id      UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  seat_number    SMALLINT,
  final_position SMALLINT,
  is_winner      BOOLEAN NOT NULL DEFAULT false,
  bet_amount     NUMERIC(18,8) NOT NULL,
  prize_amount   NUMERIC(18,8) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, player_id)
);

-- ================== PLAYER_STATS ==================
CREATE TABLE IF NOT EXISTS player_stats (
  player_id       UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  games_played    INTEGER NOT NULL DEFAULT 0,
  games_won       INTEGER NOT NULL DEFAULT 0,
  total_won_ars   NUMERIC(18,8) NOT NULL DEFAULT 0,
  total_won_eth   NUMERIC(18,8) NOT NULL DEFAULT 0,
  total_won_usdt  NUMERIC(18,8) NOT NULL DEFAULT 0,
  total_won_usdc  NUMERIC(18,8) NOT NULL DEFAULT 0
);


-- ================== MATCHES (para historial simple de partidas) ==================
CREATE TABLE IF NOT EXISTS matches (
  id             SERIAL PRIMARY KEY,
  game_id        TEXT UNIQUE NOT NULL,
  winner_wallet  TEXT NOT NULL,
  pot            NUMERIC(18,8) NOT NULL,
  currency       VARCHAR(10) NOT NULL,
  network        VARCHAR(10),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================== MATCH_PLAYERS ==================
CREATE TABLE IF NOT EXISTS match_players (
  match_id       INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  wallet_address TEXT    NOT NULL,
  is_winner      BOOLEAN NOT NULL DEFAULT false,
  prize          NUMERIC(18,8) NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, wallet_address)
);

