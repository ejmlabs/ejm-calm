---
name: calm-deploy
description: Use when you build, deploy, roll back or verify calm.ejmlabs.com, or change wrangler.jsonc, public/_headers, the CSP in index.html or tools/serve.ts, or what the build puts in dist.
---

# Deploying calm.ejmlabs.com

calm is a static site: Vite builds `dist`, and the Worker `calm` serves it as static assets at
calm.ejmlabs.com. What is live must be a merged main commit, built in a clean clone, checked,
and seen working in a headed browser. This adds the calm specifics to `ejmlabs-cloudflare`;
read it and its deploy and verify references first.

## Headers and CSP

- The CSP lives in three places that must agree: `public/_headers`, the meta tag in
  `index.html`, and `CSP` and `CSP_HEADER` in `tools/serve.ts`. The header adds
  `frame-ancestors 'none'`, which a meta tag cannot set. `tests/deploy.test.ts` checks them.
- Every source is `'self'`, and `font-src` is `'none'`. Never add another origin. The CSP
  blocks the zone's injected Cloudflare Web Analytics beacon, which shows console errors.
  Turning injection off for this host is the owner's call (`FOLLOWUP.md`). Never allow it.
- `/assets/*` is hashed and immutable. The build ships only `index.html`, `assets/`,
  `LICENSE`, `THIRD_PARTY_NOTICES`, `_headers` and the icons; `tests/deploy.test.ts` fails on
  anything else, on source maps or TypeScript, and on inline scripts.

## Build in a scratch directory

Deploy only from main after the PR merged with the local gate passed. Deploys are part of
finish through ship here; this repository does not mark them approval-gated. Never build from
a local checkout: it is often on a feature branch with uncommitted work. `MERGE_SHA` is the full
merge commit: `gh pr view N --json mergeCommit --jq .mergeCommit.oid`.

```sh
work=$(mktemp -d)   # or the session scratch directory
git clone https://github.com/ejmlabs/ejm-calm.git "$work/ejm-calm"
git -C "$work/ejm-calm" checkout --detach MERGE_SHA
cd "$work/ejm-calm"
npm ci --ignore-scripts
npm test
npm run test:browser        # typechecks, builds dist, runs the browser smoke
find dist -type f | sort    # read the list before you deploy it
```

Stop at the first failure.

## Deploy

From the scratch clone's root, where `wrangler.jsonc` is:

```sh
export WRANGLER_SEND_METRICS=false
wrangler whoami                                   # the account that serves calm
wrangler deployments list --config wrangler.jsonc # record the live version id
wrangler deploy --config wrangler.jsonc --dry-run
wrangler deploy --config wrangler.jsonc
```

- wrangler is not pinned in `package.json` yet. Use wrangler 4 from PATH and record
  `wrangler --version`.
- The config sets no `account_id` yet. If `deployments list` does not show the live `calm`
  Worker, or wrangler asks which account to use, stop and ask the user.
- Record the `Current Version ID` wrangler prints. If wrangler asks to replace a DNS record or
  is not logged in, stop and hand the user the command (see `ejmlabs-cloudflare`).

## Verify live

- Bot protection answers curl and headless Chrome on the page with a 403 challenge, which is
  neither a pass nor a failure. Check the page in a headed browser.
- Open `https://calm.ejmlabs.com/?seed=42` at phone and desktop sizes: the scene draws, the
  seed stays in the URL, New seed, Share, Sound and About work, and the console shows nothing
  but the known beacon CSP errors.
- Compare live headers with `dist/_headers`, for the page and one file under `/assets/`.
  In the headed page:
  `Object.fromEntries((await fetch(location.pathname, { cache: 'no-store' })).headers)`.
- Report the merge SHA, the wrangler version, the previous and new version ids, the checks
  and their results, and what you saw live, in which browser.

## Roll back

`wrangler rollback VERSION_ID --config wrangler.jsonc --message "..."` restores the last
verified version. Then land a revert on main and deploy it, so main matches live.

## Known gaps against ejmlabs-cloudflare

Fix each in its own reviewed change, never inside a deploy: no `account_id` in
`wrangler.jsonc`, no `not_found_handling` or 404 page, wrangler not pinned as a devDependency,
and `public/_headers` sets no page `Cache-Control`, `upgrade-insecure-requests` or
`includeSubDomains` from the shared baseline.
