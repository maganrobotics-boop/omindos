# OmindOS 四足仿真回放

采用现有 OmindOS Navigation 四足控制器、MEVIUS2 固定模型和 TorchScript 策略，在服务器独立运行 MuJoCo，再生成与状态记录对应的视频。网页是只读回放，不启动计算任务、不连接真实电机。

页面沿用双足回放的浅色风格、OriginMind 标识、视频与等比例轨迹布局，增加起身、站立、前进、转向和停车五段跳转。视频、速度、高度和轨迹游标同步；提供原始 CSV、JSON 和 MP4 下载，缺少记录或视频时禁用阶段按钮并显示错误。

候选中文路径为 `/quadruped/`，页面可返回现有 `/legged-robot/` 和 Cloud。首次访问显示真实仿真的站立海报；播放器需用户点击播放。本目录没有改动双足在线页面、Navigation 安装包或 Cloud 主应用。

## 本次实际仿真

- 2026-10-15 北京时间在腾讯云运行，22 秒物理时间、4,400 个物理步、900 次策略推理；7 项基准检查全部通过。
- 0–1 秒待机，1–4 秒起身；4.2–7 秒站立，7–13 秒前进，13–17 秒转向，17–22 秒停车。起身按钮覆盖 0–4.2 秒。
- 前进指令 0.2 m/s，前进段实测平均约 0.1585 m/s，x 位移约 0.9514 m；转向指令 0.3 rad/s，累计转角约 1.0026 rad；停车最后一秒平均平面速度约 0.00080 m/s。
- 物理与策略频率分别为 200 Hz、50 Hz；关节位置接口加模拟 PD 闭环，与现有 Navigation 验证入口一致。保留原模型、场景与参数；不是客户 Q1 整机动力学验收。
- 依赖为 PyTorch 2.14.1+cpu、MuJoCo 3.14.0、NumPy 2.5.3。已有依赖只读复用，没有修改其他应用的环境。
- 模型及权重来自 [haraduka/mevius2](https://github.com/haraduka/mevius2)，固定提交 `4f09680bb575574377b903bbc971bdb2695d507b`；原作者 Kento Kawaharazuka，MIT 声明保留在现有 Navigation 的 `LICENSES/MEVIUS2-MIT.txt`。
- 策略 SHA256 为 `392b4d3f30e856caedcb0ec25f125201e97b28795bc9342ee2fc1d8125656510`；资产清单及其每个文件由原控制器检查。

## 复现与打包

脚本只加载预置模型和明确的 MuJoCo 后端，不下载资产。`--navigation-scripts` 指向已有的 `quadruped_controller.py`、`quadruped_backends.py` 与 `joint_interface.py` 所在目录，`--assets` 指向已核验的 MEVIUS2 包。

```bash
python run_quadruped.py record --navigation-scripts /path/to/navigation/scripts \
  --assets /path/to/mevius2-reference --output /path/to/new-run
MUJOCO_GL=egl LIBGL_ALWAYS_SOFTWARE=1 LP_NUM_THREADS=1 \
  python run_quadruped.py render --assets /path/to/mevius2-reference \
  --run /path/to/new-run --ffmpeg /path/to/ffmpeg
ffmpeg -ss 5 -i /path/to/new-run/simulation.mp4 -frames:v 1 /path/to/new-run/poster.jpg
python package_replay.py --run /path/to/new-run --output /path/to/new-preview
python preview_server.py --directory /path/to/new-preview --port 18092
# 在另一终端验证：
python verify_replay.py --url http://127.0.0.1:18092/quadruped/ --output /path/to/qa
python verify_package.py --run /path/to/new-run
python make_offline.py --package /path/to/new-preview --output /path/to/preview.html
```

仿真与渲染使用单独 systemd 临时作业，限制内存 1.5 GiB、CPUQuota 150%、TasksMax 96、Nice 10；NoNewPrivileges、PrivateDevices、ProtectSystem=strict，写入仅限 `/opt/omindos-quadruped-simulation/`。每次使用新的结果目录，不覆盖历史运行。没有常驻计算服务。

渲染从同次运行保存的 440 个 qpos/qvel 状态重建，视频为 960×540、20 fps、22 秒 H264。`render-states.npz` 留在私有运行目录。打包程序只接受检查通过的完整结果，检查 CSV 时间戳和视频 SHA256，保留全部 4,401 行原始采样，并提取 221 个真实状态给网页使用。

## 发布准备

当前是源代码与本地候选预览，尚未发布。目标域名为 `cloud.omindos.cn`；正式发布仅在用户明确授权后执行。

候选文件在 `/opt/omindos-quadruped-simulation/`，临时 Python 页面测试服务仅监听服务器 `127.0.0.1:18092`，不构成公开预览。保留私有目录权限，不重载生产服务。测试服务使用 96 MiB 配额并设置 20 分钟生命周期。公开快照仅允许 HTML、MP4、CSV、JSON、JPG 五个文件；Nginx snippet 严格列出这些路径，拒绝其他文件及写请求。

本次 1366、768、390、320px 共 20 组阶段播放检查及 2 个加载失败场景通过，无 JavaScript 异常及横向溢出；20 组读数与真实采样逐项对应；4 种损坏结果打包拒绝检查通过。完整便携 HTML 的另 20 组阶段播放检查通过，包含嵌入视频的直接打开及跳转。临时预览的 11 个 HTTP 检查通过，包含 200、视频 Range 206、隐藏文件/权重路径 404 与 POST 405。Nginx 候选配置仅作语法检查，正式域名路由仍待授权发布时验收。SVG 命名空间与本机回环 HTTP 地址的审计提示均不构成生产混合内容。

授权发布时，把完整快照复制到 `/var/www/omindos-quadruped-replay/<release>/`，原子切换 `current`，将 `nginx-headers.conf` 安装到 `/etc/nginx/snippets/omindos-quadruped-replay-headers.conf`，再在既有 Cloud HTTPS server 中 include 本目录的 `nginx.conf`。运行 `nginx -t` 后 reload，并复查 200、视频 Range 206、404、写请求拒绝及手机页面。不要替换整个 Cloud Nginx 配置。

若要在双足页增加四足入口，应从当前在线 HTML 增加一个导航链接，保留其全部视频、数据和样式，核对前后文件哈希；不以旧版源码覆盖其后续品牌更新。

撤回时只移除此新增 include 并执行配置检查及 reload，保留仿真结果；已有双足页、Cloud、中文官网和阿里云服务均保持原有状态。
