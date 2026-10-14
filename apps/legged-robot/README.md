# OmindOS legged-robot

OmindOS 足式机器人模块，首个平台为 **RoboParty Roboto Origin 双足机器人**。
当前版本为 `0.1.0a1`，提供官方模型和策略的独立 MuJoCo 适配器，以及 ROS2 的速度指令和状态接口。

## 已实现

- 23 关节 MJCF 模型、780 维观测历史、公开 ONNX 策略和 PD 控制。
- 统一的 `VelocityCommand`、`RobotState` 和机器人平台注册入口。
- 显式下载固定版本的上游模型与策略，逐文件检查大小和 SHA256；运行时不自动下载。
- 站立、行走、转向、停车仿真，CSV 日志、JSON 结果及可选视频。
- ROS2 速度指令、关节状态、里程计和状态消息桥接；过期指令归零。
- 配置关节越限、倾斜、非有限数值和 MuJoCo 数值警告触发故障停止，故障保留至显式 reset。

首次接入保持官方默认命令范围：`vx ∈ [-0.4, 0.6] m/s`、`vy ∈ [-0.4, 0.4] m/s`、`wz ∈ [-0.8, 0.8] rad/s`。
此前范围外速度探索的约 1.21 m/s 没有作为此模块的默认指令范围。
本模块目前连接仿真后端；实机驱动、Isaac Lab 训练和复杂地形验收尚未完成。

## 本地启动

以下验收使用 Linux、Python 3.12。ROS2 应使用与系统 ROS 发行版匹配的 Python，见 [ROS2 接入](docs/ROS2.md)。

```bash
cd apps/legged-robot
python3 -m venv --system-site-packages .venv
.venv/bin/pip install -r requirements-sim.txt
.venv/bin/pip install -e '.[sim,test]'
.venv/bin/legged-robot list
.venv/bin/legged-robot fetch-assets --asset-dir assets/roboto-origin
.venv/bin/legged-robot simulate --robot roboto-origin \
  --asset-dir assets/roboto-origin --scenario baseline --duration 20 \
  --output outputs/baseline
```

上游资产约 34.1 MB，来源和提交固定在 [assets.lock.json](configs/roboto_origin/assets.lock.json)。
默认缓存也可通过 `OMINDOS_LEGGED_ASSETS` 指定。支持完全预置资产后离线运行；ONNX Runtime 遥测在创建会话前关闭。

基准时间表为 0–3 秒站立、3–10 秒前进 0.3 m/s、10–14 秒前进并转向、14–20 秒停车。
`--duration` 为物理仿真秒数；默认尽快执行。`--realtime` 按实时节奏运行。
`--scenario constant --vx 0.6` 用于恒定速度命令测试；输入会按官方范围钳制。
故障结果写入输出目录，并返回非零退出码。

视频需要可用的 EGL/Mesa 渲染环境和 `ffmpeg`；后者用于 H264 编码。可选 OpenCV 作为编码后备：

```bash
.venv/bin/pip install -e '.[video]'
MUJOCO_GL=egl .venv/bin/legged-robot simulate \
  --asset-dir assets/roboto-origin --scenario baseline --duration 20 \
  --output outputs/video --video
```

## OmindOS 接口

```python
from omindos_legged.profiles import create_controller
from omindos_legged.types import CommandGate, VelocityCommand
import time

controller = create_controller("roboto-origin", "assets/roboto-origin")
gate = CommandGate(limits=controller.command_limits, timeout_s=0.5)
try:
    # 在导航或任务程序收到新指令时调用 accept；每个控制周期读取 current。
    gate.accept(VelocityCommand(vx=0.3), now=time.monotonic())
    state = controller.step(gate.current(time.monotonic()))
    print(state.to_dict())
finally:
    controller.close()
```

ROS2 接口默认位于 `/legged_robot/` 命名空间，导航程序可通过话题映射连接。
详细说明见 [docs/ROS2.md](docs/ROS2.md)；本次 ROS2 桥接尚未在真实 ROS2 图中端到端验收。
双足运动控制与导航规划通过速度和里程计接口连接，添加其他足式平台时需实现各自适配器。

## 检查与验收

```bash
.venv/bin/python -m pytest
OMINDOS_LEGGED_TEST_ASSETS="$PWD/assets/roboto-origin" .venv/bin/python -m pytest
```

第一条在没有资产的情况下检查接口、资产完整性和 CLI，实际控制器用例会跳过。
第二条加载官方模型和策略，执行控制周期、映射、限幅和故障停止检查。
本次实际链路记录见 [docs/VALIDATION.json](docs/VALIDATION.json)。

## 来源

上游模型、策略与配置保留 RoboParty 来源；本模块软件采用 GPL-3.0-only，机器人描述资产遵循其 CERN-OHL-W-2.0 声明。
资产在首次显式请求时下载，未把上游二进制或机械制造文件复制进 OmindOS 源码。
逐模块许可范围和 ONNX 授权信息的现有说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与 [docs/UPSTREAM.md](docs/UPSTREAM.md)。
