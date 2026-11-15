# Member hub

The Worker on waltonleaders.org stores join requests from three networks, signs members in with magic links, and serves a private hub. Builders and Tourism post applications to this Worker. They do not read the database directly.

## Create the database and media bucket

From this directory, logged in to the Cloudflare account that owns `business-preview`:

```bash
npx wrangler d1 create walton-hub
```

If Wrangler asks to add the binding, decline. Copy the `database_id` it prints into `wrangler.toml`, replacing `00000000-0000-4000-8000-000000000000`. The binding name stays `DB` and the database name stays `walton-hub`.

```bash
npx wrangler r2 bucket create walton-hub-media
```

The bucket is private. Do not add a public r2.dev domain. The Worker serves images only after it checks the viewer.

Apply the schema to the remote database:

```bash
npx wrangler d1 migrations apply walton-hub --remote
```

Run that again after new migration files land. `migrations/0002_application_notes.sql` adds private application notes. Do not skip it, or the application page cannot load notes.

Local preview:

```bash
npx wrangler d1 migrations apply walton-hub --local
node scripts/seed-demo.mjs
npx wrangler dev
```

`scripts/seed-demo.mjs` writes clearly fake rows into the local database only.

`npx wrangler deploy` checks that the D1 id and the R2 bucket exist. Replace the placeholder id and create the bucket before merging, or the Workers Build will fail and the previous version of the site will keep running. Secrets can be missing after a successful deploy: the public site still loads, and hub pages say the database or MailerLite is not ready.

## Secrets and vars

Secrets, set in the Cloudflare account, not in git:

- `HUB_INGEST_KEY`
- `MAILERLITE_API_KEY`

```bash
npx wrangler secret put HUB_INGEST_KEY
npx wrangler secret put MAILERLITE_API_KEY
```

Vars already named in `wrangler.toml`:

- `ADMIN_EMAILS`
- `MAILERLITE_GROUP_MASTER`
- `MAILERLITE_GROUP_BUSINESS`
- `MAILERLITE_GROUP_BUILDERS`
- `MAILERLITE_GROUP_TOURISM`
- `MAILERLITE_GROUP_BUSINESS_APPROVED`
- `MAILERLITE_GROUP_BUILDERS_APPROVED`
- `MAILERLITE_GROUP_TOURISM_APPROVED`

Put group ids in `wrangler.toml` and deploy. A dashboard-only value can be overwritten by the empty strings in this file on the next build.

`ADMIN_EMAILS` is a comma-separated list. It is `marc@whpinc.com` for the current solo admin. There is no password and no broader role editor yet. The `memberships.role` column is there so a later per-network editor grant can be stored without a new table.

## MailerLite

In MailerLite, create these groups:

- One master group for every approved person, any network
- Business Leaders
- Builders
- Tourism
- Business Leaders approved
- Builders approved
- Tourism approved

Copy each group's id into the matching var. On approval the Worker adds the person to the account (the single subscriber list), the master group, that network's group, and that network's approved group. One person can be in several. Approval still completes if `MAILERLITE_API_KEY` is missing, and the application page says `MailerLite not configured`.

For each approved group, add an automation that sends when a subscriber joins the group. Set that automation's from name and from address in MailerLite. Paste the matching message from `docs/welcome-emails.md`. The Worker never picks a from address.

Deny does not remove someone from MailerLite.

## Sign-in email

Cloudflare Email Sending is onboarded for waltonleaders.org. Portal mail is sent from `Walton County Business Leaders <hello@waltonleaders.org>`.

Join and contact notices still go to marc@whpinc.com. Their Reply-To is the person who wrote in, so that address can be answered directly.

Magic links go to the member's own address. `wrangler.toml` sets `allowed_sender_addresses = ["hello@waltonleaders.org"]` and does not set `destination_address`, so the binding can mail any recipient. Reply-To on a sign-in link is hello@waltonleaders.org. The message includes a plain text part and an HTML part.

The login page always answers `If that email is approved, a link is on its way.` Requests are limited to 5 per email and 20 per IP address each hour. Tokens are stored as SHA-256 hashes, expire after 15 minutes, and work once. The session cookie is `HttpOnly`, `Secure`, and `SameSite=Lax`.

## Ingest

Builders and Tourism send:

`POST https://waltonleaders.org/api/hub/applications`

Header: `X-Hub-Key: <HUB_INGEST_KEY>`

```json
{
  "network": "builders",
  "name": "Ada Example",
  "email": "ada@example.com",
  "submitted_at": "2026-11-15T15:00:00.000Z",
  "source_url": "https://waltonbuildersnetwork.org/join",
  "fields": { "phone": "555-0100" }
}
```

`network` is `builders` or `tourism`. The body must be JSON, at most 64 KB, with string field values. Success is `201` and `{"ok":true,"id":"..."}`. A bad key is `401`. Invalid input is `400`. This is server to server, so the route does not send CORS headers.

## Still left before members can use it

- Replace the D1 placeholder id, create `walton-hub-media`, and apply migrations on the remote database.
- Set `HUB_INGEST_KEY` to the same value the Builders and Tourism workers send.
- Create the MailerLite groups, paste the welcome copy, and set each approved group's from name and from address.
- Set `MAILERLITE_API_KEY` and the group id vars.
- In Google Ads, conversion action primary and secondary settings are still changed in the Google Ads interface.
