# Third-party notices

The new software in `apps/legged-robot` is licensed under GPL-3.0-only; the full license text is in `LICENSE`. This directory does not change the license of other OmindOS applications or upstream assets.

## RoboParty robot descriptions

- Source: [Roboparty/rpo_description](https://github.com/Roboparty/rpo_description/tree/8e0f8f78903dc147a5c094c0fdc14b4a78f1b667)
- Revision: `8e0f8f78903dc147a5c094c0fdc14b4a78f1b667`
- License declared by upstream README: CERN Open Hardware Licence Version 2 — Weakly Reciprocal (`CERN-OHL-W-2.0`).
- Assets used: `mjcf/rpo.xml`, `urdf/rpo.urdf`, and the 24 mesh files referenced by that MJCF.
- The download manifest retains the upstream `LICENSE` and `README.md` without modification, adjacent to the asset cache.
- Attribution: RoboParty. No additional named copyright holder is stated in the inspected README/model files; none is invented here.

## RoboParty inference configuration and policy

- Source: [Roboparty/roboparty_inference](https://github.com/Roboparty/roboparty_inference/tree/c4238d1560bc795e61226074f4ee4b0a256a8901)
- Revision: `c4238d1560bc795e61226074f4ee4b0a256a8901`
- Upstream `LICENSE` contains GNU GPL version 3. `package.xml` states `GPL-3.0`. Upstream `debian/copyright` specifies version 3 and records:
  - `Files: *`: Copyright 2025–2026 Luo1imasi; GPL-3.0.
  - `Files: debian/*`: Copyright 2026 wentywenty; GPL-3.0.
- Assets used: `robots/rpo/models/policy.onnx`, `robots/rpo/configs/default.yaml`, `robots/rpo/robot.yaml`.
- The download manifest retains upstream `LICENSE`, `debian/copyright`, and `package.xml` without modification.
- No separate model-card, weights-license, or training-data-license statement was found at this revision. The repository-level statements above are recorded without extending them to unverified training-data or third-party-weight provenance.
- The C++ inference implementation and its `thirdparty/cnpy` submodule are not vendored into this module.

## Runtime dependencies

Dependencies are installed separately and retain their own copyright and license notices. They are not relabeled as GPL by this file. The lockfile for robot assets covers the two RoboParty revisions above; Python package distribution metadata and ROS2 package metadata are the sources for dependency notices.

For source and byte-for-byte asset provenance, see `configs/roboto_origin/assets.lock.json`. The license-scope review and configuration conventions are recorded in `docs/UPSTREAM.md`.
