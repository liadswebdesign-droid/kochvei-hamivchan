-- One-off: adds the columns of 2026-11-20 to an existing database (schema.sql has them for a new one).
-- npx wrangler d1 execute kochvei-stats --remote --file migrate-2026-11-20.sql
ALTER TABLE devices ADD COLUMN names TEXT;
ALTER TABLE devices ADD COLUMN net TEXT;
ALTER TABLE devices ADD COLUMN bot INTEGER NOT NULL DEFAULT 0;
-- The one ping from Moncks Corner, SC (a Google data centre) on 2026-11-19, two seconds before a tablet's first open.
UPDATE devices SET bot = 1 WHERE city = 'Moncks Corner' AND profiles = 0;
