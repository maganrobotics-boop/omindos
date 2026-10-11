# 官网自动发布

## Current policy — 2026-10-11

The owner confirmed that `omindos.ai` is the main website entry and must show the current Chinese homepage by default. English remains under `/en/`, with same-domain language switches on every portal page. This supersedes the English-only international policy dated 2026-10-08.

The release artifact now includes the checked-in Chinese portal, styles and media. Build-time metadata rewriting maps website URLs from `.cn` to `.ai`; service subdomains (Cloud, courses, OA) are preserved. `.cn` sources and production are unchanged. Both locale trees and artifact configuration now trigger the existing international deployment workflow. No DNS or database bindings change.

Rollback: restore the previous verified international deployment `0d3e395b-5767-4546-8275-352e19247165` / commit `6fb5b4d97c395e489db1e7f442a509889298452c`, then revert the routing/artifact policy commit before subsequent releases. Prior release: GitHub Actions run `38116529489`.


工作流：`.github/workflows/deploy-website.yml`，目标为现有 Cloudflare Pages 项目 `omindos-website` 和正式域名 https://omindos.ai。

已于 2026-09-07 启用并完成首次 push 自动发布验收：[运行记录](https://github.com/maganrobotics-boop/omindos/actions/runs/34081030685)。13 项回归测试、发布和 16 项线上检查全部通过。Cloudflare 正式部署 `5c32a4d0-b28b-4cdf-9371-4845081ce7de` 对应 GitHub 提交 `d1397dd70234c2ec7543d17874a0154dc5ac1b35`。

## 触发方式

- Push 到 `main` 时先运行网站回归与发布范围测试。只有国际站页面、共享资源或 Worker 发生变化时才自动发布 `omindos.ai`。`apps/website/cn/**`、关节式研发页专用样式/模型图，以及仅文档或测试改动，不触发国际站发布；混合改动仍会触发。
- Pull Request 只运行测试，不读取 Cloudflare 密钥，也不发布。
- 在 GitHub Actions 的 `Deploy website` 页面选择 `Run workflow`，并使用 `main`，可以重新发布当前版本。
- OA、文档、API 或说明文档的单独修改不触发官网发布。OA 继续使用独立的受控生产发布流程。

## 中文站定点发布（2026-10-08）

当前 `omindos.cn` 由腾讯服务器 Nginx 提供，根目录为 `/var/www/omindos.cn/current`，并通过 `cn/` 回退映射 `/robots/` 等路径。旧 Aliyun workflow 不是当前中文站发布入口。

PR #36 仅定点替换中文产品目录、关节式/轮足/并联轮足详情与其专用资源；必须从当前 release 复制候选目录后覆盖白名单文件，不用仓库整站覆盖现网。保留首页、其他产品、课程/竞技场链接和服务器配置。完整核对候选差异、服务用户读权限、图片/视频与桌面/手机后，原子切换 `current`；记录旧 symlink、文件 SHA256 和 GitHub commit。失败则原子恢复旧 symlink。

现网额外参数和手册已纳入 PR：关节式参数来自用户提供的 Micromachines 13(9), 1404 (2022)，第 3–4、15–17 页；0.390/0.174 m/s 为论文原型的峰值/均值，保留 20 s、0.2 r/s 与 IMU 积分条件。PWL-R1 名称及内嵌手册保留现网已确认版本。轮足/并联轮足未公布的尺寸、载荷、续航和接口数值不补造。

## 凭据

仓库的 Actions Secret `CLOUDFLARE_API_TOKEN` 保存专用发布令牌，只授予账户 `41e8b3404be24e1dd288556d77ffc951` 的 `Cloudflare Pages: Edit` 权限。这是账户级 Pages 权限；Cloudflare 的令牌界面不提供只限定单个 Pages 项目的资源选项。不授予 DNS、邮箱或独立 OA Worker 的管理权限。

账户 ID 是公开标识，写在工作流中；令牌只存入 GitHub 加密 Secrets，不能写进源码、日志或发布目录。不得使用本地 Wrangler 的短期 OAuth 登录令牌替代。

## 发布和校验

工作流先运行现有 13 项官网回归测试，再核对账户、项目、`main` 分支、正式域名和访问统计 D1 绑定。Wrangler 上传现有静态资源与 `_worker.js`；继续使用 Cloudflare 后台的配置，不运行 SQL 或修改数据库绑定。发布任务串行执行，避免不同版本同时覆盖。

发布后核对 Cloudflare 正式部署 ID 和 GitHub 提交 SHA，并实测三种语言的九个页面、访问统计、会议路由 404、旧域名跳转。任一步骤失败会使 Actions 标红；发布后检查失败不会自动回滚，需查看日志和 Cloudflare 部署记录后处理。

## 回退

优先在 GitHub 撤销导致问题的官网提交，再 push 到 `main`，由同一流程发布。紧急情况下可在 Cloudflare Pages 的 Deployments 中选择已验证的历史生产版本并回滚，然后同步修正 GitHub，以免下一次 push 重新发布错误版本。

现有项目属于 Direct Upload，因此通过 GitHub Actions 使用 Wrangler；不新建 Pages 项目或迁移自定义域名。参考 [Cloudflare 的 CI 部署说明](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)。

