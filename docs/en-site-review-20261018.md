# 英文官网改版与发布准备（2026-10-18）

英文官网主要改版代码已通过 GitHub PR #120、#121 合并，最终修正经 PR #122 合并，候选 main 为 `779b000170a489357e4d4acdcc90826cb6124aa5`。最终公开预览为 [英文官网预览](https://149994b4.omindos-website.pages.dev/en/)。正式发布已执行，但在部署前的 D1 统计数据库检查遇到 HTTP 403，生产仍保留旧版本。

目标为现有 Cloudflare Pages 项目 `omindos-website`，正式入口为 `omindos.ai/en/`。本次按用户最新要求，将 `.ai/` 与 `/index.html` 默认入口调整为英文；明确选择中文及既有中文深层地址继续进入 `.cn`。用户已于 2026-10-18 明确确认允许提交 GitHub、继续预览验收及发布。

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
- 网站、统计、发布范围、国际路由、原型展示、独立 Chat 网关及新增 404 回归等 66 项 Node 测试全部通过。
- 中文 SEO 及国际打包的 7 项 Python 测试全部通过。
- Q1／MDA1 批准视频的 SHA256 校验通过；英文字幕与既有播放器限制保留。
- 根入口、www、显式中文选择、查询参数／锚点、HEAD／POST、语言切换、英文 sitemap 和英语组件样式的 Worker 路由检查通过。
- JavaScript 语法及 `git diff --check` 通过。发布包排除本地临时文件，保留公开 `.well-known` 验证资源。

## 浏览器验收与最终修正

- 已通过公开 HTTPS 预览完成 25 个英文页面的桌面浏览器审查，未发现横向溢出或坏图。核心页面实测浏览器视口为 1363 × 936 CSS 像素，文档可用宽度为 1348 像素；页头、H1、英文字体、主要媒体及黑色页脚均已实际查看。
- 24 个内容页已在浏览器中用 390px 宽 iframe 检查。开发文档页初次加载时出现疑似溢出，加载完成后复核正常；唯一确认的窄视口问题为 OmindOS 页内目录溢出，CSS 已改为窄屏两列、允许文字换行，最终预览在 320px 和 390px 下复验均无横向溢出。
- 首页、关于、公司招聘、联系、API 文档、系统集成、实验室、实验室招生 8 个页面，以及 MDA1 详情页与修正后的 OmindOS 页，已完成 320px 宽 iframe 检查，未发现横向溢出。
- 首页、OmindOS、机器人目录、API 文档及实验室主页已完成 768px 宽 iframe 检查，未发现横向溢出。
- 折叠菜单的打开、关闭及 Escape 退出正常。API 搜索能够筛选结果，接口说明可展开和收回。
- 实验室 30 个证书默认折叠，已实际展开其中一项并确认大图正常显示。
- 实际错误路由原先使用旧版 404 卡片；已修复为通过 clean URL 读取新英文模板。新增回归测试通过，最终预览中不存在的英文路径已显示新页头、新页脚，且无旧 OEM 按钮。

上述窄视口检查是在桌面浏览器中的 iframe 内进行，属于实际浏览器渲染检查，不是真实手机设备测试。全部视频尚未逐段播放验收。

## 生产发布受 D1 权限阻塞

最终预览工作流 [39084971763](https://github.com/maganrobotics-boop/omindos/actions/runs/39084971763) 成功，验证预览部署对应候选 commit，且生产部署未变。

正式发布工作流 [39085093866](https://github.com/maganrobotics-boop/omindos/actions/runs/39085093866) 的 66 项 Node 和 7 项 Python 检查通过，Cloudflare 生产项目与既有统计绑定检查通过；随后在 `Preserve legacy baseline and prepare isolated filtered statistics` 的首次 D1 查询返回 HTTP 403。`Publish existing Cloudflare Pages project` 未执行，因此本次没有替换正式站，也没有执行数据库迁移或清理历史统计。

生产仍为原部署 `f98feccb-6b23-40cc-b5a3-f19fc916d5b3`。没有跳过发布检查或扩大令牌权限。需核对 GitHub Actions 使用的 Cloudflare 部署令牌对目标账户 D1 的访问范围；既有发布脚本会创建独立 v2 统计表，因此还需 D1 写入权限。403 的具体权限或资源限制未从令牌配置确认。

权限问题解决后，通过现有 `Deploy website` 工作流对 main 选择 `production`，完成部署及线上验证。中文生产站、OA、Chat、课程、竞技场和账户权限均未变更。公开预览和 GitHub 合并不代表正式生产已更新。

## 复核命令

```sh
node --test tests/website.test.mjs tests/website-visits.test.mjs tests/website-release-scope.test.mjs tests/cn-research-prototypes.test.mjs tests/international-english-only.test.mjs ops/chat-entry/gateway.test.mjs
python3 -m unittest tests.test_cn_seo tests.test_international_artifact
python3 scripts/prepare-product-demo-media.py
python3 scripts/prepare-international-artifact.py apps/website /tmp/omindos-international-review
```

生产发布后运行 `node scripts/verify-website-live.mjs`，并核对部署 commit、全部英文页面、核心媒体、语言切换及实际布局。本轮没有对旧生产站执行新版验收脚本，因为新版本尚未发布。
