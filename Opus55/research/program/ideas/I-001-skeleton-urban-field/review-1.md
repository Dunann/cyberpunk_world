## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 6 | Splitting the ellipse into flattening, urban extent and grid/style, and growing the extent from water and infrastructure distance, is a known procedural-city technique. It is new to this program and aimed at the cause rather than the symptom. |
| Feasibility and credibility | 5 | The diagnosis is right: the baseline G3 and B3 images show exactly the forest plain and forest ring described, and the code paths named are real. But the plan as written has several concrete faults. The "untouched" first lot loop is not untouched. Owners are assigned across rivers. District ids are interpolated at the new seams. The height cap is absolute, so the waterfront stays nearly empty. Ground paint follows the field, not the lots. The lighting cost is understated. |
| Expected impact | 7 | If the seams and empty paving are controlled, wins on G3 and B3 are plausible, because dark forest fills a large part of both frames. The idea answers user priority 3 and the critics' coherence complaint directly. But the spec does not forecast changes at A1, A3, A6 and G4, and it re-rolls traffic, crowds, street trees and shop lights on every pose. That puts the "no clear loss elsewhere" rule at risk. |
| **Overall (average)** | **6.0** | |

### Strongest reason it will fail
**The new area turns into paved, empty city ground instead of lit blocks.** Ground paint, roads, lamps and forest removal all follow the field weight. Buildings only appear where an infill lot is accepted. Several rules in the spec reject most of those lots:

- **The field covers more than the cap allows.** By my CPU reconstruction of the spec's own formula (20 m grid, no heightmap), the field adds about 3.8 km² of lot-eligible land and about 4.1 km² where `info.z ≥ 0.35`. Over that area:
  - `terrainGen.js` `bakeNear` removes the forest (`city = smoothstep(0.08, 0.35, info.z)`; hillside owners keep 40%);
  - the ground is paved;
  - `roadMask` draws roads;
  - `lampValid` (`info.z > 0.55`) places lamps.

  At today's density (about 300 lots per km²), 3.5–3.8 km² needs about 1,000+ lots, but the cap is 700. The rule for which cells to drop ("lowest `band` first") gives no real order, because `band` = 1 almost everywhere inside 200 m of the water. The dropped cells keep their roads and paving but get no buildings.
- **Slopes reject more lots.** The spec says the banks rise 14–22 m over the first 90 m. Today's subdivision applies: CBD lots are up to 99 m deep and Bund lots 73 m. Lots that size fail `gMax − gMin ≤ 14` on that grade, so the CBD and Bund river edges (the B3 "ring of forest") may stay mostly unbuilt.
- **The height plane is absolute.** `L.maxTop` is an absolute Y value in the code (`buildings_landmarks.js:34`, `buildings_gen.js:749`, `:778`). At `waterDist` = 100 m, `12 + 0.18 × 100` = 30 m, on ground that is already 20–28 m high. Multiplied by `0.6 + 0.4 × tod`, the cap is at or below the ground. The generators then fall back to their minimum heights: a 6 m podium in `genUrban`, 12 m in `genHillside`. So the first 100–150 m of every bank, where the spec promises "low waterfront blocks whose lights reflect in the river", gets one- or two-storey boxes at best.

The critics already list "a huge empty flat plaza" as a defect. At G2, where this paving is in the foreground, a judge could easily prefer the forest.

### Other concerns
- **The existing lot loop is not left untouched.** Step 1 makes `World.districtAt` return the field: owner plus `max(w_i, 0.75 × band)`. Step 3 says to leave the first loop of `_buildLots` untouched. But that loop calls `this.districtAt` and skips cells only when `dom.weight < 0.55`. With the new function it accepts every band cell inside its existing `nI` square and draws from `rng(1234)` for each of them, so every later lot in the city is re-rolled. That is exactly the risk the spec says it avoids. The first loop, and every other existing consumer, needs an ellipse-only lookup.
- **The owner rule assigns land across rivers.** `argmin e_i` uses a normalized ellipse distance, so the large Yuzhong ellipse wins far from its centre. In my reconstruction Yuzhong (hillside type, grid angle 0.32) owns:
  - the whole east bank of the Jade mouth;
  - the central plain from about x = 520 to x = 1300, z = −250 to +50;
  - strips of the south bank near the Peninsula South Bridge and the cableway.

  So the "empty central plain" in G3 and the "forested point" in G2 would fill with Yuzhong-style blocks on Yuzhong's grid, across the river from Yuzhong and right next to Jiangbei. The spec's evidence that neighbouring grid angles differ by at most 0.18 rad leaves out this owner. The Yuzhong–Bund seam differs by 0.32 rad and the Yuzhong–Jiangbei seam by 0.22 rad. Hillside owners also keep 40% of the forest between blocks.
- **District ids are interpolated at the new seams.** `worldInfo` samples the info texture with a linear sampler (`renderer.js:329`, `common.js:164`), and shaders round `info.y` to a district id. Today seams mostly fall where the weight is low, so this is hidden. With the field, seams run through weight-0.75 land everywhere: Yuzhong(1)/Nan'an(5), Yuzhong(1)/Jiangbei(4), Jiangbei(4)/Bund(2). At each one, the interpolated id passes through other district ids, so thin strips of the wrong grid, lamps and road markings will appear along every seam. Step 6 ("no shader logic change is expected") does not hold. The owner needs nearest-texel sampling (`textureLoad`) or its own texture.
- **More random streams are re-rolled than the spec lists.** Besides lots and signs:
  - **Street trees.** `vegetation.js` `_streetTrees` draws one `rng(99)` value per avenue line, and step 2 changes the line count (`ext`). The fixed-tree stream `rng(4242)` also follows list order. Which CBD and Bund avenues have trees therefore changes, which is visible at street level in B2 and B1.
  - **Traffic.** `trafficCars.js` builds runs district by district, and one `rng(31337)` stream places every car. Longer CBD runs (district 0) re-roll all cars in the city.
  - **Crowds.** `crowd.js` places people from the same run list with `rng(8080)`, so the crowds at A4 (the critics' favourite pose) and B1 are re-rolled.
  - **Shop lights.** `buildings.js` shuffles the low-priority shop lights with `rng(4242)` and keeps 1450. Adding infill lights changes the array length, so the whole shuffle is re-rolled and existing districts lose a share of their shop lights.

  None of these is necessarily a loss, but every non-target pose will differ. The step-9 check ("must look the same") cannot pass, and the pairwise judge (22/22 ties on identical images) gets random differences to choose between.
- **Poses that change but are not forecast.** The spec says A1 and A6 should not change. My frustum check, without occlusion, finds:
  - **A1:** the right side of the frame, the forested Jade bank north of the stilt complex, becomes Yuzhong infill. That bank is inside the spec's own "Jade west bank 0.8 km²". The stilts site has `r: 0`, so nothing stops infill lots from standing directly behind the north end of the complex.
  - **A3:** the right-hand east bank becomes hillside infill in the middle distance, not only "background".
  - **G4:** the forested left slope loses 60% of its trees (hillside owner) and may get lamps on a steep slope.
  - **A6:** the upper-right background changes.

  Under the adoption rule each of these needs a forecast, or the band should exclude it.
- **The GPU estimate is too low, though the gate probably still passes.**
  - **Lighting.** "Stays within +0.05 ms because budgets are fixed" ignores where the lights end up. `terrainLamps.js` gives real point lights to the 520 lamps nearest the camera. At G2 these move from distant districts into the new foreground blocks, where each light covers many more tiles. The same applies to infill shop and sign lights.
  - **gbuffer.** The estimate scales with lot count. At G2 the cost follows screen coverage: about half the frame changes from tree pixels to near facade pixels. G2 already spends 2.5 ms on buildings and signs (10.40 against 7.89).
  - **My estimate:** +0.3–0.7 ms at G2 and +0.2–0.45 ms on the fly-through average. The fly-through passes 70–80 m above the south-bank infill (`dev.js` keyframes [420, 80, 650] and [260, 70, 120]) and over the central plain. This is within the 1.36 ms headroom on its own, but it uses a third or more of it, and the spec's own stop rule (+0.45 ms total at G2) may trigger. The quick test uses `--stats` at two poses, not `bench.mjs`, which is the actual gate.
- **The height plane is chosen for an eval camera.** The spec says openly that G2 "is the reason the plane is this low". That is not keyed to pose coordinates, so it is not a violation. But it is a global constant tuned to one fixed camera, and it works against the brief: Chongqing's Nan'an bank and Lujiazui put their tallest towers at the water. It also feeds the critics' complaint that "the city looks flat". Step 9 ("if a camera is within 10 m of a building, change the zoning rule globally") is also tuning by feedback from the eval cameras. A zoning rule should come from a stated principle, with clearance checked on the fly-through path and the app viewpoints.
- **The height caps are not hard caps.** The minimum heights (6 m in `genUrban`, 12 m in `genHillside`) override `maxTop`. The quick test's "tallest allowed top" therefore underestimates real roof heights. The `tod` multiplier also scales an absolute height, which includes the ground elevation.
- **CPU load time.** `districtAt` now tests about 350 skeleton segments for every call. Lots, traffic (`blockOk` plus 5 samples per segment), crowds and the extended loops call it many thousands of times. Cache the field on a CPU grid.

### What would make it stronger
- **Make the ground follow the buildings.** Raise `info.z` above the paving and forest thresholds only where infill lots were actually accepted, for example with a lot-coverage mask written after `_buildLots`. Alternatively, plant rejected cells as street-tree or park cells (this fits I-003). Remove the 700 cap, or make the drop order meaningful (by region or by distance to water), and report how many cells it drops.
- **Define the height rule as height above ground,** and base it on a stated principle. Consider the opposite rule, with a frontage row at the water that is taller than the blocks behind it. If G2 needs clearance, say so and use the existing sightline mechanism in `prepareLots`. Use subdivided lots (about 30–40 m) for infill in CBD- and Bund-owned land, so 20% banks pass the 14 m test.
- **Isolate every random stream, not only the lots.**
  - Keep an ellipse-only `districtAt` for the first lot loop and for all existing consumers.
  - Append infill traffic runs, crowd placements and street-tree lines after the existing ones, on separate streams.
  - Give infill shop lights their own pool and budget.
  - Check A4, B1 and B2 with a pixel difference against the baseline, not by eye.
- **Fix the owner rule:** the nearest district on the same side of the water (a land flood fill, or reject owners whose centre lies across a river segment). Restate the grid-angle evidence using the owners that result.
- **Fix the seams:** read the owner with `textureLoad` (nearest texel) or from a separate integer texture, and add a seam flag so roads and lamps stop cleanly.
- **Forecast A1, A3, A6 and G4,** or exclude the Jade west bank around the stilt complex from the band with a general rule (for example, no infill within N m of a landmark site, including `stilts`).
- **Re-cost the lighting** with the street-lamp real-light relocation and the infill shop and sign lights included. In the quick test, run `bench.mjs` as well as `--stats`.
- **Make the quick test decisive:**
  - Print accepted and rejected cells per owner and per reason (slope, cap, seam, water).
  - Render a top-down map with lots over the paved field.
  - Run the blind pairwise judge on the quick-test captures of G3, B3 and G2 before the 2–3 days of full work.
