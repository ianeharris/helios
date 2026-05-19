-- Helios initial schema. Runs once on first container start.
-- TimescaleDB extension must be enabled before creating hypertables.

CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- ── Core tables ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rooms (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    floor       SMALLINT,
    icon        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS devices (
    id          TEXT PRIMARY KEY,
    vendor      TEXT NOT NULL,
    kind        TEXT NOT NULL,
    name        TEXT NOT NULL,
    room_id     TEXT REFERENCES rooms(id) ON DELETE SET NULL,
    reachable   BOOLEAN NOT NULL DEFAULT true,
    raw_state   JSONB,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Time-series tables (TimescaleDB hypertables) ──────────────────────────────

CREATE TABLE IF NOT EXISTS events (
    occurred_at TIMESTAMPTZ NOT NULL,
    id          TEXT NOT NULL,
    vendor      TEXT NOT NULL,
    kind        TEXT NOT NULL,
    device_id   TEXT,
    payload     JSONB NOT NULL DEFAULT '{}'
);
SELECT create_hypertable('events', 'occurred_at', if_not_exists => true);
CREATE INDEX IF NOT EXISTS events_device_id_idx ON events (device_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS energy_readings (
    occurred_at     TIMESTAMPTZ NOT NULL,
    pv_watts        REAL,
    battery_soc_pct REAL,
    battery_watts   REAL,
    grid_watts      REAL,
    load_watts      REAL
);
SELECT create_hypertable('energy_readings', 'occurred_at', if_not_exists => true);
