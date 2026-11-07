# Walton County Business Leaders

Preview homepage for Walton County Business Leaders, an independent professional membership organization for owners, entrepreneurs, and executives in Walton County, Florida.

This repository is a homepage preview. It is not a production site. Membership is described on the page, and there is no join account or member directory.

## Preview locally

```bash
npm install
npm run dev
```

Wrangler serves the site at http://localhost:8787.

## Deploy

`wrangler.toml` names the Worker `business-preview`. Publish that Worker only. Do not add a route or a custom domain.

```bash
npx wrangler deploy
```

Expected preview URL: https://business-preview.352marc.workers.dev

## What this preview includes

The homepage has a header, hero, purpose statement, the eight advocacy priorities, two featured issue cards, a free-membership band, and a short footer. Wording for the organization is taken from the November 6, 2026 brief.

Join buttons go to `/join`, a membership application. Membership is free, and applications require administrator approval. The footer Contact button opens a message form. Both forms are emailed to the verified destination in `wrangler.toml`. There is no member login, directory, newsroom, calendar, or admin.

Cormorant Garamond and Source Sans 3 are included under the SIL Open Font License. See `public/fonts/OFL.txt`.
