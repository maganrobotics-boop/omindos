"""Optional ROS2 adapter for the simulation controller; never opens robot I/O."""
from __future__ import annotations

from dataclasses import dataclass, replace
import json
import re
import time

from .types import CommandGate, VelocityCommand


@dataclass(frozen=True)
class Ros2Interface:
    """Separate topics and TF frames when multiple robot processes coexist."""

    namespace: str = "legged_robot"
    frame_prefix: str | None = None

    def __post_init__(self):
        namespace = self.namespace.strip("/")
        prefix = namespace if self.frame_prefix is None else self.frame_prefix.strip("/")
        pattern = r"[A-Za-z_][A-Za-z0-9_]*(/[A-Za-z_][A-Za-z0-9_]*)*"
        if not re.fullmatch(pattern, namespace):
            raise ValueError("ROS2 namespace must contain nonempty valid name segments")
        if prefix and not re.fullmatch(pattern, prefix):
            raise ValueError("TF frame prefix must contain valid name segments")
        object.__setattr__(self, "namespace", namespace)
        object.__setattr__(self, "frame_prefix", prefix)

    def frame(self, name):
        return f"{self.frame_prefix}/{name}" if self.frame_prefix else name


def _load_ros2():
    try:
        import rclpy
        from rclpy.node import Node
        from geometry_msgs.msg import TransformStamped, Twist
        from nav_msgs.msg import Odometry
        from sensor_msgs.msg import JointState
        from std_msgs.msg import String
    except ImportError as exc:
        raise RuntimeError(
            "ROS2 support is unavailable. Install ROS2 Humble on Ubuntu 22.04, "
            "source /opt/ros/humble/setup.bash, and install this module in a "
            "venv created with --system-site-packages. Plain simulate needs no ROS2."
        ) from exc
    try:
        from tf2_ros import TransformBroadcaster
    except ImportError:
        TransformBroadcaster = None
    return rclpy, Node, TransformStamped, Twist, Odometry, JointState, String, TransformBroadcaster


def run_ros2(robot_id, asset_root, ros_args=None, *, namespace="legged_robot", frame_prefix=None) -> int:
    """Run a 50 Hz simulated base with a 0.5-second cmd_vel watchdog."""
    interface = Ros2Interface(namespace, frame_prefix)
    rclpy, Node, TransformStamped, Twist, Odometry, JointState, String, TransformBroadcaster = _load_ros2()
    from .profiles import create_controller

    class LeggedSimulationNode(Node):
        def __init__(self, controller):
            super().__init__("omindos_legged_robot", namespace=interface.namespace)
            self.controller = controller
            self.gate = CommandGate(controller.command_limits, timeout_s=0.5)
            self.last_state = controller.state()
            self.fault = None
            self.joint_publisher = self.create_publisher(JointState, "joint_states", 10)
            self.odom_publisher = self.create_publisher(Odometry, "odom", 10)
            self.state_publisher = self.create_publisher(String, "state", 10)
            self.subscription = self.create_subscription(Twist, "cmd_vel", self.receive_command, 10)
            self.tf_broadcaster = TransformBroadcaster(self) if TransformBroadcaster is not None else None
            if self.tf_broadcaster is None:
                self.get_logger().warning("tf2_ros is unavailable; odom messages continue, odom->base_link TF is disabled")
            self.timer = self.create_timer(float(controller.policy_period), self.tick)
            self.get_logger().info("MuJoCo simulation only; stale cmd_vel stops after 0.5 s; faults freeze physics")

        def receive_command(self, message):
            if self.fault:
                return
            try:
                command = VelocityCommand(message.linear.x, message.linear.y, message.angular.z)
                self.gate.accept(command, time.monotonic())
            except ValueError as exc:
                self.gate.stop()
                self.get_logger().warning(f"Rejected cmd_vel: {exc}")

        def tick(self):
            if not self.fault:
                try:
                    state = self.controller.step(self.gate.current(time.monotonic()))
                    self.last_state = state
                    if state.status == "fault" or state.fault_reason:
                        self.fault = state.fault_reason or "Controller reported a fault"
                except Exception as exc:
                    self.fault = str(exc) or type(exc).__name__
                if self.fault:
                    self.gate.stop()
                    self.get_logger().error(f"Simulation fault; physics frozen: {self.fault}")
            if self.fault:
                self.last_state = replace(self.last_state, command=VelocityCommand(), status="fault", fault_reason=self.fault)
            self.publish_state(self.last_state)

        def publish_state(self, state):
            stamp = self.get_clock().now().to_msg()
            joints = JointState()
            joints.header.stamp = stamp
            joints.header.frame_id = interface.frame("base_link")
            joints.name = list(state.joint_names)
            joints.position = list(state.joint_positions)
            joints.velocity = list(state.joint_velocities)
            self.joint_publisher.publish(joints)

            odom = Odometry()
            odom.header.stamp = stamp
            odom.header.frame_id = interface.frame("odom")
            odom.child_frame_id = interface.frame("base_link")
            odom.pose.pose.position.x, odom.pose.pose.position.y, odom.pose.pose.position.z = state.base_position
            qw, qx, qy, qz = state.base_orientation_wxyz
            odom.pose.pose.orientation.w, odom.pose.pose.orientation.x = qw, qx
            odom.pose.pose.orientation.y, odom.pose.pose.orientation.z = qy, qz
            odom.twist.twist.linear.x, odom.twist.twist.linear.y, odom.twist.twist.linear.z = state.linear_velocity_body
            odom.twist.twist.angular.x, odom.twist.twist.angular.y, odom.twist.twist.angular.z = state.angular_velocity_body
            self.odom_publisher.publish(odom)

            status = String()
            status.data = json.dumps(state.to_dict(), ensure_ascii=False, allow_nan=False)
            self.state_publisher.publish(status)
            if self.tf_broadcaster is not None:
                transform = TransformStamped()
                transform.header = odom.header
                transform.child_frame_id = odom.child_frame_id
                transform.transform.translation.x, transform.transform.translation.y, transform.transform.translation.z = state.base_position
                transform.transform.rotation = odom.pose.pose.orientation
                self.tf_broadcaster.sendTransform(transform)

    controller = None
    node = None
    initialized = False
    try:
        rclpy.init(args=[] if ros_args is None else ros_args)
        initialized = True
        controller = create_controller(robot_id, asset_root)
        node = LeggedSimulationNode(controller)
        rclpy.spin(node)
        return 0
    except KeyboardInterrupt:
        return 0
    finally:
        if node is not None:
            node.gate.stop()
            node.destroy_node()
        if controller is not None:
            controller.close()
        if initialized and rclpy.ok():
            rclpy.shutdown()
