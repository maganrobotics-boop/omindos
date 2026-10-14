"""Platform registry; simulation dependencies are imported on demand."""
from copy import deepcopy

_PROFILES = {
    "roboto-origin": {
        "id": "roboto-origin",
        "name": "RoboParty Roboto Origin",
        "morphology": "biped",
        "backend": "mujoco",
        "status": "simulation",
        "dof": 23,
        "command_limits": [-0.4, 0.6, -0.4, 0.4, -0.8, 0.8],
        "description": "Official pinned model and ONNX walking policy; independent OmindOS simulation adapter.",
    }
}


def get_profile(robot_id="roboto-origin"):
    try:
        return deepcopy(_PROFILES[robot_id])
    except KeyError as error:
        raise ValueError(f"Unknown robot platform: {robot_id}") from error


def list_profiles():
    return [get_profile(robot_id) for robot_id in _PROFILES]


def create_controller(robot_id, asset_root):
    get_profile(robot_id)
    from .robots.roboto_origin import RobotoOriginController
    return RobotoOriginController(asset_root)
