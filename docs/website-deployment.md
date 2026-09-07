# 官网自动发布

工作流：`.github/workflows/deploy-website.yml`，目标为现有 Cloudflare Pages 项目 `omindos-website` 和正式域名 https://omindos.ai。

已于 2026-09-07 启用并完成首次 push 自动发布验收：[运行记录](https://github.com/maganrobotics-boop/omindos/actions/runs/34081030685)。13 项回归测试、发布和 16 项线上检查全部通过。Cloudflare 正式部署 `5c32a4d0-b28b-4cdf-9371-4845081ce7de` 对应 GitHub 提交 `d1397dd70234c2ec7543d17874a0154dc5ac1b35`。

## 触发方式

- Push 到 `main`，并修改官网目录 `apps/website`、官网测试、发布校验脚本或此工作流时，先运行测试，通过后自动发布。
- Pull Request 只运行测试，不读取 Cloudflare 密钥，也不发布。
- 在 GitHub Actions 的 `Deploy website` 页面选择 `Run workflow`，并使用 `main`，可以重新发布当前版本。
- OA、文档、API 或说明文档的单独修改不触发官网发布。OA 继续使用独立的受控生产发布流程。

## 凭据

仓库的 Actions Secret `CLOUDFLARE_API_TOKEN` 保存专用发布令牌，只授予账户 `41e8b3404be24e1dd288556d77ffc951` 的 `Cloudflare Pages: Edit` 权限。这是账户级 Pages 权限；Cloudflare 的令牌界面不提供只限定单个 Pages 项目的资源选项。不授予 DNS、邮箱或独立 OA Worker 的管理权限。

账户 ID 是公开标识，写在工作流中；令牌只存入 GitHub 加密 Secrets，不能写进源码、日志或发布目录。不得使用本地 Wrangler 的短期 OAuth 登录令牌替代。

## 发布和校验

工作流先运行现有 13 项官网回归测试，再核对账户、项目、`main` 分支、正式域名和访问统计 D1 绑定。Wrangler 上传现有静态资源与 `_worker.js`；继续使用 Cloudflare 后台的配置，不运行 SQL 或修改数据库绑定。发布任务串行执行，避免不同版本同时覆盖。

发布后核对 Cloudflare 正式部署 ID 和 GitHub 提交 SHA，并实测三种语言的九个页面、访问统计、会议路由 404、旧域名跳转。任一步骤失败会使 Actions 标红；发布后检查失败不会自动回滚，需查看日志和 Cloudflare 部署记录后处理。

## 回退

优先在 GitHub 撤销导致问题的官网提交，再 push 到 `main`，由同一流程发布。紧急情况下可在 Cloudflare Pages 的 Deployments 中选择已验证的历史生产版本并回滚，然后同步修正 GitHub，以免下一次 push 重新发布错误版本。

现有项目属于 Direct Upload，因此通过 GitHub Actions 使用 Wrangler；不新建 Pages 项目或迁移自定义域名。参考 [Cloudflare 的 CI 部署说明](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)。
