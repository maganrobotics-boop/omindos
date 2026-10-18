# OmindOS 双足仿真回放

访问地址：[cloud.omindos.cn/legged-robot/](https://cloud.omindos.cn/legged-robot/)。页面只读取已生成的视频与状态记录，播放和阶段跳转不会提交计算任务。

页面使用官网的透明 OriginMind 标识及 OmindOS 品牌。标识内嵌于 HTML，沿用现有 CSP；Roboto Origin 模型来源保留，原始 JSON 仍记录实际云服务商。

2026-10-15 在腾讯云 `VM-0-3-ubuntu` 实际运行 `legged-robot 0.1.0a2`：20 秒平地基准、1,000 个控制步，结果 `completed`。H264 视频为 720×540、20 fps、400 帧；软件渲染耗时约 300.85 秒。来源为官方固定模型、策略及配置，34 个清单文件通过大小与 SHA256 核验。没有连接真实电机。

## 运行环境与隔离

- 独立环境：`/opt/omindos-legged-simulation/venv`，Python 3.12.3；MuJoCo 3.16.0、ONNX Runtime 1.31.0、NumPy 2.3.5、SciPy 1.17.0、PyYAML 6.0.3。
- 资产缓存：`/opt/omindos-legged-simulation/assets`；公共目录仅包含 HTML、视频、CSV 和脱离服务器路径的 JSON，不暴露缓存、源码、策略权重或电机接口。
- 仿真由单独的 systemd 临时作业执行：内存上限 1.5 GiB、CPUQuota 150%、TasksMax 96、Nice 10。启用 NoNewPrivileges、PrivateDevices、ProtectSystem=strict，写入范围为独立运行目录。
- 渲染使用 `MUJOCO_GL=egl`、`LIBGL_ALWAYS_SOFTWARE=1`、`LP_NUM_THREADS=1`；ONNX 在 CPU 上推理。安装 imageio-ffmpeg 提供独立编码器，不修改原 Cloud 容器。
- 当前连接服务的子进程继承 512 MiB 配额，不能直接承载本模型或完整浏览器验证；计算与验证分别放在独立、有限额的作业中。
- 作业结束后释放计算内存。此部署没有常驻仿真计算器、公开执行 API 或开机重跑任务。

重新运行可使用已安装模块的 CLI，并沿用以上作业隔离参数：

```bash
/opt/omindos-legged-simulation/venv/bin/legged-robot simulate \
  --asset-dir /opt/omindos-legged-simulation/assets \
  --scenario baseline --duration 20 \
  --output /opt/omindos-legged-simulation/runs/new-baseline --video
```

该命令需要运行环境的 `PATH` 包含 venv/bin 中的 ffmpeg，以及上述 EGL/Mesa 环境变量。不要在连接服务的默认 512 MiB 子进程中直接运行。

## 结果与浏览器

`package_result.py` 只接受完整且无故障的 20 秒基准结果，核对 1,001 行 CSV，并提取 201 个真实采样点。它保留所有原始 CSV 行，发布 JSON 不包含本机资产路径。公共父目录须有 0755 权限，四个结果文件为 0644；配置不会放宽私有运行目录权限。

公共快照在 `/var/www/omindos-legged-replay/baseline-20261015-a2/`，`current` 指向它。`nginx.conf` 是添加到已有 Cloud HTTPS server 的独立 snippet，不是替换整个站点。原 Cloud 首页和中文官网的内容 SHA256 在发布前后完全一致。

验证包含 1366×900、390×844、320×740 的实际 Chrome 视口、模型版本、轨迹、H264 时长与阶段按钮。`verify_replay.py` 使用临时浏览器配置，不读取用户登录状态；需要 websockets 及系统 Chrome。浏览器验证也应使用独立的作业配额。

HTTP 检查：四个公共文件返回 200，MP4 的 Range 请求返回 206；未知路径、缓存及 `.git/config` 返回 404；POST 被拒绝。部署记录与截图保存在运行目录的 `deployment.json` 和 `qa/` 中。

## 撤回与限制

撤回时只从当前 Cloud 配置移除 `omindos-legged-replay.conf` 的 include，再执行 `nginx -t` 和 reload；保留运行记录。原配置备份在 `/opt/omindos-legged-simulation/backups/nginx-cloud-before.conf`，不要用备份覆盖后续其他修改。

本次是服务器批处理仿真与回放。网页实时调参、新任务启动、原生 ROS2/导航闭环、复杂地形、长期步态和实机均不在此次验收范围。没有修改 Navigation 正式安装包、现有 Cloud 容器或阿里云 OA/课程服务。
