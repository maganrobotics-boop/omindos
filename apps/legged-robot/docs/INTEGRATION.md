# Navigation 与工作台集成边界

核对日期：2026-10-15。此文记录实际读取的源码与本地验证范围。

## 核对的来源

| 仓库 | 核对提交 | 作用 |
| --- | --- | --- |
| `Omind-Robotics/OmindOS-Navigation` | `63c5b578757fffcd642907be8c002d9feecae958` | 导航开发仓、四足控制、参数工作台、发行构建脚本 |
| `maganrobotics-boop/OmindOS-Navigation-Release` | `17f056fee0ed9714befd0460a8291c5d73e1c8ab` | 公开下载说明与第三方声明 |
| `maganrobotics-boop/omindos`，PR #105 | `f1ab715437ba7e43cbfb219305be1e35d679df58` | 已有 `apps/legged-robot` 开发模块，本次在其基础上继续 |

Release 仓的 `README.md` 推荐 `v0.2.0-preview.8` Ubuntu 完整包，声明包含 ROS 2、MEVIUS2 四足策略与 MuJoCo 环境。这是现有四足包的说明，不构成 Roboto Origin 兼容性证据；本次未重新构建或替换该包。

## 模块隔离

`apps/legged-robot` 保持独立 Python 项目。运行、安装、资源缓存与机器人适配器均在本模块内；不修改 Navigation 的 MEVIUS2 控制器、正式安装包或已有参数存储。

Navigation 的以下实现与四足参考模型绑定，不能换一个 MJCF 路径后直接作为双足控制器使用：

- `scripts/quadruped_controller.py`：固定 MEVIUS2 提交、策略摘要、12 关节名称、关节限位及观测约定。
- `scripts/quadruped_backends.py` 中的 `MujocoBackend`：加载 `models/scene.xml`，按 MEVIUS2 名称查找关节、执行器与姿态传感器，并要求 200 Hz 物理周期。
- `scripts/quadruped_worker.py`：控制线程、四足生命周期及本机 HTTP 接口，默认端口 `18097`。
- `scripts/quadruped_ros2.py`：`/omindos_quadruped/` 话题及服务；速度输入是带 `base_link` 坐标系与时间戳检查的 `geometry_msgs/TwistStamped`。

`scripts/joint_interface.py` 的关节名映射、rad 单位、序号、会话和超时字段可作为未来共同接口的参考。本模块目前使用自身的 `VelocityCommand`、`RobotState` 与 Roboto Origin 23 关节适配器，没有导入四足策略或驱动。

两类机器人应分别运行，并显式选择导航输出的接收方。不得将双足速度话题映射到已有四足执行器，也不得因导入模型而打开电机接口。

## ROS 2 与导航

Navigation 的 `src/nav3d_native/nav3d_native/platform_adapter_node.py` 使用以下边界：

| 话题 | 类型 | 语义 |
| --- | --- | --- |
| `/omindos_preview/navigation/cmd_vel` | `geometry_msgs/Twist` | 导航控制器输出，输入到平台防护适配器 |
| `/omindos_preview/robot/cmd_vel` | `geometry_msgs/Twist` | 经过防护适配器的模拟底盘速度指令 |
| `/omindos_preview/odom` | `nav_msgs/Odometry` | 适配器观察的底盘里程计 |
| `/omindos_preview/localization/pose` | `geometry_msgs/PoseStamped` | 定位结果；现有节点要求 `map` 坐标系 |
| `/omindos_preview/plan` | `nav_msgs/Path` | 路径；现有节点要求 `map` 坐标系 |
| `/omindos_preview/emergency_stop` | `std_msgs/Bool` | 平台适配器的急停输入 |

现有防护适配器同时检查速度、定位、里程计、路径与急停。只连接 `cmd_vel` 和 `odom` 不会完成导航闭环。Roboto Origin 仿真里程计是 MuJoCo 状态反馈，不是已验证的真实传感器定位。

本模块 ROS 2 桥接默认使用 `/legged_robot/` 话题命名空间和 `legged_robot/` 帧前缀，可通过 `--namespace` 与 `--frame-prefix` 显式调整。默认帧隔离可避免同时运行其他机器人时争用 `odom` 或 `base_link`。ROS 话题重映射不会改写消息内部的帧名称。

在**独立仿真环境**里与当前 Navigation preview 对接时，可以采用如下映射示例：

```bash
legged-robot ros2 --robot roboto-origin \
  --asset-dir assets/roboto-origin \
  --namespace /legged_robot --frame-prefix '' \
  --ros-args \
  -r /legged_robot/cmd_vel:=/omindos_preview/robot/cmd_vel \
  -r /legged_robot/odom:=/omindos_preview/odom \
  -r /tf:=/omindos_preview/tf \
  -r /tf_static:=/omindos_preview/tf_static
```

这里显式取消帧前缀，是为了满足现有 Navigation 适配器对 `odom` / `base_link` 的检查；同时将 TF 话题隔离到 `/omindos_preview/`。同一隔离环境中不能再启动另一个发布 `odom` → `base_link` 的仿真器。另一种后续方案是让导航节点的帧检查也支持统一前缀，但本次未修改 Navigation。

`src/nav3d_native/launch/platform_preview.launch.py` 已对 TF 话题进行上述隔离，但它还会启动轮式几何仿真器；不能原样启动后再加双足桥接。未来应准备独立 launch，替换模拟底盘和里程计来源，并补齐定位、地图、路径和停止检查。

此命令是接口映射说明，**未证明真实 ROS 2 图、Nav2 或完整导航链路已经通过验收**。本模块与 Navigation 四足的 `TwistStamped` 入口类型不同，不能靠重映射互换；需要明确的消息转换及时间有效性规则。

当前桥接发布关节状态、里程计、JSON 状态和可选机身 TF，尚不发布 ROS `robot_description` 或完整关节树 TF。模型描述与完整 RViz 展示需后续独立接入。

## 参数工作台

已使用核对提交中的 `scripts/robot_kinematics.py` 实际执行 `build_model()` 与 `pose()`，输入官方 `rpo_description/urdf/rpo.urdf`：

- 根连杆 `base_link`，24 个连杆，23 个活动关节；结构与零位姿计算成功。
- 官方网格尚未列入工作台资源目录，解析器返回“mesh 未列入本地资源，以关节骨架显示”警告。
- 该检查没有启动浏览器，也没有完成带外观资源的工作台视觉验收、完整驱动参数保存或自由浮动机身控制。

工作台 `scripts/robot_workbench.py` 的 `POST /v1/robot-model` 接受 `urdf_xml` 与可选关节位置；其 HTTP 服务与 ROS 关节预览是不同进程。`POST /v1/runtime/load` 加载的是参数存储里的固定基座关节预览配置，不是本模块的平衡或行走策略。

`scripts/robot_assets.py` 只允许显式登记的本地资源；`scripts/robot_model_bundle.py` 的现有资源包注册固定为 RM75。Roboto Origin 的 STL 需要未来另建资源包：固定来源提交、逐文件大小与摘要、目录范围检查和独立 URL 命名空间。不能让导入的 URDF 自行读取任意文件或下载外部网址，也不能将 RM75 包标识挪用于 RPO。

本次没有将官方网格复制到 Navigation 的 `config/robot_models`，没有改写工作台默认机器人。描述加载与关节映射由本模块负责，工作台的可选视觉集成属于后续工作。

## 打包与发布

Navigation 的 `release/control-preview/compile_native.py` 显式列举编译模块与资源；`release/workbench/package_binary.py` 也显式列举模块、图片、配置和网格。当前列表不包含 `omindos_legged` 或 Roboto Origin 资产。

此后续开发分支不合并、不调度发布，也不修改 Navigation 构建或版本号。模块不会自行进入 Navigation 的现有显式打包路径；加入任何安装包、公开发布或商业分发均需单独决定、检查许可范围，并做针对该成品的验收。独立进程和分开下载不能自动替代许可证义务，具体来源见 `THIRD_PARTY_NOTICES.md`。

## 验收层级

| 层级 | 需要的证据 | 本次范围与限制 |
| --- | --- | --- |
| 模型加载 | 固定来源与摘要；URDF 树、关节映射、MJCF 编译检查 | 工作台解析器已验证 24 连杆 / 23 关节；外观资源在工作台尚不可用。模型加载不能证明会稳定行走。 |
| 策略运行 | 已校验权重；实际物理步进；观测/动作顺序、限幅、故障及停止记录 | 使用已有独立 MuJoCo/ONNX 适配器，执行结果以本次运行记录为准；短时仿真不代表复杂地形、长期稳定性或速度上限。 |
| ROS 2 图 | 匹配的 ROS/Python 环境；实际话题类型、频率、帧、TF、命令超时及退出测试 | 接口已实现，真实图与导航闭环仍需单独运行验证；消息对象测试不等同于 ROS 图验收。 |
| 真实机器人 | 真实型号/固件、零点与传动、传感器、反馈、停止与独立看门狗等实机证据 | 本次不连接电机；没有实机控制或硬件验收结论。 |

CAD、GPU 训练与新策略训练不是描述加载的前置条件。缺少这些资源时只记录相应未验证范围；不会把模型加载、现成策略的短时运行或接口定义写成完整机器人能力已完成。
