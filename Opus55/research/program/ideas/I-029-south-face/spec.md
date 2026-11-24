---
id: I-029
title: South Face - the hill city steps down to the Great River on the relief that is already there (lane-field terraces, stair streets, landings)
status: rejected
score: 5.67 (review-1 5.67, review-2 5.67; mean; below 7; revision requested as I-041: units spanning levels / roofs as upper lanes)
direction: The hard layout problem - hill city and riverbanks
family: section-driven hillside infill - terraces and buildings on the unchanged heightmap, laid out by one scalar field
parent: I-015 (method), I-016 (plumbing), I-002 (problem)
proposed_by: idea generator
date: 2026-11-24
---

# I-029: South Face

## Idea
**The finding.** Yuzhong already has real relief. The ground is 81 m at the tip, 93 m in the middle, 147 m under the A4 street, and the south-west bank rises 100-145 m within 100-180 m of the water. That is the scale of the real Yuzhong peninsula (roughly 80-220 m above the river). The critics still see "flat trays with vertical dark sides" and a city that "sits on top of the slope with no step-down" because the only place where the hill's section is exposed, the 1.76 km strip between the Great River and the first row of lots, has nothing on it: no lots (the district ellipse stops short), no lights, only bare cliff, forest texture and the dark sides of podiums. So the answer is not to change the terrain under the city. It is to **build the exposed face**.

**What to build.** A new generator fills that strip, from the south end of the Hongyadong complex around the tip and 1.7 km west along the Great River, with a stepped town standing on the existing ground:
1. **One scalar field lays it out.** `L(p) = max((h(p) - 5.8) / 14.4, (d(p) - 7) / 22)`, where `h` is the terrain height and `d` the water distance. The integer level sets of `L` are **lanes**. On steep ground the first term rules, so lanes are contour lines 14.4 m (four floors) apart. On gentle ground the second term rules, so lanes run parallel to the bank 22 m apart. The switch is continuous, and the curves wrap the tip without special cases.
2. **Each lane is a deck on a retaining wall** (fill only, never a cut), with a parapet and lamps. **Between two lanes stands one row of buildings**: front door on the lower lane, back buried in the hill, roof one to five floors above the upper lane and joined to it by short footbridges. This is how Chongqing's hillside housing works (enter from the street below and again from the street above).
3. **Stair streets** run down the fall line from every Yuzhong grid street that reaches the top of the face, plus one covered hill escalator and one lift tower. At the water, every second stair street ends in steps into the river with a pontoon and moored boats.

No height value, lot, street, route or existing random stream changes. Everything is appended, as I-015 and I-016 did.

## Why it might work
All numbers below come from a CPU port of the height function (`measure/hcpu.mjs`, float64). No GPU job was run. The port reproduces the lot count of six of the seven districts exactly (2,880 lots against 2,876; Yuzhong 917 of 917) and the bank sections measured for I-002 within 1-3 m. The implementer must confirm them with `tools/probe.mjs`.

**1. The relief exists; the face is empty.** Sections along the inland normal (height in m at distance from the water):

| Bank station (x, z) | 20 m | 40 m | 60 m | 100 m | 140 m | First lot at | Face depth by rule | Top of face |
|---|---|---|---|---|---|---|---|---|
| -1294, 507 (G4 left hillside) | 9 | 24 | 45 | 99 | 124 | 338 m | 127 m | 119 m |
| -1198, 494 | 9 | 20 | 37 | 84 | 109 | 290 m | 140 m | 109 m |
| -1103, 481 | 8 | 18 | 33 | 60 | 67 | 242 m | 124 m | 65 m |
| -913, 457 (shelf) | 6 | 10 | 16 | 35 | 42 | 150 m | 125 m | 39 m |
| -818, 444 (shelf) | 6 | 11 | 20 | 30 | 37 | 104 m | 80 m | 26 m |
| -315, 348 (cliff) | 27 | 43 | 46 | 51 | 56 | 56 m | 55 m | 45 m |
| -40, 263 (cliff) | 35 | 55 | 58 | 63 | 67 | 44 m | 44 m | 59 m |
| 266, 169 (tip, south side) | 13 | 38 | 69 | 84 | 88 | landmark disk at 54 m | 54 m | 59 m |

- West of x = -900 the bank is outside the Yuzhong ellipse (the ellipse is turned 0.32 rad, so its west half swings north). The first lots stand 150-340 m back from the water, on top of a 45-50 degree slope.
- From x = -500 to the tip the ellipse reaches the water, but the hillside carve (`soft = 28 m` in `carveWater`) makes a 40-60 m cliff, and the lot edge is ragged (8 to 138 m from the water). The "inverted teeth" in G3 are podium sides on that cliff.
- In G3 this strip is the dark band, 80-150 px tall, under the whole peninsula. In G4 it is the "bump-texture hillside". In G2 it is the row of dark panels left of the Hongyadong stack.

**2. The face by rule** (simulated on the CPU port, `measure/face.mjs`, `measure/lanes.mjs`): 439 stations, 1,756 m of bank, from (322, 103) to (-1317, 511); area 10.2 ha. By section class: 1,032 m steep (mean slope over the face at least 0.45), 476 m gentle, 248 m with less than 12 m free in front of existing lots. The lane field gives 8 levels and 4.2 km of lanes (2.2 km of them contour lanes), about 300 building units.

**3. Frame shares.** Share of each eval frame covered by the face's envelope (ground footprint raised 22 m; terrain and existing lots as occluders; one ray per 10 px):

| Pose | Share | Nearest | Where in the frame |
|---|---|---|---|
| G4 | 9.5% | 392 m | x 5-2015, y 485-995 (the whole left and centre hillside) |
| A3 | 2.8% | 306 m | x 265-885, y 825-1145 (south side of the tip) |
| G2 | 2.2% | 860 m | x 5-1065, y 525-695 (the dark panels left of the stack) |
| G3 | 2.2% | 1,323 m | x 5-1285, y 805-1145 (the band under the peninsula) |
| A6 | 1.4% | 356 m | bottom strip, y 1285-1435 |
| A1 | 1.1% | 359 m | left edge, x 5-345 |
| G1 | 0.9% | 2,136 m | x 5-875, y 715-835 |
| A2, A4, A5, B1-B4 | 0 | none | not in frame |

**4. The method is proven here.** I-015 walked 4 m stations along the Jade bank, read a section at each (`buildStations`), set levels from the real crest and solved clearances against existing parts. It won 4/4 targets with both judges, kept every other part identical and cost +0.06 to +0.12 ms. I-016 showed how to append lots, signs, lights and trees without moving a stream. This idea reuses both, for a plainer and much longer structure.

**5. At night a hill reads as stacked lines of light.** A flat city has all its street lamps in one plane. A hill city shows them at stepped heights, with stairs as diagonals. The face adds up to eight lamp-lit lanes above the promenade line, at real elevations from 6 to 120 m.

**Why not raise the terrain under the lots** (the obvious reading of "real relief under Yuzhong"):
- The relief is already at real scale (table above); towers of 60-250 m hide it from the air whatever its height.
- Lot ground feeds three shared streams. The I-002 reviewer measured it: 42 lots with new ground changed the sign-slot count (58,627 to 58,739), the wanted lights (1,934 to 1,935) and the skybridges (320 to 312), which re-rolls every sign, the shop-light shuffle and the skybridges city-wide.
- A5, A6, A3 and G4 use absolute camera heights. Ground changes near the monorail or the cableway break their framing.

## What's new about it
- **Closest idea: I-002** (stepped banks, rejected at 5.0). It cut terraces into the heightmap on the Great River side of the district. Its review found: little of the frame changed (it covered only the cliff, not the west slope that fills G4), city-wide re-rolls from changed lot ground, a cut into the Hongyadong cliff, and terrain at coarse LOD cutting through walls. This idea changes no height, covers the whole face up to the city line (10 ha, including the west slope), builds houses and not only walls, and is fill-only.
- **Against I-015:** same station-and-section method, different object: an ordinary neighbourhood in concrete, tile and brick, 3.6 times as long, laid out by a field and not as one stack. It never enters a landmark's reserved disk and starts with a stair street 12 m from the complex's last piece.
- **Against I-016 and I-001:** those filled flat gaps with grid blocks and parks and left the peninsula out on purpose. Their slope limit (14 m per lot) rejects exactly this land.
- **Against I-031 (in review):** its "Confluence Steps" terrace the bare ground inside the Raffles disk (the A3 wedge). The face stops at that disk, so the two meet at the disk edge and do not overlap. Whichever merges second treats the other's parts as obstacles.
- **New in this program:** the lane field (one formula for contour terraces on slopes and bank-parallel streets on flats), and using existing relief instead of making new relief.

## Expected effect on the metric
**Targets by rule:** a pose is a target if face parts cover at least 2% of its frame. The implementer measures this on the candidate with a mask render (a dev flag like `?hydmask` that paints face parts) and records the list before any judging. Forecast from the envelope table: **G4, A3, G2, G3**. Adoption as in EVAL.md: at least 2/3 of the targets won (3 of 4) and no clear loss elsewhere.

| Pose | What changes | Forecast | Loss risk |
|---|---|---|---|
| G4 | The left hillside becomes eight stepped rows of lit housing with stair streets and the hill escalator; the centre bank becomes a waterfront quarter under the towers; landings at the water | Clear win | Low to medium: depends on facade variety |
| G2 | The dark panels left of the stack become lit rows down to the promenade; a landing at the tip | Win | Medium (small share) |
| G3 | The dark band under the peninsula becomes stepped lit lanes and roofs | Win or tie | Medium (2% of the frame at 1.3-2.5 km) |
| A3 | Left third: rows on the south side of the tip and steps into the water. The wedge inside the Raffles disk stays (I-031) | Slight win or tie | Medium |
| A6, A1, G1 | Thin strips (0.9-1.4%) | Tie or slight win | Low |
| A2, A4, A5, B1-B4 | Nothing in frame; no stream or pool they use changes | Identical within capture noise | Must be confirmed by pixel diff |

**Critics:** removes "bump-texture hillside, city sits on top of slope with no step-down" (G4) and most of "districts as flat slabs" for the peninsula (G3, G2). Expect about +1 on G4 coherence and detail, +0.5 on G2 and G3 coherence; zone G mean about +0.3 to +0.5. It does not fix the flat banks of the other districts or the facade system.

## Quick test
One day, before any dressing. Build `buildFace` (plan step 1), the decks (step 3) and plain boxes for units with the default `MAT.RES` facade (no props, no signs), on two slices only: the 220 m of bank west of the cableway and the 200 m around the tip.
1. **Identity:** print and compare with main: lots (count, seeds, gMin, gMax), `buildingStats` up to the face's first part, `signStats`, the hamlet hash, the fixed-tree prefix. All equal.
2. **Held-out cameras, placed by rule, never eval poses:**
   - H1: on the bisector of the two rivers, 400 m out from the tip, 20 m up (tests the corner and the row ends);
   - H2: 900 m south of the face's midpoint, 250 m up, looking north (tests terrain against decks at LOD 2-3);
   - H3: on the south-bank promenade opposite the face's steepest station, eye height (a G4-like view from another place).
3. **Stop rules:**
   - any terrain visible through a deck or wall at H2: add the vertex sink (step 4) and re-check; stop if it remains;
   - a blind pairwise check of H1-H3 against main must prefer the candidate on at least 2 of 3;
   - `bench.mjs` (one alternating pair) must stay under +0.15 ms with the two slices.
4. Fix the lane spacing (14.4 m, 22 m), unit depths and lamp levels on H1-H3 only, before any capture of an eval pose.

## Implementation plan
New files: `face.js` (layout, CPU only), `buildings_face.js` (parts). Edits: `world.js` (one call), `buildings.js`, `terrainBank.js` (extruder reuse), `terrainGen.js` (one bake binding), `vegetation.js`, `gardenViews.js`, `signPlace.js`.

1. **Layout: `world.face = buildFace(world)`**, called in `World.generate()` after `buildPlan`. Pure CPU, own stream `rng(2929)`.
   - **Stations.** Start at the last station of the Hongyadong walk (`stiltsSite` plus the same `walkBank` rule give it without building the complex). Walk the 10 m water-distance line in 4 m steps around the tip and west along the Great River.
   - **City line** of a station: the first point along the inland normal that is within 6 m of a lot footprint, inside a landmark's reserved disk (`L.r`), or inside a bridge, cableway or route corridor (`_isReserved` margins plus 8 m).
   - **Extent.** Keep walking while a city line exists within 350 m (five blocks); stop after three failures in a row. Result on the CPU port: the face ends at x = -1317. The result is the same for any limit from 340 to 400 m, because the next stations have no lot within 400 m.
   - **Depth** of a station: `min(city line, crest + 8 m)`, with I-015's crest rule (first point past 25 m where the height is above 25 m and rises less than 0.75 m in 5 m).
   - **Region R:** the union of the station strips from 7 m (the back of the promenade) to the depth, minus plan land (`plan.blocks`) and the corridors. Rasterized at 3 m: `face.mask`, and `face.blocks(x, z, r)` like `plan.blocks`.
   - **Lane field** on the same 3 m grid: `L = max((h - 5.8) / DY, (d - 7) / DW)`, `DY = 14.4`, `DW = 22`. Lanes are the level sets `L = 1, 2, ...` inside R (marching squares, resampled to 4 m, two smoothing passes, pieces under 24 m dropped). Lane 0 is the existing promenade.
   - **Stair lines:** steepest-ascent lines of `L` from the promenade to the top lane, one from every Yuzhong grid road centreline that reaches the city line, then more until no lane point is farther than 60 m from a stair.
2. **How everything else adapts (nothing existing moves).**

   | Existing thing | What happens |
   |---|---|
   | Heightmap, info map, cover map, `PLAN_BOX` | Not edited |
   | `world.lots`, `_buildLots`, `rng(1234)` | Not edited; the face keeps 6 m from every lot |
   | Streets, traffic `rng(31337)`, crowds `rng(8080)` | Not edited; lanes are pedestrian decks with no cars and no crowd placements |
   | Monorail, metro, cableway, bridges | `_resolveRoutes` sees the same heights; their corridors are kept clear |
   | Hongyadong (I-015) | Built before the face; the face begins with a stair street 12 m from its last piece and stays out of the Raffles disk; `hyd-identity` must show every complex part identical |
   | Parks and infill (I-016) | Other banks; plan land is excluded from R |
   | Hamlets and bank stairways (`hillsideLife`, `riverbankLife`) | Those inside R (hamlets: within 40 m) are not emitted but draw the same random numbers, and their reserve rectangles go to `suppressedReserve`: the exact I-016 pattern, so `rng(7070)` and the street-tree filter stay as they are |
   | Fixed trees `rng(4242)`, forest | R (+4 m) is stamped into the exclusion mask after the street-tree filter, as `stampLots` does for infill lots |
   | Signs `rng(9137)`, `9138` | Face slots go to `world.faceSignSlots`; a third pass `placeSigns(..., { seed: 9139 })` |
   | Shop-light shuffle `rng(4242)`, budget 1450 | Face lights are a separate list and pool, added after the existing selection |
   | Skybridges `rng(5150)`, walkways `rng(5151)`, tower text | The face is generated after them and after `genInfill`; its parts are appended, so existing part indices keep their values. `selectTowerText` must return the same glyphs (check by hash; if not, limit it to the pre-face part count) |
3. **Decks and walls** (reuse the profile extruder of `terrainBank.js`, as a second mesh with the same pipeline).
   - Lane deck: inner edge on the level set, 4.2 m wide where the height term rules and 6 m where the distance term rules. Deck height `Y` = the highest terrain under the deck's footprint at that station plus 0.15 m, smoothed over 5 stations (so the deck is never below the ground).
   - Outer side: parapet (0.95 m), then a wall face down to 3 m below the lowest terrain under the outer edge. Inner side: a kerb wall where `Y` is above the ground.
   - Wall material: extend `BANK_WGSL` with two faces: coursed sandstone with buttress pilasters every 9 m, and lit vault bays (dark reveal, warm back wall, sign band) where the wall is taller than 5 m and no unit stands in front.
   - Lamps every 14 m on the parapet: instanced globes, a reserved pool of the nearest 96 real lights, analytic pools beyond the real-light range (the existing `Embankments` scheme with the deck height per lamp).
   - A lane that ends at the edge of R closes with a short return wall and meets a stair line, so no deck ends in the air.
   - Colliders for decks and parapets, as the promenade has.
4. **Ground under the face.**
   - Bake: bind `face.mask` as a texture in `bakeNear` (one new entry in `bakeLayout`); inside the mask the base is weathered rock and rubble masonry and the forest value is 0. No other shader changes.
   - **Contingency for LOD:** if the quick test shows terrain through decks at distance, bind the mask in the terrain vertex shader and lower the drawn height by 6 m inside it. `world.heightAt` is unchanged, so colliders and all generators are unaffected.
5. **Units** (`buildings_face.js`, called at the end of `generate()` after `genInfill`).
   - One row per strip between lane k and lane k+1 (row 0 fronts the existing promenade). A unit's front is on lane k's inner edge, its length 14-26 m along the chord, its depth `clamp(strip width - upper lane width - 1.5, 7, 12)`. Where less than 7 m is free: no unit, the vault wall of step 3 shows.
   - Base at the lowest terrain under the footprint minus 4 m (buried). Ground floor at lane k. Top = lane k+1 plus 1 to 5 floors of 3.6 m, capped at lane k+2 plus one floor, and at three floors above the top lane on the last row (the towers behind stay visible).
   - A footbridge (1.5-6 m) from lane k+1 to the unit at that level, where the top allows.
   - Every unit is checked against existing solid parts with I-015's box test (`overlapDepth`) and narrowed, shortened or dropped. Alleys of 2-4 m between groups of 2-4 units; a unit keeps 1 m from stair lines.
   - **Kit, chosen by rule (depth and position), neighbours never alike:**
     - slab block (depth 9.5 m or more): `MAT.RES` or `MAT.TILE` with `FLAG.BALC`, flat roof with tanks and sheds, enclosed-balcony bands in three palettes;
     - shophouse row (7-9.5 m): `MAT.BRICK` or `MAT.PLASTER`, 2-4 floors, canopies, one sign slot per bay;
     - corner tower at a stair head (at most one per 120 m of lane): 10-14 floors, narrow;
     - on the promenade where only 4.5-7 m is free in front of an existing podium: a two-storey arcade row 3.4 m deep.
   - Props (AC units, laundry, rails, roof clutter, awnings) use the face's own counter and cap by quality: 800 / 3,000 / 6,000. Sign slots at lane level only.
6. **Stairs and vertical links.**
   - Stair streets 3.2 m wide: flights with a landing at every lane, built as extruded ramps with the stair-tread material (`MAT.MASONRY`, `winW 1`), lit handrail lines.
   - Hill escalator: on the stair line with the largest rise, a covered glass gallery 3 m wide with a continuous light strip (original design).
   - Lift tower with bridges at each lane on the stair line with the second largest rise (reuse I-015's lift piece with the face's materials).
   - A crest walk with a belvedere parapet along the top of R where a crest exists; it meets the cableway station plaza.
7. **Water landings (can be cut).** At the foot of every second stair street outside bridge corridors: the promenade parapet is opened (parapet faces skipped at those stations; wall, deck, lamps and colliders unchanged), 14 m-wide steps go down to the water on the river side of the wall, with an 18 x 5 m pontoon, two or three moored boats with canopies and lanterns, and two lantern masts. At the tip station where the normal bisects the two rivers the steps are 24 m wide.
8. **Checks before hand-off.**
   - Identity tool (extend `tools/hyd-identity.mjs`): all main parts, signs, lights, skybridges, hamlets, fixed trees, cars and crowds identical; pixel diff on A2, A4, A5, B1-B4 within capture noise.
   - Dev audit as in I-015: zero overlaps between face parts and existing parts, zero unsupported units, zero lane pieces without a stair within 60 m.
   - Walk test: promenade, up a stair street, along a lane, over a footbridge. `functional.mjs` 18/18.
   - The mask render for the target rule, recorded before judging.

## Cost
- **Effort:** one implementer, 4-5 days: layout and identity plumbing 1, decks and ground 1, units and stairs 1.5-2, landings and tuning 0.5-1.
- **GPU (gate: average 11 ms, p99 16.7, worst 25; current about 9.8 ms average, 11.7 p99).** Estimate: **+0.10 to +0.20 ms average**, +0.2 to +0.4 ms at p99. Hard cap for this idea: +0.25 ms average, measured as three alternating bench pairs on a quiet GPU.
  - **Source of the estimate:** I-015 measured +0.06 / +0.12 ms for a 480 m, 12-level stack with a 6,500-prop cap and its own lights. I-016 measured +0.19 to +0.21 ms for 151 infill lots plus two parks. The face has about 300 units (about 600 solid parts, at most 6,000 props), 4.2 km of deck (one mesh, about 45,000 triangles), 300 instanced lamps and 96 pooled lights. That is about 1.5 to 2 times I-015.
  - **Where the time goes:** G-buffer (more parts in view at G4-like views and on the fly-through legs from (420, 80, 650) to (260, 70, 120), which pass the tip); lighting (96 pooled lights, nearest only). The pixels replace terrain pixels, which use the most expensive ground shader, so the fill cost is roughly neutral.
  - Culling: +900 parts and props lists on about 150,000, under +0.01 ms.
- **Load time:** 439 sections of 360 samples and one 3 m raster of 10 ha; under 0.1 s.

## Risks
- **Targets with small shares.** G2 and G3 show the face at 2% of the frame. If judges tie there, 3 of 4 is not reached even with a clear G4 win. The coordinator may prefer to judge the first build on G4 plus the held-out cameras.
- **It can look like more of the same boxes.** The units use the current facade materials, which both critics rank as the first problem. Mitigation: the composition (stepping, lanes, stairs, bridges) carries the image at G4 distance; the kit is low-rise balcony, tile and brick fronts with shop bases, not tower shafts; any adopted facade idea improves it for free.
- **Thin cliff stretches stay half-solved.** On 248 m of the cliff the existing lots leave under 12 m, so only the arcade row and the lanes' walls fit. The dark podium sides above them remain.
- **Terrain at coarse LOD.** Fill-only decks, buried bases and walls 3 m below ground cover the usual cases, as in I-015. The vertex sink is the stated fallback.
- **The A3 wedge is not in this idea.** It lies inside the Raffles reserved disk (I-031). If I-031 is not adopted, extend the face into landmark disks up to 12 m from landmark parts in a follow-up.
- **Fly-through path.** The bench camera passes over the tip at 70-90 m, close to the highest rows there. It may pass through a unit; watch p99 and worst frame at that leg. No code may be keyed to the path.
- **In-app viewpoints.** "Cableway over river" and "Under the bridge" look at the face. The corridors keep both clear, but both must be captured and checked by eye.
- **Shared headroom.** With I-030 (about +0.03 ms) the two ideas use about a quarter of the remaining 1.2 ms.
