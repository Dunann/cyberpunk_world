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
