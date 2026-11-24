---
id: I-032
title: Placeholder sweep - find what each unexplained shape is in the code and fix it at the source (bridge cables, near-camera fade, laser pontoons, street embankments, the Jade east-bank strip)
status: rejected
score: 4.33 (review-1 4.33, review-2 4.33; mean; below 7; split revision requested as I-040)
direction: Attack the weakness (critics' unexplained placeholders and voids; critic 1 change 5, critic 2 change 8)
family: defect repair at the source: coverage-correct thin members, camera-proximity fade, missing emitters, retaining structures, unclaimed land
parent: none
proposed_by: idea generator
date: 2026-11-24
---

# I-032: Placeholder sweep

## Idea
The critics name a set of shapes that read as placeholders. Most are not missing models; they are real elements drawn wrongly or left bare. Each one was traced in the code (camera rays from `poses-v1.json`, FOV 1.05, compared with the image) and gets a fix in the system that makes it, never keyed to a camera.

| Defect | What it is | Fix |
|---|---|---|
| **G1 glass pyramids** (0-120 x 730-850) | The Peninsula South Bridge's stay-cable fans. The ray from G1 at x = 60 px hits (-623, 60, 472), on the bridge axis. Cables are ribbons widened to at least 1.5 px (bridges.js:172-174); 2 x 2 x 14 cables, seen obliquely from 2 km, merge into a solid sheet. | C1 |
| **A6 floating neon bars** (0-830 x 1270-1440) | Most likely the same bridge's cables seen from above: cyan-to-violet is that bridge's LED style (`STYLE['Peninsula South Bridge']`), and their ends line up on a diagonal of moving car lights (the deck). To be confirmed (quick test 0). | C1 |
| **B2 purple box** (critical) | An oncoming car in the inner lane, its flank about 1.1 m from the lens (the camera stands on a road centre line; confirmed by the I-025 reviewers). | C2 |
| **B1 small grey head** at the bottom | People closer than 4.5 m are shrunk instead of faded (crowd.js:98, `smoothstep(2.0, 4.5, dist)` scales the body). | C2 |
| **B1 laser fan with no emitter** | The fan converges on the real emitter: the ray at the convergence point (1580, 940) has direction (0.924, 0.005, 0.382), which matches the emitter at about (2515, 6, -700) on the east embankment (lightshow.js:315-319). That fixture is 0.9 m across, about 2 px at 470 m. | C3 |
| **A4 blue-purple slope plane** (0-600 x 380-560) | Above eye level, below the shops on the left: the bare, steep terrain embankment between the left lots and the road, shaded as wet ground (its streaks are reflections). Lots stop at their footprint; nothing retains the cut. | C4 |
| **G3 empty brown lots** (1170-1800 x 690-830) | Rays hit about (650-950, -160..90): plain land east of the Jade River that the I-016 plan leaves unbuilt because it lies west of the Ovoo line (plan.js:279-282: "land west of it is the Jade River bank, not in the plan") or inside the 400 m keep-out of the stilt site (plan.js:34, 184), which reaches across the river. It keeps bare ground and scattered forest. | C5 |
| A3 dark curved wedge (critical) | Bare terrain with road lines inside the Raffles reserved disk. | in I-031 (the landmark builds its own site) |
| A5 guideway without piers, voids | Covered by I-027 (Liziba stacked streets). | not here |

## The five fixes
- **C1. Coverage-correct thin members** (bridges.js `RIBBON_WGSL`). Today a cable thinner than 1.5 px is drawn 1.5 px wide and fully opaque, with its brightness scaled by coverage (`cover = r / w`). Instead, when cover < 1 the fragment is kept with probability cover (interleaved-gradient noise rotated each frame, so TAA resolves it), kept fragments use full steel albedo and emission / cover. The average emission stays exactly as now (so the neon fans and their water reflections keep their brightness), but the city shows through between cables: a fan becomes a glowing veil of lines, not a solid pyramid. Minimum coverage 0.04. Applies to cables and plain steel members (kinds 0 and 2); single LED lines (kind 1) keep their current behaviour. If motion shows sparkle, the fallback is a pattern anchored to the cable (along-cable metres in pixel units), which moves with it.
- **C2. Camera-proximity fade for cars and people.** The standard camera-collision fade. For cars: in the car compute pass, the distance from the camera to the car's box (not its centre) gives a per-car fade, 0 below 2.0 m and 1 above 4.0 m; the mesh discards fragments by that fade with the same dither, and the car's head and tail light sprites take the same factor. A car whose flank is 1.1 m from the lens disappears entirely, so there is no half-transparent car. For people: the 2.0-4.5 m term in crowd.js:98 stops scaling the body and becomes the same dither fade (thresholds 0.8 m to 2.0 m from the person's capsule), so no shrunken heads. The run-end fades of cars (`lp *= C.pf.w`, which also shrinks cars at the end of runs) use the dither too. In free flight the player can be anywhere, so this is a real defect, not a pose fix; it uses only the camera's own position, like any game.
- **C3. Laser show pontoons** (lightshow.js). Each of the two emitters becomes a moored show pontoon: a 24 x 9 m deck at water level, 6 m out from the embankment, held by four mooring piles, with a gangway to the promenade, a small control cabin with warm windows, a 7 m steel gantry carrying the five laser heads (each a 0.8 m housing whose aperture glows in the beam colour while it fires), an LED deck edge in the show colours and red lamps on the gantry posts. The five fan beams start at the five heads, 2.5 m apart, instead of one point. Geometry goes into the module's existing fixture mesh (G-buffer, so reflections come for free). At 470 m the pontoon is about 60 px wide and the gantry about 18 px tall: the fan now visibly comes from something.
- **C4. Street-edge retaining walls** (hillside and urban districts). A new pass at the very end of building generation, with its own stream `rng(5152)` and explicit seeds. For every lot street face, sample the ground every 4 m at the lot edge and at the kerb line (from the district grid's road width). Where the strip between them rises or falls more than 2.5 m: if the lot is higher, a sandstone retaining wall from kerb level up to the podium base, 0.5 m behind the kerb, with lit shop bays every 8 m, a stair every 40 m, a railing and lamps on top; if the lot is lower, the pavement becomes a slab deck on columns over the lot's ground with a railing (a street on top of buildings, the Chongqing way). Walls end where the drop falls under 1 m.
- **C5. The Jade east-bank strip** (plan.js). Plain land that is unbuilt only because of the Ovoo line or because the stilt keep-out reaches across the Jade River (the straight line to the stilt site crosses the river) joins the Confluence Exchange. Ovoo Hill above the 45 m contour keeps its forest (existing rule). It is processed in a second plan pass with its own stream `rng(16017)`: its lots are appended after the existing infill lots, its avenue and traffic runs after the existing runs (own car stream), its shop lights in a separate pool of 20 (the existing 80 are untouched), its signs after all others. Height rule, quay walk and pocket squares as I-016.

## Isolation
- No existing random stream changes. New parts (C4, and C5's infill) are appended after everything else and carry explicit seeds; C5 uses only new streams and appends to every list it touches; C1-C3 change shaders and module-local meshes only.
- Checks: part identity for everything before the new tail (hyd-identity style diff); car and person states at t = 100 for pre-existing runs and agents identical; existing infill lots, lights and signs identical; tower-text phrases unchanged; `functional.mjs` 18/18; no WebGPU errors.

## Target eval poses (declared rule)
Capture main and the candidate at all eval poses and run `tools/pixdiff.mjs`. **A pose is a target if at least 1.0% of its pixels differ beyond pixdiff's default threshold.** Animation is identical in both builds (no stream changes), so differences come from the fixes. The list is recorded before judging. Expected (not binding): B2, A4, A6, G1, G3, G4, probably B1 and A3 (bridge fan at the left edge). Adoption as in EVAL.md.

## Why it might work
- Every fix removes a defect a critic named, and a pairwise judge sees it directly: a slab of purple instead of a street (B2), bars and pyramids where cables should be (A6, G1), a fan from nowhere (B1), a bare slope (A4), brown waste ground in the middle of the city (G3).
- The fixes are cheap, local and rule-based, and none changes shared state, so non-target poses should not move.
- C1 keeps average emission exactly, so the neon look of the bridges (and their reflections, which are SSR of the G-buffer) survives.

## What's new about it
- No earlier idea touched the bridge renderer, the light-show emitters, near-camera fades or street embankments. I-025 (rejected) tried to make near cars and people detailed; the reviewers argued a 1.1 m car would still read as a slab or a toy. C2 does the opposite: nothing should be drawn that close to the lens.
- C5 reuses I-016's machinery on land its rules excluded; it adds no new land-use idea.

## Expected effect on the metric
Clear wins at B2 (critical defect gone: the frame shows the road ahead), A6 and G1 (placeholders become cables), G3 (the brown strip becomes city); likely wins at A4 and B1; G4 is the main uncertainty (its pink fans become veils of lines with the same brightness). Critics: the B2 critical defect and five named major defects removed; about +0.3 on zone B and G, +0.2 on zone A.

## Quick test
0. **Identification** (diagnostic only, no tuning): capture A6, G1, A4 and B2 with `--query disable=bridges`, then `disable=traffic`, and confirm what disappears. If the A6 bars are not the bridge, record what they are and fix them in the module that draws them by the same rule (true thickness, visible support).
1. C1 alone on held-out cameras placed by rule: 500, 1000 and 2000 m from each pylon of the Peninsula South and North Cable bridges, at three bearings, 30 m and 300 m up, plus one moving camera (3 m per frame). Continue if fans read as lines and the moving frames show no sparkle.
2. C2 on a held-out street camera at 1.7 m on a CBD road centre line, a burst of 20 times: no car or person drawn within 2 m, no ghosted half-car.

## Implementation plan
1. Quick test 0.
2. C1: in `RIBBON_WGSL` pass a stable per-pixel noise (and the frame index, if F lacks one, from the TAA jitter) to `fs`; discard by cover; albedo and emission as above.
3. C2: `trafficCars.js` compute pass computes the box distance and stores the fade in `pf.w`'s place; the mesh stops scaling by it and discards instead; lamps multiply by it. `crowd.js`: the same for people (line 98 and `sc` in line 241).
4. C3: `lightshow.js` `fixtureMesh()` gains the pontoon; laser origins move to the gantry heads.
5. C4: `streetEdges(B, world, rng(5152))` after `genInfill`.
6. C5: second plan pass in `plan.js`; consumers (buildings_infill, signPlace, trafficCars, vegetation stamps, ground paint) read the appended lots last.
7. Checks listed under Isolation; bench in alternating pairs under the GPU lock; targets by the pixdiff rule; evaluation.
Each fix can be switched off by a constant, so a fix that loses on its held-out views is dropped before judging.

## Cost
- Effort: medium (five small, separate changes).
- GPU: about +0.10 to +0.15 ms average (gate: avg 11, p99 16.7, max 25; current about 9.8). Where it comes from: C5's infill, about 40-80 lots (about 600 parts) and 20 lights, about +0.05 ms G-buffer and +0.03 ms lighting; C4, a few hundred wall parts, about +0.03 ms; C3, about 400 triangles, negligible; C1 and C2 add a dither test and draw fewer pixels, about 0. No new pass, no new full-screen work.

## Risks
- **Bundling.** Six or more targets need about two thirds won. Each fix is aimed at a named defect in its own pose, so wins are independent, but small fixes (B1's pontoon, A3's fan) may tie.
- **G4 could lose** if a judge prefers the solid pink sails to the veils. Average emission is unchanged, which limits the risk.
- **Dither noise in motion** (C1, C2). TAA resolves it on stills; the fallback for C1 is the cable-anchored pattern; C2 fades whole objects over a short range, so it rarely shows.
- **Overlap.** C4 touches ground the terrain idea may also reshape; C5 touches land the riverbank or park ideas may claim. The coordinator should merge only one owner for each.
- **A6 identification may be wrong** (quick test 0 settles it before any work).
