# 官网视频和 API · 2026-10-11 接续点

用户要求“下页继续”，已暂停。当前改动未合并、未发布；旧官网正常版本保持在线。下一页发“官网视频继续”。

## 已完成

- Q1 45 秒：行走、小跑、原地转向、跳跃落地、慢动作。MDA1 46 秒：采用今天更新的 Cloud 42 秒视频加片头/片尾，腰部已加宽，左右手各有二自由度独立手指，取盘、移动转向、停车放盘、双臂回收。
- 两片均1920×1080、30fps、H.264/yuv420p、faststart；全片 FFmpeg -xerror 解码通过，分别1350/1380帧。已目检MDA1最终封面、原Q1转向镜头、Cloud全流程接触表。手爪为用户授权添加的仿真几何，未做真机验证。
- 中英文产品页改为简洁“产品演示”，桌面视频最大宽度520px；移除CAD工作台预览和冗长说明；片内仅标“仿真”。无下载入口，保留播放、拖动、全屏、字幕、playsinline、nodownload及视频区域右键限制。
- 四个中英文VTT已更新；英文字幕在/en/assets/demos/20261011/与英文页同源，视频和封面指向.cn。
- 接续上午API页优化：17接口搜索、说明展开、cURL/Python切换、复制、目录高亮和手机布局。两语HTML及共享CSS/JS一并保存。
- 本草稿基于main 6fb5b4d97c395e489db1e7f442a509889298452c；最新教育课程和Cloud入口不覆盖。

## 最终视频已持久保存

| 文件 | Library ID | SHA256 | 字节数 |
|---|---|---|---|
| OriginMind-Q1-Demo(1).mp4 | libfile_8ecab6516b808191a51f6c088ecf6580 | e4c558877833381e831b45fac69cb1697ef582333944b333abe40aa71de68651 | 13174105 |
| OriginMind-MDA1-Demo(1).mp4 | libfile_665aabf642908191bc91d39d1d1eab19 | b9dbb6c5b2da7297f409afdb7678c6d955a0c8eee5eb3ac3d1e8305764a70b60 | 10719710 |

草稿保存JPG封面和VTT，新MP4尚未加入Git。下一页可由上表恢复，无须重渲染；上传cn/assets/demos/20261011/并核对哈希，再跑完整CI。不得合并仍缺新MP4的草稿。

## 尚待完成

1. 两片play/pause/seek/end、字幕、封面、206 Range、360/390/768/1366视口；必须实际查看截图。
2. 中英文API搜索、展开、复制、键盘切换、目录、手机菜单及语言切换。
3. 本轮官网审计无发现；中文SEO4项、英文制品隔离1项本地通过。本地还原源码的Node测试出现matching-PDF失败，旧PDF资产未完整恢复，不能声称全套回归通过。完整仓库CI应核实该失败，勿改测试掩盖缺失资产。
4. API本轮只是文档交互优化，没有新增服务器接口；本机API不能宣称为公共云API。
5. 验收后合并并发布中英文官网，发布前再次读取当前生产版本，保留差异清单、原子切换与回滚点。用户之前已授权中英文官网视频接入发布及API发布，无需重复问相同授权；本轮因用户要求下一页继续暂停。

## 恢复路径

- 本地/workspace/scratch/8848d2533af5/website-refresh/，含repo、build_videos.py、deliverables、source-payload.json、qa/website-tests.log。
- repo为本地还原快照，不能直接push到GitHub；草稿提交只在最新主线树写入目标文件。
- 上午快照/workspace/scratch/edffb52b443a/；Cloud源视频/workspace/scratch/87cbc29fd155/OmindOS-Cloud-Mobile-Dual-Arm-1080p.mp4，模型与验收在cloud-update/。本轮没有修改Cloud应用。
- 授权腾讯设备f7d97a0e-0317-4b45-8c43-db15f58ada8c，暂停时官网current仍为/var/www/omindos.cn/releases/20261011-education-pr52，发布前必须重读。
- 新传输目录/opt/omindos-site-maintenance/product-final-20261011/：Q1新片26个b64块已全部写入，MDA1只第0块。没有解码、覆盖或发布。每块原始大小524286字节（除末块均是3的倍数），可连接后解码，续传前逐块核对。
- 本轮code-mode传输已终止；没有本轮启动的浏览器或生产发布进程。
- 上午127.0.0.1:18917预览仍由旧会话运行，本轮未停，不能当作最终候选。上午远端/opt/omindos-site-maintenance/product-refresh-20261011-1219/含无手爪的旧MDA1，勿误发。
- 远端node/Chrome/Playwright可用；rg与/usr/bin/ffmpeg不可用。用独立新端口验收，避免覆盖既有会话。
- 中文站从当时生产release增量生成并原子切换，英文站沿用已有GitHub CI/Cloudflare流程；上线后独立核验omindos.cn与omindos.ai/en/。
