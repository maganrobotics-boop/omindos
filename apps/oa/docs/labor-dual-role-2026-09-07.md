# Labor review by one explicitly configured owner

When the same person is configured as both project owner and finance owner, a labor request previously stopped after the suggested amount: finance routing excluded the project owner, and final review required three distinct accounts. The user authorized this narrow exception on 2026-09-07.

The two stages remain separate. Project review saves the suggested amount and basis and moves the request to finance review. A second action supplies the final amount; changing it still requires an explanation. Each action creates its own audit event and immutable revision. Both amount records retain the authenticated account subject.

Combining these stages requires the same verified account to appear explicitly in both `OA_PROJECT_OWNER_EMAILS`/`OA_PROJECT_OWNER_NAMES` and `OA_FINANCE_OWNER_EMAILS`/`OA_FINANCE_OWNER_NAMES`. Administrator fallback alone is insufficient. The requester still cannot approve their own application. Technical, procurement, confidentiality and independently assigned finance workflows retain their existing rules.

Production maps both explicit role lists to the existing administrator, `maganrobotics@gmail.com`, using the same configured name as `OA_ADMIN_NAMES`. Existing member records retain their reviewed display names. No database migration, business-data rewrite, identity merge or OAuth secret replacement is required.

## Verification

`tests/labor-dual-role.test.mjs` runs the real PATCH route and Drizzle queries against an in-memory SQLite database with all application migrations and triggers. Authenticated identities are fixtures. It covers two separate confirmations, audit and revision retention, PDF generation, replay rejection, independent finance review, missing/revoked role configuration, account-subject mismatch, self-review rejection, changed-amount explanations, and unchanged technical/procurement separation.

The full suite passed 221/221 tests, including all eight dual-role tests; TypeScript checking, ESLint and the explicit production build passed. The existing migration-export test double was updated to support the metadata read already performed by the production exporter. Production migration behavior remains unchanged and disabled. No synthetic approval, signature or payment was created in production.

Production updates must preserve the existing service `originmind-internal-oa-staging`, D1 `34af7e92-7da5-47cd-b7c0-1270e157c0e6`, `https://oa.omindos.ai`, both OAuth secrets and enabled Feishu PDF archiving. Build using an explicit production configuration, validate the immutable artifact, and deploy without running the retired staging release or applying migrations.

The pre-change production version is `a7d5cb07-caa5-4e39-b87d-31a3e0c62271`; it uses the correct production database and can restore the previous rule if needed. Older staging versions must not be used for rollback.

## Production receipt

- Published: 2026-09-07 06:36:32 UTC (14:36:32 Asia/Shanghai).
- Application source commit: `d77d5622cd91991c667ff990657eb240d7e20e9d`.
- Worker version: `e68bb03d-ffa5-4ef5-95f8-1daa7dc5e6c3`, serving 100% of traffic.
- Deployment: `d3478d9c-684b-4c09-afba-f1e6830a2e7c`.
- Artifact: `.wrangler/releases/production-dual-role-d77d562-r2/dist/server/wrangler.json` (local, ignored). The obsolete generated `legacy_env: true` field was removed for Wrangler 4.129; compiled application files were unchanged. The strict dry run and deployment passed. All 89 artifact file hashes were unchanged after deployment.
- Remote settings verified the four explicit role variables and preserved every existing non-asset binding, including production D1, OAuth secret names, login flags and Feishu archive settings.
- Public root, guide and session endpoint returned HTTP 200. Unauthenticated approval list, detail and PDF requests returned HTTP 401. Feishu login remains enabled; ChatGPT login and migration export remain disabled.
- Post-release read-only D1 checks found 14 archived approvals, one voided approval and 11 active members (12 member rows in total). The previously verified post-cutover NDA remains archived. No D1 data writes or migrations were performed for this release.
- The existing owner session and archived document were verified before this update. The browser automation connection timed out during post-release UI checks, so authenticated UI regression after this release is not claimed. No production labor request or real financial approval was submitted for testing.
