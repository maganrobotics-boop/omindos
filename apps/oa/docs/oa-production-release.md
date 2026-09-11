# OA 生产发布

OA 生产发布由仓库根目录的 `.github/workflows/deploy-oa.yml` 管理。`push` 和 `pull_request` 只运行类型检查、lint、构建和测试；只有在 `main` 分支手动运行 `workflow_dispatch` 才可能进入生产发布任务。

## 固定生产目标

| 项目 | 固定值 |
| --- | --- |
| Cloudflare account | `41e8b3404be24e1dd288556d77ffc951` |
| Worker service | `originmind-internal-oa-staging` |
| 主 D1 binding | `DB` → `originmind-internal-oa-production` (`34af7e92-7da5-47cd-b7c0-1270e157c0e6`) |
| 官网 D1 binding | `WEBSITE_DB` → `omindos-website-visits` (`3651ff92-d9fb-45aa-9d1d-623d25bf3459`) |
| Canonical origin | `https://oa.omindos.ai` |
| Cron | `* * * * *` |
| GitHub Environment | `production-oa` |

生产配置固定 `workers_dev: false`、`preview_urls: false` 和 `keep_vars: true`。配置中不声明 `route` 或 `routes`，因此 `oa.omindos.ai` 的既有 Custom Domain 继续由 Cloudflare 控制面管理。源码只管理公开的 `OA_PUBLIC_ORIGIN`；其他 dashboard vars 和既有加密 Worker secrets 在发布时保留。

## 一次性 GitHub 设置

1. 仓库 Secret `CLOUDFLARE_API_TOKEN` 保存现有的最小权限 Cloudflare API Token。不要把 token、OAuth secret 或 `.env` 文件加入仓库。
2. 为 `production-oa` Environment 配置 required reviewer，并只允许 `main` 分支部署。
3. Worker 必须已经包含 `GITHUB_OAUTH_CLIENT_SECRET` 和 `FEISHU_LOGIN_APP_SECRET`。`OA_LAB_AI_API_KEY` 是唯一允许的可选额外 Worker secret。

工作流不使用 Cloudflare 网页登录，也不会在 PR 或 push 上把 token 注入任何步骤。手动发布入口也会在本地检查前立即从进程环境移除 token，只对需要访问 provider 的单条 Wrangler 命令注入。Actions 只有 `contents: read` 权限，checkout、Node setup 和 artifact upload 都固定到完整 commit SHA。

## 手动发布

在 GitHub Actions 中选择 **Check OA and release production manually**，从 `main` 运行 workflow，并准确输入：

```text
originmind-internal-oa-staging:34af7e92-7da5-47cd-b7c0-1270e157c0e6:oa.omindos.ai
```

发布任务依次执行：

1. 再次运行完整本地质量门禁，并生成最终 standalone artifact。
2. 将 `dist` 和完整 `drizzle` 目录复制到单次发布目录，生成 SHA-256 清单。
3. 只读核验 Cloudflare 身份、两个 D1、必需 secret 名称、现有 Worker deployment/version 回退点。
4. 对不可变发布目录逐项核验：只允许 27 个连续、普通的 `.sql` 文件；`0026_rich_jocasta.sql` 必须匹配已审阅 SHA-256 `51878069d3f62b3d291002bfe1fb8f0b129ee58493109bfb8c57befb99fb2194`。生产迁移账本只接受已应用 `0000`–`0025` 且知识库对象尚不存在，或已完整应用到 `0026` 的安全续跑状态；存在活动迁移冻结时停止。
5. 对同一 artifact 执行 `wrangler deploy --dry-run --strict --keep-vars`，再核验 SHA-256。
6. 记录 D1 Time Travel bookmark。若 `0026` 待应用，只执行一次 `wrangler d1 migrations apply DB --remote`；若已经完整应用则跳过，支持部署失败后的安全续跑。
7. 再次核验迁移账本、知识库表/索引/冻结 trigger 的完整 SQLite 定义、通知表，并复核 artifact SHA-256。
8. 使用同一 config 和 artifact 发布 Worker；唯一发布消息包含 commit、run ID 和 attempt，后置门禁要求它是最新且承载 100% 流量的唯一 version，再核验 secret、deployment/version。
9. 对 `https://oa.omindos.ai` 执行只读 smoke：主页、指南、匿名 session、受保护审批/知识 API、关键安全响应头和实验室 AI 入口。

`WEBSITE_DB` 不设置 `migrations_dir`，所以此流程不会对官网数据库运行 OA migration。生产 OA 的迁移目录只包含 `apps/oa/drizzle`；官网通知表由既有 `migrations/oa/0001_feishu_notifications.sql` 管理并在发布前后只读核验。

## 失败和恢复边界

| 失败位置 | 生产影响 | 后续处理 |
| --- | --- | --- |
| 门禁、目标核验、迁移前置核验或 dry-run | 无生产写入 | 修复后重新手动派发 |
| `0026` 执行失败 | Cloudflare 回滚该次失败 migration；Worker 未发布 | 查看 artifact 和 Actions 日志，确认账本后再决定是否重试 |
| `0026` 成功、Worker 发布失败 | 数据库已向前兼容升级；旧 Worker 继续运行 | 不回滚 D1；修复部署问题后从 `0026` 已应用状态续跑 |
| Worker 发布成功、后置或 smoke 失败 | 新 Worker 可能仍在线 | 停止自动操作，依据保存的 version/deployment 和 D1 bookmark 人工评估 |

流程绝不自动执行 Worker rollback 或 D1 Time Travel restore。D1 restore 会覆盖 bookmark 之后的数据，只能在事故评估、数据影响确认和明确人工授权后单独执行。

每次运行都会保留 30 天的 GitHub Actions artifact，其中包括不可变发布包、hash 清单、迁移前后账本和 schema 结果、D1 bookmark、脱敏的目标/version/deployment receipt，以及公开 smoke receipt。原始身份响应和 provider 列表保存在临时私有目录，退出时删除，不上传。

本门禁有意固定在 `0026_rich_jocasta.sql`。添加 `0027` 或更高 migration 时，必须在代码审阅中显式更新期望迁移、schema 校验和失败边界；工作流不会自行接受未知 migration。
