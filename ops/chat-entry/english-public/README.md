# English website chat

The English website opens this first-party chat page in a separate window:
`https://omindos.cn/chat/assets/english-chat/index.html`.

The existing Chat service reads these three files from
`/opt/omindos-deploy/chat-current/chat-cloudflare/public/assets/english-chat/`.
Only `index.html`, `chat.js` and `chat.css` are deployed there. The existing
`/chat/` gateway and `/assets/` static route need no configuration change or
service restart. Stage the complete directory, check its hashes, and rename it
into place only when the destination is absent. A later update must retain a
copy of the previous directory before replacement.

The page imports the existing `/learning/platform-chat-scope.js` account guard.
It uses the original first-party session and expected-account header, verifies
the account before sending and before rendering, and clears its in-memory
conversation if the session changes. It does not store messages locally or
send conversation content to the English website. Existing service retention
and access rules still apply.

Requests use the existing `/learning/api/chat` schema. The visible question is
preserved; the submitted question adds an instruction to answer in English.
The service already supports an explicit language request. No new `language`
field, permission, CORS rule, credential, iframe exception or backend change is
needed. The first-party window preserves the existing SameSite cookie rules.

Run `node --test tests/english-chat-ui.test.mjs` to check session isolation,
stale-response suppression, cancellation, safe output and error recovery.
The website's main release workflow includes these tests. The website launcher
is maintained separately under `apps/website/en/assets/english-chat/`.
