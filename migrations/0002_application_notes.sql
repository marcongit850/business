-- Private notes on a membership application. Admins append notes here.
-- Members and applicants never read this table.
-- Approved members show the same rows on the member admin page.
-- copied_at is set when a note has been appended to member_admin_notes.

CREATE TABLE application_notes (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  author_email TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  copied_at TEXT,
  FOREIGN KEY (application_id) REFERENCES applications(id)
);

CREATE INDEX idx_application_notes_app ON application_notes (application_id, created_at);
