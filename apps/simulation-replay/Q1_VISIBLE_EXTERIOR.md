# Q1 public exterior motion scope

The motion-v1 release exposed 21 independent remeshed parts, including eight crank/rod parts, and all 1,100 original rigid-body poses. Neutral names and removal of CAD meshes did not sufficiently limit mechanism disclosure.

`restrict_q1_motion.py` accepts only the exact reviewed motion-v1 HTML hash. It rebuilds a compact GLB containing the 13 permitted, already remeshed exterior parts, omitting eight transmission parts and all their binary buffers. Their poses are omitted too. Remaining visible poses are sampled at nominal 25 Hz (551 frames including the last frame), with positions rounded to 1 mm and quaternion components to 0.0001. The browser normalizes interpolated quaternions. Original lavender material values are restored on all parts. The visible exterior shape buffers are unchanged.

Run privately:

```sh
python3 restrict_q1_motion.py --source /private/reviewed-motion-v1/index.html --output /private/candidate
python3 audit_visible_exterior.py --source /private/reviewed-motion-v1/index.html --candidate /private/candidate/index.html
```

Serve candidate on loopback only. `verify_visible_exterior.py` checks four viewport widths, camera views, replay controls, sampled phases, mouse dragging, wheel zoom, and mobile pinch. Inspect desktop/mobile screenshots before release. Source HTML, candidate assets, and rollback copies stay outside the repository and outside publicly served directories.

The public exterior meshes and reduced visible poses remain downloadable/extractable, and still reveal approximate visible motion. This is disclosure reduction, not encryption or a guarantee against inference. Previously downloaded versions cannot be recalled. No original STEP or detailed CAD buffers are embedded. Estimated simulation parameters and motion are not hardware validated.

The original articulated builder and template are historical intermediate inputs only: their 21-part output must not be published directly. Only the restricted candidate with matching payload audit and private browser report is eligible for publication. Replace the Q1 symlink only after checking the expected live HTML hash and preserving biped files and Nginx configuration. Archive motion-v1 outside the web root; do not restore it as an automatic rollback after this restriction.
