# Q1 外壳运动回放

已于 2026 年 10 月 15 日发布至 <https://cloud.omindos.cn/quadruped/>，版本为 `q1-motion-v1-20261015T041220Z`。页面使用 Q1 分段简化外壳，回放约 22 秒的起身、站立、行走与停步计算轨迹。质量、惯量、接触和执行器参数仍为估算值，未完成真机标定或性能验收。

公开源码只包含通用生成器、无资产 HTML 模板和浏览器检查脚本。STEP、原始网格、完整模型 HTML、姿态采样、源文件哈希以及私有验收记录均留在私有环境；它们不属于本次源码提交。

`build_articulated_exterior.py` 在每个显示分段的局部坐标中独立体素化、填充、重建表面并简化网格。生成的显示模型使用中性分段名，移除原装配层级和内部零件，记录的姿态用于只读回放。它不能用于制造或精确尺寸测量。

```bash
python -m pip install -r requirements-exterior.txt -r requirements-browser.txt
python build_articulated_exterior.py \
  --reference /private/input/motion-preview.html \
  --output /private/output/exterior-motion
# 独立终端启动仅监听本机的检查服务。
python -m http.server 18110 --bind 127.0.0.1 \
  --directory /private/output/exterior-motion
# 另一个终端执行浏览器检查。
python verify_motion_exterior.py \
  --url http://127.0.0.1:18110/candidate.html \
  --output /private/output/browser-check
```

构建应在隔离环境中执行，输入与输出留在私有目录。浏览器检查覆盖桌面、平板及手机布局、视角、播放与暂停、进度拖动、速度、章节、键盘和缩放，并核对采样读数。通过检查仅表示该候选的显示与回放功能符合断言；不代表真机能够执行同样动作。

`q1-motion-exterior.template.html` 保存无资产的浏览器显示源码，其中的 `__MODEL_INFO__`、`__MODEL_GZIP_BASE64__`、`__REPLAY_GZIP_BASE64__` 和 `__ORIGINMIND_LOGO__` 都是占位符。构建器从私有冻结参考生成候选；模板不能直接作为已构建页面发布。正式发布记录见 `Q1_MOTION_RELEASE.json`，浏览器记录见 `Q1_MOTION_BROWSER_VALIDATION.json`。
