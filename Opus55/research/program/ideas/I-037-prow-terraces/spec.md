---
id: I-037
title: Prow Terraces - the Raffles look-alike becomes a cluster rising landward with a climbing stair of sky halls, on lit Confluence Steps that cover the bare tip (the A3 wedge)
status: in-review
direction: Attack the weakness (critical A3 wedge; critic 2: Raffles City replica); revision of I-031 after review
family: landmark design plus site completion: bespoke parts built on the old records and replaced after generation, terraced podium on bare land
parent: I-031
proposed_by: idea generator
date: 2026-11-24
---

# I-037: Prow Terraces and Confluence Steps

## Idea
Two problems sit on one site at the peninsula tip.

**The critical A3 "dark curved wedge" is bare terrain.**
- A zoom of A3 shows lane lines and zebra crossings painted on a steep hillside. Rays from A3 (f = 1241.7 px) put the wedge on the ground 166-260 m south-east of the Raffles site centre (220, −60):
  - its crest at about (296, 75, 113) and (317, 70, 73);
  - its foot at the waterline at about (319, 0, 156).
- The wedge is the polygon (830, 847), (995, 865), (950, 880), (870, 1100), (860, 1150), (610, 1150), (660, 1030), (760, 900): **1.73% of the frame**.
- It is the same ground as the dark "tray" under the towers in G2 (rays hit (200-440, 30, 60-140); about 0.4% of G2).
- Why it is bare:
  - Lots are reserved off it out to r + margin (`world.js:368`).
  - Vegetation is stamped clear to r + 25 and a 424 m square (`vegetation.js:374`).
  - The Raffles assembly covers only its tower row.

**The Raffles assembly copies Raffles City.**
- Critic 2 flags it in A3 and G2: towers in an arc, one horizontal conservatory across them, and two taller flank towers linked by tubes.

**The fix, in two parts:**
- **The towers become a "prow":**
  - heights rise landward;
  - each tower gets a sloped crown facing the confluence;
  - the single horizontal vault becomes a climbing stair of three bold sky halls plus a glass prow lantern pointing at the confluence.
- **The Confluence Steps cover all the bare land at the tip:** lit sandstone terraces with arcades, balustrades, lamps, a grand stair and open streets between them, joined to the Hongyadong complex's end without a seam.

**What today's images get from the cluster stays:**
- All six tower shafts keep their positions, footprints, edge strips (`FLAG.EDGE`) and crown washes (`FLAG.CROWNLIT`) below their new crowns. So A2, where only the lower shafts are visible, barely changes (0.27% of pixels, below).
- The cyan-green glow of the vault carries over to the halls (same colour, `FLAG.LED`, lit ribs), and the halls cover about as many pixels as the vault does in each pose.

## Constraints from the Hongyadong complex (found in the code)
`hongyadong()` scans every non-prop part placed before it with min(hw, hd) ≥ 2, h ≥ 4 and y0 ≤ yTopMax, whether or not it is solid (`buildings_stilts.js:406-430`). It treats a part as an obstacle when it reaches into the stack's planned volume, and it builds podiums and skirts around those parts. I-015 records **2 landmark obstacles**.

The Raffles part order in `raffles()` is:
- local 0-7: shaft and crown of row towers 1-4;
- 8-10: vault deck, deck light, vault;
- 11-19: vault ribs;
- 20-23: north flank tower shaft, mast, prop, tube;
- 24-27: south flank tower shaft, mast, prop, tube.

Only the six shafts (local 0, 2, 4, 6, 20, 24) start low enough to be candidates. Ranked by distance from their east faces to the Jade River's west bank (centreline and width from `RIVERS`):

| Part | Position | Distance to the Jade bank | Obstacle? |
|---|---|---|---|
| Row tower 4, local 6 (kind 0, 30 × 24 m, angle 0.12, lean lx = 9) | 215, −68 | about 45 m | yes (I-015 DEVIATIONS: base at 80 m, podium and skirt) |
| North flank tower, local 20 (kind 1, 38 × 32 m, no lean) | 150, −170 | about 77 m | almost certainly the second |
| Row tower 3, local 4 | 155, 4 | about 135 m | no |
| South flank tower, local 24 | 150, 45 | about 146 m | no |

Step 1 logs the actual `o.part` indices of the `'land'` obstacles on main. The design below is safe in either case: no shaft's footprint, angle, kind or lean slope changes.

## Isolation: build the old records, replace after generation
The same mechanism as I-036:
1. `raffles()` runs exactly as today. The complex, part indices, unseeded seeds, props, light order, colliders and traffic runs all see today's Raffles.
2. After `genInfill`, `selectTowerText` runs on today's city, then `replaceLandmarks` swaps the Raffles slots:
   - **Shafts:** each keeps x, y0, z, angle, hw, hd, kind and prm, and keeps its lean slope (lx / h). Only h changes, and the new crown parts go on top.
   - **Obstacle shafts** (tower 4, the north flank tower) therefore keep their exact geometry up to yTopMax, so the complex and its podium and skirt for tower 4 stay valid.
   - **Glyph-carrying parts** keep their whole record. If a shaft carries a character, its old h is kept and the crown sits on its old top. So the 6 phrases are identical by construction.
3. **Tail:** the halls, the prow lantern and the Confluence Steps are appended at the very end with explicit seeds. Tail parts are never complex obstacles (the complex is built long before), so `tools/hyd-identity.mjs` must show the complex identical.
4. **Lights:** Raffles keeps its 4 lights in the same order. Two of them move to the Steps, with positions computed from terrain at `raffles()` time.
5. **Searchlights:** Raffles' tops carry no `cbd`, `lm` or `bund` flag, so `towerTops` (and the searchlights) are unaffected.
6. **No shared random stream:** the Steps use `rng(7301)`.
7. **Lots, plan, vegetation and LANDMARKS** are unchanged. The Steps keep 2 m clear of every road edge, so the colliders they add never cut a traffic run (`buildRuns` tests run points against collider footprints + 1.5 m). The check is that runs are identical.

## The design (heights above the plateau gm, about 95 m)

**Row towers 1-4 (west to east):**
- Tops at gm + 340, 315, 290 and 265 (old: 270, 300, 285, 255). The cluster climbs landward, away from the confluence, like a prow.
- Each tower's top 36 m is a sloped crown (taper 0.35, lean 8 m east toward the confluence) in `MAT.CROWN` cyan-green [0.5, 1, 0.85], with five lit vertical fins (0.8 × 3 × 30 m) on its east face. The slope differs slightly per tower (lean 6, 7, 8, 9 m).
- Below the crown, each shaft is unchanged and keeps `FLAG.EDGE | FLAG.CROWNLIT`.

**Flank towers:**
- North flank (150, −170): top at gm + 298 (old about 298, so practically unchanged).
- South flank (150, 45): top at gm + 268 (old gm + 298).
- Each has a "gate" crown: three 8 m setbacks on its confluence face over the top 60 m, each with a lit roof garden, and a crown lantern.
- The two masts and aviation props are kept on their own crowns.

**Sky stair** (replaces the vault, its ribs and both tubes). Three halls, each linking two neighbouring towers:
- Tower 3 to tower 4 at gm + 150, tower 2 to tower 3 at gm + 185, tower 1 to tower 2 at gm + 220: they climb landward.
- Each is 90 m long (centre to centre plus 15 m into each tower), 28 m deep and 28 m tall: an 18 m body with four lit floors, under a 10 m barrel vault (prof 1, as the old vault).
- Glass in the old vault colour [0.35, 0.9, 0.6] with `FLAG.LED`, lit ribs every 15 m and a lit underside.

**Prow lantern:**
- A 40 × 24 × 22 m glass hall at gm + 150, cantilevered east from tower 4's crown zone toward the confluence (from tower 4's centre + 15 m to + 55 m), with a lit glass floor and a sloped lit roof.
- It is far above yTopMax, so it cannot affect the complex.

**On-screen size** (projected):

| Pose | Old vault | New halls + lantern |
|---|---|---|
| A3 | 0.93% | 0.84% |
| G2 | 0.29% | 0.33% |
| G3 | 0.17% | 0.18% |
| A1 | 0.77% | 0.61% |

So the new halls are about as bold as the vault.

**Not Raffles City:**
- no single conservatory lying across the towers at one level;
- a climbing staircase of halls at three heights plus a lantern projecting toward the confluence;
- tops rising 265 → 340 m landward instead of near-equal tops;
- crowns sloped toward the confluence;
- the cluster stands on terraces instead of a mall podium.

### Confluence Steps (tail parts)
**Domain.** All bare land at the tip, covering the whole wedge, including its near-left part outside r = 190, which the reviewers measured (A3 x 600-850). The domain is every 6 m cell that meets all of these:
- within 320 m of (220, −60), on land (ground ≥ 3 m, water distance ≥ 6 m), and on the peninsula (the straight line to the site centre crosses no water);
- clear of:
  - every lot and infill lot + 3 m;
  - every plan feature;
  - every district road corridor (half road width + 2 m: the streets stay open);
  - the monorail Line 2 reserve (12 m);
  - bridge corridors;
  - the six tower footprints + 2 m;
  - every Hongyadong complex piece + 0.5 m.

**Terraces.**
- Cells are merged into runs along the district's local x (angle 0.32), each at most 48 m long and all at the same level.
- **Run top = ceil(h_max / 8) × 8 + 0.3**, where h_max is the highest ground in the run (corners and centre of every cell). So every terrace top is at or above all the ground under it, never buried.
- **Run base = h_min − 1**, where h_min is the lowest ground in the run. So no downhill face floats.
- Each run is one block in sandstone (`MAT.MASONRY`).

**Faces and dressing.**
- On every face that drops 4 m or more to the next level or the ground: a row of lit arcade shop bays every 8 m (0.4 m-proud lit shopfront panels with warm glazing), plus a lit balustrade along the edge (`MAT.RAIL` with an emissive strip).
- Lamp posts every 18 m.
- Planters and trees on the terrace tops.
- Along every open street inside the Steps, the retaining walls carry lamps every 18 m, so the streets read as steep lit lanes between terraces.

**Grand stair.**
- 16 m wide, along the steepest descent from the plaza east of tower 4 down to the riverside promenade.
- Landings every 2.4 m of rise, built from MASONRY parts with stair treads (winW 1), with lamp posts on both sides every 12 m.

**Joint with the complex.**
- Blocks stop 0.5 m from complex pieces, not 12 m.
- The row of cells touching the complex's south end pavilion becomes a lit stair landing from the promenade deck (5.8 m) up to the first terrace, so no dark seam is left.

**Checks.**
- No block corner more than 0.3 m above the ground (nothing floats).
- No block top below the ground at any sampled point (nothing is buried).
- No overlap with complex pieces (run the `?hydaudit` overlap test with the Steps added).
- Traffic runs identical.
- **Wedge coverage:** project the Steps and the open streets' walls into A3. At least 90% of the wedge polygon must be covered, and no band of bare terrain wider than 6 px may remain between the Steps and the stack.
- The same projection for the G2 tray.

## On-screen change (CPU projection) and targets
- **Method:** old and new parts (code sizes for the old, this spec's sizes for the new) projected into every eval pose with f = 1241.7 px. Calibration: the old Raffles projects to x 914-1476 in A3 and x 930-1180 in G2, matching the renders.
- **Occluders** are the skylines in front of the cluster in the main renders: A1 y 480 (the stack), A2 y 300, A3 y 860, A6 y 1010, G1 y 700, G2 y 600, G4 y 520.
- **"Changed"** = pixels where the old and new silhouettes differ, plus pixels covered by any part whose look changes (crowns, vault or halls, tubes, masts, lantern).
- The wedge and tray are measured on the main images.

| Pose | Raffles mask (old / new) | Changed: towers and halls | Steps (wedge, tray) | Total changed (estimate) |
|---|---|---|---|---|
| A3 | 6.64 / 6.22 | 2.54 | 1.73 | **about 4.3** |
| G2 | 2.28 / 2.15 | 0.92 | about 0.4 | **about 1.3** |
| A1 | 8.99 / 8.91 | 1.19 (halls in the top 94 px) | 0 | **about 1.2** |
| A6 | 3.04 / 3.19 | 0.97 | 0 | about 1.0 |
| G3 | 0.93 / 0.92 | 0.46 | about 0.3 | about 0.8 |
| A2 | 9.36 / 9.32 | 0.27 | 0 | 0.3 |
| G1, G4 | 0.43, 0.09 | 0.21, 0.13 | 0 | under 0.3 |

**Targets (declared rule):** a pose is a target if at least 1.0% of its pixels differ between main and candidate (`tools/pixdiff.mjs`, default threshold). Animation is identical in both builds. Recorded before judging.
- Expected: **A3, G2**, and **A1** (1.2%: only the halls at the top edge change); A6 is on the line.
- A2 (0.3%) is not a target; it must simply show no clear loss.

Adoption as in EVAL.md.

## Why it might work
- A3 carries a critical defect in the zone with the most weight. Covering 1.73% of the frame of bare striped slope with lit terraces removes it, and the G2 tray goes with it.
- The cluster keeps what judges see today (edge-lit shafts, a big cyan glow), so the comparison is original against copied, not new against strong.

## What's new about it
I-031 bundled this with six other towers, removed the edge strips (A2 would have changed by losing them), buried its terraces (`floor`), stopped at r = 190 (leaving the left third of the wedge bare), left a 12 m dark seam and redesigned towers the complex depends on. This version fixes each of those, finds the obstacles in the code and keeps them geometrically, and is judged on its own.

## Expected effect on the metric
- Pairwise: a clear win likely at A3; a likely win at G2; A1 is uncertain (only the top edge changes, halls instead of the vault underside).
- Critics: the A3 critical defect goes; about +0.3 on zone A, +0.1 on G.

## Quick test (before finishing)
1. Build the replacement and the Steps.
2. Run hyd-identity, the traffic-run diff and the text diff, plus the floating/buried/overlap checks.
3. Capture held-out cameras only, each at least 300 m from every eval pose:
   - two A3-like views on the confluence, 20 m up, 500 m from the tip, at bearings ±25 degrees from A3's;
   - one G2-like view 90 m up across the Great River, 900 m from the tip, at a bearing 30 degrees from G2's;
   - one A1-like view on the Jade River, 12 m up, 300 m north of A1;
   - one A2-like low close view, 25 m up, 200 m from the stack, 250 m north of A2.
4. One blind judge (`pairwise-judge-v1.md`, pairs from `make-pairs.mjs`) compares main and candidate. **Continue only if at least 4 of 5 are won and none is a clear loss.**

## Implementation plan
1. Log on main: Raffles slot range, the complex's obstacle part indices, `towerText.glyphs` parts in the range, lights, props.
2. Shared with I-036: `replaceLandmarks(B, world)` in `buildings_landmarks.js`, called after `genInfill` and `selectTowerText`; colliders from the frozen slot copy (for Raffles they are geometrically equal anyway, since the shafts keep their footprints).
   - If both ideas are adopted, they merge in sequence. Tails carry explicit seeds, so their order does not matter.
3. `prowTerraces(B, world)`: shaft heights and crowns, halls, lantern.
4. `confluenceSteps(B, world, rng(7301))`: domain grid, runs, blocks, dressing, grand stair, joint.
5. Checks; bench in alternating pairs under the GPU lock; targets by the pixdiff rule; evaluation.

## Cost
- Effort: medium-large (the terrace generator is most of it).
- **GPU:** about +0.06 ms average (gate: avg ≤ 11, p99 ≤ 16.7, max ≤ 25; current about 9.8). Where it comes from:
  - The Steps are about 1,000 blocks, 300 arcade panels and 600 props, and the towers, halls and lantern about 60 parts, against about 150,000 parts: under 0.01 ms of culling.
  - The Steps' pixels replace terrain pixels at a similar shading cost (+0.03-0.05 ms where visible).
  - Lights keep their count (2 of Raffles' 4 move), so the lighting pass does not grow. No new pass.

## Risks
- **A1 may tie or lose:** its change is the top 94 px (halls instead of the vault underside and tubes). The quick test includes an A1-like view.
- **Terraces may read as a stepped pyramid.** The arcade rows, open lit streets, the grand stair and trees break them up. The 8 m step follows the ground, so the levels differ along the slope.
- **The second obstacle could be a different part.** Every shaft keeps its footprint and lean slope, so the complex stays identical in any case; step 1 confirms.
- **Overlap with the terrain/riverbank idea:** the Steps are computed from `heightAt` at build time, so they follow any reshaped terrain. If that idea builds embankments at the tip, the domain's water-distance limit (6 m) leaves the waterline to it.
