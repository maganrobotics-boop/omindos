# Official website PWA

The Chinese and English official pages link their own manifest and share a
small installation controller. The installation entry appears in the footer.
Browsers offering `beforeinstallprompt` can show the native install dialog after
a user click. Other browsers get localized instructions. Only `appinstalled`
or standalone display mode hides the entry.

The service worker stores only fixed PWA icons and offline pages. It never
stores website HTML, account pages, course progress, API responses or video.
The public document allowlist only provides a localized fallback on network
failure. All business paths and other origins pass through without interception.
New workers wait normally; they do not reload tabs or interrupt active forms.

## Source and validation

`python3 scripts/prepare-website-pwa.py apps/website` adds hooks idempotently to
the public Chinese and English index documents. An optional `cn` or `en`
argument limits the operation. Writes replace inodes, so a hard-linked release
candidate does not modify production.

Run `node --test tests/website-pwa.test.mjs`, the existing website checks and
international artifact checks. On a browser, check the footer installation
guide, narrow-screen wrapping, manifest, worker scope and offline page. Real
Android/iOS desktop installation requires actual-device acceptance.

## Domestic release

Copy the current `/var/www/omindos.cn/current` release to a candidate, preserving
unrelated pages and media. Copy only `pwa/`, then run the hook script with `cn`.
Include `ops/pwa/nginx.conf` in the existing Chinese HTTPS server; it gives
`/pwa/sw.js` root service-worker scope and revalidation headers. Test Nginx and
verify the candidate before an atomic symlink switch. Record the old symlink,
configuration hashes and the source commit. The international Worker has the
same header behavior; deploying `.ai` is a separate release.

## Rollback

Restore the old documents atomically. Keep `/pwa/sw.js` available as a retiring
worker: on activation, delete only caches starting `originmind-website-pwa-`,
unregister its own registration, and use no fetch handler. A retiring worker
may call `skipWaiting()` to retire the PWA logic promptly, without reloading
open tabs. Retain the PWA asset route while existing clients retire; do not
delete Learning or other application caches. Removing the entire script while
clients still have an active worker is an incomplete rollback.
