# 官网视频接续点 · 2026-10-11 16:07 CST

用户已要求“下页继续”，本轮暂停，不重复制作上午已扩展的影片。

## 既有草稿与并行改动
- 继续既有草稿 PR #53：https://github.com/maganrobotics-boop/omindos/pull/53，分支 codex/product-videos-api-refresh-20261011。不要创建重复 PR。
- 主接续文件为 docs/website-product-videos-api-handoff-20261011.md；本文件补充本轮确认、文件版本及网页压缩状态，不替代该文件记录的 API 工作和腾讯部分传输进度。
- 本轮只追加接续说明，不改动 PR #53 已有页面或 API 实现。
- 当前 main 已到 92b79b3ed6bcee887ad84b353b98cd6602555055，PR #54 已合并标题简化和删除 CAD 介绍。恢复时保留这些改动，并重新读取最新 main。

## 已确认
- Q1 新片 45 秒，1920×1080、30fps；行走、小跑、转向、起跳落地与慢动作。
- MDA1 新片 46 秒，1920×1080、30fps；加宽腰部、左右两自由度手爪、双手取盘、移动转向、停车放盘与回收。
- 两片已更新同一 Library 文件，版本 2：Q1 libfile_ffd303525290819191cbef39ae32f0a9；MDA1 libfile_680d1ac0b9608191875e4ee8823b1deb。
- Q1 成片 SHA256 e4c558877833381e831b45fac69cb1697ef582333944b333abe40aa71de68651，13,174,105 bytes。
- MDA1 成片 SHA256 b9dbb6c5b2da7297f409afdb7678c6d955a0c8eee5eb3ac3d1e8305764a70b60，10,719,710 bytes。
- 2026-10-11 15:45 左右检查线上 /robots/quadruped/ 和 /robots/mobile-dual-arm/，播放器仍指向 cn/assets/simulations/20261010 的昨日33/30秒文件。这是当时观测，恢复任务必须重新核查，不能覆盖期间其他改动。

## 本地候选
/workspace/scratch/0819cde7b261/website 为隔离候选。
四个中英文产品页、product-demos.css 与四个VTT已准备。播放器桌面最大520px；去掉CAD/运动学说明和工作台预览，保留播放/暂停/拖动/全屏，隐藏下载入口。en字幕同源，视频暂用.cn资源地址。
以 PR #53 已有源代码为正式候选；本轮隔离目录仅用于检查和编码，不能用它覆盖既有 API 改动。
Q1网页压缩版已完成（1080P/30fps/45s不变），11,718,313 bytes，SHA256 629b576e75660ee49f5cb93a9df2f7c90ae22adc58cbb685dd2450fd02b22354；尚需全解码及浏览器播放核验。MDA1网页文件与上面的成片一致。
GitHub Q1海报blob已上传：7e605c50fc63ae39eb69c0d9201c118f6c3dd409。两个MP4尚未加入GitHub发布树；腾讯已有部分分块传输，详见主接续文件，尚未发布中文生产。

## 验证与阻塞
- skill audit无发现。中文SEO 4项和国际制品隔离1项通过。
- Node网站回归40/41通过；唯一失败为本地快照缺中文产品PDF，不是产品视频回归。英文产品PDF已从线上恢复。不得写成全套通过。
- 本轮未完成新视频浏览器播放、结束、字幕、手机视觉验收。已有抽帧目检。
- Desktop Commander list_devices及授权腾讯主机ping均报 Connection failed；未执行生产修改。
- Playwright默认Chrome下载返回无效zip；已安装 @sparticuz/chromium@153.0.0 到 /workspace/scratch/0819cde7b261/qa-runtime。使用ESM build/index.js加载，其executablePath解包字体时 chown /tmp/fonts 报EINVAL，需修复本地解包或使用腾讯已装浏览器。不要把浏览器启动失败当网站错误。
- GitHub MCP请求上限16MiB。原Q1 base64超限；网页压缩版base64可低于上限。读取工具输出每次上限约1MiB，需按393216字节块读base64并拼接；已验证此方式。MDA1 base64长度14292948，上传尚未调用。
- 部分GitHub工具会短暂ConnectError；blob同内容重试是幂等的，但branch/PR等创建先检查再重试。

## 恢复顺序
1. 查最新main、线上播放器和其他用户刚要求的描述清理变化，先合并这些变化；不要从旧快照覆盖。
2. 修复本地或恢复腾讯浏览器，检查4页面×360/390/768/1366，播放/暂停/seek/字幕/ended；缩小视频区和移除文字按最新用户要求核验。
3. 可使用上面的已保存成片，不重新生成动作。必要网页压缩仅改变码率。完成媒体上传及回归、发布候选差异审查。
4. 按此前明确中英文接入/发布授权完成官网替换；腾讯.cn定点原子发布，英文.ai通过既有workflow。腾讯连接失败时不要先合并引用尚不可达.cn资源的英文页面。
5. 线上验证成功后才声称新版上线。本次未上线，也未声称动作动力学或硬件已验收。

