import json
import math
import pytest

from omindos_legged.types import CommandGate, VelocityCommand
from omindos_legged.profiles import get_profile, list_profiles


def test_expired_navigation_command_requests_stop():
    gate = CommandGate(timeout_s=0.5)
    assert gate.current(0) == VelocityCommand()
    assert gate.accept(VelocityCommand(3, -2, 4), 1) == VelocityCommand(0.6, -0.4, 0.8)
    assert gate.current(1.499).vx == 0.6
    assert gate.current(1.5) == VelocityCommand()
    gate.accept(VelocityCommand(0.3), 2)
    gate.stop()
    assert gate.current(2) == VelocityCommand()


@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_invalid_velocity_cannot_enter_control_interface(value):
    with pytest.raises(ValueError):
        VelocityCommand(vx=value)


def test_profile_updates_cannot_change_registered_limits():
    profile = get_profile()
    profile["command_limits"][1] = 100
    assert get_profile()["command_limits"][1] == 0.6
    assert list_profiles()[0]["morphology"] == "biped"
    json.dumps(list_profiles(), allow_nan=False)
    with pytest.raises(ValueError, match="Unknown robot"):
        get_profile("unregistered-hardware")


@pytest.mark.parametrize("now", [math.nan, math.inf, -math.inf])
def test_invalid_clock_clears_command_until_new_input(now):
    gate = CommandGate()
    gate.accept(VelocityCommand(0.3), 2)
    with pytest.raises(ValueError, match="Timestamp must be finite"):
        gate.current(now)
    assert gate.current(2.1) == VelocityCommand()


def test_reversed_clock_and_expiry_cannot_revive_old_command():
    gate = CommandGate()
    gate.accept(VelocityCommand(0.3), 2)
    assert gate.current(1) == VelocityCommand()
    assert gate.current(2.1) == VelocityCommand()
    gate.accept(VelocityCommand(0.3), 3)
    assert gate.current(3.5) == VelocityCommand()
    assert gate.current(3.1) == VelocityCommand()
