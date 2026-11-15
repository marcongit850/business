-- Let one published item show in Latest on every network.
-- Existing rows stay on their own network (share_all defaults to 0).

ALTER TABLE content_items ADD COLUMN share_all INTEGER NOT NULL DEFAULT 0 CHECK (share_all IN (0, 1));
