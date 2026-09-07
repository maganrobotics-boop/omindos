# OMINDOS

Private monorepo for the website and OA. Documentation and API have separate private repositories reserved for future application code.

| Service | Domain | Source status |
| --- | --- | --- |
| Website | omindos.ai | V1.5.8.1 supplied patch merged; meeting assistant removed |
| OA | oa.omindos.ai | Live on independent Cloudflare Workers/D1; Feishu administrator login verified |
| Documentation | docs.omindos.ai | Private empty repository [omindos-docs](https://github.com/maganrobotics-boop/omindos-docs); program will be pushed later |
| API | api.omindos.ai | Private empty repository [omindos-api](https://github.com/maganrobotics-boop/omindos-api); program will be pushed later |

Website source is in `apps/website`. It retains the original Cloudflare Pages `_worker.js` layout, language-cookie routing and dynamic Chinese/English/Japanese language switching. Existing pages and media are unchanged.

Version **V1.5.8.1**: the owner-supplied incremental patch has been merged into the V1.5.8 base. It places the website above the sales email in the contact section and footers. The patch Worker differs from the base only in the meeting status build-version constant; the cleaned Worker is retained so meeting functionality is not restored.

## Removed from website source

Meeting UI, translation/report endpoints, authentication code, recording handlers, meeting database schema creation, TURN settings references and OpenAI calls. Visitor statistics remain, with their optional `VISITS_DB` binding.

Website deployed to the new Cloudflare Pages project `omindos-website` in the owner account on 2026-09-06: https://omindos-website.pages.dev . Latest verified deployment ID: `5c32a4d0-b28b-4cdf-9371-4845081ce7de`, source commit `d1397dd70234c2ec7543d17874a0154dc5ac1b35`. Nine live localized routes passed, and three former meeting URLs returned 404. Automatic website deployment is active through GitHub Actions using Wrangler Direct Upload. The first push-triggered [Deploy website run](https://github.com/maganrobotics-boop/omindos/actions/runs/34081030685) passed its 13 regression tests, deployment, production commit/binding checks and 16 live route checks on 2026-09-07. Changes to `apps/website` on `main` now publish automatically; pull requests only run tests. See [website deployment](docs/website-deployment.md). The custom website domain https://omindos.ai and HTTPS are active. Chinese, English and Japanese work at the same root URL. The old website originmindos.com and www.originmindos.com redirect to the new root. Independent OA migration is complete; remote legacy meeting cleanup remains pending. Visitor statistics are bound to the dedicated D1 database `omindos-website-visits` (`3651ff92-d9fb-45aa-9d1d-623d25bf3459`) through `VISITS_DB`. The existing schema was applied, the website was redeployed without source changes, and the live `/api/visits` endpoint returns HTTP 200 with `enabled: true`. Counts begin after migration; old historical counts have not been transferred. Existing Cloudflare settings must be inventoried before removing meeting-specific bindings; shared visit storage must be preserved.

## Validation

Run `node --test tests/website.test.mjs` with Node.js 22 or newer. These are local Worker-handler regression tests using an asset-binding mock, not a Cloudflare deployment or mainland-China connectivity test.

## OA production migration

The OA is live at https://oa.omindos.ai on the owner's independent Cloudflare account. The existing Worker service `originmind-internal-oa-staging` was promoted to production to preserve its configured Feishu/GitHub secrets. Its name is historical: **do not run the former staging release against it**. A release guard now rejects that account before any command can mutate Cloudflare.

The production D1 database `originmind-internal-oa-production` is separate from the preserved old test database. All 10 business tables and 180 rows were imported atomically, and all table hashes, the schema fingerprint and approval chains were verified. The administrator signed in through Feishu at the real OA domain: 13 approved documents, 10 active collaborators and 100% archive completion were displayed. ChatGPT login is disabled. The configured administrator is the owner alone; existing business roles, NDA evidence and member history were preserved.

Source v58 (`e4a509cbfc1f1ae160ed594571084a018c435195`) plus three guide Link fixes supplies the production business artifact. The original source was temporarily updated to v63 for migration export compatibility. That original deployment remains read-only as a rollback copy; its export entry is disabled and the temporary export credentials were removed. GitHub source includes subsequent migration-tool compatibility fixes. See `apps/oa/SOURCE_VERSION.json` and `apps/oa/docs/production-cutover-2026-09-06.md` for the production identifiers and verification limits.

The old OA address oa.originmindos.com now redirects to oa.omindos.ai. The owner requested two independent empty repositories for documentation and API, with application code to be pushed later. `omindos-docs` is mapped to `docs.omindos.ai`, and `omindos-api` to `api.omindos.ai`; both are private, empty and have their matching domain recorded in GitHub repository settings. No application is deployed at those two domains yet. See [repository and domain mapping](docs/service-domains.md). Feishu Mail is enabled for omindos.ai with verified MX/SPF and 2048-bit DKIM (selector feishu2609070851). Member mailboxes magan@omindos.ai and liuyanqing@omindos.ai were verified in the respective member records. The separate public mailbox sales@omindos.ai was created with the owner as its sole member; no alias or third-party IMAP/SMTP service was enabled. Actual external message delivery has not been tested. The 2026-09-07 ITDOG HTTPS test returned HTTP 200 from 247/251 mainland nodes for the website and 246/251 for OA; a few carrier nodes timed out or failed. This is public-entry reachability, not a complete Feishu sign-in test from each node. The website deploys automatically from GitHub Actions. OA retains its separate controlled production release process. Source business data, migration credentials and OAuth secrets must never be committed.
