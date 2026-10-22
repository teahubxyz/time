# quc

App shell + API in one Cloudflare Worker (`src/worker.js`), live at https://quc.yolopreneur.lol/. No dependencies, no build step.

- `npm start` serves it on :8787; `npm test` runs the tests; `npm run deploy` (needs `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) deploys and waits for `/api/health`.
- `GET /api/health` → `{ok, rev}`. `GET /chair.svg` is the chair-in-the-corner motif (also inlined in the shell).

## Pipeline (needs a human: workers can't edit `.github/workflows`)

Add `.github/workflows/quc.yml`:

```yaml
name: quc
on:
  push: { branches: [main], paths: ["quc/**"] }
  workflow_dispatch:
permissions: { contents: read }
jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 6
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm test --prefix quc
      - run: python3 quc/deploy.py
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}   # still "missing" in SECRETS.md
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

and, in `ci.yml`, `- run: npm test --prefix quc` so PRs run the quc tests.
