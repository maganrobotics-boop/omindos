# Domain and HTTPS maintenance — 2026-10-09

## Applied service changes

- Tencent: `www.omindos.cn` permanently redirects to `omindos.cn`, preserving the path and query. HTTP redirects use the fixed canonical hostname.
- Aliyun: OA and chat HTTP requests redirect to their HTTPS origins. Existing enterprise WeChat ownership verification files remain reachable over HTTP; ACME challenges use `/var/www/originmind-acme`.
- OA and chat HTTPS responses include HSTS for their own hosts. No `includeSubDomains` or preload was added.
- OA and chat now share the existing-account Let's Encrypt certificate at `/etc/letsencrypt/live/originmind-services/`. It expires on 2027-01-07 at 01:46:09 UTC.
- `certbot.timer` is enabled. The deploy hook validates Nginx and reloads it after renewal. A renewal dry run with deploy hooks passed. The first staging attempt hit a secondary-validation connection timeout; the immediate repeat passed.

Public checks passed for OA, chat, `/learning/`, `/arena/`, WeChat verification files, HTTPS redirects and the Chinese www redirect. These checks cover entry pages, not authenticated business transactions.

## Rollback

Each server retains its original configuration and deployment receipt in the root-only directory `/opt/omindos-domain-maintenance/20261009-https-canonical/`.

On Aliyun, `originmind-services.conf.original` is the original configuration and `certificate-activation.original` is the HTTPS-hardened configuration before certificate activation. The previous manual certificates were retained. On Tencent, `omindos-cn.original` is the original site configuration. Before any restore, compare the current configuration with the saved receipt so later edits are not overwritten; validate with `/usr/sbin/nginx -t`, then reload Nginx.

## Settings still awaiting console access

The `.cn` parent delegation currently lists both AliDNS and DNSPod nameservers. Both provide the same public web addresses, but only AliDNS supplies the observed Tencent enterprise-mail MX records. Export and compare the complete zones before consolidating delegation to one provider. Check registrar expiry and auto-renewal in the registrar console; certificate expiry is a separate setting.

The old `originmindos.cn` redirect currently reaches the English entry. Its zone redirect should point to `https://omindos.cn/` after console access is available. Preserve useful legacy paths where corresponding pages exist.

The `.ai` website remains on the existing Cloudflare Pages project. Do not recreate the project or remove database bindings. The Pages deployment token is not a DNS-management credential.

## Website change prepared separately

PR #43 supplies the approved Chinese product groups and was merged and released by the concurrent Chinese-site work. The current Chinese release observed at handoff is `/var/www/omindos.cn/releases/20261009-product-editions-pr43-lang`, with repository main at `df9080c43c47efd9b2d2699732573b46aa103678`. Its MDA1 language link points to the English catalogue because the English detail page does not yet exist.

PR #44 follows it with English model names, prototype/development status, six products in two groups, the MDA1 English page and matching language links. It was reconciled onto this latest main. PR #44 remains unmerged pending an explicitly authorized public website release; the international production deployment is unchanged by these source edits. Its Chinese MDA1 link must be published together with the new English page.

CI checks website behavior, Chinese search addresses and international release scope. The source audit reports no findings. Visual review remains incomplete because the cloud browser cannot open local preview files; do not represent static or CI checks as visual acceptance.

For the next authorized release, preserve the current Chinese release symlink as the rollback point, copy the candidate over the current release so manually maintained media and manuals survive, apply only the reviewed Chinese MDA1 language-link file, and switch atomically after checks. #44's international files trigger the existing Pages workflow. Recheck production URLs and desktop/mobile layouts before declaring release complete.

## Follow-up operations

Availability notifications and off-server database/attachment backups are not configured by this change. Choose the notification destination and backup storage before adding recurring jobs. Keep backups outside public web roots and verify restoration, not only backup creation.
