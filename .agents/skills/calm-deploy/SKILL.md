---
name: calm-deploy
description: Use when you build, deploy, roll back or verify calm.ejmlabs.com, or change wrangler.jsonc, public/_headers, the CSP in index.html or tools/serve.ts, or what the build puts in dist.
---

# Deploying calm.ejmlabs.com

calm is a static site: Vite builds `dist`, and the Worker `calm` serves it as static assets at
calm.ejmlabs.com. What is live must be a merged main commit, built by the deploy workflow,
checked, and seen working in a headed browser. This adds the calm specifics to
`ejmlabs-cloudflare`; read it and its deploy and verify references first. Where they describe a
manual `wrangler deploy` with the owner's login, the CI flow below replaces it here.

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

## Deploy

A push to main runs `.github/workflows/deploy.yml`, the canonical caller of the shared
`ejmlabs/.github` workflow `deploy-site.yml`:

1. A build job (no secrets, `contents: read`) builds `dist` from that main commit.
2. A staging job then runs `wrangler deploy --env staging` automatically, to the Worker
   `calm-staging` at calm-staging.ejmlabs.com. Staging is public and serves the latest main.
3. A production job deploys the same built files with the top-level config, but only after the
   required reviewer (@everettmorgan) approves the run in the GitHub `production` environment.

Merge only after the local gate passed on the PR head. The staging deploy is part of finish
through ship. Production is approval-gated: approving the production job is the owner's deploy
authorization, so hand the user the run to approve. A newer merge cancels an older production
deploy that is still waiting. Deploy jobs run Wrangler 4.151.3, pinned in the shared repository,
with the `CLOUDFLARE_API_TOKEN` secret of the `staging` and `production` GitHub environments.
A manual `wrangler deploy` from a workstation is no longer the procedure.

## Check a build locally

A local build and dry run are still fine. Never build from a working checkout: it is often on a
feature branch with uncommitted work. `MERGE_SHA` is the full merge commit:
`gh pr view N --json mergeCommit --jq .mergeCommit.oid`.

```sh
work=$(mktemp -d)   # or the session scratch directory
git clone https://github.com/ejmlabs/ejm-calm.git "$work/ejm-calm"
git -C "$work/ejm-calm" checkout --detach MERGE_SHA
cd "$work/ejm-calm"
npm ci --ignore-scripts
npm test
npm run test:browser        # typechecks, builds dist, runs the browser smoke
find dist -type f | sort    # read the list the deploy publishes
WRANGLER_SEND_METRICS=false npx wrangler deploy --config wrangler.jsonc --dry-run
WRANGLER_SEND_METRICS=false npx wrangler deploy --config wrangler.jsonc --env staging --dry-run
```

Stop at the first failure. `package.json` pins wrangler, so `npx wrangler` runs the same
version as the deploy jobs.

## Verify live

Run these checks on calm-staging.ejmlabs.com after each merge, and on calm.ejmlabs.com after
approval.

- Bot protection answers curl and headless Chrome on the page with a 403 challenge, which is
  neither a pass nor a failure. Check the page in a headed browser.
- Open `/?seed=42` on the host at phone and desktop sizes: the scene draws, the
  seed stays in the URL, New seed, Share, Sound and About work, and the console shows nothing
  but the known beacon CSP errors.
- A missing path such as `/nope` returns `404.html` with status 404.
- Compare live headers with `dist/_headers`, for the page and one file under `/assets/`.
  In the headed page:
  `Object.fromEntries((await fetch(location.pathname, { cache: 'no-store' })).headers)`.
- Report the merge SHA, the deploy run, the previous and new version ids, the checks and their
  results, and what you saw live, in which browser.

## Roll back

Redeploy the last verified Worker version in Cloudflare, or approve an earlier run's
production job while it is still available. Then land a revert on main and approve its
production job, so main matches live.
