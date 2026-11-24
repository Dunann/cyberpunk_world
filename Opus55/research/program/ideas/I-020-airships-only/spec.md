---
id: I-020
title: Airships only (I-009 without the launch)
status: rejected
score: n/a (follow-up from I-009 judge findings; coordinator decision, user priority 5)
parent: I-009
date: 2026-11-24
---

# I-020: Airships only

## Why
I-009 was blocked after three judged rounds: the rocket-launch smoke trail lost at every distance, but the advertising airship won every close aerial frame (burst-u62, 4/4 in two separate rounds). This idea keeps what the judges liked and drops what they rejected.

## What
Start from idea/I-009 at b3d59af (round 4, merged with main) and:
1. Remove the launch completely: rocket, trail, plume, pad glow, the spaceport and its deck, the `Frame.launch` field and the sky launch-glow term. Nothing related to the launch may remain in the build.
2. Keep the three airships exactly as in round 4 (hull, framed fins, silhouette lights, beams with the continuous building rule, racetracks, altitudes).
3. Fix the sign text: the Chinese ticker reads in the wrong order (舟航天), and the Latin text is clipped at the panel edge. Text must read left to right as seen from either side of the hull (mirror-safe), and fit inside the band.

## How it is judged (declared before any capture)
The airships are not visible at any target size in the eval poses, so eval targets cannot apply. Rule, fixed now:
- **Fresh cameras:** 8 cameras placed by rule relative to each airship's position and heading at seeded times (seed 20261124): for each ship, a camera at distance d in {300, 700} m, bearing 60-120 degrees off the ship's heading (seeded), height difference -150 to +50 m, looking at the ship. Rejected and redrawn if terrain blocks the line of sight. Two judges, separately shuffled pairs, file times reset.
- **Adopt if:** both judges prefer the candidate on at least 2/3 of the 8 fresh cameras, and there is no clear loss on any of the 14 eval poses or bursts (judged as usual against the current best).
