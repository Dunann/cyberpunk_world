---
id: I-016
title: Confluence plan: build first, then paint. One infill quarter and riverside parks in the core gaps
status: implementing
score: 5.67 (review-1 only; prototype track, user priority 3; build with review-1 fixes 1-12)
direction: Break an assumption (city layout and continuity; user priority 3). Combined revision of I-001 and I-003 after two reviews of I-001
family: land-use plan: blocks, parks or untouched, with ground paint driven by a lot-coverage map
parent: I-001, I-003
proposed_by: idea generator
date: 2026-11-24
---

# I-016: Confluence plan

## Idea
I-001 painted an urban field and hoped lots would follow. Both reviewers showed that most of the field would end up as empty paving, that it re-rolled the whole city, and that it changed poses it did not forecast. This revision turns the order round and shrinks the area.

**Three rules**
1. **Every piece of gap land in the plan area gets one use:** a built block, a park, or nothing (left as it is).
2. **Build first, then paint.** Infill lots are generated first. A coverage map is stamped from the blocks that were actually accepted. Paving, roads, lamps and forest removal read that map and nothing else. Land in the plan area that got no block becomes park. Empty paving cannot occur.
3. **Nothing existing moves.** The info map, the district lookups and every existing random stream stay byte-identical. Everything new is appended, with its own streams and its own light pools.

**The plan area** (layout data in `world.js`; all of it is east of the Jade River or south of the Great River)

| Site | Use | Where | Size |
|---|---|---|---|
| Confluence Exchange | Infill blocks, with a quay park along the river and pocket parks on leftover land | The empty plain between Jiangbei, the Bund and the north bank of the Great River: x 760..1700, z −820..120. Metro Line 6 crosses it; the Old Town Bridge lands in it. | 0.62 km²; simulation gives about 50–56 blocks (130–150 lots) on about 0.40 km², park on the rest |
| Lantern Park | Park, Chinese riverside character | South bank of the Great River, x −480..1200, from the promenade to the first Old Town blocks | 0.50 km², 220–420 m deep |
| Silk Road Garden | Park, Central Asian character, with a bridge approach avenue | The point south of the Bund, around (1700, −120), radius 250 m | 0.09 km² |

**Left out on purpose:** the whole peninsula (I-002 and I-015 work there), Ovoo Hill at the Jade mouth (it stays forest: it is under 0.5% of every target frame and is the only site visible in A3), and the CBD river edge (it would change B1). These are follow-ups once this plumbing exists.

## How each review point is answered
| Review point | Answer in this spec |
|---|---|
| Ground paint, lamps and forest removal followed the field, not the lots | A coverage texture is stamped only from accepted blocks (plan step 3). A block is kept only if at least half of its interior is built. Unbuilt land in the plan area is stamped as park. The quick test prints painted area against built area and renders a top-down check image. |
| Owner assigned across rivers; ids blended at seams | Owner = nearest gridded district reachable in a straight line without crossing water. The owner id is stored per texel and read with `textureLoad` (nearest). Cells whose five sample points do not share an owner are not built; they become pocket park. Result here: Jiangbei owns the plain west of about x = 1300–1400, the Bund the part east of it (the line runs close to the metro viaduct); the two grids differ by 0.1 rad. |
| Height cap absolute, collapsed to minimum podiums, tuned to G2 | The cap is height above the lot's highest ground, from a principle fixed below. No eval camera is used to set it, and none hovers low over infill (G2 is over the park). |
| First lot loop not untouched; trees, cars, crowds, shop lights and signs re-rolled | `districtAt`, `districtWeight`, the info map and `_buildLots` are not edited. The step list names each existing stream and how the new items avoid it (plan step 5). A pixel diff checks it. |
| Hongyadong unprotected | A keep-out list is applied to all infill and park stamping: 400 m around the stilts site, 60 m beyond every landmark radius. The nearest plan land is 516 m from the site, across the Jade River. |
| Unforecast poses | Frame shares for all 14 poses are computed below. A1, A2, A3, A6 and B1 are excluded by geometry. G1 and G4 are forecast. |
| GPU undercounted; quick test too weak | Lighting, city ground and trees are re-costed from new measurements. The quick test includes the coverage texture and shader changes, the empty-paving check, the full `bench.mjs` fly-through and a blind pairwise check of G2, G3 and B3. |
| Scope | About 150 infill lots, not 700. Two parks, not three. Stage 3 can be cut without breaking stages 1 and 2. |

## Why it might work
- **The complaint is about three places.** The critics' wording ("wide bands of forest and an empty central plain", "bridge ends land in forest", B3; G2; G3) and the user's ("odd forested strips between the city and the water") describe exactly the south-bank strip, the central plain and the Bund point. The user asked for "parks with character, or bring the city to the water, or a mix of both". This plan is the mix: park on the south bank and the Bund point, city to the water on the plain.
- **Frame shares** (share of each frame whose ground lies in a plan site; terrain only, buildings ignored; computed from the baseline height grid with the real camera maths):

  | Pose | Lantern Park | Silk Road Garden | Confluence Exchange | Nearest changed ground |
  |---|---|---|---|---|
  | G2 | 31.7% | 0 | 3.3% | 103 m |
  | G3 | 9.7% | 0.3% | 1.7% | 809 m |
  | B3 | 0 | 10.4% | 11.0% | 323 m |
  | G1 | 1.7% | 0.1% | 0.3% | 1367 m |
  | G4 | 0.1% | 0 | 0.1% | 1358 m |
  | A1–A6, B1, B2, B4 | 0 | 0 | 0 | none |

- **Infill simulation** (the second lot pass run offline on the baseline heights, Jiangbei grid, 14 m slope limit): 81 candidate cells; 56 built with 151 lots; 25 rejected (8 too close to the Bund's grid, 7 under the metro or on the bridge approach, 7 less than half buildable, 3 at the water). Built cells have 92% of their interior covered by lots. The rejected 25 become park. With the Bund's larger grid on the eastern third and one row lost at the seam, expect about 50 blocks and 130–150 lots.
- **Cost of the forest, measured:** hiding the trees changes the gbuffer pass by about −0.3 to −0.5 ms at G2 (forest in the foreground) and by less than 0.05 ms at G3, B3 and G1. So parks pay for themselves only at G2; elsewhere they are neutral. (The GPU was shared during this measurement; totals varied by ±0.5 ms.)
- **The codebase already has the patterns:** fixed trees and reserve rectangles published by the garden module, a lawn material in the ground shader, an exclusion mask stamped from lots, an exported `StreetLamps` class, and run-based traffic.

## What's new about it
- **Against I-001:** the urban extent is no longer a field. It is the set of blocks that were actually built, and the area is one quarter instead of every bank.
- **Against I-003:** the parks no longer compete with infill for the same land; the plan assigns each site one use. Ovoo Hill is dropped for now.
- **Closest other ideas:** I-002 (stepped banks, peninsula only) and I-015 (Hongyadong). Neither touches the plan area, and this plan touches neither of theirs.

## Expected effect on the metric
**Targets: G2, G3, B3** (adopt needs wins on 2 of 3).

| Pose | What changes | Forecast | Loss risk |
|---|---|---|---|
| G2 | The foreground forest becomes Lantern Park seen from 65 m above: a lit riverside walk, upper walks, gold-lit avenues, plazas, gates. The near bank and its reflections stay visible because nothing in a park is taller than 20 m. On the right, the "forested point" becomes the Exchange's waterfront row (about 42 m high) behind a quay park, 630 m away. | Win | Medium: the park must read as designed and lit, not as a dark lawn |
| G3 | The dark band along the south bank becomes the park; the empty plain in the centre becomes lit blocks with a ridge of taller buildings along the metro and a peak at the bridge landing. | Win | Low to medium |
| B3 | The forest in the lower half becomes the Silk Road Garden (star plaza, arch gate, approach avenue from the suspension bridge to the Bund) and, on the left, the roofs and streets of the Exchange. | Win | Medium: the infill is made of the same boxy buildings as the rest |
| G1 | 2.1% of the frame, 1.4–2.8 km away: the dark band between the Old Town and the river gains path lights and lit groves; new lit blocks appear across the river. | Tie or slight win | Low |
| G4 | 0.2% of the frame at the far right edge, beyond 1.3 km: a few distant park lights. | Tie | Very low |
| A1, A2, A3, A4, A5, A6, B1, B2, B4 | Nothing. No plan land is in frame, and no stream or pool they depend on changes. | Identical within capture noise | Must be confirmed by the pixel diff |

G1 and G4 cannot be excluded without removing target land, because they look at the same sites from farther away. They are forecast, not counted as targets: a tie there would otherwise count against adoption although nothing is wrong.

**Critic scores:** coherence and brief-fit on G2, G3 and B3 up by about 1; zone G mean by about +0.4.

## Quick test
Stage 1 of the plan is the quick test. About one day. It exercises the real risks:
1. Build stage 1: plan data, infill pass, coverage texture, the shader lookups, bake and ground changes (city ground on built cells, plain lawn on park land, no forest on either). No park design, trees or structures yet.
2. **Empty-paving check.** Print: candidate cells, built cells, rejects by reason, lots, painted area, lot-footprint area. Write a top-down debug image of the coverage map with lot outlines. Capture one straight-down custom camera over the Exchange. Fail if any painted cell has no building.
3. **Identity check.** Capture A1, A2, A3, A4, A5, A6, B1, B2 and B4 as PNG from the baseline build and from this build in the same session, and diff them (`tools/pixdiff.mjs`, new: mean absolute difference per 64-px tile). First diff baseline against baseline to learn the capture noise. Fail if any tile exceeds that noise.
4. **Cost.** Run `node tools/bench.mjs` on the baseline build and on this build, back to back, on a quiet GPU. Fail if the average rises by more than 0.30 ms or p99 exceeds 13 ms.
5. **Blind pairwise check.** Capture G2, G3 and B3 with `--poses-file ../eval/poses-v1.json --ids G2,G3,B3 --jpg`, build pairs against `eval/runs/baseline` with `make-pairs.mjs`, and give the pair folder to the coordinator for a blind judge. At this stage the parks are plain lawn, so only B3 and G3 are expected to win or tie. **Stop if B3 or G3 is a clear loss:** the infill itself would then be the problem, and stages 2 and 3 cannot fix it.

## Implementation plan
### Stage 1: plumbing and infill (about 2 days)
1. **Plan data** (`world.js`, next to `DISTRICTS`).
   - `PLAN.sites`: the three sites above as polygons or discs with `use` (`infill` or `park`) and `style`.
   - `PLAN.keepout`: 400 m around the stilts site (245, −135); 60 m beyond every `LANDMARKS` radius; the existing bridge, rail and cableway reserves.
   - `PLAN.infillHeight`: the numbers of the height rule below.
2. **Infill pass** (`World._buildInfill`, called after `_buildLots`, which is not edited).
   - Own stream: `rng(5678)`.
   - **Owner** of a point: among districts with a street grid, the smallest ellipse distance for which the straight line to the district centre stays on land (`waterDist > 0`, sampled every 20 m).
   - Enumerate the owner's grid cells that lie inside an infill site. Skip a cell if its ellipse weight is 0.55 or more (it already has lots), if its centre and four corners do not share one owner, if any of those points has another district's ellipse weight above 0.3, or if it touches the keep-out list.
   - Subdivide every cell with the urban pattern (mostly 2 × 2, lots of 30–66 m), whatever the owner's type, so that lots pass the slope test on the bank.
   - Per lot: the existing reserve, height and water tests (`waterDist ≥ 12`), and `gMax − gMin ≤ 14`.
   - Keep a cell only if its accepted lots cover at least half of the block interior. Otherwise drop all its lots.
   - Accepted lots get `infill: true`, `type: DT.URBAN`, `district: owner`, `distFromCenter: 1`, and `maxTop` from the height rule. They are appended to `world.lots` after all existing lots. `prepareLots` skips them.
3. **Coverage map** (`World._buildCover`, then uploaded as `coverTex`, `rgba8unorm`, 2048², 6 m per texel, no mips).
   - `r`: built coverage. Stamp each kept cell as a rectangle of the block size plus one street width, so the streets around a built block are painted in full.
   - `g`: owner id of that cell.
   - `b`: park coverage. Stamp all land of park sites, plus all land of infill sites that is not within a stamped cell, clipped to land more than 6 m from water and outside existing lots.
   - `a`: park style (lantern, silk road, quay strip, pocket, avenue).
   - Keep the array on the CPU as `world.coverAt(x, z)` for the appended passes below.
4. **Shader access** (`renderer.js`, `common.js`: one new texture binding in the frame group; additive).
   - `coverAt(xz)`: `r` and `b` sampled linearly, `g` and `a` read with `textureLoad` at the nearest texel.
   - `cityInfo(xz)`: `worldInfo(xz)` with `y` and `z` replaced by the cover's owner and `0.8 * r` where that exceeds the ellipse weight. `worldInfo` itself is not changed.
   - Both functions return the unchanged values outside the plan's bounding box, without reading the texture, so nothing outside the plan area can change and the extra cost is paid only inside it.
   - Switch to `cityInfo` in exactly these places: the city branch of `groundShade` and its analytic lamp pools, `bakeNear` (paving and forest removal), and `roadMask`. The lamp pools on infill streets fade against the infill lamp pool's own real-light range (pass it in the spare `TU.y`).
   - `bakeNear`: forest = 0 and base colour = lawn where park coverage is above 0.5. In `groundShade`, park coverage also switches off the existing half-painted rim of a district where it overlaps a park.
5. **Appended items, each with its own stream and pool.**

   | Existing stream or pool | Kept identical by | New, appended |
   |---|---|---|
   | `_buildLots`, `rng(1234)` | not edited; `districtAt` not edited | infill pass, `rng(5678)` |
   | Building generation per lot (`rng(L.seed)`), props budget | infill lots are generated last, by `genUrban` only (no clock tower, no tower tops for the light show), prop density 0.6; the baseline leaves 12,600 props spare | about 4,000 props |
   | Shop-light shuffle, `rng(4242)`, budget 1450 | infill lots write to a separate list while they are generated | own shuffle `rng(4343)`, pool of 80 |
   | Street lamps: candidates, `lampValid`, 520 real lights | existing candidate list and rule not edited | a second `StreetLamps` instance for infill cells, validated by a new `infillValid` (owner match, built coverage above 0.9, not already valid), real-light pool of 120 |
   | Street trees, `rng(99)`; fixed-tree stream `rng(4242)` | not edited; park trees are appended after the garden's trees | no street trees on infill streets in this version |
   | Traffic runs and cars, `rng(31337)` | `buildRuns` not edited | `buildInfillRuns` (owner grid lines inside built cells), appended after the bridge runs, cars from `rng(31338)` |
   | Crowds, `rng(8080)` and `rng(9191)` | they use `buildRuns`, which is not edited | none in this version |
   | Signs, `rng(9137)`; sign lights, budget 2150 | slots from infill lots carry a flag and are skipped in the existing pass | second pass with `rng(9138)`; own light pool of 60, selected after the existing selection |

6. **Height rule for infill** (fixed here, before any capture; all values are metres above the highest ground under the lot, `maxTop = gMax + cap`).
   - Principle: infill joins the district centres, so it stays below them, and it steps up only toward the two things that draw height in a river city, the waterfront and transit.
   - Base: 26 m (8 storeys).
   - First row at the water (lot within 90 m of the water): +16 m.
   - Bridge landing: up to +52 m at the landing, fading linearly to zero at 300 m.
   - Rail line: up to +26 m on the line, fading linearly to zero at 120 m.
   - Ceiling: 94 m. (Jiangbei's own towers reach about 140 m.)
   - The terms add, so no factor can push the cap below the base, and the base is above the generators' minimum heights (6–12 m), so `maxTop` is never overridden.
   - The numbers may be changed only for a reason that does not involve an eval camera. Clearance is checked against the fly-through path (it crosses the plain at 200 m or more) and the ten in-app viewpoints, none of which is in the plan area.
7. **Run the quick test** (above) before going on.

### Stage 2: the parks (about 1 day)
8. **Park ground** (`parkShade` in `terrainShade.js`, taken where park coverage is above zero). All layout comes from water distance `c`, a coordinate `a` along the site's long axis, and height, so it follows any bank.
   - **Lantern Park and the quay strip:** riverside walk where `|c − (34 + 10 sin(a / 46))| < 2.2` (at `c ≈ 20` in the narrow quay strip); in Lantern Park also two upper walks at `c ≈ 110` and `c ≈ 200`, cross walks every 120 m, and round plazas of 14 m radius where they meet the riverside walk.
   - **Silk Road Garden:** a central plaza of 45 m radius paved with an eight-point star tiling drawn as lit lines, and straight avenues to the promenade, the Bund and the bridge landing.
   - **Pocket parks:** lawn only.
   - Paths are stone slabs with a thin emissive edge line (gold in Lantern Park, turquoise in the garden) and warm light pools every 9 m. All of it is analytic; no point lights. Lines are widened to at least one pixel at distance with brightness scaled down, as the bridge cables do.
   - **Approach avenues** (style `avenue`): the Bund Suspension's west landing to the first Bund street, and the Old Town Bridge's north landing to the first Exchange street. Asphalt, centre line, lamp pools. One appended traffic run on each.
9. **Trees** (CPU list appended to `world.shared.gardenTrees`, after the garden's own entries).
   - Avenues: both sides of the walks every 9 m. Groves: clusters from low-frequency noise, off paths and plazas. About 2,500 trees, existing species.
   - **Uplighting:** pack a glow index into the fractional part of the species value (use `floor` where the shaders compare species). Crowns with a glow index get an emissive tint, stronger at the bottom. One colour per grove: gold and jade in Lantern Park, turquoise and magenta in the garden. Most trees stay unlit.

### Stage 3: park structures (about 1 day; can be cut)
10. New `src/buildings_parks.js`, called after the infill lots, using existing part types. Nothing taller than 15 m. Skip the keep-out list.
    - Lantern Park: 6 paifang gates at the city ends of cross walks, 8 pavilions with upturned roofs on plazas.
    - Silk Road Garden: a tiled arch gate toward the Bund, 4 teahouse platforms with carpets, 2 slim towers from the existing `minaret` helper.
    - At most 900 parts and 30 point lights from a separate park pool. Sign slots on gates go to the infill sign pass.

### Before hand-off
11. Repeat the empty-paving check, the identity diff and `bench.mjs`. Diff G1 and G4 as well: changes must be confined to the plan sites. Capture both motion bursts and one burst over each park: no shimmer on path lines. `functional.mjs` 18/18. No pose coordinates anywhere in code.

## Cost
- **Effort:** one implementer, about 4 days (stage 1: 2, stage 2: 1, stage 3: 1). Stage 3 can be dropped if stage 2 already wins.
- **GPU (budget 11 ms average; baseline 9.64 ms).** Measured on the baseline: G2 10.40 ms (gbuffer 3.45, lighting 3.30), G3 10.47 (3.30, 3.56), B3 9.03 (2.13, 3.31).

  | Source | Estimate |
  |---|---|
  | Buildings: 150 lots are 5% more than today, whose buildings and signs cost 0.7–1.0 ms of gbuffer at G2 and G3 | +0.04–0.08 ms where the Exchange is in view |
  | City ground on built cells: this branch (road layout, puddles, lamp pools) costs more than forest floor. At B3 the Exchange is 11% of the frame, about half of it hidden by its own buildings | +0.05–0.15 ms at B3; under 0.05 ms at G3 |
  | Lighting: at most 290 new lights (120 infill lamps near the camera, 80 shop, 60 sign, 30 park). At B3 most are 350–900 m away and cover few tiles; the lamp pool is separate so it cannot grow beyond 120 | +0.10–0.20 ms at B3; +0.05 ms at G3; about zero at G2 |
  | Park ground: about 40 arithmetic operations, no new texture reads beyond the coverage lookup; replaces the forest branch on those pixels | about neutral |
  | Trees: forest removed from about 0.8 km², 2,500 fixed trees added | −0.3 to −0.1 ms at G2; neutral elsewhere |
  | Coverage lookup in the ground shader: two extra reads per ground pixel, inside the plan's bounding box only | +0.02–0.05 ms where the plan area fills the view |
  | Traffic on about 60 appended runs | under 0.02 ms |

  - **Per pose:** B3 +0.25–0.45 ms, G3 +0.10–0.25 ms, G2 −0.2 to +0.1 ms.
  - **Fly-through average:** +0.10–0.20 ms (to about 9.8 ms). The path passes 60–80 m above Lantern Park and 200 m above the Exchange.
  - The quick test measures this with `bench.mjs` and has a stop rule at +0.30 ms.
- **Memory:** 16 MB for the coverage texture. **Load time:** stamping and one extra lamp validation, under 0.2 s.

## Risks
- **Identity may not be exact.** The table in step 5 covers every stream the reviewers found, but another shared budget may exist. The identity diff in the quick test is there to find it early. Outside the plan's bounding box the new lookups return the old values unchanged.
- **The infill is ordinary.** It is made by `genUrban`, so it has the boxy look the critics dislike. It fixes continuity, not building character, and it will improve if I-012 or I-013 is adopted. If the blind check at the end of stage 1 shows B3 or G3 losing, stop.
- **Parks may read as dark lawn.** A park seen from above is mostly grass. The walks, pools and lit groves must be bright enough to register (emissive about 2–6) without glare. This is the main art-direction risk, and G2 depends on it.
- **Soft, slightly jagged paving edges.** The coverage map has 6 m texels and blocks are rotated, so the edge of the paint wanders by up to 3 m. It falls outside the outer pavement, on park ground. If it shows, raise the map to 3 m texels over the plan area only.
- **Seam inside the Exchange.** Jiangbei's and the Bund's grids meet at 0.1 rad near x = 1300–1400, next to the metro viaduct. One row of cells is lost there and becomes pocket park. That is intended, but check that it does not read as a gap from B3.
- **No people, no street trees on infill streets.** Invisible from the three target poses (the nearest is 360 m away), visible on foot. Follow-up.
- **Two bridge landings stay in forest:** the south ends of the Peninsula South Bridge and the Old Town Bridge lie just outside Lantern Park. Extending the park west would bring it into G4's frame at 590 m. Left for a follow-up.
- **G1 and G4 are forecast, not targets.** If the coordinator prefers to count G1 as a target, the forecast (tie or slight win) stands, and adoption would then need 3 wins of 4.
