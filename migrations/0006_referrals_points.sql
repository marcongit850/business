-- Referral codes, the member who referred an application, and points.
-- Points are one total per member. The unique key is the dedupe:
-- one welcome per member, one install per member, one referral per
-- referred person for that referrer, and one Facebook or LinkedIn
-- follow per network. Apply this to D1 walton-hub before deploy.
-- The Worker still loads if this migration is not applied yet.

CREATE TABLE referral_codes (
  member_id TEXT NOT NULL,
  network TEXT NOT NULL CHECK (network IN ('business', 'builders', 'tourism')),
  code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (member_id, network),
  FOREIGN KEY (member_id) REFERENCES members(id)
);

CREATE UNIQUE INDEX idx_referral_codes_code ON referral_codes (code COLLATE NOCASE);

ALTER TABLE applications ADD COLUMN referral_code TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN referrer_member_id TEXT NOT NULL DEFAULT '';

CREATE TABLE points_events (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('welcome', 'referral', 'install', 'facebook', 'linkedin')),
  network TEXT NOT NULL DEFAULT '' CHECK (network IN ('', 'business', 'builders', 'tourism')),
  points INTEGER NOT NULL CHECK (points > 0),
  subject TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members(id),
  UNIQUE (member_id, kind, network, subject)
);

CREATE INDEX idx_points_events_member ON points_events (member_id);

-- One referral payout per referred person, even if two members share a code.
CREATE UNIQUE INDEX idx_points_referral_once ON points_events (subject)
  WHERE kind = 'referral' AND subject != '';

-- Welcome bonus backfill.
-- Every member who is already approved on at least one network gets
-- 10 points once. Safe to run again: existing welcome rows are skipped,
-- and INSERT OR IGNORE covers a unique-key race.
INSERT OR IGNORE INTO points_events (id, member_id, kind, network, points, subject, created_at)
SELECT
  'welcome:' || m.id,
  m.id,
  'welcome',
  '',
  10,
  '',
  COALESCE(
    (SELECT MIN(ms.created_at) FROM memberships ms WHERE ms.member_id = m.id AND ms.status = 'approved'),
    m.created_at
  )
FROM members m
WHERE EXISTS (
  SELECT 1 FROM memberships ms
  WHERE ms.member_id = m.id AND ms.status = 'approved'
)
AND NOT EXISTS (
  SELECT 1 FROM points_events pe
  WHERE pe.member_id = m.id AND pe.kind = 'welcome'
);
