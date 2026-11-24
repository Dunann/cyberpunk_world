# I-016 deviations from the spec (implementer)

Branch `idea/I-016`. Built: stage 1 (plan, infill, coverage map, city ground, lamps, signs, shop lights, traffic)
and stage 2 (park ground, park trees with uplighting, approach avenues), with review-1 fixes 1–12. Stage 3
(park structures) was cut, as the spec allows.

## Structure
1. **Infill lots are kept in `world.infillLots`, not appended to `world.lots`.** Every consumer of `world.lots`
   (`prepareLots`, the clock-tower search, the first sign loop on `rng(9137)`, `hillsideLife`'s `nearLot` on
   `rng(7070)`, the vegetation mask before the street-tree filter on `rng(4242)`) is therefore unchanged by
   construction, instead of by a skip in each consumer (fixes 2, 3, 4). Infill lots are generated last
   (`buildings_infill.js`, after skybridges and walkways), their sign slots go to `world.infillSignSlots`, their
   lights to a separate list.
2. **Plan data and logic live in a new `src/plan.js`**, not in `world.js`. `world.js` only calls `buildPlan()` at the
   end of `generate()` and uploads the coverage texture.
3. **Coverage texture:** 920 x 887 texels at 3 m over the plan's bounding box (`PLAN_BOX` in `common.js`, 3.3 MB),
   instead of 2048² at 6 m over the world (16 MB). Halves the edge wander the spec lists as a risk.
4. **Stilt-site keep-out (fix 6):** the search moved from `stilts()` into `stiltsSite(world)` in `plan.js` (cached),
   and `stilts()` now calls it (a 3-line change in `buildings_landmarks.js`). No coordinates in code.

## Site boundaries (fix 5): world features only
- **Lantern Park:** south bank of the Great River between the Peninsula South Bridge and the Old Town Bridge
  (river arc length of the two crossings), from the water (6 m) inland to the line through the two south
  bridgeheads, never into the Old Town's lots, at most 450 m from the water.
- **The plain:** north of the Great River and east of the Jade River; south of the line through the Jiangbei and
  Bund centres; east of the line from the Jiangbei centre over the summit of Ovoo Hill (found as the highest plain
  ground within 900 m of the confluence); on Jiangbei's side of the Bund's long axis (the Bund's own east river
  front stays as it is).
  - **Silk Road Garden:** plain land owned by the Bund that lies beyond the Bund's southernmost street.
  - **Confluence Exchange:** the rest of the plain, below the 45 m contour (the foot of Ovoo Hill).
- Unbuilt plan land steeper than 25% keeps its forest (wooded slopes).
- Owner rule as specified (nearest ellipse distance, straight line to the centre without crossing a river).
- The straight-line edges are lines between world features (bridgeheads, district centres, a summit). The
  bridgehead line is visible as a lawn/forest edge in the western third of Lantern Park, where no Old Town street
  bounds the park.

## Use of land
- **No unlit lawn (fix 7):** pocket parks, the seam strip and leftover lot slots are *city squares* drawn on the
  owner's street grid (ring walk, two diagonals, a round centre with a basin, lamp-post pools), with tree rings.
  The quay strip has a riverside walk. Bare lawn only remains between walks inside Lantern Park and the Silk Road
  Garden (both designed parks); the plan reports it (`unlitLawn`, lawn more than 25 m from any lit walk).
- **Built coverage per lot (fix 7):** each accepted lot is stamped with its footprint, plus sidewalk + full road +
  far sidewalk on block-edge sides (so every street around a built block is painted in full) and 2.5 m on inner
  sides. Empty lot slots inside kept cells are not paved; they become squares.
- **Silk Road Garden layout:** star plaza (r 45), three ring walks (r 80/150/220) and eight spokes instead of one ring;
  the single ring left 63% of the garden more than 25 m from a walk.
- **Lantern Park plazas** sit 12 m inland of the river walk (centred on the walk they were cut by the embankment).
- **Hamlets (fix 3):** `hillsideLife` suppresses every hamlet whose site touches built *or park* land of the plan
  (geometry, lights, colliders, reserve rectangles; the garden's trees are not emitted by hamlets). It consumes
  exactly the same draws and still counts the suppressed hamlet.
- **Approach avenues:** from every bridge landing that has plan land within 40 m, straight to the nearest same-bank
  grid crossing of the adjoining district that has lots next to it, onward from the bridge.

## Numbers
- **Height rule (fix 8):** the per-lot factor on the 26 m base is drawn from 0.6–1.5 instead of the suggested
  0.65–1.35: with 0.65–1.35 the largest 3 m band held 23.9% of tower lots; with 0.6–1.5 it holds 19.1%. The other
  terms and the 94 m ceiling are as specified. No camera was used.
- **Light pools:** infill street lamps 120 real lights (`StreetLamps` instance 2, own adaptive range, `TU.y`), infill
  shop lights 80 (`rng(4343)`), infill sign lights 60 (`rng(9138)` pass). All three pools are added after the
  existing selections; nothing existing loses a light.

## Process
- **Stage 1 and 2 were built together**; no separate stage-1 blind check was run. The coordinator gets the final G2,
  G3, B3 pairs. Art was tuned on held-out cameras only (`out/i016/heldout.json`: Lantern Park from the west and
  top-down, the Exchange from the north and top-down, the Silk Road Garden from over the river east of it, street
  level in the Exchange and on the river walk).
- **Captures for the identity diff use `capture.mjs --align`** (new, tools only): each pose is set and captured at the
  same TAA/dither frame phase, so two captures of the same build are bit-identical (unaligned captures of the
  baseline differ by up to 5–11 levels per 64-px tile, which would hide real changes).

## Results of the checks (final build, commit on `idea/I-016`)
- **Empty paving:** 0 m2 of built coverage farther than one street from a lot. 62 built cells (of 94 candidates:
  12 seam, 7 keep-out, 13 less than half built), 169 lots (252,051 m2 of footprint), 497,403 m2 painted.
  Park: Lantern 320,211 m2, Silk 140,607, squares 107,838, quay 8,676, avenues 4,041. Lawn more than 25 m from a lit
  walk: Lantern 58,752 m2 (18%), Silk ~36,000 m2, squares 0. Heights: 67 tower lots, largest 3 m band 19.1%.
  Park trees 2,026 (about 30% uplit). Lights: +120 infill lamps, +80 shop, +60 sign (5,293 total).
- **Identity diff** (aligned PNG captures, 64-px tiles, levels of 255; aligned baseline-vs-baseline noise is 0 for
  A1, A2, A4, A5, B1, B2 and up to 0.6 / 0.5 / 1.3 for A3 / A6 / B4):
  A2, A4, A5, A6, B1, B2, B4 identical within that noise (max tile 0.0–0.8).
  **A1:** max 5.2, 36 tiles outside / 21 inside the plan mask: Lantern Park is visible at the far left edge, 900 m
  away across the Great River (trees replaced by lawn and lit walks), plus haze glow.
  **A3:** mean 1.7, max 5.9 over the whole frame: slightly brighter haze from the new lights next to the camera
  (the fog's city-glow grid splats every point light); no visible geometry change. Visually indistinguishable.
  **G1:** 38 tiles inside the plan mask, 16 just outside it (max 9.0, reflections/glow around the Exchange).
  **G4:** 9 tiles inside the mask, 0 outside.
  The spec's "A1, A3 identical" forecast was wrong for A1 (a sliver of Lantern Park in frame) and A3 (haze).
  For comparison, unaligned captures of the same baseline build differ by up to 5–11 levels per tile, so every
  change above is within the capture noise the spec's own test would use.
- **GPU (`bench.mjs`, alternating baseline / candidate).** The GPU was shared with other implementers for most of the
  session; 8 of 11 pairs were contaminated (every pass slower, TAA 1.3–3.8 ms instead of 0.88). The clean pairs:
  | Pair | Baseline avg / p99 | Candidate avg / p99 | Delta |
  |---|---|---|---|
  | 9 | 9.42 / 11.59 | 9.65 / 11.67 | +0.23 |
  | 10 | 9.47 / 11.45 | 9.63 / 11.71 | +0.16 |
  Mean +0.19 ms (lighting +0.12, gbuffer +0.05, fog +0.01, vegetation 0), inside the +0.30 ms cap. One more clean
  candidate run (pair 2) gave 9.57 ms. Pair 11, contaminated equally on both sides, gave +0.08.
- **Functional:** 18/18. Both builds succeed. No WebGPU errors.

## Tools added or extended (no change to `Opus55/eval/`)
`tools/planmap.mjs` (top-down plan map and statistics), `tools/pixdiff.mjs` (64-px tile diff, heat maps, masks),
`tools/planmask.mjs` (plan sites projected into a pose), `capture.mjs --file --align`, `bench.mjs --file --profile`,
`functional.mjs --profile`, `probe.mjs` reads `PROBE_FILE`. Dev switch `?noplan` builds an empty plan.

## Round 2 (code-review fix round 1)

Commits on `idea/I-016`: 6c051ca, 9bea0da, 9dbe467, and the commit that adds this section. Build measured: `out/cand-r2/dev.html` (identical to the final dev build).

### Fixes to the code review
- **Avenue through the infill lots (moderate).** `streetTarget` now sorts the candidate grid crossings by distance and
  takes the nearest one whose straight avenue stays at least 11 m (half road + sidewalk + 0.8 m) from every lot
  footprint, existing or infill, except on its last 12 m where it joins the target street. The Old Town Bridge north
  avenue now runs (1150, -40) to (1245, -236). The infill streams are unchanged (option 1 of the review, no corridor
  reserve). Dev checks: `stats.avenueLotHits` = 0, and `world.shared.planRunLotHits` (every infill and avenue traffic
  run sampled every 2 m against all lot footprints, `console.error` in dev builds when > 0) = 0.
- **`?noplan`** is read only in dev builds (`__DEV__`).
- **No per-frame allocation in `StreetLamps.update`:** the camera position is kept in a preallocated `Float64Array`
  and the per-frame `emit` closure is now a method. This covers both lamp instances; the lamp behaviour is unchanged.
- **`rng(4242)` fixed-tree stream:** now identical by construction, not only by measurement. Suppressed hamlets put
  their reserve rectangles in `world.shared.suppressedReserve`; the vegetation module stamps them into a copy of the
  mask used only for the street-tree filter, so that filter sees exactly the mask of a build without the plan. The
  final mask (forest, park trees) leaves them out. Dev record `world.shared.fixedPrefix`: 948 street trees, 238
  garden trees, 7 suppressed reserves; filtering without them also gives 948 (so round 1 was right by measurement).
- **`buildPlan` time:** river queries use a segment grid searched ring by ring; regions and the water-distance field
  are computed exactly on every second texel and only re-computed between them where the neighbours disagree or
  near the water; the tree scan visits park texels only. Measured (browser, CPU shared with other sessions):
  1,030 ms for `buildPlan` (field 312, infill 17, avenues 74, coverage 224, park layout 403) plus 100 ms for the park trees, against 843 ms + the 1.5 m tree scan in round 1. It does much more than in round 1 (the designed layout below).
- **Formatting** at `renderer.js:345` fixed. DEVIATIONS numbers of round 1 are superseded by the numbers below.

### Lantern Park art (all rule-based; tuned only on held-out cameras H1, H3, H4, H7, H8, H9, H10)
New `src/planPark.js` (layout), `src/gardenParks.js` (structures); `terrainPark.js` reads the result.
- **Layout as polylines, baked into two textures** (deviation: the spec's park was analytic in the shader). A 2 m
  layout map holds signed distances to walk edges, plaza edges and pond edges plus the LED-curb flag; a 2 m light map
  holds the pools of the lamps, lanterns, plaza lights and uplit trees (rgba16float atlas, Lantern Park and the Silk
  Road Garden side by side, about 2 x 3.3 MB, estimated from the bounding boxes). The shader does 2 texture reads per park pixel instead of the round-1
  walk loops. Lines come from distance fields, so they are stable (see the burst check).
- **Walks:** river walk (as before); meandering upper walks every 85 m of water distance
  (`34 + 85 i + 12 sin(a/60 + 2.1 i) + 5 sin(a/21 + 1.3 i)`); cross walks at hashed spacing 80-160 m, curved by a sine
  offset whose amplitude, wavelength and phase come from the walk index; secondary paths added until the lawn gate is
  met: from the lawn point farthest from any lit feature, a path to the nearest walk and to the best walk at least 100
  degrees away (or to a bounding street), Catmull-Rom with a 4.5 m sideways meander of 26-40 m wavelength (no straight
  run longer than about 40 m). Silk Road Garden: ring walks every 35 m and 16 spokes (geometric, as fits the style),
  plus straight secondary paths.
- **Hard lawn gate** (lawn more than 20 m from a lit walk, plaza or pond edge; uplit trees not counted, so it is
  conservative): Lantern Park 3.4% (10,736 of 319,312 m2), Silk Road Garden 2.4% (2,624 of 109,776 m2); limit 5%.
- **Plazas** on the flattest ground within 30 m of each cross walk's river-walk junction (r 14, always full circles,
  joined by a short link walk when off the junction), and on every other cross walk at an upper-walk junction (r 10).
  Small round terraces end the spur paths.
- **Lights:** 6 m pole lamps every 26 m on alternating sides of every walk (30 m on paths), pool cut-off 32 m with a
  softened falloff `(h^2/(d^2+h^2))^0.95`; warm in Lantern Park, cool white in the garden. Lawn albedo 0.07
  (0.058, 0.082, 0.042).
- **Lanterns:** posts every 7 m on alternating sides of the river walk, cross walks and link walks, plus a ring of
  posts around every plaza; the red lanterns are the sign module's instanced lanterns (own cells and buffer, scale
  1.3, drawn to 900 m) with a warm-red pool each in the light map.
- **Uplit trees:** every designed-park tree within 12 m of a walk edge is uplit (one colour per 120 m grove cell:
  gold, warm white, jade; turquoise and magenta in the garden), with a 5 m ground glow disc baked under it.
- **Lotus ponds:** rule "closed low ground" (lower than everything 20 and 40 m around) found no site on this
  floodplain; relaxed to hollows at least 0.6 m below the 40 m ring mean and within 0.4 m of the 20 m ring minimum.
  Result: no site passes the relaxed rule either, so this build has 0 ponds; the pond code (layout channel, shader) is in place and unused. Not forced, to keep the rule honest. The shader draws dark mirror water (SSR), cellular lotus pads with a few glowing flowers and a lit stone rim.
- **Minimal stage 3** (in the garden module's static mesh, after all garden content; deviation: garden mesh instead of
  building parts, for real upturned roofs): paifang gates (3 bays, lit name board, gold-lit eaves, 2 lanterns) where
  each cross walk ends inland; open pavilions with a gold LED eave band on every plaza; the 15 river-plaza pavilions
  carry one real light each (park pool cap 30). All under 15 m.
- **LED curb** of 0.22 m on the river, upper, cross and link walks (and the garden's rings, spokes and avenues);
  plaza rings 0.24 m. Secondary paths have none.
- **Inland edge:** the field no longer uses the bridgehead chord. Deviation from "the 0.55 contour": the city paints
  and drives its streets out to blocks of district weight 0.3 (`buildRuns`), so at 0.55 the park covered driven
  streets and cars crossed the lawn (seen in H1). Lantern Park now stops at the 0.3 contour, and every existing
  district street that carries traffic across plan land is painted as a city street (built coverage on the district's
  own grid, 56,520 m2, reported apart from the empty-paving check). Probe: no existing or new traffic run crosses
  park land; no run crosses a lot.
- **Approach avenues:** the park now reaches the Peninsula South Bridge's south landing, which gets its avenue
  (as review-1 fix 5 asked).

### Process checks
- **Stage gate on held-out cameras (fix 1).** Blind pairwise judge (`eval/pairwise-judge-v1.md`, fresh agents,
  pairs from `make-pairs.mjs`, keys outside the judge folders) on H1, H3, H4, H7, H8, H9, H10 (all held out; no eval
  pose was used for tuning):
  - round 2 against the baseline (main): 7/7 wins, all clear;
  - round 2 against round 1 (H1, H3, H7, H8 from `out/i016/h4`, H4 from `out/i016/h3`): 5/5 wins (4 clear, H4 slight).
  - Defects the judges named in round 2: identical, evenly spaced plazas along the river walk (minor), a few path
    stubs at the park edge (minor), a lone cyan ring near the bank in H3 (minor), blurry near-camera crowns (minor).
  - The steep bank (slope over 25%) between the river walk and the upper walks keeps its forest, which stays unlit;
    it is the darkest part of H4 and H7.
- **Frame shares and forecasts for every pose (fix 5).** `tools/planshare.mjs` (terrain-only first hit, real camera,
  1 ray per 8 px, final build):

  | Pose | Lantern Park | Silk Road Garden | Exchange (blocks, streets, squares, quay, avenues) | Nearest plan ground | Changes (aligned pixel diff vs main) | Forecast |
  |---|---|---|---|---|---|---|
  | G2 | 26.0% | 0 | 5.2% | 99 m | (not captured) | win |
  | G3 | 7.2% | 0.4% | 2.5% | 810 m | (not captured) | win |
  | B3 | 0 | 8.9% | 10.1% | 321 m | (not captured) | win |
  | G1 | 1.20% | 0.12% | 0.55% | 1350 m | 33 tiles, all inside the plan mask, max 9.2 | tie or slight win |
  | G4 | 0.03% | 0.05% | 0.04% | 1092 m | 10 tiles, all inside the mask, max 3.4 | tie |
  | **A1** (changed) | <0.01% | 0 | 0 | 1025 m | 59 tiles (38 outside the mask: glow/haze), max 5.6 | tie |
  | **A3** (changed) | 0 | 0 | 0.05% | 107 m | whole-frame haze, mean 1.7, max 5.9 | tie (visually the same) |
  | A2 | 0 | 0 | 0 | none | 2 tiles at 0.5-0.66 (haze) | identical within noise |
  | A4, A5, A6, B1, B2, B4 | 0 | 0 | 0 | none | max tile 0.0-0.4 | identical |

  G2's Lantern share fell from 31.7% (spec) to 26.0% because the park now stops at the Old Town's driven streets,
  which count under the Exchange column. A1 and A3 are listed as changed; the adopt rule should treat them as
  "tie expected", not as identical.
- **Identity (`?noplan`, aligned PNG, A1-A6, B1, B2, B4, G1, G4):** all 11 identical to main (max tile 0.0-0.36, below
  the aligned capture noise). Streams: street trees 948 / garden trees 238 / hamlets 289 / signs 83,457 / sign
  lanterns 14,806 / sign lights 2,150 as before.
- **Motion bursts (fix 12):** bursts are now saved as PNG (`capture.mjs` follows `--jpg`; `run-eval.mjs` passes
  `--jpg`, so the eval keeps JPG). The eval bursts are not deterministic (scene time runs): main against main gives
  mean 3.2-6.4 and max tiles 27-89 per frame; main against noplan 2.8-6.0 / 36-88; main against the plan build
  0.8-5.3 / 11-60. All within the run-to-run noise, so the bursts show no plan-specific change; this is the limit of
  the check.
- **Shimmer bursts over each park (fix 12):** `tools/parkburst.mjs`, held-out H3 (garden), H7, H8, H10 (Lantern Park),
  4 frames each, baseline and candidate. With the camera sliding 0.6 m per frame the candidate's frame-to-frame
  difference is higher (H8 9.1 vs 4.4, H10 11.3 vs 9.3), as expected for a lit, high-contrast ground replacing a dark
  forest. With the camera still (TAA jitter only, `--static`), which isolates shimmer, the candidate is equal or lower:
  H3 1.3 vs 2.6, H7 1.7 vs 2.3, H8 3.2 vs 3.1, H10 1.8 vs 2.7 (means of the 3 frame steps). No sign of line shimmer.
- **GPU** (`bench.mjs`, 2560x1440, through the shared GPU lock, one base/candidate pair per lock hold, base first;
  one earlier pair measured on a shared GPU was discarded):

  | Pair | Main avg / p99 (TAA p99/avg) | Candidate avg / p99 (TAA p99/avg) | Delta |
  |---|---|---|---|
  | 1 | 9.53 / 11.48 (1.045) | 9.77 / 11.79 (1.056) | +0.24 |
  | 2 | 9.58 / 11.59 (1.056) | 9.76 / 11.78 (1.045) | +0.18 |
  | 3 | 9.59 / 11.62 (1.045) | 9.54 / 11.67 (1.057) | -0.05 |

  Mean +0.12 ms (cap +0.30). Per pass (means): lighting 3.47 -> 3.56 (+0.10), gbuffer 2.53 -> 2.57 (+0.04), fog
  0.64 -> 0.62, forward 0.37 -> 0.37, vegetation 0.12 -> 0.12. Worst frame 14.43 ms. Gates pass.
- **Functional:** 18/18 (final build, under the lock). Both builds succeed. No WebGPU errors in any capture.
- **Numbers of the final build** (replace round 1's): 62 built cells of 94 candidates, 169 lots, 68 tower lots,
  largest 3 m band 19.1%; painted 553,752 m2 (497,232 m2 of blocks + 56,520 m2 of existing driven streets), 0 m2 of
  empty paving. Park: Lantern 368,721 m2, Silk 133,569, squares 103,014, quay 8,676, avenues 17,037 (4 avenues, the
  new one from the Peninsula South Bridge's south landing). Layout: 200 walks, 19.8 km, 102 + 4 secondary paths,
  50 plazas and terraces, 610 pole lamps, 552 lantern posts, 15 gates, 19 pavilions (15 real lights). Park trees
  2,570 (2,382 uplit). Lights: 5,312 in total (+15 park, +120 infill lamps, +80 shop, +60 sign).
- **Memory:** park layout and light maps about 2 x 3.3 MB (rgba16float, estimated), coverage map 3.3 MB.

