# 仓库与域名对应（2026-09-07）

| 项目 | GitHub 仓库／目录 | 对应域名 | 当前状态 |
| --- | --- | --- | --- |
| 官网 | [omindos](https://github.com/maganrobotics-boop/omindos) 的 `apps/website` | [omindos.ai](https://omindos.ai) | 已上线；官网代码 push 到 main 后自动测试和发布 |
| OA | [omindos](https://github.com/maganrobotics-boop/omindos) 的 `apps/oa` | [oa.omindos.ai](https://oa.omindos.ai) | 已上线；独立受控发布 |
| 文档 | [omindos-docs](https://github.com/maganrobotics-boop/omindos-docs) | `docs.omindos.ai` | 独立私有空仓库；域名已登记在仓库设置，待程序部署后绑定服务 |
| API | [omindos-api](https://github.com/maganrobotics-boop/omindos-api) | `api.omindos.ai` | 独立私有空仓库；域名已登记在仓库设置，待程序部署后绑定服务 |

三个仓库均归 GitHub 账号 `maganrobotics-boop` 所有，使用私有可见性。Cloudflare 管理账号为 `maganrobotics@gmail.com`。文档和 API 仓库未添加 README、代码或初始提交，可在以后直接 push 项目代码。

文档、API 的域名与仓库用途已明确对应，但没有应用可供部署，目前没有为它们发布占位服务或建立指向空仓库的 DNS 记录。上线时应将 `docs.omindos.ai` 绑定到文档服务、`api.omindos.ai` 绑定到 API 服务；DNS 的目标需要使用实际 Cloudflare 服务地址，不能直接填写 GitHub 仓库网址。

官网自动发布已经实测成功：[GitHub Actions 运行记录](https://github.com/maganrobotics-boop/omindos/actions/runs/34081030685)。流程通过 13 项本地回归测试后发布，再核对正式部署提交、访问统计绑定和 16 项线上路由检查。中、英、日三种语言继续使用同一个官网地址。

旧官网 `originmindos.com`、`www.originmindos.com` 跳转到 `omindos.ai`；旧 OA `oa.originmindos.com` 跳转到 `oa.omindos.ai`。
