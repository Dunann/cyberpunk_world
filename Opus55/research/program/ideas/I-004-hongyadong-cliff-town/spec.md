---
id: I-004
title: Hongyadong as a grounded cliff town (terraces built from cross-sections, with a support solver)
status: rejected
score: 5.83 (review-1 5.33, review-2 6.33)
direction: Attack the weakness (user priorities 1 and 2)
family: procedural landmark rebuild: section-first terraced grammar with structural support rules
parent: none
proposed_by: idea generator
date: 2026-11-24
---

# I-004: Hongyadong as a grounded cliff town

## Idea
Throw away the current stilt complex (`stilts()` in `buildings_landmarks.js`: about 17 columns of identical boxes, each with a hip roof and four lanterns, stepped 7.5 m inland per tier, stuck onto a bare slope) and generate a new one that is designed the way the real Hongyadong is built: as a single long building that climbs the cliff in terraces, from stilt frames at the river up to a plaza at the top of the cliff that joins the upper city.

The generator works from cross-sections of the real terrain, not from a grid. It samples the bank every few metres, cuts the slope into shared terrace levels, fills each terrace with a row of varied house units, and joins the levels with galleries, stairs, a lift tower and a top plaza. A **support solver** runs as each piece is placed. It checks what is under the piece (rock, a masonry terrace, or a unit below) and adds stilts, braces, brackets or masonry plinths until every piece is carried. Nothing can float, and none of the slope inside the complex is left bare.

## Why it might work
- Both critics' top finding (baseline-findings §1–2) is exactly this complex. They describe stilt houses "stuck onto a black wall", with no stilts, stairs, retaining walls, terraces or walkways, upper rows reading as "floating strips of windows", and "the same module copied 80+ times". A1 and A2 scored detail 4 and coherence 4 from critic 1, the lowest scores in zone A.
- The concept already works (critics: "warm stilt complex and its reflection works as a concept"). Only the construction is wrong, so a rebuild keeps the mood and removes the defects.
- Four visual cues make a stacked hillside building look real, and the current version has none of them: continuous horizontal galleries, vertical structure reaching the ground (stilts and columns), layered roofs at different heights, and visible retaining masonry. Each one is cheap to make from existing part types (boxes, round columns, leaning braces, the `prof: 4` upturned roof).
- The support solver makes "attached properly" a property of the generator rather than of hand-tuning, so the result holds wherever the site search lands, including after the waterfront ideas (I-001..003) change the bank.

## What's new about it
- **Closest existing code:** the current `stilts()` (a regular grid of tiers) and `terracedPodium()` in `buildings_gen.js` (splits a lot into 2–4 strips with a rail and an optional stair).
- **Differences:**
  - Terrace levels are shared along the whole complex, so galleries run continuously.
  - The slope is covered from river to crest.
  - Units come from a grammar with clustered variation rather than repeating one module.
  - Circulation is modelled (galleries, stairs, lift, bridge, plaza).
  - An explicit support check guarantees grounding.
- No earlier idea in this program touches the complex. I-001..003 work on the city layout and the waterfront, and this spec deliberately does not edit terrain or the bank.

## Expected effect on the metric
- **A1 and A2:** large gains in pairwise judging. They are the poses where the complex fills the frame. Critic scores should rise about +1.5 for detail and coherence and +0.5 to +1 for character.
- **A3** (complex in the middle distance at the confluence): a clear gain, mostly in coherence.
- **Zone A:** the zone mean should rise by roughly +0.4 to +0.6, which is at or above the 0.5 smallest real improvement.
- **Other poses:** no change, since the complex is not visible from them.

## Quick test
Build only the skeleton first: site, sections, terrace platforms, plain house boxes, the support solver and its log. Leave out dressing, lights and new materials.
1. Capture A1 and A2, plus two custom cameras that are not eval poses: one looking along the bank from upstream at low height, and one from the top plaza looking down.
2. Pass if all of these hold:
   - No bare slope is visible inside the complex's extent.
   - The solver log reports 0 unsupported pieces.
   - The buildings gbuffer time at A2 (`--stats`) rises by no more than 0.3 ms.
3. About half a day of work.

## Implementation plan
Put the new generator in a new file, `src/buildings_stilts.js` (the `buildings_` prefix is allowed), and call it from `genLandmarks` in place of `stilts()`. Delete the old function.

1. **Site.**
   - Keep the current steepest-bank search.
   - From the best point, walk along the bank in both directions in 4 m steps, keeping the water distance about 10 m, as the current code does.
   - Keep walking while the terrain rises at least 15 m within 60 m inland. Clamp the length to 200–420 m.
   - Each step is a *station* with:
     - its bank point
     - a smoothed tangent and an inland normal
     - the promenade height `g0`, from `heightAt` at the bank point.
2. **Sections.**
   - At each station, sample `heightAt` along the inland normal every 2 m, out to 140 m.
   - Find the crest: the first point after the main rise where the slope falls below 0.15.
3. **Shared terrace levels.**
   - `y_0` = the median `g0` + 1.5 m.
   - Level spacing `H` = 2 floors × 3.6 m = 7.2 m.
   - The top level is snapped to the median crest height, so the top terrace opens onto the upper street. Any remainder goes into a taller stilt storey at the bottom.
   - Level count is usually 5–9.
4. **Terrace bands.**
   - For level k at each station, find the inland distance `x_k` where the terrain reaches `y_k`.
   - Band k covers inland distances `[x_k - 3, x_{k+1}]`.
   - Build the band's platform from **masonry segments** about 12 m long that follow the bank curve:
     - each is a part with its top at `y_k` and its bottom at the lowest terrain under it minus 2 m (filled down into the ground);
     - add `solid: true` so walking works.
   - Where a band is shallower than 4 m, merge it into the band above.
   - Above the top band, and for about 40 m past each end of the complex, add stepped masonry retaining walls with planting beds (dark green `NOWIN` concrete boxes plus small round tree props, like the `crown('garden')` code). The slope then never shows bare.
5. **Galleries.**
   - Every band's front edge carries a timber deck 2.2 m wide, cantilevered on brackets spaced 2.5 m apart.
   - Add a railing as a thin box, posts every 2.5 m, and a lantern string with one emissive prop every 2.5 m, alternating red and gold.
   - The level-0 gallery doubles as the riverside walk.
6. **House units.** Pack each band along its length.
   - **Width:** 4–14 m.
   - **Gaps:** 1–3 m, with a 12% chance at each gap.
   - **Clustered variation:**
     - draw a *family* every 30–60 m (wall type, roof colour, floor height 3.3–3.9 m);
     - vary individual units around the family;
     - this avoids both repetition and uniform noise.
   - **Floors:**
     - 2 floors is the default;
     - 15% of units have 3 floors, set 1.5 m back so they rise above the next gallery;
     - 10% have 1 floor with a roof terrace.
   - **Wall types:**

     | Wall type | Share |
     |---|---|
     | Dark timber with lattice windows (`MAT.WOOD`) | 45% |
     | White plaster with a dark timber frame | 25% |
     | Red lacquer | 10% |
     | Open shopfront on gallery levels (reuse the `interior()` shop mode) | 20% |

   - **Roof types:**

     | Roof type | Share |
     |---|---|
     | Single upturned hip-gable eave (existing `prof: 4`) | 40% |
     | Double eave (two stacked `prof: 4` parts) | 15% |
     | Gable ridge (new `prof: 7`, below) | 15% |
     | Flat roof terrace with railing, plants and an umbrella | 20% |
     | Small pavilion | 10% |

   - **Roof colours:** dark grey 70%, glazed teal 15%, red-brown 15%.
   - **Front offset:** 0 to 1.2 m, so the frontage is not one flat plane.
7. **Landmark pieces.**
   - **Pavilion towers:** 2–3 multi-eave towers of 5–7 storeys, at stations at least 80 m apart, rising above the top level.
   - **Lift:** one glass lift shaft (glass part with an emissive edge) from the river walk to the top level, joined to it by a short bridge.
   - **Top plaza:**
     - a platform 15–30 m deep at the top level, joining the top band to the crest street;
     - stop it at existing building footprints (test against `world.lots` and the `raffles` landmark radius);
     - it gives the towers above a base to stand on.
8. **Stilt frames.**
   - Under the front of level 0, and under any unit whose floor is more than 0.6 m above its support, place columns every 3–3.5 m:
     - round timber or concrete, `kind: 2`;
     - running down to the support height.
   - Add tie beams every 3 m in height.
   - Add diagonal braces in alternate bays, using the existing lean fields `lx`/`lz`.
   - Wide frames (> 6 m) get a second row of columns.
9. **Support solver** (the core rule).
   - Keep a support height field on a grid of station × 1 m inland, starting from terrain. Raise it whenever a platform or unit is placed.
   - Before placing a piece, sample the field at its four corners and centre, then act on the gap to support:

     | Gap to support | Action |
     |---|---|
     | ≤ 0.4 m | place as is |
     | 0.4–3 m | extend the piece down, or add a masonry plinth |
     | > 3 m | add a stilt frame |
     | Cantilever, up to 1.5 m | add bracket props |
     | Cantilever, more than 1.5 m | not allowed: shorten the piece |

   - Log counts in dev builds: pieces placed, plinths added, stilts added, unsupported (must be 0).
10. **Dressing.** Each item stays within the prop budget.
    - Vertical shop signs: add `B.slot(...)` sign slots on gallery fronts, so the signs module fills them.
    - AC units on rear walls: the existing `acUnits()`.
    - Laundry poles: a thin prop plus 3–5 small coloured cloth boxes, on about 10% of balconies.
    - Potted plants.
11. **Materials** (`buildings_wgsl.js`).
    - **New `MAT.MASONRY` (21).** Sandstone ashlar coursing:
      - 0.6 × 0.3 m blocks with box-filtered mortar lines that fade to their average when narrower than 2 px;
      - dark water streaks and moss from the top edge (`vnoise2` on x, an exponential falloff down);
      - weep-hole dots;
      - a dim warm wash near the top from the gallery lights;
      - no windows.
    - **`MAT.WOOD` variants**, selected by a high digit of `param` or a spare flag: plaster with timber frame, and red lacquer.
    - **`prof: 7`, gable ridge.** In `vs`, scale only the local z half-depth by the profile, leaving x unchanged. This is a small branch next to `prof()`.
12. **Lights.**
    - About 50 point lights, at priority 3 so they are kept: gallery lights every 25 m on alternating levels, and pavilion and lift uplights.
    - They come out of the buildings module's existing 1450 budget. The shuffled low-priority shop spill lights elsewhere absorb the change, so the total light count is unchanged.
13. **Remove the old complex:** the 17-column grid, its 8 stilts per column and its 4 lanterns per tier.

## Cost
- **Effort:** one implementer, about 2–3 days, including art-direction passes on A1, A2 and the custom cameras.
- **Parts:** about 4–6k new parts and props, replacing about 1.3k. That is roughly +8% of all parts, so `bld-cull` rises about +0.015 ms.
- **GPU per frame:**
  - At A1 and A2 the complex covers about 30% of the frame, which used to be terrain.
  - Vertex work: about 0.5–0.8M triangles across the depth and shading passes. Most come from the curved roof meshes; the near roofs use the K48×32 mesh.
  - Expect +0.15–0.3 ms gbuffer at A1 and A2.
  - Scripted fly-through average: +0.03–0.06 ms, since the complex is on screen for only part of the path.
- **Lights:** net zero, as reallocated.
- **Memory:** about +0.5 MB of part data.

## Risks
- **It may still look procedural.**
  - Uniform randomness reads as noise, so the family clustering and the few large landmark pieces (pavilion towers, lift, plaza) carry the composition.
  - Art direction on the A1 and A2 captures is essential. A one-shot implementation is not enough.
- **Roof mesh cost.** Near roofs use the K48×32 curved mesh (about 3k triangles each). If the gbuffer cost exceeds the estimate, use the K24×10 mesh for small roofs, by raising their threshold in the cull shader for `DETAIL` props.
- **Site drift.** If I-001..003 change the bank, the site search may land somewhere else.
  - The generator adapts by design, because nothing in it is keyed to poses.
  - A1 and A2 may then frame the complex differently. This is acceptable; the poses are fixed and judged blind.
- **Overlap with buildings above.** The top plaza and top bands may overlap the Raffles landmark or hillside lots. Test footprints and stop at them.
- **Walking.** New colliders on stairs and terraces could trap the player.
  - Keep colliders on platforms and units only, not on stair steps.
  - The functional test "cannot fly through buildings" still passes.
