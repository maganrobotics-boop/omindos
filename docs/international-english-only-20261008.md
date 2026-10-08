# 国际站英文单语言发布 — 2026-10-08

用户授权：`.ai` 保留英文官网，去掉国际站中文版本及 `.ai` 下 OA、Chat 入口；`.cn` 的中文官网、OA、Chat 保留。

## 网站行为

- `omindos.ai/` 始终进入 `/en/`，中文浏览器和旧语言 cookie 不再进入中文镜像。
- 保留完整英文官网，所有英文产品、OmindOS、应用场景、关于、联系和隐私页面仍可使用。
- `.ai/cn/<route>/` 和 index.html 别名永久跳转对应 `.cn/<route>/`，保留业务来源 query；去掉 lang 参数。
- 旧中文首页与 OEM/机器人/关于中文路径移至中文官网对应入口；未知中文路径返回英文 404。
- 国际站英文页中文 hreflang 和语言链接统一指向 `.cn`；国际 sitemap 只列英文规范地址与现有英文 OEM/关于旧入口。
- Cookie 选择不能再公开中文 legacy HTML；现有 API、数据库绑定和英文 OEM 功能保留。
- 独立发布包排除 `cn`、`design-study`、旧中文首页和中文 legacy 子目录；仓库中文源码仍保留供独立中文站发布。
- 英文正文、产品名称与状态、媒体、CSS/JS 和中文生产 release 保持不变。

## 发布与验证

GitHub Pages 工作流先运行原有处理器/API 回归、新的英文单语言公共入口回归、中文 SEO 检查和国际 artifact 隔离检查；发布前记录当前 Cloudflare deployment ID/commit 作为回滚点。上传已有 omindos-website 项目并验证 commit/deployment ID，再检查 17 个英文页面、对应中文旧地址跳转、英文默认入口、共享资源及 sitemap。

## OA、Chat 子域名

`chat.omindos.ai` 当前 DNS 无可用地址。`oa.omindos.ai` 仍解析到 Cloudflare；仅 HTTP 403 无法证明 OA 已删除。删除其 DNS/custom-domain/route 需要 Cloudflare 控制台当前登录或相应 DNS 权限；官网 GitHub Pages 令牌不具备 DNS/Workers 管理权限。未完成后台核查前，不声称 OA 子域名已清理。
