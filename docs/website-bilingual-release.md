# Official bilingual website release — 2026-09-09

The owner authorized publishing the approved bilingual website to omindos.ai.
The reviewed source is the OriginMind Sites build at commit
`8c1f7e9e2135d32ab63aece6f638612f1caf9f5b`.

- Thirty content pages: fifteen in Chinese at `/cn/`, fifteen in English at `/en/`.
- Automatic entries choose Chinese for a preferred Chinese browser language;
  otherwise English. Explicit language paths always take precedence.
- Navigation has no visible language selector. Chinese and English legacy
  language query links still work. Japanese pages and controls were removed on 2026-09-10; the former `/ja/` entry redirects to English.
- Approved media, product availability, prototype labels and specifications are
  retained. The OEM application, brochure downloads, visitor statistics, domain
  redirects and verification file remain in place.
- The 93.67-second open-frame demonstration uses a web-compressed H.264/AAC
  copy (1280 × 720, 10.86 MB) to fit the publishing transport limit. Its full
  framing and duration are retained; the approved original remains in Sites.
- Production canonical URLs, social metadata and sitemap replace preview
  noindex settings on the thirty content pages. The existing robots policy stays.
- No change to OA, database schemas, DNS or secret bindings.

`node --test tests/website.test.mjs` checks new routing and existing application
behavior. The existing deployment workflow publishes `apps/website` and runs
`scripts/verify-website-live.mjs` against the canonical domain after deployment.

For a future approved portal import, run
`python3 scripts/prepare-bilingual-website.py /absolute/path/to/approved/dist`,
then run the tests. Generated HTML and media are checked in for the existing
static deployment flow. Do not copy preview hosting configuration into production.

Rollback point: official main `6fd37bd614bd5253f22c1d7eecf9cb4bd3479e33`.
Revert this release commit to restore the prior website through the same workflow.
