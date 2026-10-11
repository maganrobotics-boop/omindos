# Chat 与课程主域名入口

用户约定：减少服务子域名，保留原 Chat 首页及课程。公开入口为
`https://omindos.cn/chat/`，课程独立使用 `https://omindos.cn/learning`。
旧 `/chat/learning` 及旧 Chat 子域名课程入口均跳转到 `/learning`，保留后续路径和查询参数。
OA 与 Cloud 继续使用原子域名。中文官网平台栏只列 OA、Cloud，AI 助手和挑战赛归入站内链接。

腾讯 Nginx 的 `/chat/`、`/learning` 及 `/learning/` 子路径转给仅监听 `127.0.0.1:18887` 的 Node 网关。
网关固定连接 `https://chat.omindos.cn`，保留阿里云 Chat 服务、数据库、邮件和课程接口。
不迁移或重置账号、成绩、上传文件；新域名可能需要重新登录。

网关只转换静态应用中的站内地址，API JSON、聊天 SSE、上传内容和二进制资源原样传输。
写请求必须来自 `https://omindos.cn`；身份头不从客户端透传。账号 Cookie 分别设置在 `/chat/` 与 `/learning`，保留安全标记，退出同时清除两个路径；课程专用 Cookie 保持 `/learning`。Chat PWA scope 限制在 `/chat/`。
上游 TLS 使用 Node 默认验证，不跳过证书检查。旧入口页面 GET/HEAD 返回 302，保留查询参数；旧 API 保持兼容。

## 部署

1. 使用现有 Node 22 或更新版本运行 `node --test ops/chat-entry/gateway.test.mjs`。
2. 将网关放入 `/opt/omindos-chat-entry/releases/<version>`，目录 0755、源码 0644，`current` 指向该版本。
3. 安装 systemd unit，启动后先用 Host 为 `omindos.cn` 的本机 HTTP 请求检查 `/chat/`、课程及匿名 API。
4. 备份腾讯官网 Nginx 配置，在现有 HTTPS server 内包含 `tencent-nginx.conf`，`nginx -t` 通过后 reload。等新 worker 接管后检查正式 HTTPS。
5. 阿里云在 HTTP 层安装 `aliyun-maps.conf`，仅在原 Chat HTTPS server 包含 `aliyun-server.conf`。该 server 的普通应用代理设置 `CF-Connecting-IP $remote_addr`，竞技场原有设置保留。
6. 只有腾讯固定 IP 能传递真实客户端地址并绕过旧页跳转；用 `$realip_remote_addr` 判断连接来源，防止伪造客户端头绕过。
7. 中文官网从当前 release 复制，只替换授权入口和课程链接，原子切换 current。海外英文源码更新后可晚些单独发布。

## 2026-10-11 部署记录与回滚

- 当前网关版本：`/opt/omindos-chat-entry/releases/20261011-learning-v3`；课程静态文件与 Python 沙箱 CSP 使用独立 `/learning` 路径，保留隔离限制。
- 本次调整前网关：`/opt/omindos-chat-entry/releases/20261011-v2`，官网：`/var/www/omindos.cn/releases/20261011-chat-entry-pr60`。
- 本次配置备份和 release.json：两台服务器各自的 `/opt/omindos-learning-entry-20261011/`；仅撤回本次调整时恢复上述网关、官网和该目录的 Nginx 备份。
- 腾讯 Nginx 原配置：`/opt/omindos-site-maintenance/chat-entry-20261011/nginx-before.conf`。
- 阿里云原配置：`/opt/omindos-deploy/chat-entry-20261011/originmind-services-before.conf`。
- 中文官网原版本：`/var/www/omindos.cn/releases/20261011-omindos-overview-pr56`。

回滚顺序：先恢复阿里云原配置并 reload，使旧 Chat 入口恢复；再恢复官网旧 symlink 和腾讯 Nginx 配置，验证后停用网关。
恢复配置前核对本次备份之后是否有其他维护改动，只撤回本功能。不要停用原 Chat/OA 服务、删除数据库或撤销旧域名证书。

已检查网关 URL/Cookie/PWA 转换、跨域拒绝、身份头过滤、SSE 透传，以及正式首页、课程、旧链接跳转和 OA/Cloud HTTP。
实际用户登录及学习记录写入需要用户自己的会话；不以匿名检查冒充登录验收。
