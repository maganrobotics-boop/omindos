# 中文官网 SEO 地址修订 — 2026-10-08

基线：PR #36 合并提交 `3b829a2e4b0ea48f4bc3651e4722f0eee7af8bc2`。

## 实际路由与规范地址

腾讯 Nginx `/var/www/omindos.cn/current` 提供中文站；17 个正式页面的无语言前缀目录路由全部实测 HTTPS 200，最终地址保持原路由。`/cn/` 与 `index.html` 别名仍可访问，canonical 统一指向 `https://omindos.cn/` 或 `https://omindos.cn/<route>/`。不改 DNS、Nginx、301 策略或 API。

国际站实际 `/` 跳转 `/en/`，同时保留 `/cn/` 中文镜像；`/ja/` 跳转 `/en/`。已用真实浏览器读取英文/中文首页的 canonical、hreflang、og:url。中文正式页的英文 alternate 和语言切换指向对应 `https://omindos.ai/en/<route>/`，原英文源码、Worker、共享资源、国际站 sitemap、robots.txt 保持原版本。

## 修订范围

- 中文 17 个正式页面：canonical、中文 hreflang、og:url 三者一致；中文内部链接使用已验证的无 `/cn` 前缀目录路由。
- 英文语言切换使用国际站绝对 URL；OEM 申请入口指向国际站现有 `/founding-oem?lang=zh`，避免中文站不存在的同源路由。
- 中文专用 sitemap 收录恰好 17 个规范地址；中文 robots.txt 指向中文 sitemap。仓库放在 `apps/website/cn/`，独立发布时同时映射到站点根目录。
- 中文错误页保留 noindex/nofollow，移除 canonical、alternate 和 og:url，不进入 sitemap。生产 Nginx 通用 404 响应不作修改。
- `scripts/cn_seo.py` 只修改指定 HTML 标签及已知页面链接，保留其他属性、正文、脚本、样式、媒体及未知 URL；未来静态页面生成后再次调用，防止回写旧域名。

## 中文独立发布

从当前生产 release 复制候选，运行同一标签/链接 overlay；**不拿仓库整页覆盖现网**。检查每个非白名单文件 SHA256 不变；页面去除 metadata/link-href 后内容不变；三款机器人研发样机、论文参数、手册、视频及下载文件不变。

17 页 × 桌面/手机布局检查、全部 sitemap 路由及中文内部链接检查通过后，验证 www-data 目录遍历和文件可读，记录旧 current 目标，原子切换 symlink。上线后 GET 每个规范地址、`/cn` 别名和 index.html 别名，检查标签与页面 hash；失败立即恢复旧 symlink。

## 国际站独立待办

现网国际站英文页的中文 hreflang/语言切换仍引用 `.ai/cn/`，国际站中文镜像仍 self-canonical 到 `.ai/cn/`。本次中文独立发布无法修改这些响应，不能宣称跨域 hreflang 回链已经全部一致。

如需全站跨域闭环，需要另一次明确控制范围的国际站 SEO 发布：英文页中文 alternate/语言链接改为 `.cn`，国际站中文镜像 canonical 与 og:url 指向 `.cn`，同步国际 sitemap 中文条目；保留英文正文、布局、产品状态及其他现网功能。不得直接发布整个 main，以免把中国站增量带到国际站。

以上是地址和实际 HTTP 输出修复；不据此声称搜索引擎已经更新收录。
