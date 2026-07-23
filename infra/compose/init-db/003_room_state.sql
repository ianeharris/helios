-- Migration 003: retain provider area identities and current aggregate state.
-- Safe to run on the live DB; Hue grouped-light IDs are stored here so Rooms
-- and Zones can target the bridge-native aggregate resource without fan-out.

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS raw_state JSONB NOT NULL DEFAULT '{}';
