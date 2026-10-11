# 官网视频接续点 · 2026-10-11 20:55 CST

用户要求“换页继续”，暂停实施。继续原 PR #53，不重新制作视频，不创建重复 PR。
主接续文件：docs/website-product-videos-api-handoff-20261011.md；本文件为较新补充。

## 本轮核实
- PR #53 仍为 open / Draft / 未合并，分支 codex/product-videos-api-refresh-20261011。暂停前 head 为 7a0939c7ba82b5426c57e94ab10efc696203f260。
- 两段完整原始成片已存在腾讯服务器，不再只是分块。目录 /opt/omindos-site-maintenance/product-final-20261011/。
- Q1：OriginMind-Q1-Demo.mp4，13,174,105 bytes，SHA256 e4c558877833381e831b45fac69cb1697ef582333944b333abe40aa71de68651。
- MDA1：OriginMind-MDA1-Demo.mp4，10,719,710 bytes，SHA256 b9dbb6c5b2da7297f409afdb7678c6d955a0c8eee5eb3ac3d1e8305764a70b60。
- 远端 sha256sum 与本地 /workspace/scratch/8848d2533af5/website-refresh/deliverables/ 两文件完全一致。本轮没有重新编码或重做动作。
- 17:51 CST 线上新 Q1 路径 /cn/assets/demos/20261011/OriginMind-Q1-Demo.mp4 仍返回404。这是当时状态，恢复须重读，不能当最新状态。
- 20:55 CST 重读 current：/var/www/omindos.cn/releases/20261011-arena-entry-pr62。此前候选基于 PR54，已过时，禁止整树覆盖最新生产。保留首页白背景、OmindOS介绍、Cloud、课程和竞技场等后续更新。

## 本轮浏览器检查及真实阻塞
- 腾讯设备 f7d97a0e-0317-4b45-8c43-db15f58ada8c 已可连接。
- 独立本轮工作目录：/opt/omindos-site-maintenance/video-release-20261011-1752/。
- preview.cjs 使用 127.0.0.1:18973，根目录仍为 product-final-20261011/site。verify.cjs 来自 pr53-20261011 的既有脚本。
- 运行 node verify.cjs 未通过：qa/verify.log 报 page.waitForFunction 30000ms timeout，verify.cjs 第19行，等待 seek 完成且字幕 cues 可用。没有生成 qa/verification.json。
- 因此不能声称四视口、完整播放和 API 交互验收通过。下一步查字幕文件实际路径/预览同源映射/请求状态，修复实际问题后重新验收，并实际查看截图。
- 该预览只是旧候选，不能用于最终覆盖生产。生产更新必须从最新 current 增量生成，并使用现有 /opt/omindos-site-maintenance/website-release.lock 及原子切换，保存新回滚点。

## GitHub 媒体上传
- 本轮尝试把原 Q1 文件 base64 上传 github.create_blob。长度17,565,476，服务明确返回 HTTP400：MCP request body exceeds 16 MiB limit。未创建此 blob，未修改分支源代码。
- 不要重复同一个超限调用；不要把原成片成功上服务器误报为已进Git。
- MDA1本轮未调用create_blob；已有较小Q1网页压缩候选记载于 docs/website-product-video-resume-20261011.md，但本轮遵循用户“不重新制作”未使用它。优先保留原成片哈希，选择可支持媒体的既有发布/传输办法。
- 中英文资源都齐全且可达之前，禁止合并会引用缺失资源的页面。

## 本地接续
- 当前隔离目录 /workspace/scratch/3502ee94dbec/work/。
- repo/ 是从旧本地快照复制，不是可直接push的GitHub完整克隆；origin指向旧本地目录。未改原有工作区。
- deliverables/ 为原视频副本，哈希已核对。
- main-tree.json 是17:51读取的主线 a6adac48d6d227597c753a4bfce278473546ccb0 (PR55) 文件树，已过时。
- mismatches.json 列出相对当时主线缺失/不一致的文件，其中旧PDF/图片/重定向页等需恢复才能完整本地回归。不要修改测试掩盖缺资源。
- Github候选仍以PR53源代码为准，恢复时先读最新main和最新生产，再只整合此次产品视频/API变更。

## 下一页顺序
1. 重新读 PR53、main、current 和媒体URL，保护其他会话已发布的修改。
2. 使用已核实的服务器原视频，补齐Git/发布资源与字幕，不重做视频。
3. 排查字幕加载超时；四个中英文产品页 × 360/390/768/1366：封面、play/pause/seek/ended、字幕、206 Range、实际截图。两片正常速度全片播放。
4. API：17接口搜索、无结果/清空、展开、cURL/Python、复制、键盘切换、目录、手机菜单/语言切换。
5. 完整仓库CI和制品构建通过，再按授权合并、中文原子发布、英文现有workflow。发布前给出简短变更/测试/回滚摘要；不重复问已授权发布。
6. 独立核实两站正式页面和资源哈希，测实际加载表现，记录测试条件。最终给正式链接、真实字节数/MB、上线结果。

本轮未合并或发布。暂停来自用户“换页继续”，并非等待发布授权。
