---
id: I-036
title: CBD hero trio - Braid, Tripod Lantern and Offset Pair replace the Shanghai Tower, Bank of China and Petronas look-alikes, with the light show, edge strips, searchlights and tower text kept exactly
status: in-review
direction: Attack the weakness (critic 2: near-replica landmarks); revision of I-031 after review
family: landmark design: bespoke part assemblies, built on the old records and replaced after generation
parent: I-031
proposed_by: idea generator
date: 2026-11-24
---

# I-036: CBD hero trio

## Idea
Replace the three CBD landmarks that critic 2 names as copies, and nothing else:

| Code | Site | Reads as | Replaced by |
|---|---|---|---|
| `twist` | 3250, -1350 | Shanghai Tower (B1, B3, B4, G3) | **Braid** |
| `truss` | 3020, -1780 | Bank of China (B2, G3) | **Tripod Lantern** |
| `twin` | 3560, -880 | Petronas (B3, G3) | **Offset Pair** |

Each new tower keeps the inspiration (a twisting supertall, triangulated structure, a linked pair) and drops the signature features of the real building. **What today's images get from these towers stays:** the twist's `FLAG.LED` show bands (green and pink in B1 and B4) and `FLAG.EDGE` neon strips move onto the Braid's shafts; the twin's edge strips stay on both new towers; the truss's LED lighting stays on the Tripod's legs, which also gain edge strips. Searchlights keep their order and personalities, and the tower-text phrases stay identical by construction.

The other landmarks are not touched. `crystal`, `beacon` and `ridge` are left for a later idea. When they are redesigned, the reviewers' points apply: no stacked spheres on a shaft (Oriental Pearl, and the city's `tvtower` already has orbs) and no Shard-like spike or spike cluster. Raffles and the A3 wedge are in I-037.

## The three designs (all sizes in metres above local ground g ≈ 8)
Every part is a standard part (`buildings_wgsl.js`); kind 4 is the triangle (vertices (hw, ±hd) and (−hw, 0)).

**1. Braid** (twist site; the existing three-lobed glass podium, hw 62, h 28, is kept unchanged).
- Two shafts, each a rounded rectangle 30 × 24 m (kind 0, prm 0.6, hw 15, hd 12), long side tangent to the helix, tapering linearly to 0.65 at the top (19.5 × 15.6 m).
- **Helix radius 26 m**, so the inner faces are 14 m from the axis at the base: a **28 m gap** (about 33 px at B1's 1,064 m, 56 px at B4's 624 m), widening to about 36 m at the top.
- One full turn over 540 m. Each shaft is 12 segments of 45 m: segment k starts at helix angle θ0 + 2πk/12 (the second shaft + π), leans (`lx`, `lz`) to the next helix point and twists by 2π/12, so its long side follows the helix. 45 m segments are above the text rule's `blockH` of 40 m.
- Flags on every shaft segment: `FLAG.LED | FLAG.EDGE`, glass colour, floorH and winW as the old twist ([0.32, 0.52, 0.66], 4.4, 1.6), so the LED show and the corner strips continue on both shafts.
- **Clasps instead of full collars:** at segments 3, 6 and 9, a sky-garden bridge links the two shafts across the gap. Each is a box 52 m long (centre to centre) × 14 m deep × 8 m tall, rotated to the helix angle at that height, in green-lit glass with a lit balustrade and six garden trees (from the landmark's own prop counter). They are clearly bridges between two bodies, not rings around one.
- Crown: at 564 m both shaft tops are joined by a lit crown bridge (68 × 16 × 10 m, `MAT.CROWN` cyan), centred on the axis. A hexagonal glass lantern (radius 9 m, 30 m, taper 0.4) sits on it, and a spire with five ring lights rises **on the axis** to about 660 m.
- Not Shanghai Tower: two separate bodies with a 28-36 m gap from every bearing, no lobed plan, no notch, no fin fork.

**2. Tripod Lantern** (truss site; the existing stone base, square hw 38, top at g + 18, is kept unchanged).
- Three legs, each an equilateral triangle in plan with side 22 m (kind 4: hw = 22·√3/4 = 9.5, hd = 11, part origin moved by −hw/3 along its local x so the centroid is at the leg centre), apex pointing outward.
- Leg centres sit on a circle of radius 24 m at the base (outer vertex at 36.7 m, inside the 38 m base). They lean inward to radius 12 m at 300 m and taper to 0.6 (side 13 m). Centre spacing goes from 41.6 m to 20.8 m, so the legs never touch: the gap is about 20 m at the base and about 8 m at the top. Material: glass with `FLAG.LED | FLAG.EDGE`, not the TRUSS diagrid, which is the Bank of China facade.
- Two sky-lobby floor plates tie the legs: equilateral triangles of circumradius 30 m at 110 m and 24 m at 210 m, each 9 m thick (warm lit glass, param 0.95) with a 0.6 m lit band under it. The legs pass through them; the sizes differ, so no faces are coplanar.
- The legs end at 300 m on a **crown deck**: an equilateral triangle of circumradius 22 m, 6 m thick, that sits on the leg tops (legs end at its underside, no overlap at the axis). On it stands a triangular glass lantern (circumradius 17 m, 55 m tall, taper 0.55, `MAT.CROWN` pale blue), then a 45 m mast with three ring lights.
- Not Bank of China: no square plan, no quadrants rising to sloped tops, no diagrid, no twin masts.

**3. Offset Pair** (twin site, same centres, 80 m apart on the 0.35 rad axis).
- Ground footprints stay inside the old colliders: two 30 × 30 m boxes plus 1.5 m, because roads x = 3550 and z = −875 pass beside and between the towers.
- **Tower A** (west): a chamfered square (kind 1, prm 0.35) 32 × 32 m to 220 m, then 26 × 26 m to 343 m, then 20 × 20 m to 418 m, with warm lit ledges at each setback. Its crown is a sloped glass cut toward the river: 45 m tall, taper 0.25, lean 10 m west, `MAT.CROWN` warm, with seven lit vertical fins (0.8 × 3.6 × 40 m) on its river face. A glass observation prow is cantilevered west at 300 m: 20 m long (6 m inside the tower), 14 m wide, 9 m tall, with a lit glass floor.
- **Tower B** (east): a **decagon** (kind 2, prm 10, a real polygon, not a cylinder), 33 m across flats to 230 m tapering to 0.92, a recessed lit waist at 230-236 m, then 28 m across to 360 m. Its crown is a lit halo ring (radius 14 m, 2.2 m) floating 14 m above the roof on four masts, plus a 60 m spire.
- Both shafts keep `FLAG.EDGE`.
- **Sky Hall** at 160 m: 60 × 18 × 15 m (spans the 47.5 m gap and enters each tower by 6 m), glowing glass with four lit floors, a roof garden and a lit underside. A slim lower bridge at 95 m (52 × 5.2 × 4.5 m) is offset 12 m sideways.
- Not Petronas: different plans for the two towers, no star plan, no tiered pinnacles, a hall instead of a two-storey truss bridge with struts.

## Isolation: build the old records, replace after generation
The safest way to keep every other system identical is to let them all see the old landmarks, and swap the drawing only at the end.
1. `genLandmarks` builds `twist`, `truss` and `twin` exactly as today. So the part indices, unseeded seeds, props (twist 46, twin 2, truss 2), light order, `B.tops`, `B.led`, colliders and the complex's obstacle scan are all exactly as today.
2. **Tower text:** in `generate()`, right after `genInfill`, run `selectTowerText(world, P)` on the city as it is today, then replace. Any part that carries a glyph is never replaced. By the program's logged geometry, none of the three is expected to carry one: twist parts are twisted and lobed and are skipped; truss and twin stand 570 m and 1,050 m from the water behind front-row towers. The replacement step asserts this. **The 6 phrases are therefore identical by construction**, blockers included.
3. **Replacement:** each landmark's old index slots get the new design's first parts; the rest are appended at the very end with explicit seeds. Unused old slots become empty parts. Lights keep their count, priority and order, with positions moved to the new crowns.
4. **Colliders** are built from the old records (a frozen copy of the slots), so `buildRuns` (trafficCars.js:300-320, which cuts roads at real footprints) gives identical runs and the car stream is unchanged. At ground level the new parts stay inside the old footprints plus 1.5 m, so no car drives through a new wall. Known limitation: above ground, the player collides with the old volumes; this is invisible in captures and minor in free flight.
5. **Searchlights** (lightshow.js takes the first 10 `towerTops` at least 160 m apart and gives each its personality from `rng(808)` in that order): each top keeps its old x and z (all three crowns are on the old axes and tower centres). Only y moves to the new crown, and `buildings.js` sorts by a stored `sortY` = the old y. The source list (positions in x and z, and order) is identical; only beam origin heights change.
6. No shared random stream is used. Lots, plan, vegetation and traffic are unchanged, and `LANDMARKS` is unchanged.

Checks: everything outside the three slot ranges and the tail is identical to main (part diff); `towerTops` x, z and order identical; traffic runs and car states at t = 100 identical; `world.shared.towerText` identical; `functional.mjs` 18/18; no WebGPU errors.

## On-screen coverage (CPU projection) and targets
- **Method:** the old and new part models were projected into every eval pose with the real camera: f = 720 / tan(0.525) = 1241.7 px, poses from `poses-v1.json`, ground 8 m in the CBD. The models use the code's sizes for the old towers and this spec's sizes for the new ones.
- **Calibration:** the old twist projects to x 434-618 with its top at y 238 in B1, and to x 1050-1298 in B4; both match the renders.
- **Occluders** are what stands in front in the main renders (`runs/I-016m`), as a skyline per pose read from the images: B1 y 870 (embankment and trees); B2 twist hidden by the near building, truss below y 770; B3 y 640; B4 twist below y 860, truss hidden by the near cylinder, twin below y 1,100; G4 y 700.
- Values are % of the 2560 × 1440 frame. "Union" is the old or new silhouette, which is what the mask rule measures ("either build").

| Pose | Trio old | Trio new | Union | twist / Braid | truss / Tripod | twin / Pair |
|---|---|---|---|---|---|---|
| B1 | 1.94 | 1.45 | **1.99** | 1.44 / 1.06 | 0 / 0 | 0.51 / 0.39 |
| B2 | 1.29 | 0.91 | **1.33** | 0 / 0 | 1.29 / 0.91 | 0 / 0 |
| B3 | 0.96 | 0.72 | **0.99** | 0.39 / 0.30 | 0.12 / 0.09 | 0.45 / 0.33 |
| B4 | 3.68 | 2.55 | **3.81** | 3.29 / 2.47 | 0 / 0 | 0.39 / 0.07 |
| G3 | 0.55 | 0.42 | 0.56 | 0.20 / 0.16 | 0.08 / 0.07 | 0.26 / 0.19 |
| G1 | 0.27 | 0.21 | 0.28 | | | |
| G4 | 0.08 | 0.06 | 0.08 | | | |
| A1-A6, G2 | 0 | 0 | 0 | | | |

The new towers cover less because the Braid has a 28-36 m gap through it, the Tripod is open between its legs, and the Offset Pair's footprints are held inside the old colliders.

**Targets (declared rule):** B1, B3 and B4 as set by the coordinator, plus any other pose where the `?lmmask` capture (the three landmarks' parts painted flat, everything else black; built like `devMaskComplex`) covers at least 1.0% of the frame in either build. By the table, that adds **B2** (1.33%); G3 (0.56%) stays out. B3 is a target because it was named, though it sits on the line (0.99%). The mask list is computed and recorded before any judging. Adoption as in EVAL.md: at least 2/3 of targets won and no clear loss elsewhere.

## Why it might work
- The judge brief says "landmarks are original designs inspired by real towers, never replicas", and critic 2 flags these three in B1-B4 and G3. Unlike I-031, the new designs keep what makes those images strong: the LED show bands and edge strips, the searchlight beams, the phrases and the overall height ranking. So a judge compares a copied silhouette with an original one carrying the same light.
- B4 and B1 are dominated by the twist (3.3% and 1.4% of the frame). Two lit shafts winding a full turn with lit sky bridges between them read as a new landmark at those sizes.

## What's new about it
I-031 bundled seven redesigns, dropped the edge and LED lighting, and risked phrases, searchlights and the complex. This idea is limited to the CBD trio, and it isolates the change completely (build the old records, replace after generation, colliders and text from the old records). The Braid's gap and the Tripod's leg spacing are now sized from projected pixels.

## Expected effect on the metric
- Pairwise: wins likely at B4 (the Braid fills the centre) and B1 (the Braid and the Pair are prominent, the show unchanged). B3 and B2 are smaller (about 1% each), so ties are possible there.
- Critics: the brief violation is removed from four poses; about +0.2 on zone B.

## Quick test (before the full build)
1. Build the Braid alone. Use held-out cameras placed by rule, each at least 300 m from every eval pose:
   - two B1-like views from the west-bank promenade, 8 m up, 400 m north and 400 m south of B1, aimed at the Braid;
   - two B4-like views 280 m up at 600 m from the Braid, at bearings 90 and 180 degrees from B4's;
   - one B3-like aerial view 230 m up, 1.2 km away, at a bearing 40 degrees from B3's.
2. Check the gap is visible (at least 20 px) in every view and that the LED bands run on both shafts.
3. One blind judge (`pairwise-judge-v1.md`, X/Y randomized by `make-pairs.mjs`) compares main and candidate on these five views. **Continue only if at least 4 of 5 are won and none is a clear loss.**
4. Repeat with the Tripod and the Offset Pair added, using two held-out views each framed like B2 (street level in a CBD canyon about 1 km away) and like B3.

## Implementation plan
1. Log on main: the three landmarks' slot ranges, props, lights, tops (x, y, z, flags), `towerText.glyphs` parts (assert none in the three ranges), and the collider records.
2. `buildings_landmarks.js`: `braid()`, `tripod()` and `offsetPair()` return part lists; `replaceLandmarks(B, world)` writes slots, appends the tail and moves lights.
3. `buildings.js`: call `selectTowerText` inside `generate()` before `replaceLandmarks`; build colliders from the frozen slot copy; sort `towerTops` by `sortY`.
4. Dev flag `?lmmask` for the target rule.
5. Checks listed above; bench in alternating pairs under the GPU lock; targets; evaluation.

## Cost
- Effort: medium (three assemblies, the replacement step).
- **GPU:** about +0.03 ms average (gate: avg ≤ 11, p99 ≤ 16.7, max ≤ 25; current about 9.8). Where it comes from: the three new towers are about 200 parts against about 150,000, adding under 0.01 ms of culling. The silhouettes cover 25-30% fewer pixels than the old ones, so G-buffer cost stays flat or drops slightly. Lights, text overlay, searchlights and post are unchanged.

## Risks
- A judge may prefer the massive twist to two slimmer shafts at B1 (coverage 1.44% becomes 1.06%); the quick test's blind check catches that before the full build.
- B2 and B3 may tie: the towers are 60-90 px wide there.
- Colliders from old records: the player can fly into the Braid's gap and bump into the old twist volume. This is a known limitation; making colliders match the new parts would change traffic runs and the car stream.
- A braided pair has loose precedents in unbuilt proposals; the test is "not a copy of a real tower", which it meets.
