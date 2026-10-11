# 官网发布：国内优先

## 当前约定（2026-10-11 19:00 北京时间）

用户实测国内访问 .ai 较慢，最新要求：.ai 指向国内，同时国外保留英文官网。更新仍优先 omindos.cn。

- 默认先修改、验收并发布腾讯云上的中文官网 omindos.cn，完成国内正式页面、手机及媒体检查。
- omindos.ai 及 www.omindos.ai 首页、中文深层页面和 /cn/ 旧地址，直接 308 跳转到 omindos.cn 对应页面；保留查询参数与页面锚点，移除已处理的 lang 参数。
- omindos.ai/en/ 保留国外英文官网。中英文切换分别前往 .cn 对应中文页和 .ai/en/ 对应英文页，避免循环跳转。
- 合并代码和 Pull Request 继续自动测试，但不再自动发布 .ai。
- 中文正式站验收完成后，英文内容按任务需要单独发布。中文内容更新不必重复发布到 .ai。每次发布仍遵守用户对该任务的授权范围。
- 共用仓库、分别部署；不要把“代码已合并”报告成“线上已更新”。
- OA 保持 oa.omindos.cn。Chat 对外入口为 omindos.cn/chat/，课程独立使用 omindos.cn/learning，竞技场独立使用 omindos.cn/arena/，管理入口为 /arena/admin；旧课程和竞技场页面跳到各自独立路径。原阿里云后端和学习数据保留，不通过国际入口绕行。部署与回滚见 ops/chat-entry/README.md。

## 中文站：先发布

omindos.cn 由腾讯服务器 Nginx 提供，根目录为 /var/www/omindos.cn/current，通过 cn/ 回退映射 /robots/ 等路径。旧 deploy-aliyun-cn.yml 不是当前中文站发布入口。

从当前 production release 复制候选目录，只覆盖本轮授权文件与必要资源，不用仓库整站覆盖现网。保留无关页面、课程/竞技场入口、服务器配置及已有媒体。

核对候选差异、服务用户读取权限、桌面与手机、图片视频后，原子切换 current。记录旧 symlink、文件 SHA256 和 GitHub commit。验证正式 HTTPS 页面和资源；失败则原子恢复旧 symlink。

## 国际站：英文页面与中文入口跳转

工作流：.github/workflows/deploy-website.yml。
目标：现有 Cloudflare Pages 项目 omindos-website，正式域名 https://omindos.ai。

Push 和 Pull Request 只执行验证，deploy job 跳过。中文站验收完成后，在 GitHub Actions 的 Deploy website 中选择 Run workflow，分支必须为 main；这会对当前 main 重新测试并发布国际站。

script 与 workflow 双重限制：仅 workflow_dispatch + refs/heads/main 可以发布。测试、项目/域名/D1绑定检查、部署commit核对和线上检查继续执行。

国际发布包保留已有样式、媒体和 API，便于英文页面及缓存客户端继续使用。中文入口由 Worker 返回到 .cn 的跳转，不再在 .ai 展示中文页面。语言链接与 hreflang 保持源码中的跨域关系，.ai sitemap 只列英文正式页面。Cloud、OA 保持原址；课程链接使用国内 /learning 入口。页面 POST 不跨域重定向。

此方案只修改官网应用路由，不修改 DNS、邮件或服务子域名。首次打开 .ai 仍需先收到 Cloudflare 的跳转响应；到达 .cn 后使用国内页面及资源。

## 凭据与回滚

Cloudflare 发布令牌保存在 GitHub Actions 的 CLOUDFLARE_API_TOKEN Secret；账号 41e8b3404be24e1dd288556d77ffc951。不得把凭据写入源码、日志或发布目录。

国际发布前，既有检查脚本记录当前 production deployment 及 commit。回滚时恢复该部署，并修复源码；代码回退后仍需单独触发国际发布，不会因push自行上线。

本策略变更前已验证国际版本：
- Commit: a9201f4526deecfab5f85f2a7e6f7c72970db0fc
- Deployment: 2dd4aa12-f741-4366-a65b-4f94327585eb
- 验证记录：https://github.com/maganrobotics-boop/omindos/actions/runs/38131933332

历史默认中文副本策略及自动先发国际站的描述已由以上约定取代。


