-- Migration 002: scenes, house_mode, device role/tags, and indexes.
-- Safe to run on the live DB: all statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.

-- ── Scenes ────────────────────────────────────────────────────────────────────
-- A Helios scene is distinct from a Hue scene: it spans multiple devices and
-- is owned by Helios. definition is an array of { deviceId, state } objects.

CREATE TABLE IF NOT EXISTS scenes (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    room_id     TEXT REFERENCES rooms(id) ON DELETE CASCADE,
    icon        TEXT,
    definition  JSONB NOT NULL DEFAULT '[]',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scenes_room_id_idx ON scenes (room_id);

-- ── House mode ────────────────────────────────────────────────────────────────
-- Single-row state machine. Valid modes: home, away, night, morning, guest.
-- The constraint ensures only one row ever exists.

CREATE TABLE IF NOT EXISTS house_mode (
    id          INT PRIMARY KEY DEFAULT 1,
    mode        TEXT NOT NULL DEFAULT 'home',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO house_mode (id, mode) VALUES (1, 'home') ON CONFLICT DO NOTHING;

-- ── Device role and tags ──────────────────────────────────────────────────────
-- role: 'interior' | 'security' | 'exterior' — used by automation recipes
--   (e.g. Leaving Home turns off interior lights, leaves security lights running).
-- tags: free-form array for future recipe conditions.

ALTER TABLE devices ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS devices_room_id_idx ON devices (room_id);
CREATE INDEX IF NOT EXISTS devices_vendor_idx  ON devices (vendor);
CREATE INDEX IF NOT EXISTS devices_role_idx    ON devices (role) WHERE role IS NOT NULL;
