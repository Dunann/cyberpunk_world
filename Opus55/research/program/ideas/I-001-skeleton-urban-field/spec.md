---
id: I-001
title: Skeleton field: one continuous city grown along the rivers, bridges and rail lines
status: proposed
direction: Break an assumption (city layout and continuity; user priority 3)
family: layout field: urban extent from distance to water and infrastructure, districts as styles
parent: none
proposed_by: idea generator
date: 2026-11-24
---

# I-001: Skeleton field

## Idea
Today a district is an ellipse, and the ellipse decides three things at once: where the ground is flattened, where buildings may stand, and which street grid and style apply. Buildings therefore stop at each ellipse, and everything between the ellipses is forest. A top-down map of the current world (made for this spec, see "Evidence") shows eight separate islands. The gaps are large: 150–300 m between Nan'an Old Town and the Great River, a 1 km empty plain between the confluence and Jiangbei, about 140 m between the CBD and its own river bank, and every bridge except one lands outside any street grid.

Split the three roles of the ellipse:
1. **Flattening** keeps the old ellipse weights, so the ground does not move and the existing districts stay as they are.
2. **Urban extent** becomes a continuous field: the old ellipses, plus a band along both river banks through the core, plus a band along the bridges and the two rail lines (the city's skeleton). The city then follows its water and its infrastructure, as real river cities do.
3. **Grid and style** come from the nearest district, so every infill block inherits a street grid and a building style without a new generator.

Infill blocks are zoned by rule: heights rise away from the water and peak near stations and bridgeheads, and stay well below the old district centres, so the skyline keeps its peaks and gains connecting ridges.

## Why it might work
- **It removes the cause, not the symptom.** The critics' biggest coherence complaint (baseline-findings §3: "islands on flat plinths ... separated by wide bands of forest and an empty central plain", "bridge ends land in forest") and the user's priority 3 ("odd forested strips between the city and the water") both follow from one rule in `_buildLots`: `dom.weight < 0.55 → skip`.
- **Evidence (measured for this spec on the baseline build):**
  - Lots today: 2876 in total (CBD 115, Yuzhong 917, Bund 78, Steppe 87, Jiangbei 253, Nan'an 803, West Hills 623), on about 9.5 km².
  - The bank bands are already buildable. Cross-sections of the flat banks (Nan'an, the central plain, the Bund, the CBD) rise only from 6 m at 10 m inland to 20–28 m at 100 m. No terrain change is needed there.
  - With the field below, the new buildable area is about 3.5 km²: central plain and metro corridor 1.1, south bank 0.8, peninsula edges and the Jade west bank 0.8, CBD river edge 0.5, north 0.2, peninsula neck 0.1.
  - Grid angles of neighbouring districts differ by at most 0.18 rad (Jiangbei 0.10, Bund 0.0, CBD 0.0, Steppe 0.15), and Nan'an's grid (−0.2) is nearly parallel to its river bank (−0.1 to −0.26). Extended grids therefore meet each other and the banks without ugly collisions.
  - Metro Line 6 already crosses the empty central plain, and Monorail Line 2 crosses the gap between the peninsula and West Hills. A band along the rail lines fills exactly the worst gaps.
- **Most consumers follow automatically.** Roads, sidewalks, lamps, street trees, traffic, crowds and the forest bake all read the district id and weight from the info map or from `world.districtAt`. Changing those two sources extends all of them together.

## What's new about it
- **Closest existing code:** `districtW` / `districtAt` (ellipse weights) and `_buildLots`.
- **Closest idea in this program:** none. I-004..006 change buildings and facades, I-007..009 signage and aircraft. I-002 (stepped banks) changes terrain only on steep peninsula banks; I-003 (light parks) turns three named gap sites into parks, and this idea leaves those sites alone when `PARKS` exists.
- **The obvious alternative is to add more ellipses.** That keeps the island shape, cannot hug a curved bank, and needs hand placement for every gap. Here the extent comes from two distance fields that already exist or are trivial to compute (water distance, distance to bridge and rail polylines), so the fabric reaches every bank in the core by construction.

## Expected effect on the metric
- **Targets: G3, B3, G2** (adopt needs wins on 2 of 3).
  - G3: the empty central plain, the forest strip on the south bank and the gap at the CBD edge fill with lit blocks; bridges land among streets.
  - B3: the forest in the lower half of the frame becomes the blocks between the Old Town Bridge, the Bund Suspension bridge and the Bund; the ring of forest around the CBD goes.
  - G2: the forested point across the river and the foreground forest become low waterfront blocks whose lights reflect in the river.
- **Likely gains, not counted as targets:** G1 (the dark band between the Old Town and the river), A3 and G4 (more lit frontage in the background).
- **Critic scores:** coherence on the global poses should rise by about 1 point; zone G mean by about +0.4 to +0.6.
- **No change intended** at A1, A2, A4, A5, A6, B1, B2, B4. See the risk about random streams.

## Quick test
Half a day, before any building work:
1. Implement `urbanField` on the CPU only (step 1) and the second lot pass (step 3). Do not touch shaders yet.
2. Print: number of infill lots per region, and the tallest allowed top near each of the 14 eval camera positions (must be below the camera wherever a camera is over land).
3. Capture G3 and B3 with the current shaders. The infill blocks will stand on forest-floor ground, but the lit building mass already shows whether the plain and the banks read as city.
4. Run `--stats` at G2 and G3. **Stop and reduce the lot cap if** the gbuffer pass rises by more than 0.35 ms or the total by more than 0.45 ms at either pose.

## Implementation plan
All layout data stays in `world.js`.

1. **The field (CPU and GPU, same formula, no noise in the new terms).**
   ```
   w_i(p)  = smoothstep(1.0, 0.72, e_i(p))                       // unchanged ellipse weight
   core(p) = 1 - smoothstep(0.9, 1.05, |(p - (900, -450)) / (2500, 1650)|)
   band(p) = max(1 - smoothstep(200, 300, wd(p)),                // river bands
                 1 - smoothstep(120, 220, sk(p)))                // bridge and rail bands
             * core(p) * (1 - w_garden(p))
   weight(p) = max(max_i w_i, 0.75 * band)
   owner(p)  = argmax_i w_i  if max_i w_i > 0,  else  argmin_i e_i over districts with block > 0
   ```
   - `wd` = signed water distance. `sk` = distance to the skeleton: each `BRIDGES` segment extended 150 m past both ends, and the dense `ROUTES` polylines.
   - `URBAN_FIELD = { core, bands }` holds the numbers above as layout data next to `DISTRICTS`.
   - CPU: `World.districtAt` returns `{ index: owner, weight }` from this field. `districtWeight(i, x, z)` keeps its meaning (audio, sky glow and the garden test use it).
   - GPU: in `GEN_INFO`, add the skeleton segments as a second storage buffer and write `owner` and `weight` to `info.y` and `info.z`. `GEN_HEIGHT` keeps calling the old `districtW` for flattening and `hillW`, so **the heightmap is unchanged**.
2. **Loop bounds.** Four loops assume the ellipse radius: `_buildLots`, `trafficCars.js` (`nI`), `terrainLamps.js` and `vegetation.js` street trees (`ext`, and the `(lx/rx)² + (lz/rz)² > 1.05` test). Add `World.gridExtent(di)` (the ellipse radius plus the reach of the bands, about +700 m) and use it in all four. Their existing validity tests (`districtAt`, `lampValid`) do the real filtering.
3. **Infill lots: a second pass with its own random stream.**
   - Leave the existing loop untouched so every current lot keeps its position, subdivision and seed.
   - After it, run a second loop with `rng(5678)` over cells whose owner is this district and whose ellipse weight is below 0.55 but field weight is at least 0.55.
   - Accept a cell only if its centre and four corners have the same owner (no overlaps where two grids meet), the usual reserve, height and water tests pass (`waterDist ≥ 12`), and `gMax − gMin ≤ 14` m.
   - Subdivide by the owner's type as today. Mark `L.infill = true`.
   - Skip cells inside `PARKS` sites if that list exists (I-003).
   - Cap the total at **700 infill lots**: if more qualify, drop those with the lowest `band` value first.
4. **Zoning (sets `L.maxTop`, which every generator already respects).**
   - Waterfront height plane: `cap = 12 + 0.18 * waterDist`, at most 110 m.
   - Transit peak: multiply by `0.6 + 0.4 * tod`, where `tod = 1 − smoothstep(120, 500, distance to the nearest station or bridge end)`. Station positions come from `transitLayout`.
   - `L.distFromCenter` = 1 for infill, so `genUrban` picks its outskirts mix (more shophouses, shorter towers).
   - Infill in CBD- or Bund-owned land uses `genUrban` massing with the owner's palette, not `genCBD` (whose minimum height is 60 m), within 150 m of the water.
5. **Props and lights.**
   - Raise `propBudget` (high quality) from 130,000 to 160,000. The baseline uses 117,412, so infill would otherwise be cut off unevenly.
   - Give infill lots a prop density of about 0.6 (pass a factor into `shopfront`, `acUnits` and `lotSigns`).
   - Keep `LIGHT_BUDGET` at 1450. The low-priority shop lights are already shuffled and spread, so the lighting cost does not grow.
6. **Ground and forest.** No shader logic change is expected: `groundShade` paints streets where `info.z` passes 0.16–0.42, `bakeNear` removes forest by `info.z`, `roadMask` and `lampValid` use the same values. Check two thresholds by capture and adjust only if needed: the slope cut-off in the `urban` mask on the unflattened infill ground, and the bank fade `smoothstep(6, 14, info.x)`.
7. **Bridgeheads.** For each bridge end, find the nearest grid road of the owner district and reserve a forecourt between the bridge end and that road (no lots, no trees; the ground shader already paves reserved city ground). Add one traffic run from the bridge end to that road so headlights continue off the bridge.
8. **Seams.** Where two owners meet, lots stop one cell short on each side (step 3). Leave the strip as paved ground with street trees from the existing street-tree pass. Do not build a special seam system in this idea.
9. **Checks before hand-off.**
   - Capture all 14 poses. A1, A2, A4, A5, A6, B1, B2 and B4 must look the same as the baseline apart from distant background.
   - No eval camera may be inside or within 10 m of a building. If one is, change the zoning rule globally. Never test pose coordinates in code.

## Cost
- **Effort:** one implementer, 2–3 days. Field and lots about 1 day; loop bounds, bridgeheads and tuning about 1–2 days.
- **GPU (budget: 11 ms average, about 1.3 ms of headroom).** Measured on the baseline at 2560×1440:

  | Pose | Total | gbuffer | lighting | Total without buildings and signs |
  |---|---|---|---|---|
  | G2 | 10.40 | 3.45 | 3.30 | 7.89 (gbuffer 2.46, lighting 1.86) |
  | G3 | 10.47 | 3.30 | 3.56 | 8.61 (gbuffer 2.63, lighting 2.10) |
  | B3 | 9.03 | 2.13 | 3.31 | 8.07 (gbuffer 2.27, lighting 1.94) |

  - **gbuffer:** today's 2876 lots cost 0.7–1.0 ms of gbuffer time in the aerial poses. 700 more lots at lower prop density add about +0.15–0.25 ms there.
  - **bld-cull:** 0.13–0.19 ms today for 134k parts; about +0.03–0.05 ms.
  - **Lighting:** the 1.4 ms that buildings and signs add comes from their point lights and lit pixels. Light budgets are fixed, so this should stay within +0.05 ms. Street lamps beyond the real-light range are analytic and free.
  - **Savings:** forest disappears from about 3.5 km². Tree draws are overdraw-heavy, but this spec could not isolate their cost (disabling the vegetation module also changes when the ground is drawn). The implementer measures it with `ctx.hideA = 1`.
  - **Expected net:** +0.2–0.35 ms at G2/G3/B3, about +0.15–0.25 ms on the fly-through average. The 700-lot cap and the prop density are the two controls.
- **Load time:** the info pass tests about 350 more segments per texel, roughly +0.2 s.

## Risks
- **Random streams.** `_buildLots` draws from one stream, so any change in which cells are accepted in the first loop would re-roll every later lot in the city and change all 14 poses. The second pass with its own stream avoids this. Sign placement and sign lights also use global streams and budgets; infill slots are appended last, but the sign-light budget (2150, by priority) may still move a few lights. Compare A4 and B1 with the baseline closely.
- **Eval cameras hover over infill land.** G2 is 62 m above the south bank, 200 m from the water. The height plane keeps roofs there below about 48 m. It is a real zoning rule, but it is the reason the plane is this low, and the reviewer should know that.
- **Infill on unflattened ground.** Between districts the natural relief stays (10–60 m). Lots on slopes get tall blank podium sides. The `gMax − gMin ≤ 14` test and `terracedPodium` limit this, but steep cells will stay empty and may leave holes of forest floor without trees. A follow-up could plant them.
- **Quality of the fill.** The fill is made of the same buildings the critics call boxy. It fixes continuity, not building character. If I-005 or I-006 is adopted, the fill improves with them.
- **Ragged water edge.** Grid cells meet a curved bank in steps, leaving paved wedges up to half a block deep behind the promenade. This should read as a quay road. If it reads as empty paving, a bank-aligned frontage row is the follow-up.
- **GPU.** If the cost exceeds the estimate, lower the cap to 500 lots and keep only the central plain, the south bank and the CBD edge.
- **Overlap with I-003.** Both ideas want the south bank between the two bridges and the land south of the Bund. The rule is: named park sites win, the field fills the rest. Whichever idea is adopted second must be judged against the other on G2 and B3.
