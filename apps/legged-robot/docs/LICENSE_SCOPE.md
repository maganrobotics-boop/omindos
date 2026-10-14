# legged-robot 许可证与资源边界

核查日期：2026-10-15（北京时间）。本记录区分已读取的许可证声明、资产版本和本模块的工程边界；不将目录隔离或下载缓存解释为自动满足所有许可要求。本轮不修改正式 Navigation 发行包，不接入真实电机。

## 本模块与实际使用资源

`apps/legged-robot` 的 Python/ROS 2 适配代码采用 **GPL-3.0-only**，完整文本见 [`../LICENSE`](../LICENSE)。该声明不重新许可 OmindOS 其他应用、机器人描述、运行时依赖或第三方资料。

| 资源 | 固定版本与直接证据 | 本模块处理 |
| --- | --- | --- |
| [rpo_description](https://github.com/Roboparty/rpo_description/tree/8e0f8f78903dc147a5c094c0fdc14b4a78f1b667) | `8e0f8f78903dc147a5c094c0fdc14b4a78f1b667`；README 明确声明目录文件为 CERN-OHL-W-2.0，LICENSE 为对应完整文本 | 外部缓存中的原始 URDF、平地 MJCF、24 个 STL；同时保留 README 与 LICENSE |
| [roboparty_inference](https://github.com/Roboparty/roboparty_inference/tree/c4238d1560bc795e61226074f4ee4b0a256a8901) | `c4238d1560bc795e61226074f4ee4b0a256a8901`；LICENSE 为 GPL v3，package.xml 标记 GPL-3.0，debian/copyright 明确写 version 3 | 外部缓存中的 default.yaml、robot.yaml 和 policy.onnx；保留三份许可与版权文件；不并入上游 C++ 推理实现或 cnpy 子模块 |

[`../configs/roboto_origin/assets.lock.json`](../configs/roboto_origin/assets.lock.json) 为上述每个下载文件固定提交、SHA-256 和字节数。下载至独立缓存是可复现和可审查的工程边界，并不消除下载、修改、使用或后续分发资产时的许可义务。缓存不能统一改标为本模块的软件许可证。

推理仓库的 `debian/copyright` 对 `Files: *` 记录 2025–2026 Luo1imasi，对 `debian/*` 记录 2026 wentywenty。所用提交未提供独立的模型卡、权重许可证或训练数据授权说明。仓库范围声明已保留，但不能据此宣称训练数据和所有模型来源均已核验。后述聚合仓的权重来源声明属于另一提交的证据，不能自动补足此固定提交的完整训练记录。

## 另行检查的上游仓库

下表中的仓库只用于核查结构、许可证和版本差异；没有因此进入本模块的下载清单或商业发行包。

| 仓库与已读取版本 | 声明及例外 |
| --- | --- |
| [roboto_origin](https://github.com/Roboparty/roboto_origin/tree/c71fd9287d28104dca111d7c25b908fa3f45f8e4) @ `c71fd9287d28104dca111d7c25b908fa3f45f8e4` | LICENSES.md 明确说明这是多许可证快照聚合仓；RoboParty 原创聚合层默认 GPL-3.0-only，下级许可证优先。不能只凭根 LICENSE 给整仓重新授权 |
| [roboparty_deploy](https://github.com/Roboparty/roboparty_deploy/tree/4ffaf9957347a5e2016a6f5deafcbaae6e4c8f64) @ `4ffaf9957347a5e2016a6f5deafcbaae6e4c8f64` | README/LICENSES.md：RoboParty 原创内容 GPL-3.0-only；子模块、已打包二进制和第三方资产分别授权。其推理子模块指向 `2a2158030754aa3ac5bef3774df9b0d6bc55c716`，不同于本模块的固定推理提交 |
| [roboparty_train](https://github.com/Roboparty/roboparty_train/tree/92008a6317d6d0efe8b58abc2fb3c630c75992c0) @ `92008a6317d6d0efe8b58abc2fb3c630c75992c0` | 根 README 声明 BSD-3-Clause；根目录未包含独立 LICENSE。不能将它统一描述为 GPL |
| [robolab](https://github.com/Roboparty/robolab/tree/6b1c3d9988497c8961dcba77892de32edc1770e1) @ `6b1c3d9988497c8961dcba77892de32edc1770e1` | 已初始化并读取该训练子模块 LICENSE：BSD-3-Clause，含 Isaac Lab/RoboLab 版权通知；仍需按文件检查第三方例外 |
| [rsl_rl](https://github.com/Roboparty/rsl_rl/tree/6986d4d1b9fbab96fb61d51f07de419bc95432f1) @ `6986d4d1b9fbab96fb61d51f07de419bc95432f1` | 已初始化并读取该训练子模块 LICENSE：BSD-3-Clause；文件要求参阅 `licenses/dependencies` 中的依赖许可 |

聚合仓该提交的 [`THIRD_PARTY_NOTICES.md`](https://github.com/Roboparty/roboto_origin/blob/c71fd9287d28104dca111d7c25b908fa3f45f8e4/THIRD_PARTY_NOTICES.md) 另行记录：

- `modules/roboparty_train/robolab/` 的部分 Parkour 内容来自 InstinctLab，采用 **CC-BY-NC-4.0**；不能把这部分改标为 BSD 或 GPL，或因根目录声明而视作已取得商业使用权。
- 动作数据 `.pkl`、`.npz`、`.csv` 的来源、作者、许可和转换授权仍待补齐。
- Rockchip 内核 `.deb`、缓存固件及部分预编译文件仍缺来源和再分发依据。
- 快照中 RPO 的九个 ONNX 模型声明为 RoboParty 自训练并拥有版权，同时要求发行记录注明每个模型的训练提交、配置和数据来源。这不是对本模块所选单个旧推理提交的完整模型卡。

本模块不复制这些训练内容、动作数据、固件、内核包或 CAD；本轮也不导入整个聚合仓。后续新增资源必须重新核对该资源自己的来源与许可，不能沿用“RoboParty 整仓 GPL”的假设。

## 模型版本不能混用

直接 `rpo_description` 固定提交与上述聚合快照的 `rpo_description` 并非完全相同。其 LICENSE 和 URDF 字节一致，但平地、楼梯和地形 MJCF 均不同。以下为平地 MJCF 的代表性范围差异（rad）：

| 关节 | 聚合快照 MJCF | 直接固定 MJCF 与 URDF |
| --- | --- | --- |
| left_thigh_roll_joint | [-0.2, 2] | [-0.2, 1] |
| left_thigh_pitch_joint | [-2.5, 0.8] | [-2.094, 0.7854] |
| left_knee_joint | [0, 2.5] | [-0.2, 2.5] |
| left_ankle_pitch_joint | [-0.7, 0.7] | [-0.6, 0.6] |
| torso_joint | [-2.62, 2.62] | [-3.14, 3.14] |

直接模型的 `scripts/check_limits.py` 已运行通过：三个 MJCF 的 23 个关节范围和电机力矩范围均与同提交 URDF 一致。URDF 的 23 个可动关节顺序、MJCF 关节树顺序和 MJCF 执行器顺序一致；策略 YAML 的 `usd2urdf` 为另一个排列，仍须显式转换。以上检查仅说明描述和限位一致，不证明配套策略已稳定行走，也不验证真实机械限位。

## 代码包、缓存和后续分发

当前 `pyproject.toml` 的 wheel 只纳入适配代码和资产清单；sdist 纳入本模块源码、文档、测试和清单。二者均不内置上游模型、网格、策略权重、训练数据或 CAD。正式 Navigation 安装包和四足资源未因本轮变更而重新打包。源码归档也须保持这一边界，避免误收集本地缓存。

GPL 允许商业使用和收费分发；“商业”本身不是禁止条件。分发 GPL 源码须保留通知与许可证，分发其非源码形式还须满足对应源码等条件；适配代码的具体分发应遵循 [GPL v3 第 4–6 节](https://www.gnu.org/licenses/gpl-3.0.en.html)。不同程序能否构成独立聚合，既涉及通信方式也涉及交换内容；目录、进程、ROS 2 消息或独立下载不能单独提供确定结论，见 [GNU 官方聚合与组合说明](https://www.gnu.org/licenses/gpl-faq.en.html#MereAggregation)。

对 CERN-OHL-W-2.0 资源，原样分发须保留通知；分发修改后的 Covered Source 须记录修改日期与内容并遵守同许可要求；相关 Product 的制造和分发涉及 Complete Source 或 Source Location 等条件，见 [官方许可全文第 3–4 节](https://gitlab.com/ohwr/project/cernohl/-/wikis/uploads/82b567f43ce515395f7ddbfbad7a8806/cern_ohl_w_v2.txt) 和 [OHWR 许可入口](https://ohwr.org/licences/)。许可证对 External Material 的定义也有具体条件，不能仅因代码位于独立目录就认定适用。

如后续要把缓存资产加入安装镜像、客户套件或二进制发行，应以实际组成重新核查：保留各来源通知，补足对应源码与构建资料，记录模型和数据来源，并明确修改后的描述文件及其来源位置。本轮的隔离开发和哈希验证为这些审查提供证据，不代表已经批准该类分发。
