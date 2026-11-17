-- One row each time a magic-link sign-in creates a session.
-- network is the login page the link was opened from: business, builders, or tourism.
-- Admins read counts from this table. Members do not.
-- IP addresses, tokens, and user agents are not stored.

CREATE TABLE login_events (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  network TEXT NOT NULL CHECK (network IN ('business', 'builders', 'tourism')),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_login_events_email ON login_events (email);
