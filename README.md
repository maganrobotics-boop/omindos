# OMINDOS

Private monorepo for the website, OA, documentation and API.

| Service | Domain | Source status |
| --- | --- | --- |
| Website | omindos.ai | V1.5.8.1 supplied patch merged; meeting assistant removed |
| OA | oa.omindos.ai | Awaiting source; current service oa.originmindos.com unchanged |
| Documentation | docs.omindos.ai | Awaiting source |
| API | api.omindos.ai | Awaiting source |

Website source is in `apps/website`. It retains the original Cloudflare Pages `_worker.js` layout, language-cookie routing and dynamic Chinese/English/Japanese language switching. Existing pages and media are unchanged.

Version **V1.5.8.1**: the owner-supplied incremental patch has been merged into the V1.5.8 base. It places the website above the sales email in the contact section and footers. The patch Worker differs from the base only in the meeting status build-version constant; the cleaned Worker is retained so meeting functionality is not restored.

## Removed from website source

Meeting UI, translation/report endpoints, authentication code, recording handlers, meeting database schema creation, TURN settings references and OpenAI calls. Visitor statistics remain, with their optional `VISITS_DB` binding.

No production deployment, DNS changes, remote secret removal or database deletion has occurred. Existing Cloudflare settings must be inventoried before removing meeting-specific bindings; shared visit storage must be preserved.

## Validation

Run `node --test tests/website.test.mjs` with Node.js 22 or newer. These are local Worker-handler regression tests using an asset-binding mock, not a Cloudflare deployment or mainland-China connectivity test.
