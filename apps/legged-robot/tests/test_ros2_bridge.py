"""Exercise bridge callbacks with message stand-ins, not a native ROS graph."""
from dataclasses import replace
from types import SimpleNamespace as NS
import json

import pytest

from omindos_legged import profiles, ros2_bridge
from omindos_legged.ros2_bridge import Ros2Interface
from omindos_legged.types import RobotState, VelocityCommand


def vector():
    return NS(x=0.0, y=0.0, z=0.0)


def quaternion():
    return NS(x=0.0, y=0.0, z=0.0, w=1.0)


def header():
    return NS(stamp=None, frame_id="")


def odometry():
    return NS(header=header(), child_frame_id="",
              pose=NS(pose=NS(position=vector(), orientation=quaternion())),
              twist=NS(twist=NS(linear=vector(), angular=vector())))


def test_multiple_robot_interfaces_isolate_topics_and_tf():
    first = Ros2Interface("/legged_robot")
    second = Ros2Interface("fleet/rpo2")
    assert first.namespace == "legged_robot"
    assert first.frame("base_link") == "legged_robot/base_link"
    assert second.frame("odom") == "fleet/rpo2/odom"
    assert first.frame("base_link") != second.frame("base_link")
    assert Ros2Interface("preview", "").frame("base_link") == "base_link"


@pytest.mark.parametrize("namespace,prefix", [("/", None), ("a//b", None), ("a", "bad frame"), ("1robot", None)])
def test_invalid_interface_fails_before_loading_ros(namespace, prefix):
    with pytest.raises(ValueError):
        Ros2Interface(namespace, prefix)


def test_bridge_publishes_prefixed_frames_mapping_and_stale_stop(monkeypatch):
    nodes, transforms = [], []
    clock = {"now": 0.0}
    state = RobotState(0.0, ("left_joint",), (0.25,), (-0.1,), (1.0, 2.0, 0.7),
                       (0.5, 0.1, 0.2, 0.3), (0.2, 0.3, 0.4),
                       (0.5, 0.6, 0.7), VelocityCommand())

    class Controller:
        policy_period = 0.02
        command_limits = (-0.4, 0.6, -0.4, 0.4, -0.8, 0.8)
        closed = False

        def __init__(self):
            self.last = state
            self.commands = []

        def state(self):
            return self.last

        def step(self, command):
            self.commands.append(command)
            self.last = replace(self.last, time_s=self.last.time_s + 0.02, command=command)
            return self.last

        def close(self):
            self.closed = True

    class Node:
        def __init__(self, name, namespace):
            self.namespace = namespace
            self.published = {}
            self.destroyed = False
            nodes.append(self)

        def create_publisher(self, message_type, topic, qos):
            self.published[topic] = []
            return NS(publish=self.published[topic].append)

        def create_subscription(self, message_type, topic, callback, qos):
            self.input_topic = topic
            self.callback = callback
            return NS()

        def create_timer(self, period, callback):
            self.period = period
            return NS()

        def get_logger(self):
            return NS(info=lambda *_: None, warning=lambda *_: None, error=lambda *_: None)

        def get_clock(self):
            return NS(now=lambda: NS(to_msg=lambda: "stamp"))

        def destroy_node(self):
            self.destroyed = True

    controller = Controller()
    rclpy = NS(init=lambda **_: None, ok=lambda: True, shutdown=lambda: None)

    def spin(node):
        node.callback(NS(linear=NS(x=5.0, y=-5.0), angular=NS(z=5.0)))
        node.tick()
        clock["now"] = 0.5
        node.tick()

    rclpy.spin = spin
    broadcaster = lambda node: NS(sendTransform=transforms.append)
    monkeypatch.setattr(ros2_bridge, "_load_ros2", lambda: (
        rclpy, Node, lambda: NS(header=header(), child_frame_id="", transform=NS(translation=vector(), rotation=quaternion())),
        object, odometry, lambda: NS(header=header()), lambda: NS(data=""), broadcaster))
    monkeypatch.setattr(profiles, "create_controller", lambda *_: controller)
    monkeypatch.setattr(ros2_bridge.time, "monotonic", lambda: clock["now"])
    assert ros2_bridge.run_ros2("roboto-origin", "unused", namespace="fleet/rpo") == 0
    node = nodes[0]
    assert node.namespace == "fleet/rpo" and node.input_topic == "cmd_vel"
    assert controller.commands == [VelocityCommand(0.6, -0.4, 0.8), VelocityCommand()]
    joints = node.published["joint_states"][0]
    assert joints.header.frame_id == "fleet/rpo/base_link"
    assert joints.name == ["left_joint"] and joints.position == [0.25]
    odom = node.published["odom"][0]
    assert odom.header.frame_id == "fleet/rpo/odom"
    assert odom.child_frame_id == "fleet/rpo/base_link"
    assert odom.pose.pose.orientation.w == 0.5
    assert odom.pose.pose.orientation.x == 0.1
    assert odom.twist.twist.linear.x == 0.2
    assert transforms[0].header.frame_id == odom.header.frame_id
    assert transforms[0].child_frame_id == odom.child_frame_id
    assert json.loads(node.published["state"][-1].data)["command"]["vx"] == 0
    assert node.destroyed and controller.closed
