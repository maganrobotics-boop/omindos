"""Description inspection must work before installing or loading a policy."""
import hashlib
import json
import os
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

import pytest

from omindos_legged.description import DescriptionError, load_description


def fixture_description(tmp_path, *, urdf_mesh="../meshes/base.STL", mjcf_mesh="base.STL"):
    """Small original test robot, with the required 23-joint interface shape."""
    root = tmp_path / "cache"
    folder = root / "rpo_description"
    folder.mkdir(parents=True)
    urdf = ET.Element("robot", name="fixture")
    for index in range(24):
        link = ET.SubElement(urdf, "link", name=f"link_{index}")
        if index == 0:
            visual = ET.SubElement(link, "visual")
            geometry = ET.SubElement(visual, "geometry")
            ET.SubElement(geometry, "mesh", filename=urdf_mesh)
        else:
            joint = ET.SubElement(urdf, "joint", name=f"joint_{index}", type="revolute")
            ET.SubElement(joint, "parent", link=f"link_{index - 1}")
            ET.SubElement(joint, "child", link=f"link_{index}")
            ET.SubElement(joint, "axis", xyz="0 1 0")
            ET.SubElement(joint, "limit", lower="-1.0", upper="1.0", effort="50", velocity="4")
    mjcf = ET.Element("mujoco", model="fixture")
    ET.SubElement(mjcf, "compiler", angle="radian", meshdir="../meshes")
    default = ET.SubElement(mjcf, "default")
    ET.SubElement(default, "joint", limited="true")
    ET.SubElement(default, "motor", ctrllimited="true")
    asset = ET.SubElement(mjcf, "asset")
    ET.SubElement(asset, "mesh", name="base", file=mjcf_mesh)
    worldbody = ET.SubElement(mjcf, "worldbody")
    body = ET.SubElement(worldbody, "body", name="link_0")
    ET.SubElement(body, "joint", name="floating_base", type="free", limited="false")
    for index in range(1, 24):
        body = ET.SubElement(body, "body", name=f"link_{index}")
        ET.SubElement(body, "joint", name=f"joint_{index}", range="-0.75 0.8", axis="0 1 0")
    actuator = ET.SubElement(mjcf, "actuator")
    for index in range(1, 24):
        ET.SubElement(actuator, "motor", name=f"motor_{index}", joint=f"joint_{index}", ctrlrange="-27 27")
    payloads = {"rpo_description/urdf/rpo.urdf": ET.tostring(urdf),
                "rpo_description/mjcf/rpo.xml": ET.tostring(mjcf),
                "rpo_description/meshes/base.STL": b"test mesh data",
                "rpo_description/LICENSE": b"original test fixture license"}
    fields = {"model_path": "rpo_description/mjcf/rpo.xml",
              "policy_path": "roboparty_inference/policy.onnx",
              "config_path": "roboparty_inference/default.yaml",
              "robot_path": "roboparty_inference/robot.yaml"}
    # Inference paths exist in the manifest, but their files are deliberately absent.
    all_payloads = {**payloads, **{path: b"not installed" for path in list(fields.values())[1:]}}
    sources = [{"name": name, "repository": f"Roboparty/{name}", "commit": "a" * 40}
               for name in ("rpo_description", "roboparty_inference")]
    files = [{"path": path, "sha256": hashlib.sha256(content).hexdigest(), "size_bytes": len(content),
              "url": f"https://raw.githubusercontent.com/Roboparty/{path.split('/')[0]}/" + "a" * 40 + "/" + path.split("/", 1)[1]}
             for path, content in all_payloads.items()]
    locked = {"schema_version": 1, "robot": "roboto-origin", "sources": sources, "files": files, **fields}
    manifest = tmp_path / "assets.lock.json"
    manifest.write_text(json.dumps(locked), encoding="utf-8")
    for relative, content in payloads.items():
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    return root, manifest


def mutate_model(root, manifest, relative, mutate):
    """Pin a changed fixture so validation exercises structure, not hash checks."""
    path = root / relative
    xml = ET.fromstring(path.read_bytes())
    mutate(xml)
    content = ET.tostring(xml)
    path.write_bytes(content)
    locked = json.loads(manifest.read_text())
    entry = next(entry for entry in locked["files"] if entry["path"] == relative)
    entry.update(sha256=hashlib.sha256(content).hexdigest(), size_bytes=len(content))
    manifest.write_text(json.dumps(locked))


def test_model_only_inspection_requires_no_policy_simulator_or_numpy(tmp_path, monkeypatch):
    root, manifest = fixture_description(tmp_path)
    for dependency in ("mujoco", "onnxruntime", "numpy", "yaml"):
        monkeypatch.setitem(sys.modules, dependency, None)
    description = load_description(root, manifest)
    assert description.root_link == "link_0"
    assert len(description.links) == 24
    assert description.joint_names == tuple(f"joint_{index}" for index in range(1, 24))
    assert description.actuator_joint_names == description.joint_names
    assert len(description.verified_paths) == 4
    assert all(path.startswith("rpo_description/") for path in description.verified_paths)
    data = description.to_dict()
    assert data["urdf"]["joints"][0]["limits"] == {"lower": -1, "upper": 1, "effort": 50, "velocity": 4}
    assert data["mjcf"]["joints"][1]["range"] == (-0.75, 0.8)
    assert data["mjcf"]["actuators"][0]["control_range"] == (-27, 27)
    assert data["limit_sources"]["inference_config"].startswith("not loaded")
    json.dumps(data, allow_nan=False)
    description.validate_joint_names(description.joint_names)


def test_export_uses_local_mesh_uri_and_does_not_modify_upstream_bytes(tmp_path):
    root, manifest = fixture_description(tmp_path)
    path = root / "rpo_description/urdf/rpo.urdf"
    original = path.read_bytes()
    description = load_description(root, manifest)
    exported = ET.fromstring(description.urdf_xml())
    assert exported.find("link/visual/geometry/mesh").get("filename") == (root / "rpo_description/meshes/base.STL").as_uri()
    assert path.read_bytes() == original
    copied = description.to_dict()
    copied["urdf"]["joints"][0]["name"] = "modified by consumer"
    assert description.joint_names[0] == "joint_1"


def test_controller_reordered_or_mismatched_names_are_rejected(tmp_path):
    root, manifest = fixture_description(tmp_path)
    description = load_description(root, manifest)
    for names in (tuple(reversed(description.joint_names)), ("unknown", *description.joint_names[1:])):
        with pytest.raises(DescriptionError, match="Controller joint names/order"):
            description.validate_joint_names(names)


@pytest.mark.parametrize("alter", ["joint name", "actuator name", "actuator order"])
def test_mjcf_joint_identity_and_actuator_order_must_match_urdf(tmp_path, alter):
    root, manifest = fixture_description(tmp_path)
    def mutate(xml):
        if alter == "joint name":
            xml.find("worldbody/body/body/joint").set("name", "unknown")
        elif alter == "actuator name":
            xml.find("actuator/motor").set("joint", "unknown")
        else:
            actuator = xml.find("actuator")
            first = actuator[0]
            actuator.remove(first)
            actuator.append(first)
    mutate_model(root, manifest, "rpo_description/mjcf/rpo.xml", mutate)
    with pytest.raises(DescriptionError, match="names/order do not match"):
        load_description(root, manifest)


def test_duplicate_urdf_joint_names_are_rejected(tmp_path):
    root, manifest = fixture_description(tmp_path)
    mutate_model(root, manifest, "rpo_description/urdf/rpo.urdf",
                 lambda xml: xml.findall("joint")[1].set("name", "joint_1"))
    with pytest.raises(DescriptionError, match="duplicate URDF joint"):
        load_description(root, manifest)


@pytest.mark.parametrize("reference", ["../../outside.STL", "file:///tmp/outside.STL", "https://example.test/mesh.STL", "package://another_robot/meshes/base.STL"])
def test_urdf_mesh_reference_cannot_escape_description_tree(tmp_path, reference):
    root, manifest = fixture_description(tmp_path, urdf_mesh=reference)
    with pytest.raises(DescriptionError, match="description|local"):
        load_description(root, manifest)


def test_mesh_symlink_cannot_escape_description_tree(tmp_path):
    root, manifest = fixture_description(tmp_path)
    mesh = root / "rpo_description/meshes/base.STL"
    outside = tmp_path / "outside.STL"
    outside.write_bytes(mesh.read_bytes())
    mesh.unlink()
    mesh.symlink_to(outside)
    with pytest.raises(DescriptionError, match="outside the description"):
        load_description(root, manifest)


def test_mjcf_meshdir_cannot_escape_description_tree(tmp_path):
    root, manifest = fixture_description(tmp_path)
    mutate_model(root, manifest, "rpo_description/mjcf/rpo.xml",
                 lambda xml: xml.find("compiler").set("meshdir", "../../outside"))
    with pytest.raises(DescriptionError, match="outside the description"):
        load_description(root, manifest)


@pytest.mark.parametrize("relative", ["rpo_description/LICENSE", "rpo_description/meshes/base.STL"])
def test_description_meshes_and_license_must_match_manifest(tmp_path, relative):
    root, manifest = fixture_description(tmp_path)
    (root / relative).write_bytes(b"tampered")
    with pytest.raises(DescriptionError, match="Missing or changed description asset"):
        load_description(root, manifest)


def test_unpinned_mesh_is_rejected_even_when_present(tmp_path):
    root, manifest = fixture_description(tmp_path)
    locked = json.loads(manifest.read_text())
    locked["files"] = [entry for entry in locked["files"] if not entry["path"].endswith("base.STL")]
    manifest.write_text(json.dumps(locked))
    with pytest.raises(DescriptionError, match="not pinned"):
        load_description(root, manifest)


def test_optional_official_description_assets():
    configured = os.environ.get("OMINDOS_LEGGED_TEST_ASSETS")
    if not configured:
        pytest.skip("Set OMINDOS_LEGGED_TEST_ASSETS to the pinned official asset cache")
    description = load_description(Path(configured))
    assert description.root_link == "base_link"
    assert len(description.links) == 24
    assert len(description.mesh_paths) == 24
    assert description.joint_names[0] == "left_thigh_yaw_joint"
    assert description.joint_names[-1] == "right_elbow_yaw_joint"
    assert description.mjcf_angle_unit == "radian"
    assert description.actuator_joint_names == description.joint_names
