# 官网发布：国内优先

## 当前约定（2026-10-11 18:48 北京时间）

用户明确要求：更新时优先 omindos.cn，国外的可以慢慢来。

- 默认先修改、验收并发布腾讯云上的中文官网 omindos.cn，完成国内正式页面、手机及媒体检查。
- omindos.ai 保留已上线的默认中文、/en/ 英文和中英文切换。国际站稍后同步，不影响国内更新完成。
- 合并代码和 Pull Request 继续自动测试，但不再自动发布 .ai。
- 中文正式站验收完成后，按任务需要单独触发 .ai 同步。每次发布仍遵守用户对该任务的授权范围。
- 两站共用源码、分别部署；不要把“代码已合并”报告成“两站已更新”。
- OA、Chat 保持 .cn 入口及阿里云部署，不通过国际入口绕行。

## 中文站：先发布

omindos.cn 由腾讯服务器 Nginx 提供，根目录为 /var/www/omindos.cn/current，通过 cn/ 回退映射 /robots/ 等路径。旧 deploy-aliyun-cn.yml 不是当前中文站发布入口。

从当前 production release 复制候选目录，只覆盖本轮授权文件与必要资源，不用仓库整站覆盖现网。保留无关页面、课程/竞技场入口、服务器配置及已有媒体。

核对候选差异、服务用户读取权限、桌面与手机、图片视频后，原子切换 current。记录旧 symlink、文件 SHA256 和 GitHub commit。验证正式 HTTPS 页面和资源；失败则原子恢复旧 symlink。

## 国际站：随后单独同步

工作流：.github/workflows/deploy-website.yml。
目标：现有 Cloudflare Pages 项目 omindos-website，正式域名 https://omindos.ai。

Push 和 Pull Request 只执行验证，deploy job 跳过。中文站验收完成后，在 GitHub Actions 的 Deploy website 中选择 Run workflow，分支必须为 main；这会对当前 main 重新测试并发布国际站。

script 与 workflow 双重限制：仅 workflow_dispatch + refs/heads/main 可以发布。测试、项目/域名/D1绑定检查、部署commit核对和线上检查继续执行。

国际发布包包含共用的中文页面、样式和媒体，构建时把官网规范地址、语言链接、hreflang及sitemap转换为 .ai。中文位于根路径，英文在 /en/。Cloud、课程、OA等服务子域名保持原址。中文源文件仍保留 .cn 元数据。

## 凭据与回滚

Cloudflare 发布令牌保存在 GitHub Actions 的 CLOUDFLARE_API_TOKEN Secret；账号 41e8b3404be24e1dd288556d77ffc951。不得把凭据写入源码、日志或发布目录。

国际发布前，既有检查脚本记录当前 production deployment 及 commit。回滚时恢复该部署，并修复源码；代码回退后仍需单独触发国际发布，不会因push自行上线。

本策略变更前已验证国际版本：
- Commit: a9201f4526deecfab5f85f2a7e6f7c72970db0fc
- Deployment: 2dd4aa12-f741-4366-a65b-4f94327585eb
- 验证记录：https://github.com/maganrobotics-boop/omindos/actions/runs/38131933332

历史英文单语言策略及自动先发国际站的描述已由以上约定取代。此发布顺序变更不改变当前线上内容。
