# Q1 / MDA1 中文产品页仿真视频 · 2026-10-10 22:20 CST 接续点

用户原任务：分别制作高质量视频，使用自有 CAD/URDF/真实工作台素材；Q1 展示外观、行走、转向、已验证动力学；MDA1 展示实际 CAD、双臂、夹爪、腰部及停车后操作连续流程；标注仿真边界，接入中文详情页，保留原内容并检查桌面手机播放。用户现在要求“下页继续”，本次暂停。

## 当前状态

本分支是未验收草稿，未合并、未部署。产品页面嵌入已有 30 秒 MDA1 和 33 秒 Q1 成片，不代表已补齐原任务全部动作。请先处理下述缺项，再完成发布验收。视频文件本轮未重新渲染。

已读取最新官网 main（4f2a8abbd5805e6489a1ea9b2e7608585441dbb1），中文两个详情页没有视频。已准备：
- cn/robots/quadruped/index.html 与 cn/robots/mobile-dual-arm/index.html 新增 #simulation。
- 独立 cn/product-simulation-20261010.css，仅作用于仿真版块。
- 两个现有 MP4、对应海报与中文动作 VTT，位于 cn/assets/simulations/20261010/，避免触发国际站部署。
- 原有段落、图片、表格、导航和工作台截图保留；新增原生 controls、playsinline、preload=none、16:9、下载入口及文字内容说明；不自动播放。
- 未完成静态审计、仓库 CI/测试、浏览器播放/seek/结束/字幕检查、移动布局检查、线上验证。没有声称这些通过。

## 已复核素材和边界

现有视频于今天 21:23 保存；本轮检查逐段抽帧和制作脚本，已查看两个 3×2 接触表。原制作 validation.json 记录全解码、H.264/yuv420p、faststart；本轮新的解码命令在用户暂停时被中断，须重新确认。

| 素材 | 时长/尺寸 | SHA256 | Library ID |
|---|---|---|---|
| OriginMind-Dual-Arm-Website-1080p.mp4 | 30s, 1920×1080, 30fps; 2,914,315 bytes | 02ca6608dc670bb5c5c4a86861e58faaca74001c7092dd4a23963e4e8885d212 | libfile_680d1ac0b9608191875e4ee8823b1deb |
| OriginMind-Quadruped-Website-1080p.mp4 | 33s, 1920×1080, 30fps; 10,744,940 bytes | 87667460716d545db463e1a29c43323cbf74af19750dc75c54947e0fbf6ff4e8 | libfile_ffd303525290819191cbef39ae32f0a9 |
| 两片制作包 OriginMind-Website-Simulation-Package.zip | 13,887,753 bytes | 未重算 | libfile_9019f19abdec8191aae7b9160e13570a |
| OriginMind-V11-Walk-Trot-Jump-Project.zip | 30,753,822 bytes | 未重算 | libfile_85a223c353ec81919a58fa6c9b456a42 |
| OriginMind-RM75-Integration-20261010.zip | 23,050,929 bytes | 未重算 | libfile_7238144b321881918dfc21523116d3f3 |

四足片使用自有 V1.1 R1 CAD，沿用独立 MuJoCo 平地物理工况：低速行走、小跑、跳跃落地及0.25倍回放。源工程有 VALIDATION.json，三组工况 PASS，包含自由机身、仅关节驱动、力矩/姿态/四连杆闭合/接触检查。34.6kg、±60Nm、摩擦0.85、惯量均为假设/估计，非真机标定。不要把这些称为产品性能。开发仓另有 MEVIUS2 动力学回归，不能混同 Q1。
MDA1 片使用实际整机 CAD，双臂运动明显；底盘始终静止。实际模型 b/6fb/6f 的 URDF 只有腰部和14臂轴，末端 left_tool0/right_tool0 为空坐标系，没有夹爪关节或外观。

### 原请求尚缺
1. Q1 转向场景未在现有33秒视频中展示，不能把相机环绕说成机器人转向。
2. MDA1 成片未覆盖完整停车—腰部—夹爪操作连续流程；实际 CAD 缺夹爪模型，不能私自加参考夹爪冒充实际配置。
3. 腰部已有实际 URDF 可用，可在不虚构参数的前提下补几何运动镜头；车辆整机移动可仅称几何预览，不能冒充真实导航执行。
4. 先完成已有可验证素材的页面接入是本轮支持的部分；若需用户补夹爪CAD/确认型号，在独立有用工作完成后用一个简短问题说明缺口。不要声称完整任务已完成。

## 本地与服务器资源

当前工作区：/workspace/scratch/a58a91dd96cd。repo/ 只是这次改动片段，不是完整checkout，勿盲推整个目录。
此前素材工作区仍存在：
/workspace/scratch/4e32b03e4350/deliverables/
制作脚本：/workspace/scratch/4e32b03e4350/build_product_videos.py
原项目：/workspace/scratch/4e32b03e4350/video_sources/OriginMind-V11-Walk-Trot-Jump-Project/OriginMind-V11-Walk-Trot-Jump/
其中 control.py、simulate_gaits.py、simulate_jump.py、movie.py、v11_dynamics.xml、OBJ、轨迹和检查均在。
实际双臂资源：
/workspace/scratch/4e32b03e4350/video_sources/OriginMind-RM75-Integration-20261010/OriginMind-RM75-Integration-20261010/model-bundle/
Library当前内容优先，路径失效时使用上表ID恢复，避免重复询问。

授权腾讯主机 Desktop Commander device:
f7d97a0e-0317-4b45-8c43-db15f58ada8c (VM-0-3-ubuntu)
中文生产指向 /var/www/omindos.cn/current -> /var/www/omindos.cn/releases/20261009-bilingual-products-assets
这是已核实回滚点，部署前重新检查current以免覆盖别人新发布。仅中文 omindos.cn；不要发布英文站。
服务器剩余磁盘约380MB，/dev/shm约1.8GB；不得清理无关项目。新版本可基于当前目录硬链接复制并对改变文件原子替换，禁止就地写共享硬链接。
先前任务上传了原始视频 base64：
/opt/omindos-site-maintenance/product-videos-20261010/assets/
包含双臂mp4.b64、两个jpg.b64、quad-part0..3.b64。尚未解码、未发布；本轮未修改这些。解码后核对上表 SHA256。
已有完整源码快照及测试、预览发布脚本：
/opt/omindos-site-maintenance/bilingual-release-20261009/source/
/opt/omindos-site-maintenance/bilingual-release-20261009/{publish.py,qa.mjs,media.mjs}
版本不一定最新，应结合GitHub最新源。未观察到正在运行的视频制作/发布进程。
/home/ubuntu/omindos-build/rm75-final-20261010-1826/ 内有最新完整CAD和已验收Ubuntu程序。
远端有 node22、Chrome155、Playwright；本地有ffmpeg、ffprobe、mujoco、trimesh，Playwright模块存在但其chromium路径不存在。
nginx root=/var/www/omindos.cn/current，try_files含/cn回退；部署前确认 /robots/... 和 /cn/robots/... 两份实际路由关系，不能只改错的路径。
最后一次读取发布脚本/nginx canonical文件/审计脚本的组合调用被用户中断，尚无可靠结果。

## 下一页顺序

1. 从本草稿分支继续，读最新main/PR状态和本交接，避免重复上传大视频。
2. 核对未完成镜头，能用实际模型补的继续；无实际夹爪时明确缺项。
3. 跑官网维护skill audit_site.py；仓库现有网站测试、中文SEO及国际发布隔离检查；本任务是静态页面，无单独build命令。
4. 本地或仅127.0.0.1预览，浏览器测试两个视频的play/pause/seek/end/captions、失败兜底和360/390/768/1366布局，查看截图。不要将编码检查代替浏览器播放检查。
5. 发布前简述仅中文两页、仿真范围、通过项和回滚点；用户已授权接入网站，无需重复索要相同授权。只在验收后合并/原子发布。
6. 线上两个规范路径 /robots/quadruped/ 和 /robots/mobile-dual-arm/ 核对HTTPS、视频200/206、海报/字幕、完整播放和手机布局。
7. 交付视频文件链接与产品页链接，明确尚缺项目；若仅源代码完成，不说已上线。
