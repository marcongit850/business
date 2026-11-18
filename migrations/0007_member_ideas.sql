-- Ideas sent by approved members, scoped to one network.
-- No points are awarded. Apply this to D1 walton-hub before members
-- use the idea card. The hub still loads if this migration is not
-- applied yet. Saving an idea then says the migration is needed.

CREATE TABLE member_ideas (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  network TEXT NOT NULL CHECK (network IN ('business', 'builders', 'tourism')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read')),
  FOREIGN KEY (member_id) REFERENCES members(id)
);

CREATE INDEX idx_member_ideas_created ON member_ideas (created_at DESC);
CREATE INDEX idx_member_ideas_member ON member_ideas (member_id, created_at DESC);
