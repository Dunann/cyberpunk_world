## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 5 | A careful merge of I-001 and I-003. "Build first, then paint" and a coverage map driven by accepted blocks are good engineering, but they are standard procedural-city practice. The idea is a revision of two earlier specs, not a new angle. The lit, culturally styled parks (from I-003) are the most original part. |
| Feasibility and credibility | 6 | Much better than I-001. Nearly every review point gets a concrete answer, and most code claims check out: `_buildLots`, `districtAt`, `lampValid`, `TU.x`, `bakeNear`, `roadMask`, the 1450 shop-light shuffle and the absolute `maxTop` clamp are all as described. But the "nothing existing moves" claim has two holes the step-5 table misses, and both re-roll content across the whole city (sign lot loop, garden hamlets). Site edges are coordinate lines and a circle. Unbuilt infill land becomes unlit lawn. The infill roofline will be flat. The quick test does not test the park lighting, which G2 depends on. All of this is fixable within the plan. |
| Expected impact | 6 | It goes straight at user priority 3 and at zone G, the lowest zone (5.12). G3 is a likely win: the south-bank band (about 10% of the frame) and the central plain both change. B3 is plausible. G2 is a coin flip. The forecast of +0.4 on zone G is a moderate gain, below the 0.5 smallest real change. |
| **Overall (average)** | **5.67** | |

### Strongest reason it will fail
**The 2-of-3 rule rests on G2, and the plan does not test G2's deciding risk until the work is done.** Lantern Park is about 32% of G2, seen from 65 m above. Its lawn is the shader's lake-garden lawn, `vec3(0.018, 0.03, 0.014)`, which is almost black. The walks at `c ≈ 34, 110, 200` leave bands 75–90 m wide of dark lawn between them. Whether the judge sees "a designed, lit park" or "the forest replaced by a dark field with a few lines" depends entirely on the stage-2 art. The spec calls this "the main art-direction risk" and says G2 depends on it. Yet the quick test builds stage 1 only, with plain lawn and no paths, and its stop rule fires only on a *clear loss* at B3 or G3. So two days are spent before anything shows whether G2 can win. Then adoption needs both B3 and G3 to win. B3 is not safe either:
- Its near-left foreground (150–400 m from the camera) becomes `genUrban` boxes. The tower branch clamps every tall lot to exactly `maxTop` (`buildings_gen.js:778`), so about a third of the lots end at the same height.
- Its bottom centre becomes a lawn disc (the Silk Road Garden), which at stage 1 is plain lawn.

My estimate is that the chance of wins on at least 2 of 3 is a little above even. That is acceptable for the prototype track only if the park lighting is tested first.

### Other concerns
- **The sign lot loop is re-rolled across the city.**
  - `placeSigns` (`signPlace.js:23`) runs one `rng(9137)` stream through two loops in order: first a loop over `world.lots` (line 87), then the loop over `world.signSlots` (line 253).
  - Infill lots are `DT.URBAN` and are appended to `world.lots`, so the first loop processes them and draws extra values: blades, fascias, giant-screen rolls and lantern rows.
  - Every sign in the slot loop is then re-rolled (word, colour, animation), in every district, including the B1, B2, B4 and A4 frames.
  - Step 5 flags only the infill *slots*, not the infill *lots* in the first loop. The identity diff will fail as written.
- **The garden's hillside hamlets are re-rolled.**
  - `garden.js` creates `R = rng(7070)` (line 184). It runs before `buildings` (`main.js:68`) and passes the stream to `hillsideLife` (`gardenViews.js:804`).
  - `hillsideLife` walks a 75 m grid from x = −3400 to 4200. It rejects candidates with `nearLot(x, z, 9)` over `world.lots` *before* its `R() > 0.075` draw.
  - The Exchange's bank slopes (h ≥ 14 m, slope 0.12–0.75, 45 m or more from water) will produce such candidates. When an infill lot rejects one, there is one fewer draw. Every later hamlet (all with x above about 760, including those on the Nan'an slopes seen in G1 and G2) and the lake-garden compounds that follow are then re-rolled.
  - `rng(7070)` is not in the step-5 table.
  - Hamlets that already exist inside Lantern Park are not mentioned either: the park walks, plazas, pavilions and groves could overlap their terraces and stairways.
- **The vegetation mask can shift the fixed-tree stream.**
  - `buildMask` stamps every entry of `world.lots` (`vegetation.js:342`).
  - Street trees are filtered against that mask *before* the `rng(4242)` pass over all fixed trees (lines 436–443).
  - If an infill stamp (lot plus 2 m) removes even one existing street tree at a seam, every later fixed tree gets a different rotation and variation, including all garden trees.
  - The risk is small, but it is the same kind of leak.
- **Site edges are drawn for cameras, not taken from the world.**
  - Lantern Park is cut at x = −480 and x = 1200, the Exchange at x = 760, and the Silk Road Garden is a 250 m circle.
  - The reasons given for the cuts are eval cameras: Ovoo Hill "is the only site visible in A3"; the CBD edge "would change B1"; the west extension "would bring it into G4's frame".
  - The EVAL rule asks for system-level changes and names "only change things near the fixed cameras" as the way this metric is gamed. Choosing site boundaries so that non-target frames stay untouched is that pattern, even though no pose coordinate appears in the code.
  - The result is also visible. My frustum check (flat ground, same camera maths) shows:
    - In G2 and G3, the forested tip of the confluence point (x 560–760) meets the Exchange along the straight line x = 760, in the centre-right of G2 at about 700 m and in the centre of G3.
    - In G3, the park band ends at x = 1200 with forest beyond it.
    - In B3, forest remains between the garden circle and the Bund's first street, directly below the towers.
  - The critics already list "cake-like straight edges".
- **The keep-out centre matches an eval target.**
  - `PLAN.keepout` puts the stilts site at (245, −135). The A1 and A2 targets are (240, −140).
  - The real site comes from a deterministic search in `buildings_landmarks.js:502–516`. Hard-coding a constant that equals an eval target will be read as keyed to pose coordinates in code review.
- **"Empty paving cannot occur" becomes "empty lawn can".**
  - All 25 rejected cells (31% of candidates), the seam row next to the metro viaduct and the quay strip become "pocket parks: lawn only", with no trees and no lights.
  - At night these read as black holes between lit blocks, in the B3 foreground.
  - Kept cells may also be up to 50% unbuilt, and that part is painted as block-interior paving. The per-cell empty-paving check will not flag it.
- **The roofline will be flat.**
  - The base cap of 26 m above `gMax` is below almost every `genUrban` tower: residential towers with podium are 27–66 m, office towers more.
  - With `distFromCenter = 1`, 65% of lots are shophouses of 10–20 m. The remaining 35% are towers, and nearly all of them clamp to exactly the cap.
  - From B3 and G3 this reads as a uniform plateau. That feeds the "city looks flat" criticism rather than the promised "ridge along the metro".
  - The ridge is also weakened by the metro reserve: `_isReserved` keeps lots 27–45 m from the line.
- **GPU.**
  - The estimate (+0.10–0.20 ms on average) is plausible for stage 1, and the real-light pools are well designed. Each pool is separate and nearest-first, so infill lamps cost nothing when the camera is far away.
  - But the stop rule (+0.30 ms) is applied at stage 1, *before* 2,500 uplit trees, park shading over about 0.6 km², approach avenues with traffic, and 900 parts with 30 point lights are added. The final check has no numeric cap.
  - The forest saving (−0.3 to −0.5 ms at G2) was measured on a shared GPU with ±0.5 ms noise. That noise is larger than the effect being measured.
  - A single back-to-back `bench.mjs` pair cannot resolve 0.30 ms reliably.
  - With about 1.36 ms of headroom shared with I-009 (0.1–0.2 ms), I-015 (0.04–0.08 ms) and I-014 (overlay, probably 0.1–0.25 ms by I-010's estimate), this idea should have a hard total allocation.
- **Feasibility details.**
  - `StreetLamps` is exported, but it builds its own candidates from `DISTRICTS` and validates them with a fixed shader. A second instance means refactoring it to take a candidate list and a validation function. This is modest work, but it is not "reuse".
  - `cityInfo` must not reach the existing lamp validation shader (`STREET_WGSL`), or the existing lamp list changes.
- **I-015 also targets G2.** Whichever is adopted second is judged against a different G2. That is not a fault, but the coordinator should sequence the two.

### What would make it stronger
Required fixes (for the prototype build):

1. **Test the park lighting in the quick test.** Move the Lantern Park ground from stage 2 into stage 1: walks, emissive edge lines, light pools and plazas, without trees or structures. Include G2 in the blind pairwise check. Continue to stage 2 only if (a) G2 is not a loss, (b) at least one of G3 and B3 is a win, and (c) none of G2, G3 and B3 is a clear loss.
2. **Keep the sign stream identical.** In the existing `placeSigns` lot loop, skip lots with `infill: true` as well as their slots. Handle both infill lots and infill slots in the second pass with `rng(9138)`.
3. **Keep the garden stream identical.**
   - Build `hillsideLife`'s `nearLot` grid from non-infill lots only, so the `rng(7070)` sequence is unchanged.
   - Then suppress the emission (geometry, lights, reserve rectangles and trees) of any hamlet that intersects built coverage. It must still consume exactly the same draws.
   - Inside parks, either keep hamlets as park features and add their reserve rectangles to the park keep-out list, or suppress them the same way.
   - Add `rng(7070)` and this rule to the step-5 table.
4. **Keep the fixed-tree stream identical.** Stamp infill lots into the vegetation mask *after* the street-tree filter, or into a separate mask used only for random forest placement. The existing `fixed` list and its `rng(4242)` draws must not change.
5. **Draw site edges from world features, not coordinates or cameras.**
   - Bound every site by water, the adjoining district's first street (its 0.55 weight contour), bridge approach roads, rail reserves, or a slope or contour rule. Never use a coordinate line or a circle.
   - Concretely:
     - Lantern Park runs from the Peninsula South Bridge approach to the Old Town Bridge approach, and both south landings get approach avenues.
     - The Silk Road Garden extends to the Bund's first street, leaving no forest sliver below the Bund.
     - The Exchange's west edge is the foot of Ovoo Hill. Unbuilt land in a site steeper than a fixed threshold (say 25%) keeps its forest as a wooded hill.
   - Define the overall scope by a world feature as well, for example "the Great River banks between the Peninsula South Bridge and the Bund Suspension Bridge". Do not justify any exclusion by which eval frame it appears in. Then recompute the frame shares and forecast every pose that changes, including G4 and A3.
6. **No eval-target coordinates in code.** Compute the stilts keep-out from the same search as `stilts()` in `buildings_landmarks.js` (move the search into a shared function), not from the literal (245, −135).
7. **No unlit lawn.**
   - Pocket parks, the seam strip and the quay strip get either the existing forest (wooded squares) or a grove of fixed trees with lit perimeter paths. Bare lawn is allowed only inside designed parks with walks and pools.
   - Stamp built coverage per accepted lot (footprint plus half a street), not per cell, so empty lot slots inside kept cells do not become dark paving. Alternatively, give those slots a plaza treatment.
   - Extend the empty-paving check to report unbuilt, unlit area of both paving and lawn.
8. **Vary the roofline.** Scale each infill lot's cap by a factor drawn from the infill stream (for example 0.65–1.35, drawn in `_buildInfill`) before the waterfront, bridge and rail terms are added. Keep the 94 m ceiling. Report the height histogram of infill tops; no single 3 m height band may hold more than 20% of tower lots.
9. **Set a GPU budget for the whole idea.**
   - Total cap: +0.30 ms on the fly-through average after all stages, with at most +0.20 ms at the end of stage 1.
   - Measure each check as the mean of 3 alternating runs (baseline, candidate, baseline, candidate, baseline, candidate) on a quiet GPU, with no other prototype benchmark running. Report the deltas per pass for lighting, gbuffer and vegetation.
   - Count no forest saving until it has been measured this way.
   - If stage 2 or 3 pushes the total over the cap, cut stage 3 first, then halve the uplit groves.
10. **Art direction on held-out cameras only.**
    - Use at least three held-out cameras: one low over Lantern Park away from G2's position and heading, one over the Exchange from the north, and one over the Silk Road Garden from the Bund side.
    - Tune emissive levels, line widths and grove colours on these only.
    - Capture G2, G3 and B3 only for the single stage-1 blind check and the final evaluation.
11. **Isolate lamp validation.** The existing `lamp-validate` shader and the `lampValid` used by street trees must keep reading `worldInfo`. Only `groundShade`, `bakeNear`, `roadMask` and the new `infillValid` read `cityInfo`. Make the second `StreetLamps` instance take its candidate list and validation function as parameters.
12. **Make the identity check cover every stream.** Before hand-off, diff all nine non-target poses and both motion bursts against the baseline. Diff G1 and G4 with a mask of the plan sites projected into the frame: changes outside the mask must be within capture noise.
