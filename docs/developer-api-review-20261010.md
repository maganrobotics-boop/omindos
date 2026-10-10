# 官网在线 API 文档 · 2026-10-10

用户要求：官网不提供软件下载入口，可以提供 API 文档，参考其他公司的组织方式。

## 本次改动

- 中英文 OmindOS 页面新增清晰的开发者文档入口。
- 新增中文 `/developers/` 与英文 `/en/developers/` 在线文档。内容包括快速开始、参数管理、机械臂与移动双臂接口、Python/cURL 示例、请求字段、状态与错误处理、版本对应关系。
- 新入口和文档没有安装包链接、Release 下载链接或 `download` 属性；代码示例直接在线阅读和复制。浏览器不提供调用本机机器人 API 的执行按钮。
- 国际站路由表、两站 sitemap 和现有中文 SEO 路由数量断言同步更新。
- 保留导航、语言切换、匿名访问统计和原有 OmindOS 页面内容。
- 本轮没有改动程序发行包、产品视频或既有下载服务器文件。

## 参考与内容依据

借鉴文档的信息组织方式，不复制第三方接口或声称已具备其能力：

- [RealMan 开发者中心](https://develop.realman-robotics.com/en/robot/apic/getStarted/)：快速开始、按功能分组的接口、示例与错误码。
- [Boston Dynamics Spot SDK](https://dev.bostondynamics.com/)：概念说明、客户端示例、协议参考和版本说明。

接口事实来自当前交付版本：

- Navigation `0.2.0-preview.8` 的 `docs/API_GUIDE.zh-CN.md` 和参数 API 说明。
- Manipulation `0.3.1` 的 `API.zh-CN.md`、`NAVIGATION.zh-CN.md`、`PLANNING.zh-CN.md`。
- 与开发仓的 `robot_workbench.py`、`robot_parameter_api.py`、`robot_planning.py`、`robot_navigation.py`、`workbench_state.py` 路由及校验逻辑对照。

确认的关键边界：默认仅本机 `127.0.0.1:8085`；POST 使用 JSON；默认不要求账号或 API Key；导航轮询 0.1–0.5 秒、超过 3 秒未轮询停止；仅导航终态 `parked`，整合任务终态 `succeeded`；软件停止复位字段为 `expected_epoch`，值取最新状态的 `motion_epoch`；复位不自动续跑。未把软件规划描述为真机控制。

## 验证

- 静态官网审计无发现；`git diff --check` 通过。
- 4 项中文 SEO 与 1 项国际制品隔离检查通过。
- Chromium 检查 4 个页面 × 360 / 390 / 768 / 1366 像素，共 16 组通过：无整页横向溢出、复制代码、章节锚点、展开字段表、菜单开关、规范地址、无下载入口及资源/页面错误检查。
- 4 个 Python 示例语法解析通过；接口文档按程序源路由核对。本轮不重复宣称完成软件算法或真机验收。
- 已人工查看中英文桌面和手机截图。
- 完整原有 Node 回归由 PR 的 GitHub Actions 使用完整仓库执行。本地和远端备用源码快照缺少历史 PDF 附件等资产，未将这些快照上的不完整运行宣称为全通过。

本轮只保存分支与审阅 PR，未部署生产站。
