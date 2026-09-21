PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS galleries (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  visibility TEXT NOT NULL DEFAULT 'unlisted' CHECK(visibility IN ('public','unlisted','private')),
  password_hash TEXT,
  download_pin_hash TEXT,
  downloads_enabled INTEGER NOT NULL DEFAULT 1,
  show_branding INTEGER NOT NULL DEFAULT 1,
  brand_name TEXT,
  logo_key TEXT,
  accent_color TEXT DEFAULT '#171717',
  cover_photo_id TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gallery_sets (
  id TEXT PRIMARY KEY,
  gallery_id TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(gallery_id, slug)
);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  gallery_id TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  set_id TEXT REFERENCES gallery_sets(id) ON DELETE SET NULL,
  storage_key TEXT NOT NULL UNIQUE,
  thumbnail_key TEXT,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  sha256 TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(gallery_id, sha256)
);

CREATE TABLE IF NOT EXISTS device_tokens (
  id TEXT PRIMARY KEY,
  gallery_id TEXT REFERENCES galleries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  last_seen_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY,
  gallery_id TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(photo_id, visitor_id)
);

CREATE INDEX IF NOT EXISTS idx_photos_gallery ON photos(gallery_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sets_gallery ON gallery_sets(gallery_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_favorites_gallery ON favorites(gallery_id);