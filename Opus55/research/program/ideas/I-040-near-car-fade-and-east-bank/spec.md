---
id: I-040
title: Near-camera car fade and the Jade east-bank infill - remove the car that fills B2, and build the bare strip of G3 and G2 with fully separate streams
status: in-review
direction: Attack the weakness (B2 critical "purple box"; G3 "empty brown lots"); revision of I-032 after review
family: defect repair at the source: camera-proximity fade for cars; land-use completion with an append-only second plan pass
parent: I-032
proposed_by: idea generator
date: 2026-11-24
---

# I-040: Near-camera car fade and the Jade east-bank infill

## Idea
I-032 bundled five fixes. Both reviewers backed the same smaller idea, made of the two fixes that remove a named defect without touching anything else.

**1. Near-camera car fade (B2, critical).**
- The B2 "purple box" is an oncoming car in the inner lane. The camera stands on a road centre line, lanes are at ±2 m and ±6 m, and the car's flank is about 1.1 m from the lens (confirmed by the I-025 and I-032 reviewers). Projected with f = 1241.7 px, a car body 1.1 m to the left of the lens, its far end at z ≈ −1004.5, covers **13.1% of the frame** (x 0-970, y 905-1440), which matches the render.
- Fix: a standard camera-collision fade, using only the camera's position, applied to every car. It is a real defect in free flight too, where the player can be anywhere.
- Only the camera term is new. The steep-slope fade (`trafficCars.js:49`, cars on kerbs and stair streets shrink away) and the run-end fades stay exactly as on main, so cars at A4 and A5 look as they do today.
- People are not changed. The person fade cannot remove the B1 head: that person is 2-4.5 m away, and changing the rule would draw it larger. That claim from I-032 is dropped.

**2. The Jade east-bank strip (G3 "empty brown lots", and the dark wooded bank in G2).**
- Rays from the corners of the critic's G3 box (1170-1800 x 690-830) hit the ground at about (342, −709) and (907, −496) to (946, 86). That is the plain east of the Jade River, between the river and Ovoo Hill.
- I-016's plan leaves it unbuilt by two rules:
  - land west of the Ovoo line "is the Jade River bank (not in the plan)" (`plan.js:279-282`);
  - the 400 m stilt-site keep-out (`plan.js:34, 184`) reaches across the river.
- Fix: a second plan pass builds the land that these two rules exclude, and only that. All the other plan rules still apply: the 45 m hill foot, the 25% slope rule, the 70 m quay depth, bridge ramps, and "at least half built". It has its own cell list, its own traffic runs and its own random streams, so nothing that exists today moves.

The thin-cable change (C1), the laser pontoon (C3) and the retaining walls (C4) are dropped.

## Part 1: the car fade
**Compute pass** (`CAR_CS`, `trafficCars.js:74-152`):
- After `carState`, compute `boxDist`, the distance from the camera to the car's body box. The box is oriented by `st.f`, with half sizes by type:
  - car and taxi: 0.9 x 0.6 x 2.3 m, centred 0.9 m up;
  - van: x 1.08 and y 1.18 of that;
  - bus: 1.22 x 0.9 x 5.95 m, centred 1.1 m up.
- `camFade = smoothstep(1.2, 2.5, boxDist)`.
- If `camFade < 0.001`, the car is skipped entirely: no near-list entry, no head or tail sprites, no wet-road streak. Nothing is left of it, and its SSR reflection goes with the body.
- Otherwise `camFade` multiplies the lamp `vis` and the streak brightness `S.b`. The lamp offsets and every other term are unchanged.

**Mesh** (`CAR_MESH_WGSL`):
- `camFade` reaches the fragment shader packed into the fraction of `pp.w`, which holds the integer colour index; `paint()` reads it with `i32()`. It is stored as `color + 0.98 · camFade` and decoded with `fract / 0.98`.
- Where `camFade < 1`, a fragment is discarded when an interleaved-gradient noise value (rotated each frame for TAA) is above `camFade`.
- `lp *= C.pf.w`, the steep and run-end scaling, is untouched.

**The band is 1.2-2.5 m**, the narrower band reviewer 2 suggested:
- The B2 car (1.1 m) is removed outright, with no ghost.
- Only cars 1.2-2.5 m from the lens are drawn dithered. That happens only when a camera stands in a traffic lane. The quick test checks it in motion.

**Isolation:** rendering only. Car states, runs, the near list and the lamp buffer order for every car farther than 2.5 m are unchanged, and no random stream is touched.

## Part 2: the east-bank pass
**Cells** (`plan.js`, a new `eastBankPass` after the existing plan):
- **Region:** field texels that would be `REG.PLAIN` if (a) the Ovoo-line test and (b) the stilt keep-out were skipped. The keep-out is skipped only where the straight line from the texel to the stilt site crosses the Jade River. Ovoo Hill above the 45 m contour keeps its forest, as today.
- **Owners, blocks and the half-built rule** as in the first pass.
- **Lots:** from **`rng(5679)`**, in `plan.cells2` and `world.infillLots2`. The first pass's `plan.cells`, `world.infillLots` and `rng(5678)` draws are untouched.
- **Height rule:** `INFILL_HEIGHT` unchanged (8 storeys, 16 m first row at the water, ceiling 94 m). The blocks are I-016's `genUrban` infill, which won G2 and G3 before.
- **Unbuilt land in the strip stays exactly as it is today:** no quay paint and no pocket squares. So A3, which sees only the strip's 70 m waterside band at its right edge, is unchanged. Projected, the quay band would have changed 3.7% of A3; leaving it alone keeps A3 out.

**Coverage:**
- `plan.coverAt` gains the `cells2` built coverage: lot footprints plus the streets around them.
- Ground paint and forest removal therefore change only inside the new blocks and their streets.

**Every consumer appends, with its own pool:**

| Consumer | Today | Second pass |
|---|---|---|
| Buildings | `genInfill`, `rng(L.seed)` per lot, 60% prop thinning by a running counter | `genInfill2` for `infillLots2`, called last; own prop counter |
| Building shop lights | `INFILL_LIGHT_BUDGET` 80, shuffle `rng(4343)` | own pool of 20, `rng(4344)` |
| Signs | `placeInfillSigns`, `rng(9138)`, `INFILL_SIGN_LIGHTS` | a third pass on `infillLots2`, `rng(9139)`, own light pool of 12, its own sign cells |
| Street lamps | `infillLamps`, from `plan.cells`, 120 real lights at high quality | a third `StreetLamps` instance from `cells2`, 15 real lights |
| Traffic runs | `buildInfillRuns` over `plan.cells`, cars from `rng(31338)` | `buildInfillRuns2` over `cells2` only (see below); cars from **`rng(31339)`**, appended after the infill runs |
| Vegetation | `stampLots(mask, world.infillLots)` | also stamps `infillLots2`; trees removed only under the new lots |

**Traffic without touching existing runs.**
- `buildInfillRuns` scans grid lines over the bounding box of `plan.cells` and merges consecutive segments. New cells next to old ones would lengthen existing runs and re-roll every `rng(31338)` car.
- `buildInfillRuns2` therefore scans only `cells2`, and drops every segment already used by a district run (the existing `existing` test) or by any infill run. Each infill run's segments are put in a key set `di, axis, line, k`.
- So no street gets two sets of cars, and existing runs are untouched.

**Tower text:**
- Infill tops stay under 94 m, so the blocks never join a phrase (minimum 100 m).
- They stand across the water from every phrase face, so they never block one.
- Check: `towerText` identical.

## Identity checks (every shared stream)
For each stream, the main build's output must be a prefix of the candidate's, or identical:

| Stream | What must match |
|---|---|
| lots `rng(1234)` | identical |
| plan first pass `rng(5678)` | `plan.cells`, `world.infillLots` identical |
| park trees `rng(6161)`, vegetation `rng(4242)` and `rng(99)` | identical, except trees removed under `infillLots2` (count reported) |
| building parts | identical prefix (all of main's parts) |
| infill lights `rng(4343)` | identical selection |
| signs `rng(9137)`, `rng(9138)` | identical prefix and identical light selection |
| district cars `rng(31337)`, infill cars `rng(31338)` | car inputs identical for every index of main; runs identical prefix |
| crowd `rng(8080)`, `rng(9191)` | agent arrays identical (the crowd uses district runs only) |
| infill street lamps | candidates and real-light slots identical |
| tower text, `towerTops`, searchlights | identical |

Plus `functional.mjs` 18/18 and no WebGPU errors.

## Per-pose change (CPU projection) and targets
**Method:**
- f = 720 / tan(0.525) = 1241.7 px, poses from `poses-v1.json`.
- **Car:** body box 1.8 x 1.1 m plus a 1.56 x 0.5 m glasshouse, 1.1 m from the lens, nothing in front of it. Only B2 has a camera inside a traffic lane. A4's camera is on the pavement, with the nearest car at about 6 m, and the street burst u12's cars are 10 m or more away. So only B2 changes.
- **Strip:** an upper-bound polygon from the Jade east bank to x = 950, z −750 to the Great River bank. The east edge is the most the G3 critic box allows; the real edge is the Ovoo line, which only the dev build can compute (`stats.ovoo`).
  - It is split into 20 m cells: cells within 70 m of the water are left unbuilt (quay depth), the rest are 16 m blocks (first 160 m from the water) or 26 m blocks.
  - Occluders: nothing stands between these cameras and the strip except open water. In G2 the strip lies behind the river; the part east of about x 800 may overlap existing infill, so G2's real change is lower.

| Pose | Car fade | Strip blocks | Total change (estimate) | Target? |
|---|---|---|---|---|
| B2 | 13.1% | 0 | **about 13%** | yes |
| G2 | 0 | 1.76% (x 1528-2194, y 610-738; the dark wooded bank is about 1.3%) | **about 1.3-1.8%** | yes |
| G3 | 0 | 1.15% (x 1174-1670, y 652-812) | **about 1.2%** | yes |
| G1 | 0 | 0.30% | 0.3% | no |
| G4 | 0 | 0.30% | 0.3% | no |
| A6 | 0 | 0.05% | under 0.1% | no |
| A3 | 0 | 0 (the waterside 70 m stays as it is) | 0 | no |
| all others | 0 | 0 | 0 | no |

**Targets (declared rule):** a pose is a target if at least 1.0% of its pixels differ between main and candidate (`tools/pixdiff.mjs`, default threshold). Animation is identical in both builds, since no stream changes. The list is computed and recorded before judging; **expected B2, G2, G3**. Adoption as in EVAL.md: at least 2 of 3 targets won, and no clear loss elsewhere.
- If the strip turns out smaller than the upper bound and G3 or G2 falls under 1%, it is judged under the no-loss rule only. B2 plus the remaining strip pose must then both win.

## Why it might work
- B2 carries a critical defect over 13% of the frame. Without the car, the frame shows the street ahead.
- G3's brown strip and G2's dark bank become lit city of the same kind that won both poses for I-016.
- Neither part changes anything outside its own pixels: every stream is unchanged or appended.

## What's new about it
- The camera-collision fade is standard practice but new to this program. It replaces I-025's rejected idea of detailing a car 1 m from the lens.
- The east-bank pass extends I-016 to the land its own rules left out. It is made fully append-only: own cells, own runs with de-duplication, own pools. Without that, a naive extension would re-roll infill traffic, as the I-015 result review saw happen.

## Expected effect on the metric
- Pairwise: a clear win likely at B2; likely wins at G3 and G2. No other pose changes.
- Critics: B2's critical defect is gone (about +0.4 on B2's pose score). G3 and G2 lose "empty brown lots" and "dark forest band", partly; the infill blocks are still plain 8-storey boxes. In total about +0.1 on zone B and +0.1 on zone G.

## Quick test
0. **Dev logs, no images:**
   - the strip's cell and lot count and its built area;
   - `stats.ovoo`, and why each excluded texel was excluded;
   - the number of new runs and cars;
   - at the B2 pose and time, the box distance of the nearest car (expected about 1.1 m).
   
   If the strip yields fewer than 15 lots, stop part 2.
1. **Car fade on held-out cameras:**
   - three cameras on CBD and Bund road centre lines at 1.7 m, each at least 300 m from B2;
   - for each, the first time t in 60-140 s when the log shows a car's box within 1.5 m (still frame), and a second time with a car at 1.5-2.5 m (inside the dither band);
   - a 4-frame burst moving 3 m per frame along each road.
   
   One blind judge (`pairwise-judge-v1.md`, pairs from `make-pairs.mjs`) compares main and candidate on the 6 stills, and reads the bursts for temporal defects only. **Continue if at least 4 of 6 are won, none is a clear loss, and no stipple or ghost car is named.**
2. **East bank on held-out cameras:**
   - G3-like: 600 m up, 1.5 km south of the strip, bearing +30 degrees from G3's;
   - G2-like: 90 m up across the Great River, 800 m away, bearing −25 degrees from G2's;
   - one 40 m high view from the Jade River's west bank.
   
   The same blind judge. **Continue if at least 2 of 3 are won and none is a clear loss.** Then the identity checks, the bench, the targets and the evaluation.

## Implementation plan
1. `trafficCars.js`: `boxDist` and `camFade` in `CAR_CS`; skip at 0; lamp, streak and packed-colour changes; discard in `CAR_MESH_WGSL`.
2. `plan.js`: `eastBankPass` (texel region, cells, lots from `rng(5679)`, `coverAt` merge); `world.infillLots2`.
3. Appended consumers: `buildings_infill.js` (`genInfill2`, light pool `rng(4344)`), `signPlace.js` / `signs.js` (third pass `rng(9139)`, own cells and light pool), `terrain.js` / `terrainLamps.js` (third lamp instance), `trafficCars.js` (`buildInfillRuns2` with the segment key set, cars `rng(31339)`), `vegetation.js` (stamp `infillLots2`).
4. Identity checks (table above), as a dev tool that dumps each stream's output from both builds and compares.
5. Bench in alternating pairs under the GPU lock; targets by the pixdiff rule; evaluation.

## Cost
- Effort: small for part 1, medium for part 2 (mostly the append-only plumbing and the identity tool).
- **GPU:** about +0.10 ms average (gate: avg ≤ 11, p99 ≤ 16.7, max ≤ 25; current about 9.8). Where it comes from:
  - **Part 1:** `discard` in the car G-buffer pipeline turns off early depth for all car pixels, a few percent of the screen: about +0.01 ms. If the bench shows more, cars with `camFade` = 1 are drawn by the current pipeline and only the faded ones by a second one.
  - **Part 2, geometry:** the strip is at most about 260,000 m² of buildable land, roughly a third of I-016's Exchange (I-016 cost +0.19 ms for its whole plan). That is about 40-90 lots, 600-1,200 parts: about +0.05 ms of G-buffer where visible.
  - **Part 2, lights:** 47 new real lights (20 shop, 12 sign, 15 lamp) in the tiled lighting pass, all local to the strip: about +0.03 ms.
  - **Part 2, traffic:** a few hundred cars, about 2% of the total, under 0.01 ms in the car compute. The lamp buffer has room: its cap is the lesser of 3x the car count and 36,000.

## Risks
- **The strip may be smaller than the upper bound**, if the slope or hill-foot rules exclude much of it. Then G2 or G3 can fall under the target threshold, and adoption rests on B2 plus one strip pose. Quick test 0 measures this first.
- **Flat infill boxes.** Critic 2 calls G3's districts flat slabs. The pass adds more of the same type, so the pairwise gain is likelier than a critic gain.
- **A dithered car at 1.2-2.5 m** may show stipple in motion for a camera standing in a lane. The burst check covers it; the band could be shortened further (for example 1.2-2.0 m) if needed.
- **Overlap:** the riverbank or park ideas may also claim the Jade east bank. This pass leaves the 70 m waterside band untouched for them, and the coordinator should merge only one owner for the built part.
