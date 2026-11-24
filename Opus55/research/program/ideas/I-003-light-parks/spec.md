---
id: I-003
title: Light parks: three riverside gaps become designed, lit parks with distinct cultural characters
status: rejected
score: superseded by I-016 (merged)
direction: Break an assumption (what "green" means inside the city; user priority 3)
family: designed open space: analytic park layout fields, lit planting, park structures
parent: none
proposed_by: idea generator
date: 2026-11-24
---

# I-003: Light parks

## Idea
Inside the city, green space is currently wild forest: trees are scattered by a noise mask on any land that is not a lot. At night a forest is a black hole, so the strips between the districts and the water read as voids, and the user calls them "odd forested strips ... which real cities never have".

Break the assumption that vegetation is nature. In a city, a park is designed and lit. Take the three largest unbuilt pieces of river bank in the core and make each a park whose **layout is an analytic design field** (paths, plazas, lawns, groves) and whose **lighting is the design**: glowing paths, uplit tree groves in a limited palette, lit pavilions and gates. From the air each park reads as a drawing in light; from the ground it is a place to walk through.

The parks also carry the brief's cultural blend, which today exists only as one far-away dome district:

| Site | Where | Character | Signature |
|---|---|---|---|
| South-bank Lantern Park | South bank of the Great River between the Peninsula South Bridge and the Old Town Bridge landings, from the promenade to the first Old Town blocks. About 1.8 km long and 220–420 m deep (0.5 km²). Metro Line 6 crosses it. | Chinese riverside park | Wavy riverside walk, ginkgo avenues uplit gold, paifang gates, pavilions, lantern strings, LED dance plazas |
| Ovoo Hill | The 70 m hill on the east bank at the mouth of the Jade River (summit at about (590, −300)), facing the peninsula tip. About 0.16 km². | Mongolian steppe | Ring paths on the contour lines in cool blue, a summit cairn with flag strings, ger teahouses, a 34 m ring gate on the summit |
| Silk Road Garden | The point of land south of the Bund, between the Old Town Bridge and Bund Suspension landings. About 0.1 km². | Central Asian | A plaza paved in a glowing eight-point star pattern, a tiled arch gate, teahouse platforms with carpets, turquoise and magenta light |

Bridge landings inside a park get an approach avenue to the nearest street grid, so no bridge ends in trees.

## Why it might work
- **The user asked for it in these words:** "Turn them into parks with character, or bring the city to the water, or a mix of both." I-001 is the second option; this is the first. Together they are the mix.
- **The three sites are the gaps the critics named.** A top-down map of the baseline (made for I-001) shows them as the largest unbuilt bank lands in the core: the south-bank strip is the dark foreground of G2 and the bottom band of G3, the Jade-mouth hill is the "forested point" and part of the "empty central plain", and the Bund point is the lower half of B3, where "bridge ends land in forest without roads".
- **Night parks are made of light, and light is cheap here.** Emissive ground patterns and emissive tree tints cost almost nothing in a deferred renderer. Real Chinese riverside parks are lit exactly this way: wrapped trees, glowing paths, lit pavilions.
- **Removing forest saves time.** The scattered forest is drawn with heavy overdraw (the vegetation code says so and orders trees front to back for that reason). A park has far fewer trees, placed by design.
- **The code has a model to copy.** The garden module already publishes fixed trees (`world.shared.gardenTrees`) and reserved rectangles (`gardenReserve`) to the vegetation module, and the ground shader already has a lawn material for the lake gardens (`gardenK`).
- **Composition.** Ovoo Hill faces the Hongyadong cliff across the Jade River: cool blue rings on one side, warm lantern light on the other, both reflected in the confluence. That is what G2 and G3 look at.

## What's new about it
- **Closest existing code:** the lake gardens (`garden.js`, `gardenViews.js`), which are hand-built scenes around fixed viewpoints. These parks are generated from fields of water distance, height and a long-axis coordinate, so they follow any bank shape.
- **Closest idea: I-001** (skeleton field). It fills gaps with blocks; this fills three named gaps with parks. The rule between them: named park sites win, the urban field fills everything else. `PARKS` in `world.js` is the shared list, and each spec works without the other.
- **Not covered elsewhere:** I-002 treats only steep banks of the peninsula; I-004..009 do not touch open land.

## Expected effect on the metric
- **Targets: G2, B3, G3** (adopt needs wins on 2 of 3).
  - G2: the foreground forest becomes the Lantern Park seen from above (glowing walk, gold avenues, a dance plaza near the metro station); the forested point on the right becomes Ovoo Hill with its lit rings and ring gate.
  - B3: the forest filling the lower half of the frame becomes the Silk Road Garden: star plaza, arch gate, and an approach avenue from the suspension bridge to the Bund.
  - G3: the dark band along the south bank and the dark point in the centre both gain structure and light.
- **Likely gains, not targets:** G1 (the band between the Old Town and the river), A3 (Ovoo Hill is behind the camera, so no change there).
- **Critic scores:** coherence and brief-fit on G2, G3 and B3 up by about 1; zone G mean by about +0.3 to +0.5.

## Quick test
Half a day, Lantern Park only:
1. Add the site mask, remove forest inside it (bake and scatter), and add the lawn, path and light-pool code to the ground shader. No trees, no structures yet.
2. Capture G2, one custom aerial camera over a different part of the park, and one ground-level camera on the riverside walk.
3. Run `--stats` at G2. Baseline: total 10.40 ms, gbuffer 3.45 ms.
4. Go on only if the path network is clearly readable from the air, does not shimmer in a 4-frame burst, and the gbuffer time has not gone up.

## Implementation plan
1. **Sites** (`world.js`): `PARKS = [{ id, style, shape, axis }, ...]`.
   - Starting shapes: Lantern Park = land within 320 m of the south bank between x = −500 and x = 1250; Ovoo Hill = a disc of radius 260 m around (590, −300); Silk Road Garden = a disc of radius 250 m around (1700, −120). Each is clipped to land more than 8 m from water and to ground where no gridded district has an ellipse weight above 0.5.
   - `World.parkAt(x, z)` returns the site and mask on the CPU. A WGSL function with the same constants is generated from the list, the way `terrainLand.js` generates the causeways.
   - If lots exist inside a site (after I-001), filter them out after generation.
2. **Design fields** (same formulas on CPU and GPU). Inputs: `c` = water distance, `a` = position along the site's long axis, `h` = ground height.
   - **Lantern Park:** riverside walk where `|c − (34 + 10 sin(a / 46))| < 2.2`; two upper walks at `c ≈ 110 + 12 sin(a / 60 + 2)` and `c ≈ 200 + 14 sin(a / 75)`; cross walks every 120 m of `a`; round plazas (radius 14 m) where cross walks meet the riverside walk.
   - **Ovoo Hill:** ring paths on the contour lines every 12 m of height (constant 2.2 m width, using the slope from the normal); one straight stair path up the side facing the confluence; a summit plaza.
   - **Silk Road Garden:** a central plaza (radius 45 m) with an eight-point star tiling; four straight avenues from it to the two bridge landings, the promenade and the Bund.
   - **Approach avenues:** for each bridge end inside a site, a straight 16 m road from the bridge end to the nearest grid road of the neighbouring district. Add one terrain-following traffic run on it in `trafficCars.js`.
3. **Ground** (`groundShade` in `terrainShade.js`, new `parkShade` branch placed before the city branch; `bakeNear` in `terrainGen.js`).
   - Bake: forest = 0 inside sites; base colour = lawn.
   - Lawn: reuse the lake-garden lawn material.
   - Paths: stone slabs with a thin emissive edge line in the site's colour. Lines are widened to at least one pixel at distance with brightness scaled down (as the bridge cables do), so they do not shimmer.
   - Light pools: warm pools every 9 m along paths, computed as (distance to path) × (pulse along `a` or along the contour angle). Analytic, no point lights.
   - Plazas: Lantern Park plazas have a grid of LED floor tiles with slow colour waves (also driven by `F.show` during the light show); the star plaza draws its tiling as lit lines.
   - Avenues: asphalt, centre line, lamp pools (reuse `lampFake`).
4. **Trees** (CPU list, published through `world.shared.gardenTrees`; sites stamped into the vegetation exclusion mask like `gardenReserve`).
   - Avenues: both sides of main walks every 9 m. Groves: clusters chosen by low-frequency noise, kept off paths and plazas. About 3000–3500 trees in total, using the four existing species.
   - **Uplighting:** add a glow index to fixed trees (pack it into the fractional part of the species value; use `floor` where the shaders compare species). In `shadeTree`, crowns with a glow index add an emissive tint that is stronger at the bottom of the crown. Palette per site: gold and jade (Lantern Park), cool blue and white (Ovoo Hill), turquoise and magenta (Silk Road Garden). One colour per grove, not per tree.
5. **Structures** (new `src/buildings_parks.js`, called from `generate()` in `buildings.js` after the landmarks; all from existing part types).
   - Lantern Park: a paifang gate at the city end of every second cross walk; a pavilion with an upturned roof (`prof: 4`) on each plaza; lantern strings on poles along the riverside walk near plazas (the market code has the catenary pattern).
   - Ovoo Hill: a stone cairn with flag strings on the summit; four ger teahouses (`gerHut` exists); the ring gate: 40 emissive box segments forming a 34 m vertical ring, facing the confluence.
   - Silk Road Garden: an arch gate with tile (`MAT.TILE`) toward the Bund; six teahouse platforms with carpets (`MAT.CARPET`); two slim towers from the existing `minaret` helper.
   - Sign slots (`B.slot`) on gates and kiosks so the signs module labels them.
   - Skip anything within the existing reserves (bridges, rail lines, cableway).
   - Budget: at most 1500 parts and 40 point lights, taken from the buildings light budget at high priority.
6. **Checks before hand-off.**
   - Capture all 14 poses; A1–A6, B1, B2, B4 and G4 must match the baseline.
   - 4-frame bursts over each park from a moving camera: no shimmer on path lines.
   - No structure taller than 15 m except the ring gate. No test of pose coordinates anywhere.

## Cost
- **Effort:** one implementer, about 3 days: fields, bake and ground shader 1; trees and uplighting 0.5; structures 1; avenues and tuning 0.5.
- **GPU (budget 11 ms average, about 1.3 ms headroom).** Baseline: G2 10.40 ms (gbuffer 3.45), G3 10.47 (3.30), B3 9.03 (2.13).
  - **Trees:** the random forest is removed from about 0.75 km² and replaced by about 3500 fixed trees. Expected saving in gbuffer where a park fills the view; the implementer measures it with `ctx.hideA = 1` before and after.
  - **Ground shader:** the park branch is about 30–40 arithmetic operations and no new texture reads, on park pixels only, and those pixels skip the forest branch. About neutral.
  - **Structures:** up to 1500 parts (+1%). Under 0.02 ms.
  - **Lights:** 40 static point lights of 15–25 m radius. About +0.02 ms where several are on screen.
  - **Expected:** between −0.1 and +0.05 ms at G2, G3 and B3; about zero on the fly-through average.
- **Memory:** negligible.

## Risks
- **Dark lawns may still read as empty.** A park seen from 600 m is mostly lawn. The light pools, edge lines and uplit groves must be bright enough to register (emissive around 2–6, like neon tubes), without turning the park into a billboard. This is the main art-direction risk and the reason for the quick test.
- **Uplit trees can look garish.** One colour per grove, low saturation at distance, and most trees left unlit.
- **The low-poly trees stay low-poly.** The critics dislike the blob trees. Parks put fewer of them in view and light them deliberately, but do not fix the meshes.
- **Slopes.** The south bank rises about 20 m over the first 100 m, and 10% of the Lantern Park site is steeper than 30%. Lawns and paths follow the slope, which is fine, but plazas on a slope look wrong. Place plazas only where the slope is under 6%, and move them along the walk otherwise.
- **No people.** The crowd module places people on district sidewalks only, so the parks are empty at close range. A follow-up could add walkers on the path fields.
- **The sites match what three eval cameras see.** They were chosen from the map as the largest gaps, and the code contains no camera positions, but a reviewer should confirm that the layout rules are general (they are driven by water distance, height and bridge landings).
- **Overlap with I-001.** Both want the south bank between the bridges and the land south of the Bund. Whichever is adopted second is judged against the other on G2 and B3, and the judge may prefer blocks to parks or the reverse. Ovoo Hill overlaps less: about 30% of it is too steep for lots, and I-001 would build only on its gentler flanks.
