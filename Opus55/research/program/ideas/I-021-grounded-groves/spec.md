---
id: I-021
title: Grounded groves - trees that stand on the ground, crowns that differ, parks planted like parks, plazas built as places
status: rejected
direction: Attack the weakness (judge- and critic-named vegetation and park defects that are still open)
family: vegetation and park planting: tree meshes, LODs, grounding, planting layout, plaza geometry
parent: I-016 (its parks and park trees)
proposed_by: idea generator
date: 2026-11-24
---

# I-021: Grounded groves

## Idea
Every tree in the city is one of four meshes. Beyond 130 m from the camera a broadleaf is a single 20-triangle ball with no trunk, hanging about 6 m (times its scale) above the ground. That is what the judges and critics keep naming: "clone lollipop trees" (G2), "blob trees", tree clumps "floating off steep slopes" (I-014 fresh cameras R05, R06, R16, R17), "bump-texture hillside" (G4), and in I-016's parks "identical lollipop trees on a grid", "decal-like cyan and gold plazas" and "regularly spaced round plazas". This idea fixes the vegetation as a system, in four parts, without touching buildings, terrain heights or any shared random stream.

1. **Grounding (all trees).** No tree may show a gap between crown and ground at any LOD. Every LOD gets a trunk. The trunk base is sunk by the local slope times the trunk radius, plus a buried length, so the downhill side never floats. Trees are not placed where the slope is steeper than 1.0 (45°); between 0.6 and 1.0 they thin out and switch to low, wide shrub masses that hug the ground. Fixed trees (streets, gardens, parks) take the lowest height under their trunk, not the centre height.
2. **Crowns that differ.** The single broadleaf becomes three broadleaf forms that read differently in silhouette: a broad multi-lobed camphor dome, a wide low banyan-like spread on a short thick trunk, and a tall narrow upright oval. Each crown is built from 3–6 lumpy lobes instead of one ellipsoid, so the outline breaks up. The far LODs keep the lobes (3 smoothed lobes of 80 triangles plus a trunk stub) instead of one faceted ball. A fifth new form, a low shrub mass, covers forest edges, steep ground and park borders.
3. **Parks planted like parks.** In I-016's parks the trees are rows along every walk, every 9–11 m, 93% of them uplit, mostly one species at nearly one size. They become clusters: groups of 2–5 trees of one form with 3–6 m inside a group and 15–40 m gaps between groups, sides alternating irregularly; groves on blue-noise (Poisson-disc) spacing with a big-old-tree core and young edges; one specimen banyan at each plaza; shrub borders along walk edges. Only formal avenues keep rows (staggered, with varied sizes). Uplighting drops from 93% of park trees to specimen trees and the head tree of each cluster (about 25%).
4. **Plazas built as places, not paint.** The flat LED tile plazas become geometry with a few distinct types chosen by rule: a raised stone terrace with two steps and a balustrade around the existing pavilion; a planter court (a ring of raised planters with benches, the specimen tree in the middle); a timber river overlook deck where the plaza is within 30 m of the river walk; and at about one junction in four, no plaza at all (just a widened walk). The emissive floor tiles are removed; light comes from a lit curb at the base of the steps, the existing light pools and the pavilion. The Silk Road Garden's star plaza keeps its star, as inlaid stone with eight shallow lit basins, its emissive lattice cut to a quarter.

## Why it might work
- **The defect is named in every round.** Fresh critics on the current best (`metric/best-016m-findings.md`): critic 1 lists "clone lollipop trees (G2)", "bump-texture hillside (G4)", "dark forest band on far bank (B3, G2)" and ranks "vegetation variety" as change 9 for G2, B3, G3, G4, A5, G1; critic 2 ranks "ground materials and varied vegetation" as change 10. I-016's two judging rounds named the park tree grid, mixed tree styles, decal plazas and regular plazas (LOG 2026-11-24). I-014's fresh-camera judge found floating clumps on steep slopes. Detail is the weakest axis (4.86).
- **The cause is concrete and visible in the code.** `vegMeshes.js`: `broadleaf(lod >= 2)` is `M.blob(cc, …, 0, …)`, an icosphere with 0 subdivisions (12 vertices) centred 9 m up with a 3.1 m vertical radius, and no trunk. `vegetation.js` switches to it at 130 m (`VU.lod.y`) and the far ring (650–2100 m) scales it by 1.65 more. `place()` has no slope test, and sets the base at `h − 0.3` from the trunk centre only. In G4 the left bank is 200–600 m from the camera: every tree there is a trunkless faceted ball, which is exactly what the frame shows. In G2 the park trees are `ROW` entries every 9–11 m at scale 0.72–0.84 of species 0.
- **Trees are in many frames.** From the current-best images (estimates, to be replaced by the measured rule below): G2 about 40% of the frame is park and forest; B3 about 20%; G4 about 15%; G3 about 10%; A5 about 15% (the forest right of the station); G1 about 8%. That is 6 of 14 poses, with G2 the largest.
- **It is cheap on the GPU.** I-016 measured that hiding every tree changes the gbuffer pass by only −0.3 to −0.5 ms at G2 and under 0.05 ms elsewhere. Tree cost is overdraw, not vertices, so better far meshes cost little.

## What's new about it
- **Closest earlier work: I-016** (which created the parks and their trees) and I-003 (light parks, superseded). Neither touched the tree meshes, LODs, grounding or forest placement; I-016 placed park trees as walk rows and used existing meshes. No earlier idea in this program changed vegetation at all.
- **Difference from a plain asset upgrade:** the change is rule-based placement (slope rule, LOD-consistent grounding, cluster and blue-noise planting, plaza types by rule), not only nicer meshes, so it fixes the floating and grid defects everywhere, including fresh views.

## Expected effect on the metric
**Targets, by a rule declared now.** After the build is final and before anyone views a candidate eval image, capture all 14 poses on main and on the candidate with `capture.mjs --align` (PNG, same session, under the GPU lock). A pose is a target if at least 8% of its 64-px tiles differ by more than the aligned capture noise of that pose (`tools/pixdiff.mjs`, noise from main-vs-main). The list is frozen in `DEVIATIONS.md` before judging. Expected targets: G2, B3, G4, G3; possibly A5 and G1. Adopt needs wins on 2/3 of the targets and no clear loss elsewhere (the usual rule).

| Pose | What changes | Forecast |
|---|---|---|
| G2 | Foreground park: clustered mixed groves instead of lit lollipop rows, shrub borders, built plazas instead of LED discs; the far-bank forest band gets lobed, grounded crowns | Clear win likely |
| G4 | Left bank: grounded trees with trunks and lobed crowns, shrubs on the steepest ground, no faceted balls | Win |
| B3 | Silk Road Garden: grouped planting, the star plaza as stone and water; far-bank forest | Win or slight win |
| G3 | Lantern Park strip (no more regular dots of lit trees and identical plaza rings); distant forest | Slight win |
| A5, G1 | Forest at 50–600 m with real trunks and varied crowns | Tie or slight win |
| A1–A4, A6, B1, B2, B4 | Few or no trees; nothing else changes | Tie |

**Critic scores (estimate):** detail and coherence on G2 +0.5 to +1.0, on G4 and B3 +0.3 to +0.5, on G3, A5, G1 +0.1 to +0.3. Zone G mean about +0.3, zone B about +0.1, zone A about +0.05. This idea alone does not reach 9 anywhere; it removes a defect that every later idea would otherwise keep paying for.

## Quick test
About one day, on held-out cameras only.
1. Build part 1 (grounding, slope rule, trunks on all LODs) and part 2 (crown forms, lobed far LODs, shrub form). No park changes yet.
2. **Held-out cameras by rule (seed 20261125), written to `heldout-cameras.json` before any capture:** 8 forest cameras. For each: pick a random land point where the baked forest mask is above 0.5 and the slope is 0.35–1.0; place the camera 150–600 m away horizontally (random bearing), 20–80 m above its own ground, looking at the point; reject if the terrain blocks the line of sight (sample every 2 m, 2 m clearance), if the camera is within 300 m of any eval pose, or if it faces a wall within 100 m (the I-014 lesson). Plus I-016's held-out park cameras H1, H3, H4, H7, H8 for part 3 later.
3. Capture main and the candidate. Blind pairwise judge (`pairwise-judge-v1.md`, fresh agent, `make-pairs.mjs`, key outside the judge folder).
4. **Stop rule:** fewer than 5 of 8 forest cameras won, or any clear loss, means the new meshes are not better; stop before parts 3 and 4.
5. `bench.mjs` one alternating pair: stop if the average rises by more than 0.15 ms.

## Implementation plan
### Part 1: grounding (`vegetation.js`, `vegMeshes.js`)
1. **Slope in `place()`.** Sample `tHeight` at ±3 m in x and z (two extra samples per candidate). `s = |∇h|`.
   - `s > 1.0`: return (no tree).
   - `0.6 < s ≤ 1.0`: keep with probability `1 − (s − 0.6) / 0.4 × 0.6` (from the existing hash `h4.x`), and force the shrub form.
2. **Base height.** `y = h − 0.3 − s × rTrunk × scale − 0.4`, where `rTrunk` is the mesh's trunk base radius. All trunk meshes start at y = −1.5 instead of −0.5 (buried length; it never shows on flat ground).
3. **LOD 2 and far-ring LOD 3 get a trunk stub** (4-sided tapered prism from −1.5 m to the lowest lobe, 8 triangles) and their lowest lobe reaches down to within 4 m of the ground, so no sky or ground shows between crown and ground from a low camera.
4. **Fixed trees** (`fixed.forEach` in `init`): `y = min(heightAt)` over the trunk centre and 4 points at 0.6 m × scale around it, minus 0.2. This replaces `t[1] − 0.2`; it is computed, not drawn, so the `rng(4242)` sequence is untouched.
5. **Clearance from the rail viaduct** (an I-016 named defect): park and forest trees keep 14 m (crown radius plus deck) from `ROUTES` instead of 9 m. Applied only in a copy of the mask stamped *after* the street-tree filter (as I-016 did for infill lots), so the street-tree list and the `rng(4242)` prefix stay identical.
6. **Forest floor under stands** (`terrainShade.js`, the `forest > 0.05` branch): where real trees stand (inside the near ring), replace the baked crown-bump relief with a dark, flat forest floor with leaf litter tone; keep the crown-bump shading only beyond the near ring, where it stands in for trees. This removes the "bump-texture hillside" between trunks. One `smoothstep` on the camera distance; no new texture. *(Coordinate with the terrain generator's ideas: this touches only the forest-floor term.)*

### Part 2: crown forms (`vegMeshes.js`, `vegetation.js`)
7. **Species list goes from 4 to 6:** 0 camphor dome, 1 pine, 2 bamboo, 3 willow (unchanged ids, so garden and park data keep their meaning), 4 banyan spread, 5 upright oval; plus the shrub mass as 6. `SPECIES = 7`, `LISTS = 28`.
   - Forest: species 0 is split by `fract(h4.y × 5.3)` into 0 (55%), 4 (20%), 5 (25%); shrubs as in step 1 and along the forest edge (forest mask 0.15–0.35).
   - Fixed trees of species 0 are split the same way by their existing hash (`R()` value already drawn), so no new draws.
8. **Lobed crowns.** Each broadleaf crown is 3–6 lumpy lobes (`blob` subdivision 1) placed by a fixed per-form recipe, with the leaf cards spread over the lobes. LOD 0: full lobes and cards; LOD 1: lobes at subdivision 1, half the cards; LOD 2 and 3: three lobes at subdivision 1 with smoothed normals (about 240 triangles), no cards. Forms differ by height-to-width ratio (dome 0.75, banyan 0.5 on a 3.5 m trunk, oval 1.6).
9. **Shrub mass:** 3–5 flattened lobes, 1.5–3 m tall, 4–7 m wide, no trunk, drawn only within 400 m.
10. **Buffer size:** `instBuf` grows from 16 to 28 lists. Report the peak per-list counts (`__vegCounts`) on the fly-through and set `CAP` per list from them (no list may hit its cap on the path), so memory stays near today's 16 MB.

### Part 3: park planting (`plan.js` `parkTrees`, I-016 parks only)
11. **New stream** `rng(6163)` for park planting (the old `rng(6161)` is only used here; it is retired, not shared). Park trees stay appended after every other fixed tree.
12. **Walk planting as clusters.** Along each walk, walk the arc length in steps drawn from {group: 2–5 trees of one form, 3–6 m apart} then {gap: 15–40 m}; side chosen per group (70% stay on the same side as the previous group). Avenues (`avenue`, `spoke`) keep rows, staggered by ±1.5 m, sizes 0.8–1.2.
13. **Groves on blue noise.** Replace the jittered 8 m grid with Poisson-disc sampling (min distance 6 m for broadleaf, 4 m for pine and bamboo), thresholded by the same clump noise; scale from an "age" field (low-frequency noise, larger in the grove core, 0.6–1.5). Form mix per grove cell of 120 m: one dominant form (60%) plus two others.
14. **Shrub borders** along walk edges between groups (every 4–8 m where no tree is within 5 m), and around each plaza.
15. **Specimen trees:** one banyan, scale 1.4–1.6, at every planter court and terrace plaza; uplit.
16. **Uplighting:** only specimen trees and the first tree of each walk group are uplit (target 20–30% of park trees). The lawn gate (lawn more than 20 m from a lit walk, plaza or pond edge) does not count trees, so it is unaffected; report it.

### Part 4: plazas (`planPark.js`, `gardenParks.js`, `terrainPark.js`)
17. **Plaza type by rule, no random draws:** for plaza index `i` (in the layout's existing order), `k = hash(i)`:
    - within 30 m of the river walk: river overlook deck (timber deck to the embankment edge, railing, two benches);
    - else `k < 0.25`: no plaza (the walk widens to 6 m for 20 m; no ring, no posts);
    - else `k < 0.6`: raised stone terrace, 0.45 m in two steps, balustrade with gaps on the walk axes, existing pavilion on it;
    - else: planter court, 8 raised planters (0.6 m, stone) in a ring with benches between, the specimen tree in the middle.
    Sizes vary with a second hash: radius 9–16 m; terraces may be square (rotated to the walk).
18. **Remove the emissive floor tiles** in `terrainPark.js` (the `plazaM` LED wave and the Lantern Park plaza `plazaEm`). Plaza floors become wet stone slabs with joints, lit by the existing pools. The lit line stays only as a 0.24 m LED curb at the base of the bottom step (geometry, emissive).
19. **Silk Road Garden star plaza:** the star becomes stone inlay (albedo and normal only), plus 8 shallow basins (0.3 m deep, 3 m wide) between the star points, drawn with the existing pond shader path (dark mirror water, lit rim). The turquoise lattice emissive is scaled to 25%.
20. **Lantern posts** around removed plazas are dropped; posts around terraces and courts follow the new outline. Park lanterns stay appended after the main lanterns in the sign module; park real lights stay within the existing cap of 30.

### Checks before hand-off
21. **Identity outside vegetation and parks.** `tools/hyd-identity.mjs`: all main building parts, signs, the first 14,806 lanterns, the slots and all main lights identical; park lanterns and park lights may change. With trees hidden (`ctx.treeLodMask = 0`, dev) the aligned PNG captures of A1–A6, B1, B2, B4 must match main with trees hidden (max tile at or below aligned noise). Dev record `fixedPrefix` must show 948 street and 238 garden trees, as on main.
22. **Floating audit (dev):** for every emitted near-ring tree and every fixed tree, the lowest trunk vertex must be at or below the lowest of 5 terrain samples under it; print the count of failures (target 0).
23. **Shimmer:** I-016's `parkburst.mjs --static` on H3, H7, H8, H10: frame-to-frame difference not above main's.
24. `functional.mjs` 18/18, no WebGPU errors, both builds. No pose coordinates in code (the existing hero-sightline stamps in `buildMask` stay as they are).

## Cost
- **Effort:** one implementer, about 3–4 days (parts 1–2: 1.5 days, part 3: 1 day, part 4: 1–1.5 days).
- **GPU** (gate: average ≤ 11 ms, p99 ≤ 16.7, max ≤ 25; current best about 9.8 ms; the remaining ~1.2 ms is shared with I-018 (+0.05) and the other generators' ideas). **Cap for this idea: +0.20 ms on the fly-through average, +0.3 ms at p99**, measured as the mean of 3 alternating main/candidate pairs under the GPU lock.

  | Source | Estimate | Where it comes from |
  |---|---|---|
  | Far LODs: 3 lobes of 80 triangles + trunk (about 250 triangles) instead of 20; at most ~15k far-ring instances on screen | +0.03–0.06 ms (vertex work; RTX 4050 handles ~4M extra vertices per frame in well under 0.1 ms) | gbuffer |
  | Lobed crowns near the camera: slightly more overdraw at LOD 0–1 | +0.02–0.06 ms where trees fill the view (G2) | gbuffer |
  | Shrubs: at most ~8k instances within 400 m, low and mostly hidden by early-z | +0.02–0.05 ms | gbuffer |
  | Slope rule: no trees on slopes above 1.0, thinning above 0.6 | −0.01 to −0.03 ms | gbuffer |
  | Two extra height samples per scatter thread (about 90k threads) | +0.01 ms | vegetation compute (0.12 ms today) |
  | Plazas: about 20–40k triangles of static garden mesh, piece-culled | under 0.01 ms | gbuffer |
  | Park lights: unchanged cap of 30; uplighting is emissive only | 0 | lighting |
  | Forest floor term: one `smoothstep`, fewer instructions than the bump term it replaces in the near ring | about 0 | gbuffer (terrain) |

  Total estimate: +0.05–0.15 ms average, +0.1–0.2 ms at G2. Nothing is added to the lighting pass (the largest pass, 3.4 ms).
- **Memory:** instance buffer about 16–20 MB (per-list caps from measured counts), meshes under 1 MB.
- **Shared random streams (unchanged by construction):** `rng(1234)` lots, `rng(9137)` signs, `rng(4242)` (shop lights in `buildings.js`; fixed trees in `vegetation.js`: same prefix, only computed y values change), `rng(5150)` skybridges, `rng(31337)`/`rng(31338)` traffic, `rng(8080)`/`rng(9191)` crowds, `rng(7070)` hamlets, `rng(99)` street trees (not edited), `rng(6262)` park layout (walks unchanged; plaza types come from hashes of the plaza index). Forest placement uses GPU cell hashes only (unchanged cells; new decisions derive from the same hashes). New: `rng(6163)` for park planting.

## Risks
- **Better meshes may not read at night.** Most trees are dark masses lit only by sky fill and the city glow. The lobed silhouettes matter most against lit backgrounds (G2's river, G4's water) and at mid distance. The quick test on 8 forest cameras checks this before the park work starts.
- **G2 is shared with other ideas.** The terrain and riverbank generators may change the same far-bank forest and Lantern Park's steep bank; whichever is judged second is judged against a different G2. Sequence after the coordinator decides the order; part 1's forest-floor change (step 6) is the one place that touches terrain shading.
- **Fewer uplit trees could make the parks darker.** The uplighting is what made I-016's parks win from the air. Cutting it to ~25% may lose some of that glow at G3. If the held-out park cameras H1/H7 lose, raise the uplit share to 40% before eval capture (rule fixed in DEVIATIONS before any eval image is seen).
- **The target rule may pick only 2–3 poses.** If only G2 and G4 pass the 8% tile rule, adoption needs both. That is the honest size of the change.
- **Interaction with I-016's lawn gate and lights.** Removing a quarter of the plazas removes some lit features; the 20 m lawn gate (Lantern 3.4%, Silk 2.4%, limit 5%) must be re-measured and stay under 5%, using the widened walks and shrub borders.
