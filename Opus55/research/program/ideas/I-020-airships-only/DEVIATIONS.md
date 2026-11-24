# I-020 airships only: deviations and notes

Branch `idea/I-020`, started from `idea/I-009` at b3d59af (round 4 merged with main at d92175a).
- `e2f4660`: the launch is removed and the LED band is fixed.
- The next commit merges current main (54f2c3e, which now includes the adopted I-016), so the candidate is compared against the current best.

## 1. Launch removed
These are gone:
- the rocket, trail, plume, pad and tower lights, and the haze glow;
- the spaceport deck, tower, hangar, tanks and piles, with their 3 colliders;
- the plume light (the module now reserves 3 lights, not 4);
- the trail and plume pipelines, the `skyops-fwd` pass and its timer;
- the launch materials (7–22) and the local-light term in the opaque shader;
- the launch constants and functions in `skyopsLayout.js`;
- `rocketMesh` and `spaceportMesh`;
- the five launch unit tests.

The frame buffer is back to 144 floats. `common.js`, `renderer.js`, `sky.js` and `vegetation.js` are byte-identical to main: `git diff main` is empty for all four. The only shared-file edits left are I-009's own:
- `main.js`: the module entries;
- `air.js`: `LANES`/`CIRCLES` exported, and `airCorridors` published.

A grep of `src/` and `tools/skyops-*` finds no rocket, trail, plume, smoke, spaceport or `F.launch` left.

## 2. Airships unchanged
Unchanged from round 4:
- hull, fins, materials and livery;
- outline and nav lights;
- the beams and their rule;
- tracks, phases and altitudes.

The ship-local camera poses of the held-out R cameras match the round-4 build to 0.1 mm. After merging I-016 the rule-derived altitudes are still 530 / 405 / 290 m (confluence / Bund–CBD / west). Changes that do not alter the look:
- the instance buffer holds 3 ships instead of 5 slots;
- the sprite buffer is sized to the ships' 108 sprites (was 144, the rest unused);
- the opaque pass is skipped when no ship is in view.

## 3. LED band: pages instead of a scrolling ticker
**Cause of the bug.** The round-4 band was a 100 m window onto a scrolling loop about 190 m long. The judges saw "舟航天" because the window had cut off the first 天. For the same reason the Latin line was clipped at the band's ends. The reading direction itself was already correct on both sides: a held-out camera on the starboard side, R6, shows "◆ TIANZHOU OR…" reading left to right.

**What changed.** The band now shows two pages per ship, the Chinese brand set between diamonds and then the Latin line (for example `◆ 天舟航天 ◆`, then `TIANZHOU ORBITAL`):
- Each page is fitted and centred in the band and does not scroll. Type is 108 px (as in round 4), shrunk only if a page is wider than 880 px = 86 m. The fully lit band is 94 m (z −36…58), so 4 m is left at each end.
- The band position `s` runs to the right as seen from outside each side, so both sides read left to right.
- Pages switch every 5 s, with a per-ship phase taken from the existing ship seed. No new random draws are made.
- The switch is instant. A 0.5 s vertical roll was tried first. On held-out R6 (mid-roll) it showed half of each page, so about 10% of still frames would show cut glyphs. The instant switch is used so no frame shows a partial page.
- The atlas is now 1024 × 1024 with 6 used rows (was 4096 × 512). The type scale is unchanged at 10.24 px/m.

**New unit tests** (`tools/skyops-test.mjs`, 10 checks pass):
- the page and row layout;
- every page fits inside the lit band;
- mirror safety: for every ship and both sides, increasing band position runs along the viewer's screen-right vector.

## 4. Fresh judging cameras
`tools/airship-cams.mjs` implements the spec's rule (seed 20261124, mulberry32). It writes `fresh-cameras.json` in this folder (ids S01–S08), in the `capture.mjs --poses-file` format. Choices the spec leaves open, fixed before any capture:
- **Ship and distance:** camera k looks at ship k mod 3, at d = 300 m for even k and 700 m for odd k, so each ship gets both distances.
- **Draw order per attempt:** time uniform in [0, 360) s, bearing uniform in [60, 120]°, side 50/50, then height difference uniform in [−150, +50] m. The distance is horizontal from the hull centre, and the camera looks at the hull centre.
- **Line of sight:** 101 samples on the segment from the camera to the hull centre. An attempt is rejected if the terrain is within 2 m of any sample, the camera position included. No attempt was rejected.
- **Where it runs:** it reads ship states and terrain from the running app, so it runs under the GPU lock. It ran on the merged build.
- **Images:** no image from these cameras was captured or viewed by the implementer.

## 5. Tuning and checks
Looks were checked only on held-out cameras (`heldout-cameras.json`), never on eval poses or S cameras:
- H1–H4 and R1–R5 from I-009;
- R6–R8, added here: close views of the starboard and port sides, to check mirror safety.

Before and after captures:
- round 4: `Opus55/source/out/i020-before/R4–R8.jpg`;
- I-020: `Opus55/source/out/i020-after/*.jpg`.

Checks on the merged build:
- **`skyops-test`:** 10/10.
- **`functional.mjs`:** 18/18, no WebGPU errors.
- **Bench pair** (2560×1440 High, under the GPU lock, main 54f2c3e first, then I-020):

| Build | GPU avg | p50 | p99 | max | skyops-gbuffer avg / p99 | forward avg / p99 |
|---|---|---|---|---|---|---|
| main | 9.76 | 9.63 | 11.74 | 14.33 | – | 0.37 / 1.38 |
| I-020 | 9.79 | 9.67 | 11.77 | 13.44 | 0.01 / 0.03 | 0.37 / 1.36 |

The difference is +0.03 ms average, within noise. All gates pass.

## Not done
- The eval and the judging were not run; the evaluator does that.
- `Opus55/index.html` (the production build) is not rebuilt in this branch. An uncommitted local copy of it in the worktree was set aside with `git stash` before the merge.
