# Website maintenance

For work in apps/website or the website deployment workflow, read docs/website-deployment.md.

The owner's current release preference (2026-10-11, 19:00 Asia/Shanghai):
- Update and verify omindos.cn first. It is the priority for domestic users.
- Redirect the omindos.ai homepage and Chinese routes to their corresponding omindos.cn pages.
- Retain the overseas English website at omindos.ai/en/ and cross-domain language switching.
- Chinese content updates only need the domestic release; English updates may follow later.
- Merges run tests only. Publish .ai by an explicit main workflow dispatch after Chinese production acceptance.
- Preserve the separate Tencent Chinese deployment and existing Alibaba OA/Chat systems.
- Report each site's actual release status independently.

Do not ask for authorization again when the ongoing task already authorizes its release.
