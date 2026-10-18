# 官网发布：国内优先

## 当前约定（2026-10-18 北京时间）

用户于 2026-10-18 要求在 .ai 建设使用自然商务英语的英文官网。此要求取代此前“.ai 首页跳转国内”的入口约定；中文官网仍由独立的腾讯部署提供。

- 默认先修改、验收并发布腾讯云上的中文官网 omindos.cn，完成国内正式页面、手机及媒体检查。
- omindos.ai 及 www.omindos.ai 的 `/` 和 `/index.html` 默认 302 跳转到 `https://omindos.ai/en/`。浏览器语言和旧语言 Cookie 不覆盖这一默认入口；保留其他查询参数与页面锚点，移除已处理的 lang 参数。
- 首页显式 `lang=zh` 或 `lang=cn`、中文深层页面及 `/cn/` 旧地址继续 308 跳转到 omindos.cn 对应页面。现有无前缀深层路径维持中文跳转，显式 `lang=en` 仍前往对应英文页。页面 POST 不跨域重定向。
- omindos.ai/en/ 为英文 canonical 入口，涵盖现有页面及履带机器人、实验室、实验室招生、公司招聘、综合加入入口。中英文切换分别前往 .cn 对应中文页和 .ai/en/ 对应英文页，避免循环跳转。
- 合并代码和 Pull Request 继续自动测试，但不再自动发布 .ai。
- 中文正式站验收完成后，英文内容按任务需要单独发布。中文内容更新不必重复发布到 .ai。每次发布仍遵守用户对该任务的授权范围。
- 共用仓库、分别部署；不要把“代码已合并”报告成“线上已更新”。
- OA 保持 oa.omindos.cn。Chat 对外入口为 omindos.cn/chat/，课程独立使用 omindos.cn/learning，竞技场独立使用 omindos.cn/arena/，管理入口为 /arena/admin；旧课程和竞技场页面跳到各自独立路径。原阿里云后端和学习数据保留，不通过国际入口绕行。部署与回滚见 ops/chat-entry/README.md。

## .com 品牌入口

用户于 2026-10-11 21:05 确认使用 omindos.com 作为品牌入口，跳转到现有 omindos.cn，暂不维护独立网站。现有 .cn 业务路径与 .ai/en/ 保持原方案。

omindos.com 的 A 记录指向阿里云 39.108.50.65，www 为该根域名的 CNAME。已有有效 HTTPS 证书覆盖两个名字。沿用当前 DNS、证书、ACME 和企微验证路径，仅将 /etc/nginx/conf.d/omindos-com.conf 的 HTTP/HTTPS 跳转从旧 Chat 域名改为 https://omindos.cn$request_uri，保留路径和查询参数，使用现有 302 状态。配置源码见 ops/domains/omindos-com.conf。

公网验收存在明确阻塞：阿里云返回 HTTP 403 的 Non-compliance ICP Filing 页面，HTTPS 连接被重置。源站跳转配置完成不等于公网已可用；需要在阿里云备案后台核对该 .com 的备案或接入状态，不通过更换 IP 规避拦截。本轮不改 DNS、业务站点、证书或备案资料。

## 中文站：先发布

omindos.cn 由腾讯服务器 Nginx 提供，根目录为 /var/www/omindos.cn/current，通过 cn/ 回退映射 /robots/ 等路径。旧 deploy-aliyun-cn.yml 不是当前中文站发布入口。

从当前 production release 复制候选目录，只覆盖本轮授权文件与必要资源，不用仓库整站覆盖现网。保留无关页面、课程/竞技场入口、服务器配置及已有媒体。

核对候选差异、服务用户读取权限、桌面与手机、图片视频后，原子切换 current。记录旧 symlink、文件 SHA256 和 GitHub commit。验证正式 HTTPS 页面和资源；失败则原子恢复旧 symlink。

## 国际站：默认英文首页与中文别名跳转

工作流：.github/workflows/deploy-website.yml。
目标：现有 Cloudflare Pages 项目 omindos-website，正式域名 https://omindos.ai。

Push 和 Pull Request 只执行验证，deploy job 跳过。中文站验收完成后，在 GitHub Actions 的 Deploy website 中选择 Run workflow，分支必须为 main；这会对当前 main 重新测试并发布国际站。

script 与 workflow 双重限制：仅 workflow_dispatch + refs/heads/main 可以发布。测试、项目/域名/D1绑定检查、部署commit核对和线上检查继续执行。

国际发布包保留已有样式、媒体和 API，便于英文页面及缓存客户端继续使用。默认首页由 Worker 跳转到 `/en/`；明确中文入口及既有无前缀深层路径跳转到 .cn，不在 .ai 展示中文页面。语言链接与 hreflang 保持源码中的跨域关系，.ai sitemap 只列英文正式页面，包括新增的 `/en/robots/tracked/`、`/en/lab/`、`/en/lab/join/`、`/en/careers/` 和 `/en/join/`；根地址为跳转入口，不列为 canonical。Cloud、OA 保持原址；课程链接使用国内 /learning 入口。页面 POST 不跨域重定向。

此方案只修改官网应用路由，不修改 DNS、邮件或服务子域名。默认英文访问留在 .ai；选择中文后转到 .cn，并使用国内页面及资源。

## 凭据与回滚

Cloudflare 发布令牌保存在 GitHub Actions 的 CLOUDFLARE_API_TOKEN Secret；账号 41e8b3404be24e1dd288556d77ffc951。不得把凭据写入源码、日志或发布目录。

国际发布前，既有检查脚本记录当前 production deployment 及 commit。回滚时恢复该部署，并修复源码；代码回退后仍需单独触发国际发布，不会因push自行上线。

本策略变更前已验证国际版本：
- Commit: a9201f4526deecfab5f85f2a7e6f7c72970db0fc
- Deployment: 2dd4aa12-f741-4366-a65b-4f94327585eb
- 验证记录：https://github.com/maganrobotics-boop/omindos/actions/runs/38131933332

历史默认中文副本策略及自动先发国际站的描述已由以上约定取代。



## 英文官网访问统计 v2（2026-10-17）

`/api/visits` 只接受严格同源 POST；只采集精确域名 `omindos.ai`，Pages 别名、预览地址及其他域名即使绑定生产 D1 也不写入统计。客户端也跳过这些域名以及浏览器标明 `navigator.webdriver` 的自动化会话；不创建指纹。不提供公开统计读取。统计的是可见文档触发的页面访问事件，刷新或新页面可再次计数，不是去重访客、实名用户或实时在线人数。中文腾讯站的采集与存储独立，不能混用。

本次发布在既有 main 手动发布工作流中，先通过已有项目、账号与 D1 绑定校验，再执行 `scripts/website-visit-stats.mjs --prepare`。脚本仅读取旧 `visit_*` 汇总作为基线，并应用 `migrations/website/0003_filtered_visit_stats.sql` 的幂等增表操作。不得改写旧汇总或 OEM 表；D1 权限不足时必须在发布前失败。发布后 `--report` 只读 v2 分类汇总与首条事件时间，不发送模拟页面访问。GitHub Actions 日志及任务摘要只含汇总，不含凭据、访问 IP 或 OEM 内容。

v2 将 `accepted_unknown`、`accepted_scored` 页面事件与四类排除事件分别汇总。Cloudflare verifiedBot、1–29 分数（corporateProxy 除外）、明确爬虫或自动化工具 User-Agent，以及预取请求只从统计中排除，网页仍正常提供。只信任平台 `request.cf.botManagement`，不信任同名 HTTP 请求头。缺少评分或分数为 0 时按未知处理，accepted 并不证明真人。当前 Cloudflare 套餐是否提供评分仍须控制台核验；User-Agent 可伪造，过滤结果也不能作真实用户数。浏览器可见性与文档内防重复只减少预取和同页重复采集，不进行跨页去重。

旧 `visit_totals`、`visit_country` 和 `visit_recent` 留作“历史未过滤页面加载次数”，不得与 v2 相加展示为同一口径，也不能将 Cloudflare 全站自动化请求百分比乘入旧计数来修正。旧数据只有汇总，没有足够信息回算真人数。v2 的 `visit_collection_v2.first_event_at` 是该版本首条事件时间，迁移执行时间不等于新口径采集开始时间。分钟聚合保留约两天，累计分类及国家汇总长期保留。回滚只恢复旧部署，不删除 v2 表；旧版本恢复期间的数据仍属于旧口径。
