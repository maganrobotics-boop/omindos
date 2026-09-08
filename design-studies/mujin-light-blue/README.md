# Mujin 浅蓝色移动机器人设计试版

从独立 Mujin 学习版复制的 85 个页面入口，保留参考版的英文标题、正文、导航与按钮文案。仅调整配色和首页媒体。长篇原站文章仍沿用学习版导读与原文链接，没有新增复制全文。

## 目录与运行

- 源码：本目录 `src/`、`public/`。
- 生成目录：`apps/website/design-study/`，入口 `/design-study/`。
- 构建：在仓库根目录运行 `node design-studies/mujin-light-blue/build.mjs`。
- 检查：`python3 design-studies/mujin-light-blue/validate.py`。
- 本地静态预览：`python3 -m http.server 8080 --directory apps/website`，打开 `http://localhost:8080/design-study/`。

所有学习版内部链接限定在 `/design-study/`。现有首页、中英日路由、OEM 表单、后端、统计和部署配置保持原样。实验仅提交到 `website-mujin-light-blue-review`；不合并或发布。

## 视觉和媒体

- 浅蓝主色 `#a9dfff`，深蓝文字 `#12344a`，浅蓝灰背景；同步按钮、悬停、焦点与选中状态。
- 首页 14 处场景图片使用 6 张 AI 移动机器人概念图，OEM 标志不作为场景图替换。首屏导航里的配图也使用移动机器人图。
- AI 图不是实物、已交付产品或客户案例证明。页面末尾有来源说明，图片替代文字明确标为 AI concept。
- 使用内置 `image_gen` 生成，完整提示词见 `image-prompts.json`。网页资产见 `public/assets/*.webp`。
- 首屏直接引用现有官网的视频 URL 播放，不下载或复制新的 MP4 到试版目录。浏览器按需加载远程视频；三段内容合计约 24 秒，切换时长受网络影响。
- 播放片段：`https://omindos.ai/assets/videos/1000087160-web.mp4` 的 16–24 秒（华润仓库）；`https://omindos.ai/assets/videos/1000087155-web.mp4` 的 2–10 秒（室外四足）；`https://omindos.ai/assets/videos/1000087153-web.mp4` 的 8–16 秒（矿井履带）。保持原片速度与完整画幅。
- 默认静音循环，可暂停；离屏和后台暂停；减少动态效果设置下不加载视频。手机保留完整横向画幅。视频首帧作为真实封面，AI 图片作为备用图。
- 参考版内页的外部图片与视频仍沿用原引用。

## 验证范围

85 条路由与 404 的结构、资源和锚点检查；JavaScript 语法检查；官网现有回归测试。云浏览器无法访问本地预览，因此本轮桌面和手机的视觉及真实播放验收仍待完成。
