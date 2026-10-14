# SPDX-License-Identifier: GPL-3.0-only
"""Inspect the pinned robot description without loading a policy or simulator.

The URDF and MJCF remain upstream-owned cache files. Their position limits are
reported separately: neither format substitutes for the inference configuration
or establishes safe limits for hardware. Loading a description is not evidence
that a robot can stand or walk.
"""
from copy import deepcopy
from dataclasses import dataclass
import math
from pathlib import Path
from urllib.parse import unquote, urlparse
import xml.etree.ElementTree as ET

from .assets import AssetError, _asset_path, _valid, load_manifest


class DescriptionError(AssetError):
    """A locked description is incomplete, inconsistent or unsafe to resolve."""


def _xml(content, label):
    if b"<!DOCTYPE" in content.upper() or b"<!ENTITY" in content.upper():
        raise DescriptionError(f"DTD and entity declarations are unsupported: {label}")
    try:
        return ET.fromstring(content, parser=ET.XMLParser(target=ET.TreeBuilder(insert_comments=True)))
    except ET.ParseError as exc:
        raise DescriptionError(f"Invalid XML in {label}: {exc}") from exc


def _number(value, label):
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise DescriptionError(f"Invalid numeric value: {label}") from exc
    if not math.isfinite(result):
        raise DescriptionError(f"Nonfinite numeric value: {label}")
    return result


def _vector(value, size, label):
    result = tuple(_number(item, label) for item in value.split())
    if len(result) != size:
        raise DescriptionError(f"Expected {size} values: {label}")
    return result


def _named(elements, label):
    names = [element.get("name") for element in elements]
    if any(not name or not name.strip() for name in names) or len(set(names)) != len(names):
        raise DescriptionError(f"Missing or duplicate {label} names")
    return names


def _origin(element):
    child = element.find("origin")
    return {"xyz": _vector(child.get("xyz", "0 0 0") if child is not None else "0 0 0", 3, "origin xyz"),
            "rpy": _vector(child.get("rpy", "0 0 0") if child is not None else "0 0 0", 3, "origin rpy")}


def _resolve_reference(reference, base, description_root):
    """Accept local relative paths and this description's package URI only."""
    if not reference or "\\" in reference or "\x00" in reference:
        raise DescriptionError("Invalid mesh reference")
    uri = urlparse(reference)
    if uri.scheme == "package" and uri.netloc == description_root.name:
        if uri.query or uri.fragment:
            raise DescriptionError("Mesh references cannot contain query or fragment")
        relative = unquote(uri.path).lstrip("/")
        base = description_root
    elif uri.scheme or uri.netloc or uri.query or uri.fragment:
        raise DescriptionError("Only local description mesh paths are supported")
    else:
        relative = unquote(reference)
    if Path(relative).is_absolute() or "\\" in relative or "\x00" in relative:
        raise DescriptionError("Absolute mesh paths are unsupported")
    target = (base / relative).resolve()
    if description_root not in target.parents:
        raise DescriptionError("Mesh path resolves outside the description tree")
    return target


@dataclass(frozen=True)
class RobotDescription:
    robot_id: str
    asset_root: Path
    description_root: Path
    urdf_path: Path
    mjcf_path: Path
    root_link: str
    urdf_name: str
    mjcf_name: str
    links: tuple
    joints: tuple
    mjcf_bodies: tuple
    mjcf_joints: tuple
    actuators: tuple
    mjcf_angle_unit: str
    mesh_paths: tuple
    verified_paths: tuple
    sources: tuple
    _urdf_bytes: bytes
    _mesh_uris: dict

    @property
    def joint_names(self):
        return tuple(joint["name"] for joint in self.joints if joint["type"] == "revolute")

    @property
    def actuator_joint_names(self):
        return tuple(actuator["joint"] for actuator in self.actuators)

    def validate_joint_names(self, names):
        """Require controller order to equal both locked model orders."""
        if tuple(names) != self.joint_names:
            raise DescriptionError("Controller joint names/order do not match the pinned description")

    def urdf_xml(self):
        """Export robot_description with absolute file URIs; never alter cache files."""
        document = _xml(self._urdf_bytes, "URDF")
        for mesh in document.iter("mesh"):
            mesh.set("filename", self._mesh_uris[mesh.get("filename")])
        return ET.tostring(document, encoding="unicode", xml_declaration=True)

    def to_dict(self):
        return deepcopy({
            "robot": self.robot_id, "status": "description_loaded", "dof": len(self.joint_names),
            "root_link": self.root_link, "joint_names": list(self.joint_names),
            "urdf": {"path": str(self.urdf_path), "name": self.urdf_name,
                     "links": list(self.links), "joints": list(self.joints), "angle_unit": "radian"},
            "mjcf": {"path": str(self.mjcf_path), "name": self.mjcf_name,
                     "bodies": list(self.mjcf_bodies), "joints": list(self.mjcf_joints),
                     "actuators": list(self.actuators), "angle_unit": self.mjcf_angle_unit,
                     "actuator_joint_names": list(self.actuator_joint_names)},
            "assets": {"verified_paths": list(self.verified_paths), "sources": list(self.sources),
                       "mesh_paths": [str(path) for path in self.mesh_paths]},
            "validation_scope": "URDF/MJCF metadata and asset integrity; no dynamics, policy, or hardware validation",
            "limit_sources": {"urdf": "URDF joint limits", "mjcf": "MJCF joint ranges and actuator control ranges",
                             "inference_config": "not loaded; remains a separate controller configuration"},
        })


def load_description(asset_root, manifest=None):
    """Verify and inspect description assets only, without downloads or simulation.

    Policy weights, inference configuration and CAD packages are not required.
    URDF, MJCF, every referenced mesh, and the model repository's LICENSE must
    match the same pinned manifest. XML includes are deliberately unsupported.
    """
    locked = load_manifest(manifest)
    asset_root = Path(asset_root).expanduser().resolve()
    model_path = _asset_path(asset_root, locked["model_path"])
    source_name = Path(locked["model_path"]).parts[0]
    description_root = _asset_path(asset_root, source_name)
    if description_root not in model_path.parents:
        raise DescriptionError("MJCF path resolves outside the description tree")
    entries = {entry["path"]: entry for entry in locked["files"]}
    urdf_paths = [path for path in entries if Path(path).parts[0] == source_name and path.endswith(".urdf")]
    if len(urdf_paths) != 1:
        raise DescriptionError("Pinned description must contain exactly one URDF")
    urdf_path = _asset_path(asset_root, urdf_paths[0])
    if description_root not in urdf_path.parents:
        raise DescriptionError("URDF path resolves outside the description tree")
    verified = set()

    def verify(path):
        relative = path.relative_to(asset_root).as_posix()
        if relative in verified:
            return
        entry = entries.get(relative)
        if entry is None:
            raise DescriptionError(f"Description dependency is not pinned in the manifest: {relative}")
        if not _valid(path, entry):
            raise DescriptionError(f"Missing or changed description asset: {relative}. Run legged-robot fetch-assets first.")
        verified.add(relative)

    verify(model_path)
    verify(urdf_path)
    license_path = _asset_path(asset_root, f"{source_name}/LICENSE")
    verify(license_path)
    urdf_bytes = urdf_path.read_bytes()
    urdf = _xml(urdf_bytes, "URDF")
    mjcf = _xml(model_path.read_bytes(), "MJCF")
    if urdf.tag != "robot" or mjcf.tag != "mujoco":
        raise DescriptionError("Expected a URDF robot and an MJCF mujoco document")
    if list(mjcf.iter("include")):
        raise DescriptionError("MJCF includes are unsupported by the description-only loader")
    meshes = set()
    mesh_uris = {}

    def resolve_mesh(reference, base):
        path = _resolve_reference(reference, base, description_root)
        verify(path)
        meshes.add(path)
        return path

    # Verify every URDF mesh, including extension elements that are not link
    # geometry. Export must never retain an unresolved remote/path reference.
    for mesh in urdf.iter("mesh"):
        reference = mesh.get("filename")
        path = resolve_mesh(reference, urdf_path.parent)
        mesh_uris[reference] = path.as_uri()

    link_elements = urdf.findall("link")
    link_names = _named(link_elements, "URDF link")
    links = []
    for link in link_elements:
        geometry = []
        for role in ("visual", "collision"):
            for shape in link.findall(role):
                for mesh in shape.findall("geometry/mesh"):
                    reference = mesh.get("filename")
                    path = resolve_mesh(reference, urdf_path.parent)
                    mesh_uris[reference] = path.as_uri()
                    geometry.append({"role": role, "reference": reference, "path": str(path),
                                     "scale": _vector(mesh.get("scale", "1 1 1"), 3, "mesh scale"),
                                     "origin": _origin(shape)})
        inertial = link.find("inertial")
        mass = inertial.find("mass") if inertial is not None else None
        links.append({"name": link.get("name"), "meshes": geometry,
                      "mass_kg": _number(mass.get("value"), "link mass") if mass is not None else None})
    joint_elements = urdf.findall("joint")
    _named(joint_elements, "URDF joint")
    joints = []
    children = set()
    edges = {}
    for joint in joint_elements:
        kind = joint.get("type")
        if kind not in ("revolute", "fixed"):
            raise DescriptionError("Only revolute and fixed URDF joints are supported")
        parent, child = joint.find("parent"), joint.find("child")
        parent = parent.get("link") if parent is not None else None
        child = child.get("link") if child is not None else None
        if parent not in link_names or child not in link_names or child in children:
            raise DescriptionError("URDF joint links are missing, unknown or have multiple parents")
        children.add(child)
        edges.setdefault(parent, []).append(child)
        axis_element = joint.find("axis")
        axis = _vector(axis_element.get("xyz", "1 0 0") if axis_element is not None else "1 0 0", 3, "joint axis")
        if kind == "revolute" and not any(axis):
            raise DescriptionError("Revolute joint axis cannot be zero")
        limits = None
        if kind == "revolute":
            limit = joint.find("limit")
            if limit is None:
                raise DescriptionError("Revolute URDF joint is missing limits")
            limits = {key: _number(limit.get(key), f"{joint.get('name')} {key}")
                      for key in ("lower", "upper", "effort", "velocity")}
            if limits["lower"] > limits["upper"] or min(limits["effort"], limits["velocity"]) < 0:
                raise DescriptionError("Invalid URDF joint limits")
        joints.append({"name": joint.get("name"), "type": kind, "parent": parent, "child": child,
                       "axis": axis, "origin": _origin(joint), "limits": limits})
    roots = set(link_names) - children
    if len(roots) != 1:
        raise DescriptionError("URDF must have one root link")
    root_link = roots.pop()
    visited, pending = set(), [root_link]
    while pending:
        link = pending.pop()
        if link in visited:
            raise DescriptionError("URDF link graph contains a cycle")
        visited.add(link)
        pending.extend(edges.get(link, ()))
    if visited != set(link_names):
        raise DescriptionError("URDF link graph is disconnected or cyclic")
    urdf_joint_names = tuple(joint["name"] for joint in joints if joint["type"] == "revolute")
    if len(urdf_joint_names) != 23:
        raise DescriptionError("Roboto Origin requires 23 named revolute URDF joints")

    # Retain native MJCF ranges and compiler units, separate from URDF limits.
    compiler = mjcf.find("compiler")
    compiler_attributes = compiler.attrib if compiler is not None else {}
    angle_unit = compiler_attributes.get("angle", "degree")
    if angle_unit not in ("degree", "radian"):
        raise DescriptionError("Unsupported MJCF compiler angle unit")
    mesh_dir = compiler_attributes.get("meshdir", compiler_attributes.get("assetdir", ""))
    mesh_base = _resolve_reference(mesh_dir or ".", model_path.parent, description_root)
    asset = mjcf.find("asset")
    mesh_elements = asset.findall("mesh") if asset is not None else []
    _named(mesh_elements, "MJCF mesh")
    for mesh in mesh_elements:
        resolve_mesh(mesh.get("file"), mesh_base)
    # File-backed non-mesh assets would otherwise escape integrity verification.
    if asset is not None and any(element.get("file") for element in asset if isinstance(element.tag, str) and element.tag != "mesh"):
        raise DescriptionError("File-backed non-mesh MJCF assets are unsupported")

    defaults = {}

    def read_defaults(element, inherited):
        values = deepcopy(inherited)
        for tag in ("joint", "motor"):
            child = element.find(tag)
            if child is not None:
                values.setdefault(tag, {}).update(child.attrib)
        defaults[element.get("class", "")] = values
        for child in element.findall("default"):
            read_defaults(child, values)

    for default in mjcf.findall("default"):
        read_defaults(default, {})

    def attributes(element, tag, inherited_class=""):
        values = dict(defaults.get(element.get("class", inherited_class), defaults.get("", {})).get(tag, {}))
        values.update(element.attrib)
        return values

    bodies, mjcf_joints = [], []

    def read_body(body, parent, inherited_class=""):
        body_class = body.get("childclass", inherited_class)
        bodies.append({"name": body.get("name"), "parent": parent,
                       "position": _vector(body.get("pos", "0 0 0"), 3, "body position")})
        for element in body.findall("joint"):
            attrs = attributes(element, "joint", body_class)
            kind = attrs.get("type", "hinge")
            if kind not in ("hinge", "free"):
                raise DescriptionError("Only hinge and free MJCF joints are supported")
            joint_range = _vector(attrs["range"], 2, "MJCF joint range") if "range" in attrs else None
            if kind == "hinge" and (joint_range is None or joint_range[0] > joint_range[1]):
                raise DescriptionError("MJCF hinge joints must have valid native ranges")
            mjcf_joints.append({"name": attrs.get("name"), "type": kind, "body": body.get("name"),
                               "axis": _vector(attrs.get("axis", "0 0 1"), 3, "MJCF joint axis"),
                               "range": joint_range, "limited": attrs.get("limited", "auto")})
        if body.findall("freejoint"):
            raise DescriptionError("Use the pinned named free joint, not freejoint shorthand")
        for child in body.findall("body"):
            read_body(child, body.get("name"), body_class)

    worldbody = mjcf.find("worldbody")
    if worldbody is None:
        raise DescriptionError("MJCF is missing worldbody")
    for body in worldbody.findall("body"):
        read_body(body, None)
    body_names = [body["name"] for body in bodies]
    mjcf_names = [joint["name"] for joint in mjcf_joints]
    if any(not name for name in body_names + mjcf_names) or len(set(body_names)) != len(body_names) or len(set(mjcf_names)) != len(mjcf_names):
        raise DescriptionError("Missing or duplicate MJCF body/joint names")
    hinge_names = tuple(joint["name"] for joint in mjcf_joints if joint["type"] == "hinge")
    if hinge_names != urdf_joint_names:
        raise DescriptionError("MJCF hinge names/order do not match the 23 URDF joints")
    if set(body_names) != set(link_names):
        raise DescriptionError("MJCF body names do not match URDF links")
    free_joints = [joint for joint in mjcf_joints if joint["type"] == "free"]
    if len(free_joints) != 1 or free_joints[0]["body"] != root_link:
        raise DescriptionError("MJCF must have one named free-base joint on the URDF root link")
    actuator_element = mjcf.find("actuator")
    actuator_elements = [element for element in actuator_element if isinstance(element.tag, str)] if actuator_element is not None else []
    _named(actuator_elements, "MJCF actuator")
    actuators = []
    for element in actuator_elements:
        if element.tag != "motor":
            raise DescriptionError("Only pinned joint motor actuators are supported")
        attrs = attributes(element, "motor")
        control_range = _vector(attrs.get("ctrlrange", ""), 2, "actuator control range")
        if control_range[0] > control_range[1]:
            raise DescriptionError("Invalid MJCF actuator control range")
        actuators.append({"name": attrs.get("name"), "joint": attrs.get("joint"), "type": element.tag,
                          "control_range": control_range, "control_limited": attrs.get("ctrllimited", "auto"),
                          "gear": tuple(_number(value, "motor gear") for value in attrs.get("gear", "1").split())})
    if tuple(actuator["joint"] for actuator in actuators) != urdf_joint_names:
        raise DescriptionError("MJCF actuator joint names/order do not match the 23 URDF joints")
    sources = tuple(source for source in locked["sources"] if source["name"] == source_name)
    return RobotDescription(locked["robot"], asset_root, description_root, urdf_path, model_path,
                            root_link, urdf.get("name", ""), mjcf.get("model", ""), tuple(links), tuple(joints),
                            tuple(bodies), tuple(mjcf_joints), tuple(actuators), angle_unit,
                            tuple(sorted(meshes)), tuple(sorted(verified)), sources, urdf_bytes, mesh_uris)
