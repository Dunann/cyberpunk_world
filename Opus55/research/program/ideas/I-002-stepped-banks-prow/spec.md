---
id: I-002
title: Stepped banks and the confluence prow: the steep peninsula banks become built terraces
status: proposed
direction: Break an assumption (terrain under the city; zone A first)
family: designed landform: stepped quay terraces in the heightmap, faced with wall geometry
parent: none
proposed_by: idea generator
date: 2026-11-24
---

# I-002: Stepped banks and the confluence prow

## Idea
The terrain generator treats every bank the same way: a 5 m quay wall, then a smooth ramp up to whatever the natural land height is. Where the hillside district meets the Great River, that ramp is a sheer slope of 60–80 m in 50 m (measured below). Nothing can stand on it, so it is the bare dark slab under the towers in A3 and the "cake edge" of the peninsula in the aerial views.

Break the assumption that the ground under the city is natural. On the Great River side of the hillside district, cut the bank into **built terraces**: flat treads 14 m deep, 9 m apart in height, climbing from the quay to the plateau. This is how the real Chongqing riverfront is built (stepped quays, retaining walls, stair streets). The work has four parts:

1. **Heightmap.** One extra `min()` in the bank-carving function replaces the smooth cliff with a stepped profile. The treads are real ground: walkable, flat, and usable by lots, trees and props.
2. **Wall geometry.** Each riser is faced with a crisp retaining wall, parapet and coping, built by the existing embankment extruder at further offsets from the bank. Lower walls carry lit vaulted arches (riverside vault shops); every tier carries a row of lamps.
3. **Stairs.** Every third cross street of the district grid continues down the terraces as a stair street, a straight ramp in the heightmap painted as flights and landings.
4. **The prow.** At the peninsula tip the terraces are free of buildings (the tower landmark reserves the land), so they form a civic place: a monumental stair on the axis of the tower row down to a ferry concourse with pontoons, tiers lined with light, and a top terrace that gives the towers the plinth they lack.

The Hongyadong cliff on the Jade River side is left as it is.

## Why it might work
- **Critics' finding 1** (both reviews): the terrain under the peninsula tip is "a smooth, featureless dark slab or mound"; "towers end at the hill crest with no podium or plaza"; quays have "no steps, moorings, boats or piers". Finding 3: "flat plinths with cake-like straight edges", the city "looks flat, not stacked on hills". Terraces lined with lamps are the most direct way to make a hill read as built and stacked, at night, from far away.
- **Measured bank cross-sections** (height in m at distance inland, baseline build):

  | Bank | 10 m | 20 m | 40 m | 60 m | 100 m | 200 m |
  |---|---|---|---|---|---|---|
  | Tip, south-east face | 9 | 17 | 46 | 77 | 81 | 71 |
  | Tip, south face | 13 | 32 | 66 | 69 | 75 | 85 |
  | Peninsula south bank, x = −300 | 15 | 31 | 44 | 47 | 51 | 65 |
  | Peninsula south bank, x = −900 | 6 | 7 | 10 | 18 | 35 | 48 |
  | Nan'an bank (not hillside) | 6 | 7 | 12 | 18 | 29 | 28 |

  With treads of 14 m and risers of 9 m (a 33° average slope) the stepped profile only cuts where the bank is steeper than that. The gentle hillside bank (x = −900) lies below the step line from the first riser on, so `min()` changes nothing there except that the first 24 m become a level quay. Banks outside the hillside district (last row) are not touched at all.
- **The precedent exists in the code.** `landHeight` already quantizes tea terraces with `floor(t) + smoothstep(...)`, and `lakeLandforms` adds designed causeways and islands to the heightmap. `terrainBank.js` already extrudes a wall, parapet and deck along an offset of the bank and gives them lamps and colliders.
- **Lots are not disturbed.** The step level is never below the quay level (5.8 m), so the lot test `h < 2.5 → reject` cannot flip for any cell. The same cells are accepted, the shared random stream stays aligned, and only the ground heights of lots near these banks change. The rest of the city is bit-identical.
- **The terrain mesh can show it.** The finest terrain patches have 2 m vertex spacing; the heightmap has 3 m texels. A 14 m tread is 4–5 texels. The 3 m riser ramp is hidden behind the wall geometry.

## What's new about it
- **Closest idea: I-004** (Hongyadong cliff town). It rebuilds the stilt complex on the Jade River cliff with building parts and "deliberately does not edit terrain or the bank". This idea is the complement: it changes the terrain itself, on the other side of the tip (facing the Great River and the confluence) and along the peninsula's south bank, and it builds a public place rather than a building. The two meet at the tip: where the terraces end against the Jade cliff, the cliff top steps down toward the prow, and I-004's section-based generator follows whatever terrain it finds.
- **Closest existing code:** the single-tier `Embankments` and the tea-terrace quantization.
- **Different from I-001 and I-003:** those treat flat banks (with buildings and parks). This one treats steep banks, which neither can use.

## Expected effect on the metric
- **Targets: A3, G2, G3** (adopt needs wins on 2 of 3).
  - A3: the centre and left of the frame change from a bare mound to lit terraces, a monumental stair, a ferry concourse and a plinth under the towers. This pose carries most of the effect.
  - G2: the tip is in the middle distance, left of centre. Rows of lamps and lit vaults step up from the water under the towers and reflect in the river.
  - G3: the dark band along the peninsula's south bank becomes stepped, lit tiers. A small part of the frame.
- **A1:** the left third changes (the cliff top steps down toward the prow). A2: almost no change. Neither is a target.
- **Critic scores:** A3 coherence and detail should each rise by 1–1.5; zone A mean by about +0.2 from A3 alone.

## Quick test
Half a day, heightmap only:
1. Add the stepped profile (plan step 2) with no shading, walls or props.
2. `node tools/probe.mjs --grid` over the tip (x 0..400, z −100..250, step 10) and the south bank at x = −300. Check: flat treads at 5.8 + 9k, the tower sites and the monorail end unchanged, the stilt site still found at the same place.
3. Print the lot count and the first 20 lot seeds; they must equal the baseline's.
4. Capture A3, G2 and two cameras that are not eval poses: one on the top terrace looking down the stair, one from a boat due south of the tip. Even with plain rock shading, the stepped form should read clearly and the towers should appear to stand on it. If the treads look like a quarry rather than a base, change tread and riser sizes before building the rest.

## Implementation plan
1. **Per-river distance** (`world.js`).
   - Put a river index in the unused `Seg.b.w` (0 Great River, 1 Jade River, 2 canal).
   - Add `waterDistTo(p, river)` to `GEN_COMMON` and `World.waterDistTo(x, z, river)` on the CPU: distance to one river's bank only.
   - Add layout data `QUAY_STEPS = { river: 0, q0: 27, tread: 14, rise: 9, riser: 3.2, maxTiers: 10 }`.
2. **Stepped profile** (`CARVE_WGSL` in `terrainLand.js`, called from `GEN_HEIGHT`).
   - Compute `dG = waterDistTo(p, 0)` exactly in `GEN_HEIGHT` (not from the 6 m info map) wherever the hillside weight is above zero and `dG < q0 + maxTiers * tread`.
   - `u = max((dG - q0) / tread + 1, 0)`; `step = 5.8 + rise * (floor(u) + smoothstep(1 - riser / tread, 1, fract(u)))`. This gives a level quay at 5.8 m out to `q0 − riser`, then tread k at `5.8 + rise * k` from `q0 + (k − 1) * tread` to `q0 + k * tread − riser`, with a 3.2 m riser ramp in front of each tread.
   - The existing carve computes `land = mix(shore, landH, smoothstep(wall, wall + soft, wd))` from the distance to the nearest water of either river. Its smooth ramp must not be applied on the Great River side, or it would bend the treads (at the tip `soft` is 55–90 m because the hillside weight there is only 0.35–0.8). So, in the stepped zone:
     ```
     rampJ   = mix(shore, landH, smoothstep(wall, wall + soft, dJ))   // Jade-side cliff, as today (dJ = waterDistTo(p, 1))
     stepped = min(rampJ, step)                                        // Great-side bank: steps
     stepW   = smoothstep(0.05, 0.3, hillW)
     land    = mix(land, stepped, stepW)
     ```
     The quay wall in the first 5 m stays as it is. Where terraces reach the Jade cliff they simply end at it. Where the hillside weight fades out (the west end of the district's bank) the steps fade into the old ramp.
   - `carveWater` gets the extra inputs (`dG`, `dJ`, stair weight); the far-field call in `terrainGen.js` passes values that switch the steps off.
3. **Stair streets** (`GEN_HEIGHT`).
   - In the district's grid frame, a corridor of ±5 m around every third road line that runs toward the river.
   - Inside it, replace `step` by the straight ramp `5.8 + (rise / tread) * max(dG - (q0 - tread), 0)`, which passes through the front edge of every tread (33° if the street meets the bank at right angles, gentler otherwise). Check that the walking controller climbs it; if not, lengthen the ramp by starting it lower on each tread.
   - **Grand stair:** one corridor ±15 m wide on the line from the `raffles` landmark site at right angles to the Great River bank. It is anchored to the landmark, not to any camera.
4. **Wall geometry** (`terrainBank.js`).
   - For each existing promenade run on the Great River's north bank, and each tier k = 1..maxTiers, offset the stations inland by `q0 + (k − 1) * tread − riser − 0.2` (the foot of the riser ramp).
   - Keep a station only where the terrace is real: `heightAt` 3.5 m behind it is within 0.6 m of level k, and 1.5 m in front of it is at or below level k − 1 plus 0.6 m. Skip stair corridors.
   - Extrude the existing profile, scaled to the tier: wall face from level k − 1 (minus 0.6) to level k plus parapet, parapet top and back, and a 3.6 m coping deck at level k that covers the heightmap's riser ramp. Encode the tier in the face id.
   - Close open ends and corners with a round bastion (one extruded half-cylinder, radius 4 m), which also hides small mismatches between the traced walls and the heightmap.
   - Colliders: parapet and coping per 16 m, as for the promenade.
   - Lamps: one per 22 m of parapet on every tier, added to the existing lamp list. They share the existing pool of real lights (nearest 160) and the analytic pools; generalize the fixed `DECK_Y` in the shader to the tier height.
5. **Wall material** (`BANK_WGSL`, face 0, by tier).
   - Tiers 1 and 2: a vaulted arch every 9 m (2D arch shape in wall coordinates), dark inside with a warm lit back wall and a signboard band above. About one in five is shuttered.
   - Upper tiers: buttress pilasters every 9 m, weep holes and water streaks (the streak code exists), patches of hanging vines near the top.
   - All tiers: a thin warm LED line under the coping, widened to at least one pixel at distance with its brightness scaled down, as the bridge cables do.
6. **Tread and stair ground** (`groundShade` in `terrainShade.js`).
   - Terrace mask: hillside owner, `dG` inside the stepped range, and height within 1 m of a tread level. Compute it inline, or bake it into a spare value of the terrace channel in `bakeNear` (implementer's choice).
   - Treads: large stone slabs, a dark drain line at the wall foot, a strip of planter beds along the parapet. Do not paint the district's cross streets on treads except in stair corridors.
   - Stairs: step lines from height bands (`fract(p.y / 0.16)`), faded out by pixel footprint as the rock strata are; a landing band at every tier; two lit handrail lines.
   - `bakeNear`: no forest on treads or stairs.
7. **Planting and props.**
   - Trees: rows of fixed trees in the planter strips at 11 m spacing, published through the existing `world.shared.gardenTrees` list (the vegetation module already draws it and keeps the random forest off reserved rectangles).
   - Prow concourse (level 0 at the foot of the grand stair): three floating pontoons with gangways and four moored boats, built as static parts in `buildings_landmarks.js` (call it from `genLandmarks`), plus a slim light mast at the head of the stair. Original designs; about 300 parts.
   - Add 4 point lights at the concourse from the buildings budget at high priority.
8. **Stilt site.** Leave the `stilts` hint in `LANDMARKS` alone. The search picks the bank point with the largest rise minus a distance penalty; the stepped cut only lowers the rise on the Great River side, so today's site (245, −135) on the Jade side still wins. The quick test confirms it.
9. **Checks before hand-off.**
   - All 14 poses captured. A4, A5, A6, B1–B4, G1 and G4 must match the baseline.
   - Walk test: from the promenade up the grand stair to the top terrace, and along a tread; no falling through, no invisible walls.
   - `functional.mjs` 18/18.

## Cost
- **Effort:** one implementer, about 3 days: heightmap and stairs 0.5, walls and lamps 1, materials 1, prow props and tuning 0.5.
- **GPU (budget 11 ms average, about 1.3 ms headroom).** Baseline at A3: 9.14 ms total, gbuffer 2.60, lighting 2.86.
  - **Wall geometry:** about 2.5 km of bank × up to 8 tiers, about 40–60k triangles in the existing embankment draw. Under 0.03 ms.
  - **Pixels:** walls and treads replace terrain pixels that were already shaded by the ground shader, which is the costlier of the two. Roughly neutral; allow +0.03 ms at A3 for the arch and stair code.
  - **Lamps:** about 600 more instanced globes; no new point lights (the 160-light pool is shared). The CPU loop over lamps grows from about 1200 to 1800 entries per frame, which is negligible.
  - **Props and trees:** about 300 parts and 300 fixed trees. Under 0.02 ms.
  - **Expected:** at most +0.08 ms at A3 and G2, about +0.03 ms on the fly-through average.
- **Load time:** exact river distance for the stepped zone only; under 0.05 s.

## Risks
- **It may read as a quarry.** Bare treads without buildings can look like a mine. The tip is free of lots by design, so the lamps, lit vaults, planters and the stair must carry it. The quick test checks the form before the detail work.
- **The cut reaches the plateau.** On the tip the plateau edge moves from about 60 m to about 125 m inland. Checked against the baseline height data: the six tower bases, the monorail end and the stilt site all lie where the step level is above the present ground, so none is cut. The closest is the southern tip tower at (150, 45): about 163 m from the Great River, ground 81 m, step level 96 m. The probe in the quick test must confirm this on the real build.
- **Junction with the Hongyadong cliff.** Near the prow the Jade-side cliff becomes lower in 9 m steps. The current stilt columns adapt (their height comes from `heightAt`), and so does I-004, but A1's left third will look different. If I-004 is adopted first, re-check where its walker ends: terraces also rise more than 15 m in 60 m, so its complex could continue around the prow. Cap its length at the first terrace wall if so.
- **Heightmap resolution.** Risers are 3 m ramps in the height data. The wall geometry hides them, but any stretch without a wall (rejected stations, stair edges) shows a steep ramp with stretched texture. Give stair corridors side walls from the same extruder.
- **Lots on treads.** Hillside lots within about 90 m of the south bank now stand on flat treads or straddle a riser. Straddling lots get a 9 m podium side (`terracedPodium` handles this). If it looks wrong, drop lots whose `gMax − gMin` exceeds 7 m inside the stepped zone; do this as a filter after generation so the random stream is not disturbed.
- **Scope.** The idea changes only the Great River side of the hillside district. That is deliberate (zone A first), but it means only A3 changes strongly. If A3 wins and G2 and G3 tie, the adoption rule rejects the idea; the coordinator may want to judge it on A3 with G2 and G3 as supporting poses.
