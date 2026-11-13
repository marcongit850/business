# Walton County Business Leaders

The site at https://waltonleaders.org and https://www.waltonleaders.org is the Cloudflare Worker `business-preview`. Requests for www.waltonleaders.org redirect to https://waltonleaders.org.

HTML pages live in `src/index.js`. Styles, fonts, and images are loaded from jsDelivr at commit `a811ae3d19efdbfe03beea1f88df5a58ecf6c466` of this repository.

## Deploy

Merging to `main` does not publish the site. This Worker has no Workers Builds connection. Previous deploys were manual script uploads.

From this directory, with Wrangler logged in to the Cloudflare account that owns `business-preview`:

```bash
npx wrangler deploy
```

That uploads `src/index.js`. Leave the existing custom domains `waltonleaders.org` and `www.waltonleaders.org` attached to the Worker.

## Checks

```bash
npm test
```
