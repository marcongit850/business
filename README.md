# Walton County Business Leaders

The site at https://waltonleaders.org and https://www.waltonleaders.org is the Cloudflare Worker `business-preview`. Requests for www.waltonleaders.org redirect to https://waltonleaders.org.

HTML pages live in `src/index.js`. Styles, fonts, and images are loaded from jsDelivr at commit `a811ae3d19efdbfe03beea1f88df5a58ecf6c466` of this repository.

## Deploy

Merging to `main` publishes the site through Cloudflare Workers Builds. The build runs `npx wrangler deploy` for the Worker `business-preview`. Leave the existing custom domains `waltonleaders.org` and `www.waltonleaders.org` attached to the Worker.

The member hub needs a D1 database and a private R2 bucket before that deploy can succeed. The ids in `wrangler.toml` are placeholders until then. Setup, MailerLite, and the sign-in email limit are in `docs/member-hub.md`. Application thank-you mail and MailerLite approval copy are in `docs/welcome-emails.md`.

## Checks

```bash
npm test
npm run check
```
