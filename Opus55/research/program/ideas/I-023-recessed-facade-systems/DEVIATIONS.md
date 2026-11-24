# I-023 recessed facade systems: implementation notes and deviations

Branch `idea/I-023` (worktree `C:\Users\pdunc\cyberpunk_world\.claude\worktrees\agent-aa732c021dfa0106c`), built from main at 10a592f. Prototype track: built with both reviews' fixes and the coordinator's required changes. All changes are in the facade shader (`buildings_wgsl.js`) plus the shader switches in `buildings.js`; no generation code changed. New tool: `tools/i023-cams.mjs` (held-out and tuning camera rules).

## What was built
- **`recessGrid()`**: residential (material 1) and office (material 2) facades now use one of 7 recess systems. Each sub-cell's opening is a box of depth `dep` with glass on its back wall, solved per pixel in closed form. The window content (room, curtains, cages, lit state) is looked up where the ray meets the back wall. No triangles, no data change.
- **Open axes (reviewers' fix)** are implemented, so open recesses work. On an open axis there are no side walls, the glass repeats per cell, and the content cell is `floor(cell + f + s)`: the ray crosses into the next cell and uses that cell's `winLit` state. This makes the office ribbon (open along the face) and the fins (open vertically) correct, instead of egg-crates.
- **Systems** (chosen per building, see below):

| Kind | Material | Depth (m) | Opening and glass | Lit-window signature |
|---|---|---|---|---|
| PUNCH 25% | residential | 0.22-0.42 | today's window in a reveal | today's proportions, lit reveals |
| PAIRS 20% | residential | 0.30-0.42 | 2 slots per bay, 0.6 floor tall | paired tall slots |
| GRID 25% | residential | 0.45-0.60 | flush piers and floor bands, wide low window set back | wide lit bands in a frame |
| LOGGIA 30% | residential | 1.10-1.40 | loggia in every bay above the flush parapet (0.33), door-window on the back wall | full-height door-windows, lit loggia sides and ceilings |
| RIBBON 35% | office | 0.35-0.50 | open along x: continuous ribbon behind flush spandrels | continuous lit ribbons |
| EGG 35% | office | 0.60-0.80 | piers and shelves in front of each window | grid of lit boxes |
| FINS 30% | office | 0.50-0.60 | open along y: two fins per bay, full height | vertical slots with lit fin sides |

  For every system, the glass area seen square-on equals today's window area (`ww * wh` from the tower seed). The clamps never bind for the seed ranges in use. So the lit window area is within the ±10% asked for; only its proportion and grouping change.
- **Distant band:** the exact closed-form cell mean for the same view direction, blended in with a per-sub-cell `det`. The glass share is the product of the visible glass lengths; open axes use the glass length of the period. The far own-window light uses the mean of `sz^2` over a visible side (1/3).
- **Own-window light:** a lit window lights its recess sides in its own colour, `L * (0.06 + 0.7 * sz^2) * 0.35`. The back wall around the glass gets 0.25 of `L * 0.35`. Unlit windows add nothing.
- **Glass control arm** (`cityRefl(..., softArm)`): behind the dev switch `glass=1`, and **off** in both the candidate and the production build.

## Required changes (coordinator) and how they were met
1. **Closed recesses only, unless the open-axis fix is built.** The open-axis fix is built (above), so ribbons and fins are included. Mullion caps, balcony bands and panel mix are **not** built, because glass facades are untouched (see 5).
2. **Own window-light pattern per system, lit area within ±10%.** See the table. The square-on glass area equals today's exactly.
3. **System per building, not per part.**
   - `sysOf()` hashes the part centre `P.a.xz`. All segments of a `tower()` share it, and so does the hillside cross wing.
   - Depth comes from a separate hash.
   - **Tower-text parts are not excluded.** They get the same recess, and the overlay (equal-depth, emissive only) draws over it. So phrase towers are never mixed flat and recessed.
4. **Fade per sub-cell; smooth the far floor steps; define normals, roughness and wetness for every band.**
   - `detS` is computed from the sub-cell, so PAIRS and FINS fade at their half-bay size. Wall features (slab lines, painted balconies) keep the bay `det`.
   - Shifted edges are filtered with `w + fwidth(k) * dep / cellM`, where `k = dq.xy / dq.z`. The derivative is taken at the top of `fs`, where control flow is uniform.
   - A new exact box filter, `boxI()`, replaces `pulse()` in the recess intervals. It is exact for narrow and empty intervals.
   - The far lit and dark floor runs are box-filtered between neighbouring runs and floors (`farRuns`). Home runs average out along the face once a run is under about 1 px (grazing views).
   - **Normals:** side normals are blended by the filtered shares of the x-walls and y-walls, not hard-switched. They are used only while `detS > 0.5`, faded by `2*detS - 1`. The far band keeps the face normal.
   - **Roughness:** sides and back wall keep wall roughness. Only the glass coverage moves it toward 0.1.
   - **Wetness:** wall wetness, reduced by up to 75% on upward sills and loggia floors, so that wet up-facing surfaces do not become mirrors.
5. **Glass separated.**
   - Glass, LED and glass-tower facades are unchanged in the candidate.
   - The cheap control arm is behind `glass=1` in dev builds and off by default. It does three things:
     - the window dots fade to their average once their period is under about 6 px;
     - the neon strips are kept to the top 0.1 rad of the reflected skyline;
     - the averaged skyline band (the tower-window term) is kept.
   - The arm was **not judged** here. It needs its own decision, with B1 and B3 as no-loss checks.
   - There is no random opaque-pane hash anywhere.
6. **Coverage of the deep systems (measured on masks only).**
   - A dev paint (`facdbg=1`) colours three classes:
     - deep systems (depth 0.5 m or more) with sub-cells of 6 px or more;
     - other recesses with sub-cells of 4 px or more;
     - all other building pixels.
   - The images were only counted by a script, never viewed.

| View | Deep >= 6 px (% of frame) | Any recess >= 4 px (% of frame) | Deep share of building pixels |
|---|---|---|---|
| A6 | 10.6 | 46.0 | 16.1% |
| H4 (aerial, West Hills) | 3.9 | 22.0 | 5.1% |
| H5 (aerial, Nan'an) | 10.4 | 23.1 | 13.9% |
| H1 / H2 / H3 / H6 | 12.2 / 29.7 / 36.4 / 11.8 | 58.4 / 67.0 / 48.2 / 26.0 | 19.2 / 35.3 / 45.3 / 13.6% |

   - "Building pixels" includes roofs and every building material, so the deep share of facade pixels alone is higher than the last column.
   - Any recess at 4 px or more, on the other eval poses: A1 5.7, A2 2.6, A3 4.3, A4 9.1, A5 11.5, B1 2.2, B2 3.0, B3 6.5, B4 33.3, G1 3.0, G2 1.3, G3 0.6, G4 7.8.
   - **Frozen target list, by the spec's rule** (eligible pixels at least 30% of the frame; glass not counted, since glass is unchanged): **A6 (46.0%) and B4 (33.3%).** Every other pose is a no-clear-loss pose.
   - G3 (0.6%) and G1 (3.0%): the idea cannot move them.
7. **Shared random streams stay identical.**
   - The `tools/hyd-identity.mjs` dumps of main and the candidate are byte-identical (SHA-256 `3FBA13319BD0F5EBC3BD3F7C1055F937B6ED951A1CA623EA701564AC9851EA91`).
   - They cover 147,000 parts, 89,164 signs, 14,942 lanterns, 5,385 lights, 58,715 slots and 14,861 colliders.
   - No JS generation code changed.
   - Tower phrases: see Checks.

## Other deviations from the spec
- **System split.** Only residential and office facades get systems. Glass systems (flush panes with tilt, capped mullions, panel mix) and the light-map glass arm are not built (required changes 1 and 5).
- **Curved faces.** Non-box residential plans get the same systems, with depth capped at 0.3 m on curved faces (rounded corners, ellipses, lobed plans).
- **Systems are not tied to `FLAG.BALC`.** The flag is per part and the wing lacks it, so using it would break "one system per building."
  - Painted balconies stay on BALC parts in every system, on the flush parapet below 0.33 of the floor. Loggias open only above it.
  - AC units (0.10-0.28 of the floor, box residential only) always sit on flush wall in every residential system.
- **Corner piers.** Systems that are closed along x keep the first and last opening of a face at least half the recess depth from the face end. Open-x ribbons wrap the corner as corner glazing.
- **The Liziba tower (step F) is not done**, as the spec puts it after the quick test.
- **No recess on/off switch.** The comparison is against the main build itself. The dev switches all compile to constants, and production uses the defaults:
  - `glass=1`: the glass control arm;
  - `facdbg=1|2|3`: the coverage paint, system colours, and a coverage/side/emission probe;
  - `sys=k`: force system k;
  - `own=x`: scale the own-window light (tuning).
- **Energy check on held-out views, not eval poses.** Frame-mean 8-bit luma, candidate against main:

| View | Change |
|---|---|
| H4 (aerial) | +0.0% |
| H5 (aerial) | −0.6% |
| H6 | +1.7% |
| H2 | +3.5% |
| H1 | −4.8% |
| H3 (street, looking up) | −11.3% |

  Aerials are within ±1%. Street views looking steeply up lose lit glass to the window soffits. That is physically right, but a risk with judges who prefer the brighter flat original.

## Cameras
- **Judged held-out cameras H1-H6** (`heldout-cameras.json`). They are placed by rule from part data by `tools/i023-cams.mjs`; the rules are in the tool's header. None is an eval pose. **I never viewed any H image**, only their luma numbers and coverage masks.
  - H1: Nan'an balcony tower, 45 m.
  - H2: West Hills office tower, 45 m.
  - H3: Yuzhong street, looking up.
  - H4: West Hills aerial, 300 m.
  - H5: Nan'an aerial, 260 m.
  - H6: CBD office, mid-air, 80 m.
- **Tuning cameras T1-T4** (`--set tune`): Jiangbei tower, Jiangbei office, Jiangbei aerial, Nan'an street. All visual tuning was done on these only.
- **Blind pairs:** `heldout-pairs/order-1` and `heldout-pairs/order-2`. Order 2 swaps every X/Y of order 1. File times are reset. The key is `heldout-key.json` in this folder, outside the pairs folder. Judges must be given only a pairs folder, not this idea folder.

## Tuning done (on T cameras)
- **Own-window light.** It first used the wall albedo and a full-strength back wall, and fins and spandrels glowed as whole bright floors. It was changed to window-coloured light at reflectance 0.35, with K0 0.06, K1 0.7 and the back wall at 0.25.
- **Recess albedo** is 0.6 of the wall (was 0.8), so ambient light does not lift recessed facades to grey.
- **Depths.** Grid is 0.45-0.6 m (spec 0.5-0.7) and loggia 1.1-1.4 m (spec 1.2-1.5), to limit the loss of lit glass at steep views.

## Known look issues (for the code reviewer and the coordinator)
- **Faces seen at grazing angles** (T3 aerial, left tower face) lose their crisp lit dots. The reveals hide the glass, and the thin glass slivers left are filtered over 1-2 px cells into a dim grey-white patchwork of lit apartments. This is physically consistent, but flatter than main.
- **Street views looking steeply up** are 5-11% darker, because soffits hide glass.
- **Fins (office)** read as a bright vertical curtain on lit floors.
- **Code to check closely:** `recessAxis` and the content-cell lookup on open axes in `recessGrid`; the side-normal sign (`-sign(s) * tAlong`); the corner-pier clamp; and the refactor of `windowGrid` into `lookOf`, `litOf` and `furnish`. The refactor is meant to keep stone, brick, shop, wood and glass facades bit-identical.

## Checks
- Builds: `node build.mjs` and `node build.mjs --dev` succeed.
- `functional.mjs`: 18/18, no WebGPU errors.
- Identity: byte-identical dumps (above).
- Tower phrases: the selection is unchanged (15 glyphs, 6 phrases: 不夜城 江上月 两江 山水城 大江 山城). The per-phrase views (`tools/text-views.mjs --phrases`, 36 views, the same cameras for both builds) show the phrases rendering the same as main over the recessed facades. For example, p0-near shows 不夜城 on both builds, and frame luma differs by 0.1-0.3 levels.

## Bench (2560x1440 High, under the GPU lock, dev builds; main = `out/main.html` built from 10a592f)
| Run | GPU avg | p99 | max | gbuffer avg | TAA p99/avg |
|---|---|---|---|---|---|
| main-1 | 9.75 | 11.79 | 13.90 | 2.61 | 1.55 |
| cand-1 | 10.03 | **17.51** | 24.21 | 2.74 | 2.04 |
| main-2 | 9.89 | 12.05 | 15.72 | 2.64 | 1.63 |
| cand-2 | 10.09 | 13.26 | 15.68 | 2.76 | 2.23 |
| main-3 | 9.82 | 11.91 | 14.92 | 2.63 | **1.05** |
| cand-3 | 10.05 | 14.54 | 22.13 | 2.75 | 1.91 |
| main-4 | 9.97 | 12.41 | 16.07 | 2.68 | 1.90 |
| cand-4 | 10.13 | 14.13 | 18.46 | 2.77 | 2.02 |
| cand-5 (first, after a 90 s cool-down) | 10.06 | 15.38 | 20.53 | 2.75 | 2.08 |
| main-5 (after a 90 s cool-down) | 9.75 | 11.74 | 13.88 | 2.61 | **1.05** |

- **Average:** candidate 10.07 against main 9.84 ms, **+0.24 ms** (pairs +0.28, +0.20, +0.23, +0.16, +0.31). This is under the 11 ms gate and within the spec's +0.30 cap. The gbuffer pass is +0.13 ms.
- **p99 and max are the problem.**
  - All 5 candidate runs have p99 between 13.3 and 17.5 ms (one above the 16.7 gate) and max between 15.7 and 24.2 ms.
  - Main's two clean runs (TAA ratio 1.05) have p99 11.7-11.9 ms.
  - By the 1.15 rule every candidate run counts as contended. But the pattern held in 5 of 5 candidate runs, including the run made first after a 90 s cool-down, while main was clean in 2 of 5. So it is most likely **caused by the candidate**, not by contention.
  - The spikes also show in the maxima of passes this change does not touch: lighting 10.9, TAA 5.0-5.7, fog 8.3, SSR 5.2 ms, against 6.7 / 1.8 / 1.3 / 1.4 in main. That points to GPU-wide stalls, for example from register pressure or scratch memory in the much larger inlined `fs`, rather than to the recess arithmetic.
  - It needs fixing before a full evaluation. Options:
    - move the recess path into its own pipeline or entry point for residential and office parts;
    - cut live state (a smaller `Grid` struct, `litOf` called once, no second `lookOf`);
    - test the register-pressure hypothesis with a build where `recessGrid` is replaced by `windowGrid`.
- One extra candidate bench (cand-6) and one text-view launch crashed at browser start (detached frame; the machine is low on RAM). Neither is counted.
