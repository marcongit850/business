-- Issues flagged by approved members, scoped to one network.
-- Attachment bytes live in the private walton-hub-media bucket.
-- Members can read only their own rows. Downloads are admin only.

CREATE TABLE flagged_issues (
  id TEXT PRIMARY KEY,
  network TEXT NOT NULL CHECK (network IN ('business', 'builders', 'tourism')),
  member_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  where_text TEXT NOT NULL DEFAULT '',
  deadline TEXT NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '',
  effect TEXT NOT NULL DEFAULT '',
  contact_ok INTEGER NOT NULL DEFAULT 0 CHECK (contact_ok IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'looking', 'action', 'closed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members(id)
);

CREATE INDEX idx_flagged_issues_network ON flagged_issues (network, created_at DESC);
CREATE INDEX idx_flagged_issues_member ON flagged_issues (member_id, network, created_at DESC);

CREATE TABLE flagged_issue_files (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (issue_id) REFERENCES flagged_issues(id)
);

CREATE INDEX idx_flagged_issue_files_issue ON flagged_issue_files (issue_id);
