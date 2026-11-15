-- Walton network hub. Membership roles stay per network so a later editor
-- grant can use role = 'editor' on one network without a new table.
-- v1 only treats ADMIN_EMAILS as admins. The role column is not a login system.

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE memberships (
  member_id TEXT NOT NULL,
  network TEXT NOT NULL CHECK (network IN ('business', 'builders', 'tourism')),
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'denied')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (member_id, network),
  FOREIGN KEY (member_id) REFERENCES members(id)
);

CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  network TEXT NOT NULL CHECK (network IN ('business', 'builders', 'tourism')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  source_url TEXT NOT NULL DEFAULT '',
  fields_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_at TEXT,
  reviewed_by TEXT,
  mailerlite_status TEXT,
  mailerlite_detail TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_applications_list ON applications (status, network, submitted_at DESC);
CREATE INDEX idx_applications_email ON applications (email);

CREATE TABLE magic_links (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  request_ip TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_magic_links_email ON magic_links (email, created_at);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE rate_limits (
  bucket TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL
);

-- Admin-only. Never join this table into member profile or hub queries.
CREATE TABLE member_admin_notes (
  member_id TEXT PRIMARY KEY,
  body TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members(id)
);

CREATE TABLE member_profiles (
  member_id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  role_title TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members(id)
);

CREATE TABLE member_profile_fields (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members(id)
);

CREATE INDEX idx_profile_fields_member ON member_profile_fields (member_id, sort_order);

CREATE TABLE content_items (
  id TEXT PRIMARY KEY,
  network TEXT NOT NULL CHECK (network IN ('business', 'builders', 'tourism')),
  type TEXT NOT NULL CHECK (type IN ('page', 'announcement', 'resource', 'post')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  image_key TEXT,
  image_alt TEXT NOT NULL DEFAULT '',
  image_type TEXT,
  image_bytes INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  UNIQUE (network, slug)
);

CREATE INDEX idx_content_network_status ON content_items (network, status, pinned);
