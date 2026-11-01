---
name: calm-deploy
description: Use when you build, deploy, roll back or verify calm.ejmlabs.com or staging.calm.ejmlabs.com, or change wrangler.jsonc, public/_headers, the CSP in index.html or tools/serve.ts, or what the build puts in dist.
---

# Deploying calm.ejmlabs.com

calm is a static site: Vite builds `dist`, and a Worker serves it as static assets. A merge to
main deploys it through the shared ejmlabs pipeline, staging first, then production. How that
pipeline runs, what it refuses, how to follow a run and what to do when one fails are in
[ci-deploys.md](../ejmlabs-cloudflare/references/ci-deploys.md); read it and the rest of
`ejmlabs-cloudflare` first. This skill holds only calm's facts.

## Site facts

| | Staging | Production |
| --- | --- | --- |
| Host | staging.calm.ejmlabs.com | calm.ejmlabs.com |
| Worker | `calm-staging` | `calm` |
| Config | `env.staging` in `wrangler.jsonc` | top level of `wrangler.jsonc` |

- The pipeline builds with `npm ci --ignore-scripts` and `npm run build` (the `ejm-calm` entry in
  `SITES` in `scripts/deploy.py` of `ejmlabs/.github`) and publishes `dist`.
- `wrangler.jsonc` names the account. Staging keeps its own Worker name and route; without them
  `--env staging` would deploy onto the production domain, and the pipeline refuses that.
- Never run `wrangler deploy` from a workstation while `.github/workflows/deploy.yml` exists.

## Headers and CSP

- The CSP lives in three places that must agree: `public/_headers`, the meta tag in
  `index.html`, and `CSP` and `CSP_HEADER` in `tools/serve.ts`. The header adds
  `frame-ancestors 'none'`, which a meta tag cannot set. `tests/deploy.test.ts` checks them.
- Every source is `'self'`, and `font-src` is `'none'`. Never add another origin. The CSP
  blocks the zone's injected Cloudflare Web Analytics beacon, which shows console errors.
  Turning injection off for this host is the owner's call (`FOLLOWUP.md`). Never allow it.
- `/assets/*` is hashed and immutable. Pages get Cloudflare's own
  `public, max-age=0, must-revalidate`; a `/*` Cache-Control rule would join the immutable one.
- The build ships only `index.html`, `404.html`, `assets/`, `LICENSE`, `THIRD_PARTY_NOTICES`,
  `_headers` and the icons; `tests/deploy.test.ts` fails on anything else, on source maps or
  TypeScript, and on inline scripts.

## Before the merge

On the PR head, after the gate ([calm-verify](../calm-verify/SKILL.md)), read the published list
and dry-run both environments:

```sh
npm run build
find dist -type f | sort
export WRANGLER_SEND_METRICS=false
npx --no-install wrangler deploy --config wrangler.jsonc --env "" --dry-run
npx --no-install wrangler deploy --config wrangler.jsonc --env staging --dry-run
```

A dry run checks the config and the packaging only.

## Verify live

Check staging when its job finishes, then production when its job finishes.

- Bot protection answers curl and headless Chrome on the page with a 403 challenge, which is
  neither a pass nor a failure. Check the page in a headed browser.
- Open `/?seed=42` at phone and desktop sizes: the scene draws, the seed stays in the URL,
  New seed, Share, Sound and About work, and the console shows nothing but the known beacon CSP
  errors.
- A missing path such as `/nope` returns `404.html` with status 404.
- Compare live headers with `dist/_headers`, for the page and one file under `/assets/`.
  In the headed page:
  `Object.fromEntries((await fetch(location.pathname, { cache: 'no-store' })).headers)`.
- Report the merge SHA, the run URL, the `Current Version ID` of each deploy job, and what you
  saw live on each host, in which browser.

## Roll back

Follow the rollback in [ci-deploys.md](../ejmlabs-cloudflare/references/ci-deploys.md):
`npx wrangler rollback VERSION_ID --config wrangler.jsonc --message "..."` for production, with
`--env staging` for staging, then land a revert on main, which deploys through the pipeline.
