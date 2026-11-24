---
id: I-031
title: Original hero landmarks - seven near-replicas redesigned around one idea each, and the empty tip of the Raffles site built as terraces
status: rejected
score: 5.33 (review-1 5.00, review-2 5.67; mean; below 7; revision requested: user rule "inspired by, never replicas")
direction: Attack the weakness (critic 2: near-replica landmarks; critic 1 change 8; critical A3 wedge)
family: landmark design: bespoke part assemblies with index-slot isolation
parent: none
proposed_by: idea generator
date: 2026-11-24
---

# I-031: Original hero landmarks

## Idea
Critic 2 found that the seven hero towers copy real buildings, which breaks the user's standing rule (inspired by, never replicas; the pairwise judge's brief says the same). The copies are easy to place in the code, and each was confirmed by projecting the landmark's position into the named eval image:

| Code (`buildings_landmarks.js`) | Site | Reads as | Seen in |
|---|---|---|---|
| `twist` (three-lobed, twisting, sky gardens, fin fork) | 3250, -1350 | Shanghai Tower | B1, B3, B4, G3 |
| `truss` (four triangular shafts with sloped tops, twin masts) | 3020, -1780 | Bank of China | B2, G3 |
| `twin` (star plan, tiered, truss skybridge, pinnacles) | 3560, -880 | Petronas | B3, G3 |
| `crystal` (rotated hexagon stack with a diamond lattice) | 900, -1150 | Canton Tower (G2 x = 2170 px) | G2, G3 |
| `raffles` (towers in an arc, horizontal vault, two tall flank towers) | 220, -60 | Raffles City | A1, A2, A3, G1, G2 |
| `beacon` (shaft, one doughnut pod, banded antenna) | -1250, -900 | CN Tower (G3 x = 180 px, A6 x = 970 px) | A6, G3 |
| `ridge` (rounded square, tapering, lit cap) | -600, -260 | Salesforce (A6 x = 1176 px) | A6 |

Each is replaced by an original design that keeps the one idea worth keeping (twist, triangulated steel, a linked pair, crystal facets, a linked cluster, a hilltop lantern, a hillside tower) and is built from sculpted crowns, setbacks, fins and lit spires instead of glass shafts outlined with neon edge strips (`FLAG.EDGE`). The other landmarks (`crown`, `tvtower`, steppe and garden landmarks) are not changed.

The same idea fixes the critical **A3 "dark curved wedge"**. It is not a model: it is bare terrain at the peninsula tip, painted with road lines and zebra crossings (visible in a zoom of A3), at about (250-350, 50-150). That ground lies inside the Raffles site's reserved disk (r = 190 m; distance from the site centre about 180 m), so `_isReserved` (world.js:368) keeps lots off it, vegetation stamps it clear (vegetation.js:374) and traffic avoids it (trafficCars.js:323), but the Raffles assembly only covers its tower row. The same ground is the dark "tray" under the towers in G2 (rays from G2 hit (200-440, 30, 60-140)). The redesigned Raffles fills its own site with lit terraces stepping down to the confluence.

## Why it might work
- The judge brief explicitly rewards original landmarks, and critic 2 marks the replicas as a brief violation in 9 of 14 poses. A replica is a defect a strict judge can name; an original tower with a readable silhouette is a gain on character and brief at once.
- Critic 1's change 8 asks for exactly this vocabulary (crowns, setbacks, fins), and the I-018 judges preferred main where it kept "an Art Deco crowned spire tower", so crowns are what judges notice.
- The A3 wedge is the single largest placeholder in zone A (about 4% of A3) and the G2 tray; building on it removes a critical defect in the zone with the most weight.
- The work is local: a few hundred parts at known sites, no change to lots, plan, traffic or any shared random stream.

## What's new about it
- Earlier silhouette ideas (I-005 kits, I-013 crown library, I-017 crown swap) changed many generic towers by rule and were rejected because the change was thin and spread over hundreds of towers. This idea changes only the seven heroes, each a large bespoke design, and is driven by a concrete brief violation, not by variety.
- I-019 (linked tower pairs) repeated one motif many times; here every link is unique to one landmark.
- No earlier idea built anything on the landmark reserve disks.

## The seven designs
All heights are above local ground g. "Lit ledge" = 1-1.2 m `MAT.EMIT` band at a setback. No landmark shaft keeps `FLAG.EDGE`; light comes from ledges, fins, crowns (`MAT.CROWN`, `FLAG.CROWNLIT` uplight wash) and spires.

1. **Braid** (replaces `twist`). Two slender shafts wind half a turn around each other: plan rounded rectangle 40 x 28 m (kind 0, prm 0.6) tapering to 0.6, centres on a helix of radius 15 m, the second shaft offset by 180 degrees. Each shaft is 14 segments of 38 m; segment k starts at helix point k, leans (`lx`, `lz`) to point k+1 and twists by the same angle, so the long side stays tangent to the helix. Four sky-garden collars (kind 2, prm 48, radius 37 m, 7 m, green glass with a lit balustrade and garden trees) clasp both shafts at segments 3, 6, 9, 12. Crown: shaft A ends at 540 m in a `MAT.CROWN` lantern with three short lit blades; shaft B stops at 500 m in a pointed cut (taper 0.15); a lit clasp joins them at 495 m; a spire with five ring lights rises from A to about 660 m, so it stays the tallest CBD top. Not Shanghai Tower: no lobed plan, no notch, no single tapering body, no fin fork.
2. **Tripod Lantern** (replaces `truss`). Three triangular legs (kind 4, 18 x 26 m, `MAT.TRUSS` diagrid) stand at the corners of a 42 m-radius triangle and lean inward to meet at 300 m. Two glass sky-lobby rings tie them at 110 m and 210 m. Above the meeting point sits a 55 m triangular glass lantern (`MAT.CROWN`, taper 0.55) and a 45 m mast with three ring lights. A triangular glass atrium fills the space between the legs at the ground. Not Bank of China: no square plan, no quadrants stepping to sloped tops, no twin masts.
3. **Offset Pair** (replaces `twin`, same 80 m separation and axis). Tower A: chamfered square (kind 1), 440 m, three setbacks with warm lit ledges, a sloped glass crown cut toward the river (taper 0.25, lean 10 m) with seven vertical lit fins. Tower B: 16-sided, 360 m, tapering, a recessed lit "waist" at 230 m, a lit halo ring floating 14 m above the roof on four masts, and a spire. They are joined by a four-storey glowing Sky Hall at 160 m (glass, lit floors, roof garden) and a slim lower bridge at 95 m on the other side, plus a cantilevered glass observation prow off tower A at 300 m. Not Petronas: different plans, no star plan, no tiered pinnacles, the link is a hall.
4. **Shard Cluster** (replaces `crystal`). Three faceted hexagonal shards grow from one faceted podium, like a quartz cluster: the main shard tapers continuously to a point at about 620 m with a spire to 670 m (keeps the height), two companions (380 m and 250 m) lean 6 and 9 degrees away from it. Lit "fracture bands" (violet rings) at three heights; in the crystal shader (mat 18 only) the seams are brightest on the facet edges and fade in the middle of faces, so the facets read and the whole tower no longer reads as one lattice. Not Canton Tower: no single hourglass lattice, no rotated stack.
5. **Prow Terraces** (replaces `raffles`; see the constraint below). The four row towers keep their base positions and footprints; their heights now rise landward (east tower lowest), so the cluster reads as a prow climbing the hill. The horizontal vault and sky tubes are replaced by a "sky stair": three glass galleries linking neighbouring towers at increasing heights (150, 185, 220 m above the plateau), each with a shallow vault roof, a lit underside and a roof garden. Each tower ends in a sloped crown facing the confluence (different slope per tower) with lit fins; the two flank towers become lower stepped "gate" towers with terraces on the confluence side. **Confluence Steps:** the empty tip of the site gets a terraced podium. On a 6 m grid inside the reserved disk, on land with water distance of at least 8 m, at least 12 m from the Hongyadong complex's pieces and 6 m from every tower, each cell takes the terrace level floor(h / 8) x 8; runs of equal level become terrace blocks (sandstone `MAT.MASONRY` retaining faces with a row of lit arcade bays, a lit balustrade, lamp posts every 18 m, roof gardens). A 16 m grand stair (MASONRY with stair treads, winW 1) runs down the steepest line to the promenade.
6. **Lantern Mast** (replaces `beacon`). Same footing and 235 m octagonal concrete shaft; instead of one pod, three stacked lantern pods of decreasing size (radius 15, 12, 9 m) at 150, 195 and 232 m, each a flattened sphere (prof 2) in warm red with a flared gold eave ring and eight vertical gold ribs (a Chinese palace lantern), then a slim stepped mast with ring lights. Not CN Tower or KL Tower: no Y-plan, no single doughnut pod or bulb.
7. **Terrace Ridge** (replaces `ridge`). A rectangular chamfered slab (60 x 36 m). Its uphill side steps back in five 24 m terraces with roof gardens and lit balustrades; the downhill face stays sheer with three full-height lit fins. Crown: a roof plane sloping toward the river, framed by two lit blades and a mast, keeping the pink crown colour. Not Salesforce: no rounded square, no taper to a lit cap.

## Isolation rules (so nothing else changes)
- **Part indices.** Parts added without a seed take one from their index (`buildings_gen.js:32`), and landmarks are generated first, so changing a landmark's part count would re-seed every later part. As `placeComplex` does: each landmark is built into a collector; the first N_old parts go into the landmark's old index slots (padded with empty parts if fewer); the rest are appended at the very end of `generate()`, after `genInfill`. Every appended part gets an explicit seed.
- **Props.** The old landmarks spent props from the shared budget (`av()`, the twist's 45 garden trees, about 56 in total). `B.props` is advanced by exactly the old count; new landmark props come from their own counter (cap 1,500), like the complex's `PROP_CAP`.
- **Lights, tops, LED entries.** Each landmark adds the same number of lights with the same priority (positions may move: Raffles moves 2 of its 4 lights to the Confluence Steps), and pushes the same number of `B.tops` and `B.led` entries with the same flags. So the city light budget, the shop-light shuffle and the searchlight count stay as they are; searchlights move onto the new crowns.
- **No random stream.** None of the seven functions call the shared stream R today, and the new ones must not. The plinth uses its own `rng(7301)`. `LANDMARKS` (positions and r) is unchanged, so lots, the plan's keep-outs, vegetation and traffic are unchanged.
- **The Hongyadong complex must stay identical.** `hongyadong()` treats solid landmark parts placed before it as obstacles (`buildings_stilts.js:406-430`) and builds podiums and skirts for them. Rule: every part the complex lists as an obstacle today keeps its geometry fields (x, y0, z, angle, hw, hd, h, lean, kind, prm, taper); material, colour and flags may change. New parts in the old slots must not enter the complex's volume. The appended tail is created after the complex, so it is never an obstacle. `tools/hyd-identity.mjs` must show all complex parts identical.
- **Tower text (I-014).** Any landmark part that carries a character today keeps its position, plan size and orientation over the character band plus margin (changes happen above). After the build, `selectTowerText` must give the same 6 phrases on the same towers; if a redesigned landmark joins or blocks a phrase, the implementer reports it, and the result is accepted only if there are still at least 6 phrases and 江上月 at B1 is unchanged.

## Target eval poses (declared rule)
Add a dev flag `?lmmask`, built like `devMaskComplex`: the seven landmarks' parts (old slots and tail) are painted flat magenta, everything else black. Capture the mask on main and on the candidate at every eval pose. **A pose is a target if the mask covers at least 1.0% of the frame in either build.** Compute and record the list before any judging and before looking at normal captures of the candidate. Expected by projection (not binding): A1, A2, A3, A6, B1, B3, B4, G2, G3; probably not B2, G1, G4. Adoption as in EVAL.md: at least 2/3 of targets won and no clear loss elsewhere.

## Expected effect on the metric
- Pairwise: clear wins at A3 (critical wedge gone, prow terraces), B4 and B1 (the Braid is large in both), G2 (tray and lattice tower); likely wins at A6, B3, G3; A1/A2 change only above the stack's skyline (galleries and crowns instead of the vault underside), so ties are possible there.
- Critics: removes one critical defect (A3) and the brief violation named in 9 poses; +0.3 to +0.6 on zone A and B means through character and brief; detail rises where the plinth replaces bare ground.

## Quick test
Before building all seven: build Prow Terraces with the Confluence Steps, and the Braid. Capture held-out cameras only (no eval poses), placed by rule for each landmark: from the nearest water, 700 m from the site centre, 20 m up, facing the site; aerial, 900 m away and 300 m up, at two bearings 60 degrees apart; street level 250 m away. Run hyd-identity and the tower-text check. Continue only if the complex is identical, the phrases hold, and the held-out images show the Steps grounded on the slope (no floating terraces, no clipping into the complex) and the Braid readable as two shafts.

## Implementation plan
1. **Baseline facts on main** (dev build, log only): for each of the seven landmarks, its part index range and count, props, lights, tops and LED entries; the part indices the complex lists as obstacles (`o.part` of `kind: 'land'`); the landmark parts in `world.shared.towerText.glyphs`.
2. **Collector and tail** in `buildings_landmarks.js`: `placeLandmark(B, L, buildFn, old)` fills old slots, pads, defers the rest to `B.lmTail`; asserts the light, top and LED counts; advances `B.props` by the old count. `finishLandmarks(B, world)` is called at the end of `generate()` after `genInfill`: it builds the Confluence Steps (it can read the complex's pieces) and appends the tail.
3. **The seven designs** as above, one function each, sized with the numbers given.
4. **Shader:** crystal seam weighting (mat 18 branch only). No other shader change.
5. **Checks:** hyd-identity; a part-identity diff of everything outside the seven old ranges and the tail (identical to main); lots, infill lots, traffic runs and light list identical; tower-text phrases; `functional.mjs` 18/18; no WebGPU errors; bench in alternating pairs under the GPU lock.
6. **Targets** by the `?lmmask` rule, then the evaluation.

## Cost
- Effort: large (seven bespoke assemblies, a terrace generator, the slot mechanism).
- GPU: about +0.1 ms average (gate: avg 11, p99 16.7, max 25; current about 9.8). Where it comes from: about 600 new landmark parts plus about 1,500 plinth parts and props, against about 150,000 parts; culling is per part (under +0.01 ms); G-buffer cost is mostly pixels, and the new surfaces mostly replace pixels that already cost something (glass shafts, bare terrain at the tip), estimated +0.05-0.1 ms over the fly-through. Lights, text overlay and post are unchanged, so the lighting pass (3.4 ms) does not grow.

## Risks
- **Identity with the complex.** If a Raffles tower the complex treats as an obstacle cannot keep its footprint, the complex changes and A1/A2 (I-015 wins) are at risk. The rule above avoids it; hyd-identity is the check.
- **Many targets.** About nine targets means about six wins are needed. A1 and A2 may tie because only the upper towers change. The 1% threshold was chosen so that every pose where a replica is visible is judged.
- **New designs may still remind a judge of something.** A braided pair or a tripod has loose precedents; the test is "not a copy", and each design drops the signature features listed.
- **The Steps may look like a stepped pyramid** if terraces are too regular. The contour rule makes them follow the ground; the arcade bays, lamps and the grand stair break them up.
- **Overlap with the terrain and riverbank idea:** the Steps sit on whatever terrain exists inside the reserved disk; if that idea reshapes the tip, the Steps follow it, since they are computed from `heightAt` at build time.
