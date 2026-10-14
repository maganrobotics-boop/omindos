"""OmindOS legged robot command and state interface."""
from dataclasses import asdict, dataclass
import math


@dataclass(frozen=True)
class VelocityCommand:
    vx: float = 0.0
    vy: float = 0.0
    wz: float = 0.0

    def __post_init__(self):
        if not all(math.isfinite(value) for value in (self.vx, self.vy, self.wz)):
            raise ValueError("Velocity commands must contain finite numbers")

    def clipped(self, limits):
        if len(limits) != 6:
            raise ValueError("Expected six command limits")
        return VelocityCommand(*(min(max(value, limits[2 * i]), limits[2 * i + 1])
                                 for i, value in enumerate((self.vx, self.vy, self.wz))))


@dataclass(frozen=True)
class RobotState:
    time_s: float
    joint_names: tuple[str, ...]
    joint_positions: tuple[float, ...]
    joint_velocities: tuple[float, ...]
    base_position: tuple[float, float, float]
    base_orientation_wxyz: tuple[float, float, float, float]
    linear_velocity_body: tuple[float, float, float]
    angular_velocity_body: tuple[float, float, float]
    command: VelocityCommand
    status: str = "running"
    fault_reason: str | None = None

    def to_dict(self):
        return asdict(self)


class CommandGate:
    """Keep a bounded, fresh velocity command; stale input requests a stop."""

    def __init__(self, limits=(-0.4, 0.6, -0.4, 0.4, -0.8, 0.8), timeout_s=0.5):
        if not math.isfinite(timeout_s) or timeout_s <= 0:
            raise ValueError("Command timeout must be positive")
        self.limits = tuple(limits)
        self.timeout_s = timeout_s
        self._command = VelocityCommand()
        self._received_at = None

    def accept(self, command, now):
        if not math.isfinite(now):
            raise ValueError("Timestamp must be finite")
        self._command = command.clipped(self.limits)
        self._received_at = now
        return self._command

    def current(self, now):
        if not math.isfinite(now):
            self.stop()
            raise ValueError("Timestamp must be finite")
        if self._received_at is None:
            return VelocityCommand()
        age = now - self._received_at
        if age < 0 or age >= self.timeout_s:
            self.stop()
            return VelocityCommand()
        return self._command

    def stop(self):
        self._command = VelocityCommand()
        self._received_at = None
