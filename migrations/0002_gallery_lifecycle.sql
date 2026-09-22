ALTER TABLE galleries ADD COLUMN event_date TEXT;
ALTER TABLE galleries ADD COLUMN auto_archive_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE galleries ADD COLUMN auto_archive_started_at TEXT;
CREATE INDEX IF NOT EXISTS idx_galleries_expiry ON galleries(auto_archive_enabled,expires_at);
