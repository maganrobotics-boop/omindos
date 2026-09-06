# Production cutover — 2026-09-06

- Owner: maganrobotics@gmail.com, the sole configured OA administrator.
- Canonical origin: https://oa.omindos.ai
- Cloudflare account: `41e8b3404be24e1dd288556d77ffc951`
- Worker service: `originmind-internal-oa-staging` (promoted to production, preserving existing OAuth secrets).
- Live Worker version: `a7d5cb07-caa5-4e39-b87d-31a3e0c62271`
- Live deployment: `88b07c57-8abc-4214-8017-acbd65158fe9`
- Production D1: `originmind-internal-oa-production`, `34af7e92-7da5-47cd-b7c0-1270e157c0e6`
- Custom domain: `40dacf9f15443059a2dc133bfc75005c3c28ffa7`

The production database was imported from the source frozen at 2026-09-06 11:06:42 UTC. The encrypted source snapshot contains 10 business tables and 180 rows. The original local Wrangler remote-D1 transport timed out without writing data. Read-only checks confirmed all 15 application tables remained empty. The same guarded import worker was then executed locally using Cloudflare's official D1 query batch REST transport. Schema, relationships, row counts and all table hashes passed; its atomic import guard was removed only after exact verification. Private encrypted archives, key files and receipts remain outside this Git repository.

Feishu login at the production domain successfully identified the owner's existing account, exposed the administrator navigation and displayed 13 passed documents, 10 active collaborators and 100% archive completion. No new approval, signature or business message was submitted for testing. Existing member roles and NDA evidence were preserved. The owner explicitly waived pre-migration external-account binding for the eight unbound active members.

The old source remains read-only. Source v64 (`218ecac522e907a2587f5894ab0b78befe8957e4`) adds a scoped redirect from oa.originmindos.com to oa.omindos.ai, enabled in environment revision 20. Public root and guide navigation were verified to redirect to the corresponding new address. Old POST bodies and OAuth query parameters are not forwarded. A cleanup request for the old platform registration of the new domain was rejected by automatic approval review; that registration remains, while the independently verified Cloudflare Worker binding serves the live domain. Its export flag is false, and export authentication key, public encryption key and window variables were removed in environment revision 19. This prevents two writable copies. The previous test D1 database is preserved separately. The previous production-domain CNAME was renamed `oa-migration-backup.omindos.ai` as a DNS configuration backup; it is not a supported user entry.

## Release and rollback constraints

The old staging release command is disabled for this Cloudflare account because it would overwrite the promoted service with the test database. Provision a separately named staging Worker before restoring staging automation. For a future production release, preserve the canonical origin, production DB ID, both existing OAuth secrets, administrator configuration, and the custom domain. Keep ChatGPT login and migration export disabled. Build and review an immutable artifact before updating the live service.

Do not blindly roll back to Worker version `4f993233-b1fe-4d3e-8a8c-d548a5ac9d7b`: that version binds the former test database. Do not restore the original source to writable mode after production has received new business writes without reconciling those writes first. The pre-import D1 recovery bookmark belongs to an empty database and is not a normal production rollback target.

Mainland-China operator connectivity, a new business approval/signature/PDF archive write, automatic Git deployment, docs/API services and independent email are not claimed as verified by this cutover.
