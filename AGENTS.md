# Website maintenance

For work in apps/website or the website deployment workflow, read docs/website-deployment.md.

The owner's current release preference (2026-10-18, Asia/Shanghai):
- Update and verify omindos.cn first. It is the priority for domestic users.
- The omindos.ai homepage and /index.html open the English site at /en/ with a 302 redirect, including www. The owner's 2026-10-18 request for an English .ai site supersedes the previous Chinese homepage redirect.
- Explicit lang=zh/cn homepage choices, /cn/ aliases, and existing unprefixed deep links retain their redirects to corresponding omindos.cn pages. Do not change the Tencent Chinese deployment to implement this international entry policy.
- Retain English canonical pages at omindos.ai/en/ and cross-domain language switching. The English site also includes tracked robots, the lab, lab admissions, company careers, and the combined join entry.
- Chinese content updates only need the domestic release; English updates may follow later.
- Merges run tests only. Publish .ai by an explicit main workflow dispatch after Chinese production acceptance.
- Preserve the separate Tencent Chinese deployment and existing Alibaba OA/Chat systems.
- Public Chat entry is omindos.cn/chat/; courses use omindos.cn/learning and arena uses omindos.cn/arena/, independently of Chat. Legacy course and arena page URLs redirect to their independent paths. The legacy Chat hostname remains the backend. Keep OA and Cloud as the only separate platform entries.
- Report each site's actual release status independently.

Do not ask for authorization again when the ongoing task already authorizes its release.
