-- kochvei-stats: per-device usage counts. No IP addresses, no raw User-Agent, no answers or scores. Since 2026-11-20 a
-- device also reports its profile NAMES (the owner asked for them, to match devices to real people); the app's
-- parent screen says so and can turn the pings off.
-- Idempotent: safe to run again on an existing database.

-- One row per tablet/browser (the random id the app made on first run).
CREATE TABLE IF NOT EXISTS devices (
  id          TEXT PRIMARY KEY,          -- 16-char base32, random on the device
  first_seen  INTEGER NOT NULL,          -- ms since epoch
  last_seen   INTEGER NOT NULL,          -- ms since epoch
  city        TEXT,                      -- from request.cf, the latest ping
  region      TEXT,
  country     TEXT,                      -- ISO 3166-1 alpha-2
  kind        TEXT,                      -- coarse label from the User-Agent, e.g. "Android tablet · Chrome"
  version     TEXT,                      -- app build id
  profiles    INTEGER,                   -- number of profiles on the device
  names       TEXT,                      -- JSON array of the profile names (app builds from 2026-11-20 on)
  net         TEXT,                      -- internet provider (request.cf.asOrganization), the latest ping
  bot         INTEGER NOT NULL DEFAULT 0, -- 1 = the ping came from a cloud/datacenter network: an automatic scanner
  standalone  INTEGER NOT NULL DEFAULT 0, -- 1 = installed as a PWA
  label       TEXT                       -- owner-editable name, NULL until the owner sets one
);

-- One row per device per Israel-local date (Asia/Jerusalem).
CREATE TABLE IF NOT EXISTS daily (
  device   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  day      TEXT NOT NULL,                -- YYYY-MM-DD
  opens    INTEGER NOT NULL DEFAULT 0,
  minutes  INTEGER NOT NULL DEFAULT 0,   -- capped at 600 a day
  pings    INTEGER NOT NULL DEFAULT 0,   -- capped at 300 a day; pings past the cap are ignored
  PRIMARY KEY (device, day)
);
CREATE INDEX IF NOT EXISTS daily_by_day ON daily(day);
