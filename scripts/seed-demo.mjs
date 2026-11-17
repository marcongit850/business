import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const adminToken = "demo-admin-session-token-0123456789abcdef";
const memberToken = "demo-member-session-token-0123456789abcdef";
const hash = (value) => createHash("sha256").update(value).digest("hex");

const sql = `
DELETE FROM login_events;
DELETE FROM application_notes;
DELETE FROM member_profile_fields;
DELETE FROM member_profiles;
DELETE FROM member_admin_notes;
DELETE FROM content_items;
DELETE FROM sessions;
DELETE FROM magic_links;
DELETE FROM rate_limits;
DELETE FROM memberships;
DELETE FROM applications;
DELETE FROM members;

INSERT INTO members (id, email, name, created_at, updated_at) VALUES
('55555555-5555-4555-8555-555555555555', 'demo.member@example.com', 'Demo Member', '2026-11-01T15:00:00.000Z', '2026-11-10T15:00:00.000Z');

INSERT INTO memberships (member_id, network, role, status, created_at, updated_at) VALUES
('55555555-5555-4555-8555-555555555555', 'business', 'member', 'approved', '2026-11-02T15:00:00.000Z', '2026-11-02T15:00:00.000Z');

INSERT INTO member_profiles (member_id, name, company, role_title, phone, location, website, bio, updated_at) VALUES
('55555555-5555-4555-8555-555555555555', 'Demo Member', 'Example Harbor Co', 'Owner', '850-555-0100', 'Santa Rosa Beach', 'https://example.com', 'Demo Member runs a sample company used only for local previews.', '2026-11-10T15:00:00.000Z');

INSERT INTO member_profile_fields (id, member_id, label, value, sort_order, created_at, updated_at) VALUES
('55555555-5555-4555-8555-555555555551', '55555555-5555-4555-8555-555555555555', 'Business info', 'Example Harbor Co, retail', 0, '2026-11-10T15:00:00.000Z', '2026-11-10T15:00:00.000Z'),
('55555555-5555-4555-8555-555555555552', '55555555-5555-4555-8555-555555555555', 'Boat slip', 'Example marina, slip 12', 1, '2026-11-10T15:00:00.000Z', '2026-11-10T15:00:00.000Z');

INSERT INTO member_admin_notes (member_id, body, updated_at) VALUES
('55555555-5555-4555-8555-555555555555', 'Demo note for the admin only. Mentioned an example.com side project.', '2026-11-12T15:00:00.000Z');

INSERT INTO applications (id, network, name, email, submitted_at, source_url, fields_json, status, reviewed_at, reviewed_by, mailerlite_status, mailerlite_detail, created_at) VALUES
('11111111-1111-4111-8111-111111111111', 'business', 'Demo Applicant', 'applicant@example.com', '2026-11-14T15:00:00.000Z', 'https://waltonleaders.org/join', '{"name":"Demo Applicant","email":"applicant@example.com","phone":"850-555-0199","company":"Example Goods","role":"Manager","industry":"Retail","years_in_walton":"4 years","website":"https://example.com/goods","about":"This is a fake application for the local preview."}', 'pending', NULL, NULL, NULL, NULL, '2026-11-14T15:00:00.000Z'),
('22222222-2222-4222-8222-222222222222', 'business', 'Demo Member', 'demo.member@example.com', '2026-11-01T15:00:00.000Z', 'https://waltonleaders.org/join', '{"name":"Demo Member","email":"demo.member@example.com","phone":"850-555-0100","company":"Example Harbor Co","role":"Owner","industry":"Retail","years_in_walton":"8 years","website":"https://example.com","about":"Fake member used for screenshots."}', 'approved', '2026-11-02T15:00:00.000Z', 'marc@whpinc.com', 'not_configured', 'MailerLite not configured', '2026-11-01T15:00:00.000Z'),
('33333333-3333-4333-8333-333333333333', 'builders', 'Demo Builder', 'builder@example.com', '2026-11-13T15:00:00.000Z', 'https://waltonbuildersnetwork.org/join', '{"name":"Demo Builder","email":"builder@example.com","trade":"Sample carpentry","phone":"850-555-0188"}', 'pending', NULL, NULL, NULL, NULL, '2026-11-13T15:00:00.000Z'),
('44444444-4444-4444-8444-444444444444', 'tourism', 'Demo Visitor', 'visitor@example.com', '2026-11-12T18:00:00.000Z', 'https://waltontourism.org/join', '{"name":"Demo Visitor","email":"visitor@example.com","business":"Example Inn","seasons":"Year round"}', 'pending', NULL, NULL, NULL, NULL, '2026-11-12T18:00:00.000Z');

INSERT INTO application_notes (id, application_id, author_email, body, created_at, copied_at) VALUES
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'marc@whpinc.com', 'Demo note on a pending application. Local preview only.', '2026-11-14T16:00:00.000Z', NULL);

INSERT INTO content_items (id, network, type, status, title, slug, body, description, link_url, pinned, image_alt, created_at, updated_at, published_at) VALUES
('66666666-6666-4666-8666-666666666666', 'business', 'post', 'draft', 'Draft harbor update', 'draft-harbor-update', 'This draft is only for the admin preview. Members should not see it.', 'A draft post with a featured image.', '', 1, 'Navy and gold sample image', '2026-11-14T12:00:00.000Z', '2026-11-14T12:00:00.000Z', NULL),
('77777777-7777-4777-8777-777777777777', 'business', 'post', 'published', 'Welcome to the member hub', 'welcome-to-the-hub', 'This is placeholder copy for the Business Leaders hub. More member resources will land here.', 'A published sample post.', '', 0, 'Gold bar on a navy field', '2026-11-03T12:00:00.000Z', '2026-11-03T12:00:00.000Z', '2026-11-03T12:00:00.000Z'),
('88888888-8888-4888-8888-888888888888', 'business', 'announcement', 'published', 'Next breakfast is a demo', 'next-breakfast', 'The next sample breakfast is on the calendar for this preview only.', '', '', 0, '', '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z'),
('99999999-9999-4999-8999-999999999999', 'business', 'resource', 'published', 'Example agenda', 'example-agenda', 'A short note about the sample agenda.', 'A sample agenda for the demo hub.', 'https://example.com/agenda', 0, '', '2026-11-09T12:00:00.000Z', '2026-11-09T12:00:00.000Z', '2026-11-09T12:00:00.000Z'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'builders', 'post', 'published', 'Builders only update', 'builders-only', 'This published post belongs to Builders and must not appear in Business Leaders.', '', '', 0, '', '2026-11-08T12:00:00.000Z', '2026-11-08T12:00:00.000Z', '2026-11-08T12:00:00.000Z');

INSERT INTO sessions (id, token_hash, email, csrf_token, expires_at, created_at) VALUES
('sess-admin-demo', '${hash(adminToken)}', 'marc@whpinc.com', 'demo-admin-csrf-token', '2027-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
('sess-member-demo', '${hash(memberToken)}', 'demo.member@example.com', 'demo-member-csrf-token', '2027-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z');
`;

const dir = mkdtempSync(join(tmpdir(), "walton-seed-"));
const file = join(dir, "seed.sql");
writeFileSync(file, sql);
const result = spawnSync("npx", ["wrangler", "d1", "execute", "walton-hub", "--local", "--file", file], {
  stdio: "inherit",
  cwd: fileURLToPath(new URL("..", import.meta.url)),
});
if (result.status !== 0) process.exit(result.status || 1);
console.log("Seeded local walton-hub with fake demo rows.");
console.log("Admin cookie wl_session=" + adminToken);
console.log("Member cookie wl_session=" + memberToken);
