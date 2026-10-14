# SPDX-License-Identifier: GPL-3.0-only
"""Prepare the module source archive, notes and checksums for a GitHub release."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tomllib
import zipfile


def prepare_release(package_root, output):
    package_root = Path(package_root).resolve()
    output = Path(output).resolve()
    config = tomllib.loads((package_root / "pyproject.toml").read_text())
    version = config["project"]["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:(?:a|b|rc)\d+)?", version):
        raise ValueError("Release version must be an explicit semantic version")
    tag = "legged-robot-v" + version
    output.mkdir(parents=True, exist_ok=True)
    paths = subprocess.check_output(
        ["git", "ls-files", "-z", "--", "."], cwd=package_root
    ).decode().split("\0")
    archive = output / f"legged-robot-{version}-source.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for relative in sorted(path for path in paths if path):
            source = (package_root / relative).resolve()
            if package_root not in source.parents:
                raise ValueError("Source archive path escaped the module")
            bundle.write(source, f"legged-robot-{version}/" + relative)
    artifacts = sorted([*output.glob("*.whl"), *output.glob("*.tar.gz"), archive])
    if not list(output.glob("*.whl")) or not list(output.glob("*.tar.gz")):
        raise ValueError("Build wheel and sdist before preparing the release")
    checksums = "".join(
        hashlib.sha256(path.read_bytes()).hexdigest() + "  " + path.name + "\n"
        for path in artifacts
    )
    (output / "SHA256SUMS.txt").write_text(checksums)
    notes = f"""# OmindOS legged-robot {version}

Roboto Origin 双足仿真模块的描述与接口更新。包含官方模型与 ONNX 策略适配、MuJoCo 仿真、速度/状态接口和可选 ROS2 桥接。

- 66 项测试通过，20 秒站立、前进、转向、停车基准仿真通过。
- 新增无策略、无 MuJoCo 依赖的 URDF/MJCF 描述核验与导出，检查 23 关节及执行器顺序。
- ROS2 话题命名空间与 TF 帧前缀可配置，默认 legged_robot/odom 和 legged_robot/base_link。
- 指令时钟回退、过期或非有限值会清除旧指令；补齐工作台与四足集成边界、许可范围说明。
- 默认前进指令上限为官方配置的 0.6 m/s。
- 模型、策略和网格通过固定提交清单显式下载，并校验 SHA256；发布包不内置上游二进制资产。
- 软件与上游来源、许可说明包含在源码包中。

下载 wheel 后，在文件所在目录安装并启动：

```bash
python -m pip install './omindos_legged_robot-{version}-py3-none-any.whl[sim]'
legged-robot fetch-assets
legged-robot simulate --scenario baseline --duration 20
```

源码 ZIP 解压后可在模块根目录执行 `python -m pip install -e '.[sim]'`。ROS2 环境配置见模块文档。

这是仿真预发布版本。原生 ROS2、Nav2、实机与 Isaac Lab 训练尚未完成验收。
不修改 OmindOS Navigation 正式安装包，也不连接真实电机。

使用 `SHA256SUMS.txt` 核对下载文件。源码 ZIP 可直接解压阅读；tar.gz 为标准 Python 源码发行包。
"""
    (output / "RELEASE_NOTES.md").write_text(notes)
    metadata = {"version": version, "tag": tag,
                "prerelease": bool(re.search(r"(?:a|b|rc)\d+$", version)),
                "artifacts": [path.name for path in artifacts] + ["SHA256SUMS.txt"]}
    (output / "release-metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
    return metadata


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("dist"))
    args = parser.parse_args()
    package_root = Path(__file__).resolve().parents[1]
    print(json.dumps(prepare_release(package_root, args.output)))


if __name__ == "__main__":
    main()
