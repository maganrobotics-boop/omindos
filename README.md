# OMINDOS

Private monorepo for the website, OA, documentation and API.

| Service | Domain | Source status |
| --- | --- | --- |
| Website | omindos.ai | V1.5.8.1 supplied patch merged; meeting assistant removed |
| OA | oa.omindos.ai | v58 saved source imported into apps/oa; independent migration pending |
| Documentation | docs.omindos.ai | Awaiting source |
| API | api.omindos.ai | Awaiting source |

Website source is in `apps/website`. It retains the original Cloudflare Pages `_worker.js` layout, language-cookie routing and dynamic Chinese/English/Japanese language switching. Existing pages and media are unchanged.

Version **V1.5.8.1**: the owner-supplied incremental patch has been merged into the V1.5.8 base. It places the website above the sales email in the contact section and footers. The patch Worker differs from the base only in the meeting status build-version constant; the cleaned Worker is retained so meeting functionality is not restored.

## Removed from website source

Meeting UI, translation/report endpoints, authentication code, recording handlers, meeting database schema creation, TURN settings references and OpenAI calls. Visitor statistics remain, with their optional `VISITS_DB` binding.

Website deployed to the new Cloudflare Pages project `omindos-website` in the owner account on 2026-09-06: https://omindos-website.pages.dev . Deployment ID: `0785558a-b062-4155-a4bf-c4350d73ab7c`, source commit `fceb5ec`. Nine live localized routes passed, and three former meeting URLs returned 404. This is a direct upload of the GitHub source; automatic Git deployment is not configured. Custom-domain DNS, OA migration, remote legacy meeting cleanup and independent mailboxes are pending. Visitor statistics have no VISITS_DB binding in the new project and return an unavailable state until storage is configured. Existing Cloudflare settings must be inventoried before removing meeting-specific bindings; shared visit storage must be preserved.

## Validation

Run `node --test tests/website.test.mjs` with Node.js 22 or newer. These are local Worker-handler regression tests using an asset-binding mock, not a Cloudflare deployment or mainland-China connectivity test.

## OA migration

`apps/oa` contains the exact tracked source of saved Sites v58 (`e4a509cbfc1f1ae160ed594571084a018c435195`), plus source provenance metadata. This does not assert that v58 is the current production deployment. Existing OA hosting and data have not been switched. The standalone staging Worker and its separate D1 database already exist; both need version and data verification before release. Source business data, migration credentials and OAuth secrets must never be committed. The original Sites manifest is retained as provenance; the user-requested target is independent Cloudflare hosting.
