# 实验室页面：公众号资料更新

目标：中文正式页面 `https://omindos.cn/lab/`，源码 `apps/website/cn/lab/index.html`。

资料为用户提供的 `ARTS-Robotics-WeChat-Archive-20261017.zip`（18 条文章记录）。本次不复刻文章全文，以介绍、论文、项目和活动摘要补充页面。保留共享导航、页脚、视频、聊天及毕业生公开档案和账户维护入口。

## 内容依据

| 页面内容 | 公众号原文 | 采用范围 |
| --- | --- | --- |
| 实验室介绍、全景感知、轮足与腿足运动 | [实验室介绍，2024-05-06](https://mp.weixin.qq.com/s/1WLxbaAcpjyGZVdLpRuNXw) | 学院归属及研究方向；不使用“过去一年”的论文和专利统计 |
| 语义导航与视觉反馈 | [自主移动技术，2025-01-01](https://mp.weixin.qq.com/s/tTZy9cDJSDbcs3Mq1XRkvQ) | 表述为研究方向，不将系统愿景写成当前交付能力 |
| ICRA 2025 透明物体抓取 | [论文报道，2025-04-17](https://mp.weixin.qq.com/s/l32RVAob1TZDTOechUsgvw) | 标题、会议、作者及研究主题；[arXiv](https://arxiv.org/abs/2504.09868)、[IEEE](https://ieeexplore.ieee.org/document/11127580/) 核对 |
| ICRA 2024 楼梯点云建模 | [论文报道，2024-05-11](https://mp.weixin.qq.com/s/GOm9l6rRtsHS1f6SEzG72A) | 标题、会议、作者及研究主题；[arXiv](https://arxiv.org/abs/2405.01918)、[IEEE](https://ieeexplore.ieee.org/document/10610407/) 核对；不等同实机爬楼 |
| 矿海明眸 | [项目介绍，2026-08-06](https://mp.weixin.qq.com/s/z_yj2vTXqaNLXHC0ds3J2g) | 保留第十九届“挑战杯”专项赛应用赛一等奖；文章发布日期不作为获奖年份 |
| 双臂咖啡机拆解与 WIK 资助、清华李翔团队合作的线性柔性体操作 | [自主操作介绍，2024-11-09](https://mp.weixin.qq.com/s/7mVlsapqc9Ft4oY3nQSH_g) | 明确为 2024 年公开的研究演示，不声称生产线部署 |
| 试管识别与分拣 | [自主操作技术，2024-11-17](https://mp.weixin.qq.com/s/_Zx4uOt3gHS1G_FhtfovHw) | 对象检测与抓取推理，不复用缺少测试条件的成功率和速度 |
| THWS 活动周 | [赴德活动，2024-11-21](https://mp.weixin.qq.com/s/yU81VJMLRKSOTX96bJihoA) | 四名本科生、Gazebo 迷宫挑战；只有活动年份，不编造具体日期或已签署的协议 |
| 暑期学校 | [活动回顾，2024-07-18](https://mp.weixin.qq.com/s/-LcFb45ohA4nWgC1ipOpDA) | 2024-07-05 至 07-08；团队参与，不称实验室独办 |
| 华为来访 | [交流记录，2024-05-10](https://mp.weixin.qq.com/s/LpezTR1Yy75wMRyoUrVG3Q) | 活动发生于 2024-04-29；不将来访写成已成立联合实验室 |
| 实验室助手 | [上线报道，2026-09-15](https://mp.weixin.qq.com/s/JRoS6IhrHrwqZHHKDGkibA) | 内容整理与问答；使用当前 `/chat/` 入口 |
| 科研向平台转化 | [从矿海明眸到 OriginMind，2026-08-06](https://mp.weixin.qq.com/s/z_yj2vTXqaNLXHC0ds3J2g) | 明确科研探索与平台工程化的关系，不将愿景全部列为已实现功能 |

两篇论文均按正文首页标注前两位作者共同贡献。2025 年论文作者为 Yi Han、Zixin Lin、Dongjie Li、Lvping Chen、Yongliang Shi、Gan Ma；2024 年论文作者为 Chun Qing、Rongxiang Zeng、Xuan Wu、Yongliang Shi、Gan Ma。

两条已删除的重复暑期学校报名通知不用于新增事实；招聘转发、投稿通知和讲座预告不作为已完成活动。保留页面原有荣誉信息，本轮未重新统计论文、专利或人员总数。

## 发布范围

用户于 2026-10-17 15:54 明确授权公开提交并上线中文实验室页面。国内发布仅从当时的 production release 复制候选目录，覆盖本轮 HTML 与 CSS；CSS 查询版本为 `v=2-articles`。发布前须重新比对 GitHub main 与现网，保留其间的无关更新。

开始编辑时，两份文件与现网逐字节一致：

- `cn/lab/index.html`：`aaef57c16a9b7378bdb18649acc91d4da2f464d3f7bf80c6053b88fe8822bf74`
- `cn/lab-20261017.css`：`1d117aadfa77e7ae4862eed80b2d7d3885634089abada392ebca0dac96e3aeff`

中文站以 Nginx 的 `cn/` 回退提供 `/lab/` 路径；不改路由、部署工作流、OA、Cloud 或英文站。

## 版式与实验室标识修订

用户在上线后要求取消句中人为换行，提升整页质感，并将实验室相关页面统一为 ARTS Robotics 标识，沿用公司首页的页眉与导航标准。

- 首页主标题改为完整文本节点，章节标题和正文移除强制换行；窄屏按实际宽度自然排列。
- 首屏改为全宽标题、实验室介绍与研究平台展示；研究方向与代表论文采用清晰的条目结构。
- 阅读内容使用暖白底，深色重点集中在代表项目与相邻现场视频；保持原有研究事实和全部文章来源。
- `/lab/`、`/lab/join/`、`/lab/alumni/` 共用 ARTS Robotics 文字标识及实验室页样式；页眉、导航、页脚结构沿用公司首页，保留原有登录、个人主页、视频和聊天功能。
- 主页面样式版本为 `v=3-editorial`，实验室公共样式独立于公司页面，避免影响其他官网页面。

## 验证记录

- 文章事实独立复核；两篇论文标题、会议归属与共同贡献署名交叉核对 arXiv / IEEE。
- 网站现有 Node 检查 64 项通过，中文 SEO 与国际发布包 Python 检查共 7 项通过。
- 官网维护审计无新发现，`git diff --check` 通过。网站为静态 HTML/CSS，本次没有新增构建或安装依赖。
- 首次预览阶段浏览器检查受运行环境限制；发布前须另行完成桌面和手机验收，实际结果写入服务器发布记录。
- 公开代码仓库推送首次被自动审批拒绝，用户随后已明确授权公开提交和上线。生产目录切换、文件校验和回退点以服务器发布记录为准。
