# Roboto Origin 上游资源

本模块以 Roboto Origin 作为首个双足机器人后端。仿真资源从 RoboParty 官方仓库下载，原文件不改写；OmindOS 负责速度命令、状态接口和仿真运行。该模块不包含真实电机、CAN 或串口驱动。

## 固定版本与资源完整性

`configs/roboto_origin/assets.lock.json` 固定以下源码版本，并为每个下载文件记录 SHA-256 和字节数：

| 来源 | 固定提交 | 用途 |
| --- | --- | --- |
| [Roboparty/rpo_description](https://github.com/Roboparty/rpo_description/tree/8e0f8f78903dc147a5c094c0fdc14b4a78f1b667) | `8e0f8f78903dc147a5c094c0fdc14b4a78f1b667` | MJCF、24 个 STL 网格及 URDF |
| [Roboparty/roboparty_inference](https://github.com/Roboparty/roboparty_inference/tree/c4238d1560bc795e61226074f4ee4b0a256a8901) | `c4238d1560bc795e61226074f4ee4b0a256a8901` | ONNX 策略、观测配置和 PD 参数 |

清单共 34 个文件，总计 34,141,780 字节，含模型、24 个网格、URDF、策略、2 份 YAML 配置，以及上游许可证、README 和版权声明。`mjcf/rpo.xml` 的所有外部 `file` 依赖均已纳入；地面和纹理由 MJCF 内置定义生成，无外部纹理文件或 `<include>`。该清单仅覆盖平地基础策略，不包含楼梯、地形、起身、舞蹈模型或训练数据。

大型资产保存在下载缓存中，不进入 OmindOS 主仓库。缓存仍保留两个上游目录及其 LICENSE，不能把所有资产统一改标为本模块的软件许可证。更新版本时应同时更新完整依赖清单、哈希和验证记录；单独替换策略或模型不能证明版本配套。

## 策略约定

以下值来自固定提交的 `robots/rpo/configs/default.yaml` 和 `robots/rpo/robot.yaml`：

| 项目 | 上游值 |
| --- | --- |
| 动作维度 | 23 |
| 单帧观测 | `ang_vel:3, gravity_b:3, cmd_vel:3, dof_pos:23, dof_vel:23, last_action:23`，合计 78 |
| 历史堆叠 | 10 帧，`frame_major`，输入共 780 维 |
| 控制周期 | `dt=0.004` × `decimation=5` = 0.020 秒，50 Hz |
| MuJoCo 积分周期 | `rpo.xml` 中 0.001 秒 |
| 动作缩放 | 0.25，叠加到 `joint_default_angle` |
| 前后速度命令 | `[-0.4, 0.6]` m/s |
| 横向速度命令 | `[-0.4, 0.4]` m/s |
| 转向角速度命令 | `[-0.8, 0.8]` rad/s |
| 跌倒判断配置 | `gravity_z_upper=-0.5` |

`usd2urdf` 定义策略与模型关节顺序转换；`robot.yaml` 的 `kp`、`kd` 定义 PD 参数。其余电机标识、闭链映射、符号和零偏是实机配置，不用于驱动本模块的仿真执行器。OmindOS 默认速度命令遵守上游 `clip_cmd`；范围外仿真探索不等于官方支持范围或实机最大速度。

MJCF 自带关节范围和力矩范围。配置 YAML 的软件限位与 MJCF 不完全相同，二者应同时检查。本模块未验证机械版本、真实电机或实体机器人的这些限位；仿真通过不能替代实机标定。

## 已核实的许可证范围

`rpo_description/README.md` 明确声明该目录文件使用 **CERN-OHL-W-2.0**，根目录 LICENSE 保留其原文。这一声明覆盖本清单使用的 MJCF、URDF 和网格；并未在本模块中复制机械 CAD 或 PCB 源文件。

`roboparty_inference/LICENSE` 为 GNU GPL 第 3 版，`package.xml` 标记 `GPL-3.0`；`debian/copyright` 的 `Files: *` 声明 GPL-3.0，并明确写“version 3”。本模块新增 Python/ROS2 代码采用 **GPL-3.0-only**，完整原文位于 `../LICENSE`。这只描述 `apps/legged-robot` 的许可，不重新许可整个 OmindOS 仓库。

`policy.onnx` 位于上述推理仓库，固定提交未提供独立模型卡、权重许可证或训练数据授权说明。本模块保留仓库层面的许可证和版权信息，并不据此认定模型训练数据、第三方权重或所有权来源已获单独核验。若后续单独分发权重、提供成品套件或上线商业服务，应先向上游确认未说明的权重与数据授权范围。

未下载或纳入上游 `thirdparty/cnpy` 子模块，也未复制该仓库的硬件驱动或整个 C++ 推理程序。Python 包、MuJoCo、ONNX Runtime、ROS2 和各依赖保持各自许可证，详见 `../THIRD_PARTY_NOTICES.md`。
