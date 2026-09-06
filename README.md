# OMINDOS

Private monorepo for the website, OA, documentation and API.

| Service | Domain | Source status |
| --- | --- | --- |
| Website | omindos.ai | V1.5.8.1 supplied patch merged; meeting assistant removed |
| OA | oa.omindos.ai | Live on independent Cloudflare Workers/D1; Feishu administrator login verified |
| Documentation | docs.omindos.ai | Empty project reserved in apps/docs; program will be pushed later |
| API | api.omindos.ai | Empty project reserved in apps/api; program will be pushed later |

Website source is in `apps/website`. It retains the original Cloudflare Pages `_worker.js` layout, language-cookie routing and dynamic Chinese/English/Japanese language switching. Existing pages and media are unchanged.

Version **V1.5.8.1**: the owner-supplied incremental patch has been merged into the V1.5.8 base. It places the website above the sales email in the contact section and footers. The patch Worker differs from the base only in the meeting status build-version constant; the cleaned Worker is retained so meeting functionality is not restored.

## Removed from website source

Meeting UI, translation/report endpoints, authentication code, recording handlers, meeting database schema creation, TURN settings references and OpenAI calls. Visitor statistics remain, with their optional `VISITS_DB` binding.

Website deployed to the new Cloudflare Pages project `omindos-website` in the owner account on 2026-09-06: https://omindos-website.pages.dev . Deployment ID: `0785558a-b062-4155-a4bf-c4350d73ab7c`, source commit `fceb5ec`. Nine live localized routes passed, and three former meeting URLs returned 404. This is a direct upload of the GitHub source; automatic Git deployment is not configured. The custom website domain https://omindos.ai and HTTPS are active. Chinese, English and Japanese work at the same root URL. The old website originmindos.com and www.originmindos.com redirect to the new root. Independent OA migration is complete; remote legacy meeting cleanup and independent mailboxes remain pending. Visitor statistics have no VISITS_DB binding in the new project and return an unavailable state until storage is configured. Existing Cloudflare settings must be inventoried before removing meeting-specific bindings; shared visit storage must be preserved.

## Validation

Run `node --test tests/website.test.mjs` with Node.js 22 or newer. These are local Worker-handler regression tests using an asset-binding mock, not a Cloudflare deployment or mainland-China connectivity test.

## OA production migration

The OA is live at https://oa.omindos.ai on the owner's independent Cloudflare account. The existing Worker service `originmind-internal-oa-staging` was promoted to production to preserve its configured Feishu/GitHub secrets. Its name is historical: **do not run the former staging release against it**. A release guard now rejects that account before any command can mutate Cloudflare.

The production D1 database `originmind-internal-oa-production` is separate from the preserved old test database. All 10 business tables and 180 rows were imported atomically, and all table hashes, the schema fingerprint and approval chains were verified. The administrator signed in through Feishu at the real OA domain: 13 approved documents, 10 active collaborators and 100% archive completion were displayed. ChatGPT login is disabled. The configured administrator is the owner alone; existing business roles, NDA evidence and member history were preserved.

Source v58 (`e4a509cbfc1f1ae160ed594571084a018c435195`) plus three guide Link fixes supplies the production business artifact. The original source was temporarily updated to v63 for migration export compatibility. That original deployment remains read-only as a rollback copy; its export entry is disabled and the temporary export credentials were removed. GitHub source includes subsequent migration-tool compatibility fixes. See `apps/oa/SOURCE_VERSION.json` and `apps/oa/docs/production-cutover-2026-09-06.md` for the production identifiers and verification limits.

The old OA address oa.originmindos.com now redirects to oa.omindos.ai. The owner requested empty projects for documentation and API, with application code to be pushed later. Their domains are reserved under the existing zone; no service or placeholder deployment is published. Two independent mailboxes, automatic Git deployment and real mainland-China connectivity checks remain outstanding. Source business data, migration credentials and OAuth secrets must never be committed.
