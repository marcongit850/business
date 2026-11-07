# Walton County Business Leaders

Preview homepage for Walton County Business Leaders, an independent professional membership organization for owners, entrepreneurs, and executives in Walton County, Florida.

This repository is a design preview. It is not a production site. Membership applications are not open, and the page does not collect information.

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

The homepage has a header, hero, purpose statement, the eight advocacy priorities, two illustrative issue cards, a free-membership band, and a footer. Wording is taken from the November 6, 2026 brief. The issue cards are layout samples, not official positions.

About, Issues, News, Calendar, and Join stay on this page. Join scrolls to the membership band. There is no application form, account, directory, newsroom, calendar, or admin.

Cormorant Garamond and Source Sans 3 are included under the SIL Open Font License. See `public/fonts/OFL.txt`.
