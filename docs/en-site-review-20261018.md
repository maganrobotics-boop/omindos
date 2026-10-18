# 英文官网改版与发布准备（2026-10-18）

英文官网代码已完成，尚未推送或发布。目标为现有 Cloudflare Pages 项目 `omindos-website`，正式入口为 `omindos.ai/en/`。本次按用户最新要求，将 `.ai/` 与 `/index.html` 默认入口调整为英文；明确选择中文及既有中文深层地址继续进入 `.cn`。

## 本次内容

- 共 25 个英文 HTML 页面：24 个内容页面及 404 页面。
- 首页按最新中文站重写，以矿山自主巡检、四种工业机器人、OmindOS、研究团队为主线，采用深浅交替的页面分区。
- 核心页涵盖公司、系统集成、OmindOS、开发文档、应用、矿山、仓储、演示、联系和隐私。
- 机器人目录及 8 个详情页同步最新型号、研究参数和验证边界，新增 T1 独立英文详情页。Q1、MDA1 的仿真标识、英文字幕及原有播放限制保留。
- 新增英文实验室首页、研究生招生、公司招聘和加入入口。实验室保留 6 篇代表论文、14 条专利记录、18 项荣誉及 30 个默认折叠证书。
- 专利记录明确区分 12 条授权／注册与 2 条申请／通知；美国专利使用已核验的 11,938,623 B2；IEEE ROBIO 荣誉保持 Finalist。
- 法定主体没有编造英文注册名称。隐私及专利产业化说明保留准确中文公司名；“赋权开展产业化”没有扩写成所有权转让或独占许可。

## 英文与排版

采用直接、克制的技术商务表达，例如：

| 位置 | 英文表达 |
| --- | --- |
| 首页主标题 | Autonomous robots for mining |
| OmindOS 入口 | Bring OmindOS to your robot. |
| 合作咨询 | Tell us about your application. |
| 研究支持 | Grounded in field research. |

统一英文页头、页脚、标题层级、正文行距、按钮、语言切换及黑色页脚。英文菜单在 1280px 以下切换为折叠菜单。长标题允许自然换行；产品型号保持完整，说明文字可以换行。实验室使用室外机器人视频及独立深浅交替内容带。

共用样式在 `apps/website/en/site-20261018.css`；交互在同名 JS。10 个既有组件样式适配为英语选择器，放在 `en/assets/layout-20261018/`，避免修改中文现网样式。5 个新增翻译页面的中文源文件仅同步对应英文语言链接及 hreflang，本轮不会部署中文站。

## 已完成验证

- 25 页均为单一 H1、单一 main，未发现重复 ID。
- 155 个不同的本地页面／媒体／样式／脚本引用存在，站内目标锚点均能匹配。
- 英文正文无意外中文；仅实验室和隐私页保留准确法定主体名称。
- 网站、统计、发布范围、国际路由、原型展示及独立 Chat 网关等 65 项 Node 测试全部通过。
- 中文 SEO 及国际打包的 7 项 Python 测试全部通过。
- Q1／MDA1 批准视频的 SHA256 校验通过；英文字幕与既有播放器限制保留。
- 根入口、www、显式中文选择、查询参数／锚点、HEAD／POST、语言切换、英文 sitemap 和英语组件样式的 Worker 路由检查通过。
- JavaScript 语法及 `git diff --check` 通过。发布包排除本地临时文件，保留公开 `.well-known` 验证资源。

## 尚未验收与发布限制

桌面和手机浏览器视觉验收尚未完成。云浏览器无法连接本地预览服务器；data URL 预览也被浏览器策略拒绝，未尝试绕过。不能将静态检查或断点样式视为手机实测，也未声称逐段播放了全部视频。

既有国际发布路径要求将代码提交到 `maganrobotics-boop/omindos` 的 main，并显式运行现有 GitHub Actions 工作流。此前自动审批拒绝了向该仓库导出代码，准备阶段因此暂停提交。用户已于 2026-10-18 明确确认允许该提交及继续发布；随后恢复已连接 GitHub 工具的正常提交流程，待完成 HTTPS 预览、桌面／手机视觉与交互验收、正式发布及线上验证。

本轮只读调查中，自动审批另拒绝了阿里云服务器的 Cloudflare 环境变量名和登录目录元信息探查，理由是该服务器与本次英文站任务无关且缺少跨服务器凭据环境检查授权。该项已停止，没有重试或绕过，也没有读取凭据内容。

中文生产站、OA、Chat、课程、竞技场和账户权限均未变更。国际站回滚使用现有 Cloudflare deployment 记录，本地代码或发布包准备完成不代表线上已更新。

## 复核命令

```sh
node --test tests/website.test.mjs tests/website-visits.test.mjs tests/website-release-scope.test.mjs tests/cn-research-prototypes.test.mjs tests/international-english-only.test.mjs ops/chat-entry/gateway.test.mjs
python3 -m unittest tests.test_cn_seo tests.test_international_artifact
python3 scripts/prepare-product-demo-media.py
python3 scripts/prepare-international-artifact.py apps/website /tmp/omindos-international-review
```

生产发布后运行 `node scripts/verify-website-live.mjs`，并核对部署 commit、全部英文页面、核心媒体、语言切换及实际布局。本轮没有对旧生产站执行新版验收脚本，因为新版本尚未发布。
