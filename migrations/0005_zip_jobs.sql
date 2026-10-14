CREATE TABLE IF NOT EXISTS zip_jobs (
  id TEXT PRIMARY KEY,
  gallery_id TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  email_token_hash TEXT,
  status TEXT NOT NULL CHECK(status IN ('queued','processing','ready','failed')),
  archive_key TEXT NOT NULL,
  photo_count INTEGER NOT NULL DEFAULT 0,
  email_status TEXT NOT NULL DEFAULT 'pending',
  error_code TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_zip_jobs_expiry ON zip_jobs(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_zip_jobs_gallery ON zip_jobs(gallery_id, created_at);
