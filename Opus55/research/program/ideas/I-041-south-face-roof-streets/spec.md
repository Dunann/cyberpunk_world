---
id: I-041
title: South Face with roof streets - the hill city steps down to the Great River as stacked houses whose roofs are the streets above (revision of I-029)
status: proposed (review queued until running builds report; budget pacing)
direction: The hard layout problem - hill city and riverbanks; revision of I-029 after two reviews
family: section-driven hillside infill - houses and roof streets on the unchanged heightmap, laid out by one scalar field
parent: I-029
proposed_by: idea generator
date: 2026-11-24
---

# I-041: South Face with roof streets

## Idea
I-029's finding stands, and both reviewers reproduced it: Yuzhong already has real relief (81 m at the tip, 147 m under the A4 street, 100-145 m of rise within 100-180 m of the water on the south-west bank), but the strip between the Great River and the first row of lots is empty. I-029 failed on one rule: a house needed 7 m of free ground in front of a separate deck for the lane above, so on slopes steeper than 1.13 it built retaining walls and no houses.

This revision changes that rule and fixes every other finding:
1. **Roof streets.** On steep ground a house fills the whole strip between two lanes. Its front door is on the lower lane, its back is in the hill, and **its roof is the upper lane**. The next row stands on that roof line. This is how Chongqing's hillside blocks work, and it is I-015's principle (each level's roof is the next level's gallery) at the grain of four floors. No retaining wall is left exposed: a lit facade stands where I-029 had a wall.
2. **The same lane field** lays it out, now with a 3 m margin: `L(p) = max((h(p) + 3 - 5.8) / 14.4, (d(p) - 7) / 22)`. Lanes are the integer level sets. Contour lanes are 14.4 m apart (four floors), so a roof-street house between two contour lanes is exactly four floors high.
3. **Boundaries are explicit.** The face stops 320 m from the Raffles site (that land is I-037's), keeps 10.5 m from the centre line of every street that traffic and crowds use, and 3 m from every lot. Both ends step down.
4. **Nothing about the terrain changes**, not even the drawn terrain. There is no terrain sink.

The face now runs 1,420 m, from (74, 226) west to (-1309, 510), on 9.0 ha, with about 190 houses.

## How each review finding is answered
| Finding | Answer in this spec | Measured |
|---|---|---|
| Units fit on 11-19% of cliff strips; the rest are 6-10 m walls (both reviewers) | Roof-street houses where the strip is 5-12.7 m wide; two-level houses with a gallery where it is under 5 m (plan step 3) | Units on 87% of cliff strips (x -600..74; target 85%) and 99% of the G4 hill (x below -1000). Exposed walls over 5 m with no unit in front: 0 |
| Shares inflated by the 22 m envelope; G2 and G3 under 2% | Shares recomputed by part class with real roof heights and only the units that fit | Table below. Target by the 2% rule: G4 only |
| The tip overlaps I-037 | No face part within 320 m of (220, -60). Hand-off line in plan step 1 | Nearest face station to the Hongyadong complex: 278 m. A3: 0.2% of the frame, A1: 0 |
| 17 traffic and crowd segments cross the face; colliders would cut the runs | Corridors of 10.5 m around every street that passes `buildRuns`' terrain tests are cut out of the face; runs, cars and crowds are in the identity check from the quick test on | 17 segments, 598 m, confirmed. Nearest unit to a street centre line: 10 m |
| Road paint appears when the forest value is zeroed | The face mask also sets `urban` to 0 in `groundShade`; the kept street corridors are baked as city ground so their paint is complete | - |
| The terrain sink makes walls and units float and opens trenches | No sink. Roofs and decks stand 3 m above the true ground; bases reach 6 m below it | Coarse terrain above a roof: 0% of covered points at 4 m and 8 m vertex spacing, 0.05% at 16 m |
| Deck heights from a smoothed maximum can fall below the ground | Roof streets sit at fixed lane levels. Lanes on gentle ground are the ground itself (baked paving), with no deck | - |
| Ends are cut off; cableway and bridge slots | Rows step down two per 16 m at both ends. The face continues under the cableway (ropes clear the roofs by 18 m or more). Under the bridge: a paved square with return walls | 64 of 64 unit rows under the ropes kept |
| Bench path crosses the top of the face at the tip | The tip is no longer in the face. General caps: nothing more than two floors above its station's crest, no corner towers | Nearest approach of the path to the face: 214 m; no path sample above it |
| Straight stairs at 55-67 degrees | Switchback stair bays between houses where the slope is over 0.75 | - |
| Props through `B.prop` are all dropped at quality 1 | Own counter and cap, added with `P.add` as the complex does | - |
| Light rows shift; sign light budget | A new `face` module, last in the module list, reserves every face light after all existing lights and after the signs module has computed its budget | - |
| Decks cannot be tested against parts that do not exist yet | Decks, stairs and lamps are built in the `face` module, after all solid parts; the audit covers them | - |
| "Arcade row at 4.5-7 m" contradicts "6 m from every lot" | One rule: 3 m from every lot footprint, no exception | - |
| Hongyadong seam | The face no longer touches the complex; I-037 owns that joint | 278 m apart |
| Moored boats, park trees, tower text | Boats are static face parts on `rng(2930)`; the face is stamped into the tree mask after `plan.parkTrees`; `groupTowers` reads only the parts that existed before the face | - |
| About 190 units, not 300; effort optimistic | 192 units by the new count; effort 6-7 days | - |
| The quick test misses the failing ground | A cliff slice (x -300..-100) and a stop rule on exposed walls | - |

## Why it might work
All numbers come from the CPU port of the height function that both reviewers re-ran (`measure/` here and in I-029; float64, 3 m texels like the real map). No GPU job was run.

**1. Houses now fit where the judges look.** One strip is one station (4 m of bank) times one row. Strips inside street or bridge corridors are streets by design and are listed apart.

| x band | Strips | With a house | In a street or bridge corridor |
|---|---|---|---|
| -1400..-1200 (G4 hill, left) | 176 | 100% | 0 |
| -1200..-1000 (G4 hill) | 321 | 99% | 7 |
| -1000..-800 (shelf) | 197 | 100% | 72 |
| -800..-600 (shelf, bridge) | 76 | 93% | 79 |
| -600..-400 (cliff) | 120 | 93% | 16 |
| -400..-200 (cliff) | 134 | 90% | 17 |
| -200..0 (cliff) | 162 | 87% | 4 |
| 0..74 (cliff, next to I-037) | 36 | 53% | 0 |
| **All** | **1,222** | **94%** | 195 |

- By type: 345 roof-street strips, 130 houses with a back lane, 504 free-standing blocks on gentle ground, 175 top-row houses. The two-level type was never needed (no strip is narrower than 5 m).
- The 68 strips without a house are all last strips with less than 5 m of free depth, mostly where existing lots stand right behind the promenade. Nothing is built there and no wall is exposed: the existing podium fronts the promenade as today.
- Under I-029's rule the same count was 60% overall and 11-19% on the cliff.

**2. Frame share by part class** (real roof heights, only houses that fit, alleys left open, terrain and lots as occluders, one ray per 8 px):

| Pose | Houses and roof streets | Stair bays, yards, paving | Bare face ground | Face parts total | Nearest |
|---|---|---|---|---|---|
| G4 | 9.7% | 0.4% | 0.0% | **10.1%** | 392 m |
| G3 | 1.1% | 0.2% | 0.0% | 1.3% | 1,326 m |
| G2 | 1.0% | 0.0% | 0.0% | 1.0% | 1,054 m |
| A6 | 0.4% | 0.25% | 0.0% | 0.6% | 457 m |
| G1 | 0.4% | 0.1% | 0.0% | 0.5% | 2,137 m |
| A3 | 0.2% | 0.0% | 0.0% | 0.2% | 602 m |
| A1, A2, A4, A5, B1-B4 | 0 | 0 | 0 | 0 | not in frame |

G4's share rose from the reviewers' 6.4-7.7% to 10.1% because the hill is now a full stack of houses. G2 and G3 fell because the tip went to I-037.

**3. Coarse terrain against the face.** The terrain mesh has vertices 4 m apart at G4's distance, 8 m at G2's and 16 m at the far part of G3 and at G1.

| Vertex spacing | Coarse ground minus true ground: lowest / 1% / 99% / highest | Covered points where coarse ground is above the roof (3 m margin) | With no margin |
|---|---|---|---|
| 4 m | -0.8 / -0.3 / +0.3 / +0.8 m | 0.00% | 0.6% |
| 8 m | -1.9 / -1.1 / +1.0 / +1.8 m | 0.00% | 0.5% |
| 16 m | -5.7 / -3.5 / +2.9 / +5.4 m | 0.05% (at most 1.8 m, about 1 px at that distance) | 1.0% |

So a 3 m margin above the ground and a 6 m footing below it keep roofs above, and bases inside, the drawn ground at every distance, with no change to the terrain.

**4. The rest still holds from I-029:** the method is I-015's (stations, sections, levels from the real crest), which won 4/4; the appended-only plumbing is I-016's; at night a hill reads as stacked lines of light, and the face adds up to eight lit roof streets at real elevations from 6 to 120 m.

## What's new about it
- **Against I-029:** the unit rule (roof streets), the boundary with I-037, the street corridors, no terrain sink, tapered ends, a late `face` module for lights and decks, and honest shares. The lane field, the finding and the identity method are kept.
- **Against I-015:** the same section method and the same roof-as-gallery principle, at a four-floor grain, as an ordinary neighbourhood in concrete, tile and brick, 1.4 km long, 278 m away from the complex.
- **Against I-002:** no height changes and no bare tiers: every step of the hill is a house front.
- **Against I-037:** it takes the bare tip within 320 m of the Raffles site; this takes the bank outside it. The promenade is shared and unchanged.

## Expected effect on the metric
**Target by rule** (the same rule as I-029): a pose is a target if face parts cover at least 2% of its frame in a mask render of the candidate, recorded before judging. Forecast: **G4 only** (10.1%). G3 (1.3%) and G2 (1.0%) are below the rule and count as "no clear loss" poses.

**Second condition, declared now** (so the idea is not adopted on one pose alone): six held-out cameras placed by rule (quick test, H1-H6) are judged blind by both judges; each judge must prefer the candidate on at least 4 of 6.

| Pose | What changes | Forecast | Loss risk |
|---|---|---|---|
| G4 | The bump-texture hillside becomes eight rows of four-floor houses with lit roof streets, stair bays and the hill escalator under the cable car; the centre bank becomes a waterfront quarter with its real streets; the dark strip above the promenade is gone | Clear win | Low to medium: it rests on facade variety at 400-700 m |
| G3 | The dark band under the west and middle of the peninsula becomes stepped lit rows (1.3%) | Slight win or tie | Low |
| G2 | Lit rows on the cliff from x = -50 westward (1.0%); the tip itself is I-037's | Slight win or tie | Low |
| A6, G1 | Thin strips (0.5-0.6%) | Tie | Low |
| A3 | 0.2% at the far left, 600 m away | Tie | Very low |
| A1, A2, A4, A5, B1-B4 | Nothing in frame; no stream, pool or light row they use changes | Identical within capture noise | Confirm by pixel diff |

**Critics:** removes "bump-texture hillside, city sits on top of slope with no step-down" (G4, both critics' change 2) and adds the stacked streets of user priority 7 in one view. Expect +1 to +1.5 on G4's coherence and detail; zone G mean about +0.3. It does not fix the tip (I-037), the flat banks of other districts or the facade system.

## Quick test
One and a half days, before any dressing. Layout (step 1), plain house boxes with roof slabs (step 3), stair bays as plain ramps, on three slices: the G4 hill (x -1300..-1100), the cliff (x -300..-100) and the shelf with two kept streets (x -900..-700).
1. **Identity, printed and compared with main:** lots; `buildingStats` up to the first face part; `signStats`; hamlet hash; fixed-tree prefix; **`buildRuns` output (count and end points), the car buffer and the crowd agent buffer**; `ctx.lights.count` at the start of the signs module; every light row that exists on main.
2. **Held-out cameras by rule, never eval poses:**
   - H1: south-bank promenade opposite the face's steepest station, eye height;
   - H2: 900 m south of the face's midpoint, 250 m up, looking north (terrain at 8 m spacing);
   - H3: on the water 150 m off the midpoint of the cliff slice, 12 m up, looking at the cliff;
   - H4: on the Peninsula South Bridge deck at mid-span, 2 m above the deck, looking north-west along the face;
   - H5: on the cableway line at 30% of the span from the north station, at rope height, looking down the hill;
   - H6: on the third roof street of the G4 hill, eye height, looking east along the lane.
3. **Stop rules:**
   - more than 30% of the cliff slice's lane length shows a wall over 5 m with no house in front: stop and change the unit rule;
   - terrain visible above a roof or a base visible above the ground at H2: raise the margin or the footing depth, re-check, stop if it remains;
   - a blind check of H1-H3 against main must prefer the candidate on at least 2 of 3;
   - one alternating bench pair must stay under +0.15 ms with the three slices.
4. Fix lane spacing (14.4 m, 22 m), margin, house depths and lamp levels on H1-H6 only, before any capture of an eval pose.

## Implementation plan
New files: `face.js` (layout, CPU), `buildings_face.js` (houses), `faceModule.js` (decks, stairs, lamps, lights; last module). Edits: `world.js` (one call), `buildings.js`, `buildings_text.js`, `terrainGen.js` and `terrainShade.js` (mask), `vegetation.js`, `gardenViews.js`, `signPlace.js`, `signs.js`, `main.js` (module list).

1. **Layout: `world.face = buildFace(world)`** in `World.generate()` after `buildPlan`. Own stream `rng(2929)`.
   - **Stations:** the 10 m water-distance line of the Great River's north bank, 4 m apart.
   - **Tip boundary (hand-off with I-037):** land within 320 m of the Raffles site centre belongs to I-037's Confluence Steps; land outside belongs to the face. No face part stands inside the circle. The promenade is shared and unchanged. On the CPU port the face starts at (74, 226).
   - **City line:** the first point along the inland normal within 3 m of a lot footprint or inside a landmark's reserved disk. One rule, no exception.
   - **Extent:** stations continue west while a city line exists within 350 m (three failures end it). Result: x = -1309.
   - **Depth:** `min(city line, crest + 8 m)` with I-015's crest rule.
   - **Street corridors:** every Yuzhong grid segment that passes `buildRuns`' terrain and district tests (block weight at least 0.3, slope at most 0.4, ground above 2 m, 6 m from water), ignoring colliders, so it is a superset of the real runs. Corridor half width 10.5 m (road 5.5 + sidewalk 3 + 2 clear; walkers stay within 7.8 m). Bridge corridors: 19 m from the axis.
   - **Region R** = station strips from 7 m to the depth, minus the tip circle, corridors and plan land. Rasterized at 3 m as `face.mask` (1 = face, 0.5 = street corridor inside the face's extent), with `face.blocks(x, z, r)`.
   - **Lane field:** `L = max((h + 3 - 5.8) / 14.4, (d - 7) / 22)`; lanes are its integer level sets in R; lane k from the height term is at level `5.8 + 14.4 k`; a lane from the distance term is at ground level. Lane 0 is the existing promenade.
   - **Ends:** at a station `e` metres from either end of the face, rows above `2 + 2 * floor(e / 16)` are not built.
2. **What stays as it is.** Heightmap, drawn terrain, info map, cover map, `PLAN_BOX`, `world.lots`, every street run, cars `rng(31337)`, crowds `rng(8080)`, routes, the Hongyadong complex (278 m away), I-016's parks and infill, signs `9137` and `9138`, the shop-light shuffle, skybridges, walkways. Hamlets and bank stairways inside R (hamlets within 40 m) are not emitted but draw the same numbers, with their reserves kept in `suppressedReserve` (the I-016 pattern; `riverbankLife` draws nothing).
3. **Houses** (`buildings_face.js`, called at the end of `generate()` after `genInfill`; parts appended; `B.faceFirst` = index of the first face part). For the strip between lane k (front, at `w_k`) and lane k+1:

   | Strip | House | Roof |
   |---|---|---|
   | Upper lane from the height term, strip 12.7 m or wider | Depth 7-12 m, with a 4.2 m deck for the upper lane behind it and a footbridge to it | Upper lane + 1 to 3 floors |
   | Upper lane from the height term, strip 5-12.7 m | **Roof street:** depth = the whole strip, 1 to 4 floors | Exactly the upper lane's level: the roof is the lane (paving slab, parapet, lamps) |
   | Strip under 5 m | Two levels: depth = two strips; the middle lane crosses the front as a 2.2 m gallery on brackets | The lane two levels up |
   | Upper lane from the distance term (gentle ground) | Free-standing block, depth up to 12 m, 4-7 floors, paved yard behind | Own height |
   | Top row | Depth up to 12 m, 3-5 floors | Capped (below) |

   - **Caps:** no roof more than two floors above its station's crest; no towers; every roof at least 14 m below the lowest cableway rope (measured least clearance: 18 m, so the face runs under the cableway without a gap; the station tower's own collider is an obstacle).
   - **Footprint and footing:** except for roof streets, a footprint ends where the ground comes within 3 m of its roof. Every base and wall foot reaches 6 m below the lowest true ground under it.
   - **Clearance:** every house is tested against existing solid parts and the corridors with I-015's box test and narrowed, shortened or dropped. It keeps 10.5 m from street centre lines and 3 m from lots.
   - **Along a lane:** houses 14-26 m long; a 4 m stair bay after every 2-4 houses.
   - **Kit, by rule, neighbours never alike:** slab fronts (`MAT.RES`, `MAT.TILE` with `FLAG.BALC`), shophouse fronts (`MAT.BRICK`, `MAT.PLASTER`) with a shop base and one sign slot per bay on the lane, three palettes, roof clutter only on roofs that are not streets. If I-023 (facade systems) is adopted first, houses take its per-building system.
   - **Props** use the face's own counter and cap (600 / 2,000 / 4,500 by quality) and are added with `P.add`, never `B.prop`.
   - **Tower text:** `groupTowers` loops to `B.faceFirst`, so face houses are neither candidates nor blockers.
   - Lights and sign slots go to `B.face.lights` and `world.faceSignSlots`; nothing is added to the light list here.
4. **Ground.**
   - Bake (`terrainGen.js`, one new texture in `bakeLayout`): where the mask is 1 the base is stone paving and the forest value is 0 (lanes and yards on gentle ground are this paving, with no deck); where it is 0.5 the base is city ground with forest 0.
   - Draw (`terrainShade.js`, one new texture in the terrain group, sampled only inside the face's bounding box): `urban *= 1 - step(0.75, mask)`. Road paint is then off inside the face and complete on the kept streets.
   - Vegetation: R and the corridors are stamped into the exclusion mask after the street-tree filter and after `plan.parkTrees(masked)`, where `stampLots` is today.
5. **`face` module, last in the module list** (after `audio`).
   - Builds one mesh with the `terrainBank.js` extruder: roof-street parapets, the 4.2 m decks behind back-lane houses, galleries, stair bays, the under-bridge square's return walls, end returns. Built after all colliders exist and tested against them.
   - **Stairs:** where the local slope is over 0.75, a switchback of two flights along the lane inside the 4 m bay (about 36 degrees); elsewhere straight steps down the fall line. A stair within 60 m of every lane point.
   - **Hill escalator:** one covered glass gallery with a light strip on the stair line nearest the cableway station, from the promenade to the crest walk (original design).
   - **Lamps** every 14 m on roof-street parapets and at-grade lanes: instanced globes, analytic pools at distance.
   - **Lights, all reserved here, after every existing light:** a pool of the 96 nearest lamps, up to 32 static lights from `B.face.lights`, up to 48 sign lights chosen in the signs module's third pass (`placeSigns(..., { seed: 9139 })` on `world.faceSignSlots`) but added here. The signs module therefore computes its budget from the same light count as on main.
   - Colliders for roofs, decks and parapets, none within 10.5 m of a street centre line.
6. **Water landings (can be cut).** At the foot of every second stair line outside corridors: the parapet is opened at those stations (wall, deck, lamps and colliders unchanged), 14 m-wide steps to the water, an 18 x 5 m pontoon, two or three moored boats. All are static face parts on `rng(2930)`; `boats.js` and its `rng(4242)` are not touched.
7. **Checks before hand-off.**
   - Identity as in the quick test, on the full build, plus pixel diff on A1, A2, A4, A5, B1-B4 within capture noise.
   - Audit over houses, decks, stairs and lamps against every solid part: zero overlaps, zero unsupported pieces, zero bases above the ground, zero roofs below it, zero colliders inside a corridor or the tip circle.
   - The unit-fit table of this spec re-measured on the real build; exposed walls over 5 m reported per 200 m.
   - Walk test on a roof street, a stair bay and the escalator; `functional.mjs` 18/18.
   - Mask render for the target rule; `ctx.lights.count` at the start of the signs module on main and candidate.

## Cost
- **Effort:** one implementer, 6-7 days: layout, corridors and identity plumbing 1.5; houses and clearance 2; face module (mesh, stairs, lamps, lights) 1.5; ground and tuning 1; landings 0.5 if kept.
- **GPU (gate: average 11 ms, p99 16.7, worst 25; current about 9.8 ms, p99 11.7).** Estimate **+0.10 to +0.20 ms average**; hard cap +0.25 ms average, three alternating bench pairs. Report the G-buffer and lighting passes separately on the fly-through legs that see the face (from (600, 160, 1300) to (260, 70, 120), and from (200, 220, 800) to (-900, 160, 1500)).
  - **Source:** I-015 measured +0.06 / +0.12 ms for a 480 m, 12-level stack with 6,500 props and its own lights; I-016 measured +0.19 to +0.21 ms for 151 lots plus two parks. The face has about 190 houses (about 600 solid parts with roof slabs, at most 4,500 props), about 330 instanced lamps, one stair and parapet mesh of about 30,000 triangles, and 176 lights at most, of which 96 are nearest-only.
  - Both reviewers judged this estimate and cap plausible for the larger I-029 face.
- **Load time:** under 0.2 s (355 sections of 720 samples, one 3 m raster, street tests).

## Risks
- **One target.** Adoption rests on G4 and the held-out set. G3 and G2 gain about 1% of lit rows each, which may not be noticed.
- **More of the same windows.** About 190 houses in the current facade materials are close to G4's camera. The stepping, roof streets, stair bays and escalator carry the composition, but both critics rank facades first. This idea is stronger after I-023.
- **A uniform staircase.** Four-floor steps repeated eight times can look mechanical. Mitigation: the lane field already mixes roof streets, back-lane houses and free-standing blocks by slope (345 / 130 / 504 strips), stair bays break every row, and roof heights vary by 1-3 floors where there is no street on the roof.
- **Ragged cliff.** Between x = -500 and the boundary, existing lots stand 8-50 m from the wall in a sawtooth, so stacks of two or three rows alternate with single promenade houses and a few empty spots (13% of cliff strips). The dark podium sides above them remain.
- **Tower text behind houses.** Text selection ignores the new houses by design, so a character could sit behind a roof. Houses are capped two floors above the crest and text sits higher on the shafts; check the phrase towers on the south bank by eye.
- **In-app viewpoints.** "Cableway over river" and "Under the bridge" look at the face; cabins pass at least 11 m above the roofs. Both must be captured.
- **Boundary with I-037.** If I-037 is not adopted, the bank from x = 74 to the complex stays as it is today. Moving the boundary is one constant.
- **Shared headroom.** This idea may use up to a fifth of the remaining 1.2 ms.
