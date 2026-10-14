"""Check user-visible CLI validation and recording without loading the policy."""
from dataclasses import replace
import json
import sys
from types import SimpleNamespace

import pytest

from omindos_legged import cli
from omindos_legged.ros2_bridge import run_ros2
from omindos_legged.types import RobotState, VelocityCommand


class StubController:
    policy_period = 0.02
    command_limits = (-0.4, 0.6, -0.4, 0.4, -0.8, 0.8)

    def __init__(self, fault_at=None):
        self.fault_at = fault_at
        self.closed = False
        self.steps = 0
        self._state = RobotState(0.0, ("joint",), (0.0,), (0.0,), (0.0, 0.0, 0.75),
                                 (1.0, 0.0, 0.0, 0.0), (0.0, 0.0, 0.0),
                                 (0.0, 0.0, 0.0), VelocityCommand())

    def state(self):
        return self._state

    def step(self, command):
        self.steps += 1
        self._state = replace(self._state, time_s=self.steps * self.policy_period,
                              command=command.clipped(self.command_limits))
        if self.steps == self.fault_at:
            self._state = replace(self._state, status="fault", fault_reason="joint limit", command=VelocityCommand())
        return self._state

    def close(self):
        self.closed = True


@pytest.mark.parametrize("arguments", [
    ["simulate", "--duration", "0"],
    ["simulate", "--duration", "-1"],
    ["simulate", "--duration", "nan"],
    ["simulate", "--vx", "inf"],
    ["simulate", "--scenario", "baseline", "--duration", "19.99"],
])
def test_invalid_arguments_fail_before_controller(monkeypatch, arguments):
    def unexpected_create(*_):
        raise AssertionError("Invalid arguments must be rejected before loading assets")
    monkeypatch.setattr(cli, "create_controller", unexpected_create)
    with pytest.raises(SystemExit) as error:
        cli.main(arguments)
    assert error.value.code == 2


def test_profile_list_does_not_require_simulator(monkeypatch, capsys):
    monkeypatch.setitem(sys.modules, "mujoco", None)
    monkeypatch.setitem(sys.modules, "onnxruntime", None)
    monkeypatch.setattr(cli, "list_profiles", lambda: [{"id": "roboto-origin", "morphology": "biped"}])
    assert cli.main(["list"]) == 0
    assert json.loads(capsys.readouterr().out)[0]["id"] == "roboto-origin"


def test_description_export_requires_no_policy_or_simulator(monkeypatch, capsys, tmp_path):
    from omindos_legged import description
    monkeypatch.setitem(sys.modules, "mujoco", None)
    monkeypatch.setitem(sys.modules, "onnxruntime", None)
    metadata = {"status": "description_loaded", "dof": 23}
    monkeypatch.setattr(description, "load_description", lambda *_: SimpleNamespace(
        to_dict=lambda: metadata, urdf_xml=lambda: '<robot name="rpo"/>'))
    assert cli.main(["describe", "--asset-dir", "model-only", "--output", str(tmp_path)]) == 0
    assert json.loads(capsys.readouterr().out) == metadata
    assert json.loads((tmp_path / "description.json").read_text()) == metadata
    assert (tmp_path / "robot.urdf").read_text() == '<robot name="rpo"/>'


@pytest.mark.parametrize("time_s, expected", [
    (0.0, VelocityCommand()), (2.99, VelocityCommand()),
    (3.0, VelocityCommand(0.3)), (9.99, VelocityCommand(0.3)),
    (10.0, VelocityCommand(0.3, 0.0, 0.3)),
    (14.0, VelocityCommand()), (25.0, VelocityCommand()),
])
def test_baseline_boundaries(time_s, expected):
    assert cli.scenario_command("baseline", time_s, VelocityCommand(0.5)) == expected


def test_simulate_saves_command_clamp_and_closes(monkeypatch, tmp_path):
    controller = StubController()
    monkeypatch.setattr(cli, "create_controller", lambda *_: controller)
    assert cli.main(["simulate", "--duration", "0.06", "--vx", "2", "--output", str(tmp_path)]) == 0
    summary = json.loads((tmp_path / "summary.json").read_text())
    assert summary["status"] == "completed"
    assert summary["scope"] == "simulation_only"
    assert summary["control_steps"] == 3
    assert summary["requested_command"]["vx"] == 2
    assert summary["effective_constant_command"]["vx"] == 0.6
    assert summary["final_state"]["command"]["vx"] == 0.6
    assert (tmp_path / "simulation.csv").read_text().count("\n") == 5
    assert controller.closed


def test_realtime_pacing_starts_after_initialization(monkeypatch, tmp_path):
    controller = StubController()
    clock = {"now": 0.0}
    sleeps = []

    def create_after_initialization(*_):
        clock["now"] += 2.0  # Asset verification and policy loading precede the first tick.
        return controller

    def sleep(seconds):
        sleeps.append(seconds)
        clock["now"] += seconds

    monkeypatch.setattr(cli, "create_controller", create_after_initialization)
    monkeypatch.setattr(cli, "time", SimpleNamespace(monotonic=lambda: clock["now"], sleep=sleep))
    assert cli.main(["simulate", "--duration", "0.06", "--realtime", "--output", str(tmp_path)]) == 0
    assert sleeps == pytest.approx([controller.policy_period] * 3)
    summary = json.loads((tmp_path / "summary.json").read_text())
    assert summary["simulated_duration_s"] == pytest.approx(0.06)
    assert summary["wall_time_s"] == pytest.approx(2.06)
    assert controller.closed


def test_fault_stops_and_records_partial_run(monkeypatch, tmp_path):
    controller = StubController(fault_at=2)
    monkeypatch.setattr(cli, "create_controller", lambda *_: controller)
    assert cli.main(["simulate", "--duration", "1", "--output", str(tmp_path)]) == 1
    summary = json.loads((tmp_path / "summary.json").read_text())
    assert summary["status"] == "fault"
    assert summary["fault_reason"] == "joint limit"
    assert summary["control_steps"] == 2
    assert summary["final_state"]["command"] == {"vx": 0.0, "vy": 0.0, "wz": 0.0}
    assert controller.closed


def test_initialization_error_is_recorded(monkeypatch, tmp_path):
    def missing_assets(*_):
        raise FileNotFoundError("Run fetch-assets first")
    monkeypatch.setattr(cli, "create_controller", missing_assets)
    assert cli.main(["simulate", "--output", str(tmp_path)]) == 1
    summary = json.loads((tmp_path / "summary.json").read_text())
    assert summary["status"] == "error"
    assert summary["error"] == "Run fetch-assets first"


def test_missing_ros2_has_actionable_message(monkeypatch):
    monkeypatch.setitem(sys.modules, "rclpy", None)
    with pytest.raises(RuntimeError, match="source /opt/ros/humble/setup.bash"):
        run_ros2("roboto-origin", "unused")


def test_ros2_remapping_arguments_forwarded(monkeypatch):
    from omindos_legged import ros2_bridge
    recorded = {}
    def run(robot, assets, ros_args, **interface):
        recorded.update(robot=robot, assets=assets, ros_args=ros_args, **interface)
        return 0
    monkeypatch.setattr(ros2_bridge, "run_ros2", run)
    assert cli.main(["ros2", "--ros-args", "-r", "/legged_robot/cmd_vel:=/cmd_vel"]) == 0
    assert recorded["robot"] == "roboto-origin"
    assert recorded["ros_args"] == ["--ros-args", "-r", "/legged_robot/cmd_vel:=/cmd_vel"]
    assert recorded["namespace"] == "legged_robot"
    assert recorded["frame_prefix"] is None
