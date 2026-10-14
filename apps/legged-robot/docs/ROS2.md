# ROS2 仿真接口

本模块把 Roboto Origin 的 MuJoCo 仿真接入 OmindOS 的速度指令与状态接口。当前只有仿真后端；不会打开 CAN、串口、网口电机控制器或真实机器人。原有 OmindOS 导航模块可沿用 `cmd_vel` 接口，但目前没有完成 Nav2 导航验收、传感器仿真或实机联调。

## 安装与启动

建议使用 Ubuntu 22.04 和 ROS2 Humble。先按 [ROS2 Humble 官方安装说明](https://docs.ros.org/en/humble/Installation/Ubuntu-Install-Debs.html) 配置 ROS2，并安装消息包和 TF 广播组件：

```bash
sudo apt install ros-humble-ros-base ros-humble-geometry-msgs \
  ros-humble-nav-msgs ros-humble-sensor-msgs ros-humble-std-msgs ros-humble-tf2-ros
source /opt/ros/humble/setup.bash
python3 -m venv --system-site-packages .venv-legged
source .venv-legged/bin/activate
python -m pip install -e 'apps/legged-robot[sim]'
legged-robot fetch-assets --asset-dir ./legged-assets
legged-robot ros2 --robot roboto-origin --asset-dir ./legged-assets
```

使用 `--system-site-packages` 让虚拟环境读取系统安装的 `rclpy`。ROS2 Python 包需要与系统 Python 版本匹配；Ubuntu 22.04 的标准安装使用 Python 3.10。`list`、`fetch-assets`、`simulate` 不需要 ROS2，缺少 ROS2 时 `ros2` 命令会给出明确安装提示。

## 话题与坐标

| 话题 | 类型 | 行为 |
| --- | --- | --- |
| `/legged_robot/cmd_vel` | `geometry_msgs/Twist` | 读取 `linear.x`、`linear.y`、`angular.z`；分别表示机身前向、侧向速度和偏航角速度 |
| `/legged_robot/joint_states` | `sensor_msgs/JointState` | 发布 23 个关节的位置与速度；关节名来自官方模型 |
| `/legged_robot/odom` | `nav_msgs/Odometry` | `legged_robot/odom` 中的基座位置与姿态，`legged_robot/base_link` 中的线速度与角速度 |
| `/legged_robot/state` | `std_msgs/String` | JSON：仿真时间、关节、机身状态、实际生效指令、故障状态及原因 |

安装 `tf2_ros` 时同时广播 `legged_robot/odom → legged_robot/base_link`。没有 `tf2_ros` 时仍发布消息，并提示缺少 TF。姿态接口内部使用四元数 `w,x,y,z`，ROS2 消息按 `x,y,z,w` 对应赋值。位置和速度由 MuJoCo 直接读取，属于仿真真值，未模拟定位误差；消息协方差默认全零，不应解释为测得零误差。

`--namespace fleet/rpo2` 同时更改相对话题的命名空间及默认 TF 前缀，避免与现有四足的 `odom/base_link` 冲突。`--frame-prefix` 可另行指定；显式传入空字符串会使用全局帧，此时必须为整套图隔离 `/tf`、`/tf_static`，或确保仅有一个基座 TF 发布者。重映射话题不会重写消息中的坐标系名。机器人关节 TF 可交给 `robot_state_publisher`，使用 `describe --output` 导出的 URDF和相同话题命名空间。该节点直接拼接帧前缀与连杆名，须设置 `frame_prefix:=legged_robot/`（自定义命名空间示例为 `fleet/rpo2/`），包含末尾 `/`；桥接的 `--frame-prefix legged_robot` 则自行补分隔符。本模块尚未在原生 ROS2 图验证这一组合。

仿真每次计时器回调推进 20 ms，目标频率 50 Hz。ROS2 消息使用节点时钟盖戳，本模块不发布 `/clock`；默认按墙钟使用，并保持 `use_sim_time=false`。计算机执行过慢时仿真会低于实时速度，当前接口不会自动补偿丢失的周期。要集成其他使用仿真时钟的系统，需先统一 `/clock` 与所有节点的时间设置。

同时隔离话题与 TF 时使用本模块的 `--namespace`。ROS 原生 `__ns` 重映射只修改话题命名空间，不会同步修改配置的帧前缀，须另行指定 `--frame-prefix`。

## 指令试验与停止

另开终端并载入同一 ROS2 环境：

```bash
source /opt/ros/humble/setup.bash
ros2 topic pub --rate 10 /legged_robot/cmd_vel geometry_msgs/msg/Twist \
  '{linear: {x: 0.3, y: 0.0}, angular: {z: 0.0}}'
```

前向指令限幅为 `[-0.4, 0.6] m/s`，侧向为 `[-0.4, 0.4] m/s`，偏航为 `[-0.8, 0.8] rad/s`，采用锁定版本的官方策略配置。停止发布指令后，0.5 s 单调时钟看门狗使下一次策略输入归零；归零是请求停车，步态仍需过渡，并不保证基座瞬间静止。NaN 或无穷大指令被拒绝并清空指令。跌倒、关节越限或数值故障会锁定 `fault`，发布零指令并停止推进物理；需要退出、检查原因并重新启动。关闭节点会释放仿真资源。

## 接入 OmindOS / Nav2

例如把现有 `/cmd_vel` 输出重映射到本模块的输入，并把里程计映射到预期名称：

```bash
legged-robot ros2 --asset-dir ./legged-assets --ros-args \
  -r /legged_robot/cmd_vel:=/cmd_vel \
  -r /legged_robot/odom:=/odom \
  -r /legged_robot/joint_states:=/joint_states
```

接口使用未盖戳的 `geometry_msgs/Twist`。若导航版本输出 `TwistStamped`，先配置导航输出格式或增加明确的消息适配器；只改话题名不能转换消息类型。Nav2 还需要地图、传感器、机器人 footprint、`map → odom` 定位和传感器 TF；本模块提供速度指令与基座里程计接口，不能据此宣称已完成导航。接入后先核对消息类型、时间与 TF，再做独立的停止距离、转向、避障及到点验收。

当前已验证内容应以模块 README 的实际运行记录为准。ROS2 桥接的代码与缺依赖提示检查，不等同于已经在 ROS2 Humble 环境完成运行验收。
