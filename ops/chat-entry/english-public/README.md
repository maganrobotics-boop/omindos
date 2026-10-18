# English website chat

The English website opens a retained same-origin chat panel by default, with
explicit Fullscreen, Small window and Collapse controls. Its local assets are
under `apps/website/en/assets/english-chat/`. The existing first-party standalone
page remains available as the recovery link or a modified click:
`https://omindos.cn/chat/assets/english-chat/index.html?v=20261018-2`.

The existing Chat service reads these four files from
`/opt/omindos-deploy/chat-current/chat-cloudflare/public/assets/english-chat/`.
Only `index.html`, `chat.js`, `chat.css` and `account-link.js` are deployed there. The existing
`/chat/` gateway and `/assets/` static route need no configuration change or
service restart. Stage the complete directory, check its hashes, and rename it
into place only when the destination is absent. A later update must retain a
copy of the previous directory before replacement.

The existing domestic static route uses a one-year immutable cache. Each release must
bump the entry URL version in the English website launcher and the matching
query versions on `chat.css`, `chat.js` and `account-link.js` inside `index.html`.
Keep the service cache policy unchanged.

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
needed for the standalone page. That first-party window preserves the existing
SameSite cookie rules.

The international panel uses the same tested question/response UI with only its
API and scope-import paths changed. Its `/api/english-chat/session` and
`/api/english-chat` endpoints map a dedicated HttpOnly, Secure, SameSite=Lax
guest cookie to the existing domestic account broker. The proxy checks guest
kind on every request, verifies the expected account before sending a question,
and never forwards domestic login cookies or Authorization headers. Private
accounts, arbitrary upstream URLs, cross-origin calls and additional API routes
are rejected. Domestic framing, CORS, cookie policies and the 25/h upstream
chat limit remain in force. The gateway forwards only a well-formed expected
account comparison header; the backend still owns authentication. Deploy this
small gateway fix from the current live gateway, preserving subsequent live
subtitle work, before verifying international chat.

The embedded `panel.html` is noindex and permits only same-origin framing. The
panel retains one iframe across size changes and collapse/reopen. Navigation
restoration reconnects the document after BFCache; it does not persist messages
in browser storage. Each English HTML page loads a fresh version of the site
bootstrap so existing immutable caches receive the panel controls.

The local `account-link.js` moves the original shared account anchor into the
header beside New chat and labels it “My account”. It preserves the link target
and click behavior, and handles delayed injection, replacement and later label
updates. Page-local styles remove the injected fixed positioning and keep the
two actions together on narrow screens. The shared account script and identity
guard are unchanged.

Run `node --test tests/english-chat-ui.test.mjs` to check session isolation,
stale-response suppression, cancellation, safe output and error recovery.
The same suite checks delayed account-link injection and local English labels.
The website's main release workflow includes these tests. The website launcher
is maintained separately under `apps/website/en/assets/english-chat/`.
