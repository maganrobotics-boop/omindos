# OmindOS Q1 简化外壳展示

当前公开候选仅含独立生成的低细节外壳与四条腿部轮廓：5 个网格、124 个三角面，无 CAD 输入，不包含原详细装配、内部结构、传动、电机、关节结构或精确尺寸。保留旋转、缩放、正视/侧视/俯视、键盘与触摸操作。公开模型仍可导出，不能撤回访客此前保存的详细模型副本。运动仿真尚未验收。

```bash
python build_q1_shell.py --output /private/q1-shell
python preview_server.py --directory /private/q1-shell --port 18108
python verify_q1.py --url http://127.0.0.1:18108/quadruped/ --output /private/shell-qa
```

`build_q1_shell.py` 仅使用标准库和独立定义的近似多边形，不读取 STEP、旧 GLB 或 CAD 元数据。内嵌 GLB 与下载内容一致。`deploy_q1_shell.py` 校验生成器字节、实际候选浏览器报告、当前生产 HTML 哈希，再原子切换 Q1；旧详细 HTML 移出公开根目录并以 700/600 权限保存在私有目录。不改 Nginx、双足文件或其他服务。私有详细备份不得在未获明确授权时重新公开。历史详细模型构建和发布入口已停止使用。

最新实际上线状态见 `Q1_RELEASE.json`，浏览器验收见 `Q1_BROWSER_VALIDATION.json`；本节的候选说明本身不代表已上线。

## 历史详细模型发布（已由简化方案取代）

以下为历史记录，旧构建与发布命令已停用，不能作为当前公开模型说明。

2026-10-15 按所有者要求，默认预览改为 OriginMind 自有《四足机器狗总装V1.2 (2).STEP》的真实三维装配。`index.html` 仅显示这套模型，支持鼠标与触摸旋转、双指或滚轮缩放、正视/侧视/俯视、键盘操作及用户主动开启的旋转。结构、零件颜色及传感器位置均来自原 CAD；不套用其他平台的视频、关节运动或状态读数。

原始 STEP 包含装配几何，但未提供可验证的关节约束、质量惯量与执行器配置。因此默认页明确标记为 CAD 模型查看，运动仿真尚未验收。后续须基于自有结构建立并核对 URDF/MJCF、关节轴与限位、各连杆质量惯量、碰撞体、执行器参数和控制器，完成真实运行后再展示动作与遥测。不能仅以替换外观推定现有参考策略适用于自有机器人。

## 自有模型预览

CAD 转换使用 CadQuery/OpenCascade，网页网格优化使用 NumPy、VTK 与 fast-simplification，依赖只安装在转换环境。原始 STEP、GLB、转换缓存和内嵌模型的便携 HTML 保留在私有目录，不提交机械资产至公开源码仓库。

```bash
python -m pip install -r requirements-model.txt
python import_q1_model.py --source /private/OriginMind-Q1-V1.2.step --output /private/new-model
python optimize_q1_model.py --source /private/new-model --output /private/web-model
python build_q1_preview.py --model /private/web-model --output /private/preview/index.html
python preview_server.py --directory /private/preview --port 18108
# 在另一终端，使用独立环境中的 Chrome 和 Python：
python -m pip install -r requirements-browser.txt
python verify_q1.py --url http://127.0.0.1:18108/quadruped/ --output /private/qa
```

便携 HTML 内嵌真实 GLB、原始文件及模型哈希、几何信息和 OriginMind 正式标识；无第三方 JS、CDN 或运行时网络依赖，WebGL 2 负责渲染。原始机械装配只在生成便携预览时读取。JSON 中的 `scope=cad_geometry`、`dynamics.motion_simulation_verified=false` 保留模型展示与运动验收之间的边界。

导入保留零件级名称、颜色、层及装配位置，不创建未使用的逐面名称标签。同一父装配中重复的名称加上确定性的实例后缀，并在元数据记录原名称；几何、颜色、变换和实例数量不受名称消歧影响。

这份 CAD 的竖直轴为 Y。网页网格撤回 CadQuery 导出时额外添加的整机 Z→Y 轴旋转，并把毫米换为米；所有子装配的相对变换与材质保留。优化器同时修复导出节点名的 UTF-8 解码。浏览器检查实际网格的竖直及纵向尺寸，并在截图前确认复位视角已经绘制。

2026-10-15 已使用真实 V1.2 网格完成腾讯云私有浏览器验收：1366、768、390、320px 四种宽度的 20 项检查通过，包含视角按钮、自动旋转、键盘、触摸拖动、双指缩放、复位及实际画布像素；无控制台异常。桌面与手机截图已人工核对，临时监听和上传入口已关闭。结果保存在 `VALIDATION.json` 与 `Q1_BROWSER_VALIDATION.json`；此前参考平台的结果保存在 `REFERENCE_VALIDATION.json`。

正式入口为 `https://cloud.omindos.cn/quadruped/`，2026-10-15 已发布，仅部署生成的 `index.html`。网页支持下载展示用 GLB，原始 STEP 保留在私有文件中。`reference.html` 与以下 MEVIUS2 回放脚本保留用于独立工程对照，不属于自有模型页，也不得将其结果作为自有机器人验证结果。完整机械资产不写入公开源码仓库。

## 参考平台的独立仿真记录

采用现有 OmindOS Navigation 四足控制器、MEVIUS2 固定模型和 TorchScript 策略，在服务器独立运行 MuJoCo，再生成与状态记录对应的视频。网页是只读回放，不启动计算任务、不连接真实电机。

页面沿用双足回放的浅色风格、OriginMind 标识、视频与等比例轨迹布局，增加起身、站立、前进、转向和停车五段跳转。视频、速度、高度和轨迹游标同步；提供原始 CSV、JSON 和 MP4 下载，缺少记录或视频时禁用阶段按钮并显示错误。

参考模板为 `reference.html`，不在生产路由中开放。参考模板中的播放器需用户点击播放。

## 参考平台的历史仿真

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

## 自有模型发布

目标域名为 `cloud.omindos.cn`。用户明确要求上线后，已于北京时间 2026-10-15 10:29 发布自有 V1.2 模型页，并在双足页面增加四足入口。原双足视频和数据保持原哈希。当前公开功能为 CAD 模型展示与交互，起身、行走等运动仿真尚未验收。

正式 HTTPS 页面已通过四种视口的 20 项模型交互检查、2 项双足导航检查和 10 项 HTTP 检查，桌面与手机截图已核对。线上 HTML 与发布前验收文件哈希一致，双足视频继续支持分段读取。发布记录见 `Q1_RELEASE.json`，浏览器记录见 `Q1_BROWSER_VALIDATION.json`。预检监听已关闭，原配置与双足快照保留用于回退。

候选文件和发布记录保留在 `/opt/omindos-quadruped-simulation/` 的私有目录。`deploy_q1.py stage` 创建全新的公开快照，生成仅监听 `127.0.0.1:18096` 的独立 Nginx 预检配置，不切换生产路由。浏览器测试在独立配额的临时 systemd 作业内运行；`verify_q1.py` 覆盖 1366、768、390、320px 四种尺寸、四个视角、键盘旋转、触摸拖动、双指缩放、自动旋转开关、画布实际像素、品牌图像及横向溢出。传入 `--biped-url` 同时核对桌面和手机的双足导航、布局与视频元数据。Node 版本 `verify_q1.mjs` 可用于独立模型检查。

发布自有模型时，只把已验收的便携 `index.html` 复制到 `/var/www/omindos-quadruped-replay/<release>/` 并原子切换 `current`，将 `nginx-headers.conf` 安装到 `/etc/nginx/snippets/omindos-quadruped-replay-headers.conf`，在既有 Cloud HTTPS server 中 include 本目录的 `nginx.conf`。新增 include 后执行 `nginx -t` 和 reload，检查页面 200、规范路径跳转 308、其他路径 404、写请求拒绝及手机触摸交互。自有模型页不部署参考回放的视频、CSV、JSON、策略或原始 STEP，也不修改私有源目录权限。

`deploy_q1.py publish` 仅接受 20 项候选浏览器检查全部通过且没有异常的实际模型结果，并要求报告的 HTML 哈希与发布快照一致；拒绝通用测试模型、缺失或失败的检查。发布要求明确的源码提交号，并校验候选 HTML 与双足媒体哈希。双足页从当前在线快照增加导航，保留视频、数据和样式。切换前保存当前配置及双足快照位置；配置校验或 reload 失败会恢复本次改动。发布后再次验收正式 HTTPS 页面。

撤回时恢复发布记录中的双足 `current` 指向，移除此新增 include，再执行配置检查及 reload；保留转换与验收记录。Cloud 主应用、中文官网和阿里云服务不属于本次发布范围。

参考平台曾通过 20 组阶段播放检查、2 个加载失败场景、4 种损坏结果拒绝检查和 11 个 HTTP 检查；这些结果不等于本页自有 CAD 的验收，也不证明自有机器人能够执行参考动作。
