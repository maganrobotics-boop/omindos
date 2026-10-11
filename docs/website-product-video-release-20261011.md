# Product videos and API release candidate

Continues PR #53 with existing authorization for both language sites. This record supersedes the older paused handoff status.

- Integrated with main dd6dca9190ad26db656514c0bfe5bcb95054085f, preserving the latest mining-focused Chinese content and product imagery.
- Q1: 45 seconds, 13,174,105 bytes, SHA256 e4c558877833381e831b45fac69cb1697ef582333944b333abe40aa71de68651.
- MDA1: 46 seconds, 10,719,710 bytes, SHA256 b9dbb6c5b2da7297f409afdb7678c6d955a0c8eee5eb3ac3d1e8305764a70b60.
- MP4 bytes are stored as four Git transport chunks; prepare-product-demo-media.py validates all hashes and restores both clips before tests and international packaging. Both files retain H.264, 1920x1080, 30 fps and faststart.
- Four bilingual product pages use compact players (maximum 520px), posters, captions, inline playback and no download button. The obsolete MDA1 workbench preview is removed.
- Chinese and English API pages include 17 searchable endpoints, expandable details, keyboard accessible cURL/Python tabs and copy buttons. This updates documentation only; it does not introduce cloud API endpoints.
- Local verification: 52 Node tests, 4 Chinese SEO tests, 1 international packaging test, no site audit findings. Browser evidence is stored on the authorized Tencent host under /opt/omindos-site-maintenance/pr53-release-20261011-2350/qa.
- Prior completed browser pass: 16 layouts at 360/390/768/1366, four normal-speed full playbacks, 8 API interaction combinations and two HTTP 206 range checks. Final candidate verification reruns the same checks after latest-main integration.
- Chinese release must copy the current production directory and replace only the 17 changed website files. Expected rollback point: /var/www/omindos.cn/releases/20261011-mining-focus. Recheck current immediately before atomic promotion and retain the rollback directory.
- Publish omindos.cn first; verify production playback and media hashes. Then explicitly dispatch deploy-website.yml on main for omindos.ai/en/, with independent live checks. Merging alone does not publish the English site.
