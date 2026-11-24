## Reviewer 1 (2026-11-24)

**How I checked it.** I built the spec's heightmap step myself (plan steps 1–2: river index in `Seg.b.w`, `waterDistTo`, the stepped `min()` blended by `stepW`) in a copy of the baseline source, ran it, and compared it with the baseline build through `heightAt`, `world.lots` and `world.shared` (lots, building, sign and garden statistics). I then ray-marched both height grids from the real eval cameras (fov 1.05, 16:9) to measure how much of each frame's visible terrain changes, and overlaid that mask on the baseline screenshots to judge building occlusion. All numbers below come from these runs, with no walls, lamps or props yet.

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 6 | Treating the ground under the city as built form is new in this program: every earlier idea changed buildings, parks or signs. As a design it is the obvious Chongqing reference (stepped quays, stair streets), and I-004 already proposed terraces for the other side of the same hill. |
| Feasibility and credibility | 5 | The core works and is cheap. The patched heightmap builds in about 20 lines, the lot list is identical (2,876 lots, same seeds and hash), and the six Raffles tower bases and the stilt search are untouched. But four central claims fail when measured. (1) "The rest of the city is bit-identical": 42 lots get new ground (up to −48 m), which re-rolls three city-wide streams. (2) "The Hongyadong cliff is left as it is": the cut lowers the Jade cliff top by up to 41 m at I-015's south end. (3) "The gentle bank changes nothing": it is raised by up to 10 m. (4) A6, G4 and G1 "must match the baseline", but all three change. The plan also does not cover terrain LOD: at the distances of G2 and G3 the terrain mesh cannot show 14 m treads, so the terrain will cut through the walls. All of this is fixable, but none of it is in the plan. |
| Expected impact | 4 | Measured with the real cameras, the changed terrain is 1.9% of A3, 1.6% of G2 and 2.3% of G3, before buildings hide part of it. In A3 only the left half of the bare slab changes. The centre of the mound and the crest under the towers face the Jade River and stay bare. The spec's own forecast is +0.2 on zone A, below the 0.5 smallest real change. If it fails, the program learns whether lit terraces read at 1–2 km, which is useful but narrow. |
| **Overall (average)** | **5.0** | |

### Strongest reason it will fail
**Too little of the target frames changes, and the part of A3 that matters most does not change.** The A3 camera stands at (650, 20, 150), level with the Great River bank at the tip (z ≈ 140). It therefore sees the Great River face almost edge-on and looks straight at the Jade-facing side of the mound. The cut follows the distance to the Great River, so in A3 it changes a wedge on the left: the slope under the left buildings and the left half of the bare slab (1.9% of the frame, less after buildings hide part of it). The right half of the slab and the dark crest under the towers face the Jade River and do not change. These are the areas the critics named, and I-015 is extending its stack over them. The "plinth under the towers" does not appear either: the top terrace ends about 125 m from the river, and the tip towers stand behind the mound crest. From A3 the treads are also seen end-on, as a sawtooth where they meet the Jade-side slope, and none of the spec's quick-test cameras looks from that side. In G2 and G3 the change is a band of 1.6% and 2.3% at 1.0–1.8 km. There the CDLOD mesh has 8–16 m vertex spacing (2 m only within about 370 m), so 14 m treads and 3 m risers become a wavy slope that passes through the wall geometry. Adoption needs wins on 2 of A3, G2 and G3. I put A3 at about 60% if the prow is well designed, and G2 and G3 at about 35–45% each, which gives roughly a 40–45% chance of adoption, and only after the fixes below.

### Other concerns
- **City-wide streams are re-rolled, so non-target poses will change.**
  - The lot list itself is identical. But 42 hillside lots near the bank get new ground (gMin down by up to 48 m), and 39 of them now span more than 7 m.
  - `terracedPodium` then draws a different number of strips, shopfronts and lights from each lot's own stream. That stays local, but the totals change:
    - sign slots go from 58,627 to 58,739;
    - wanted lights go from 1,934 to 1,935;
    - skybridges go from 320 to 312.
  - Each of these feeds a shared stream:
    - the slot loop in `placeSigns` (`rng(9137)`) re-rolls the word, colour and animation of every later sign, in every district;
    - the Fisher–Yates shuffle of the low-priority lights (`rng(4242)` in `buildings.js`) depends on the list length, so the 1,450 kept shop lights are re-chosen across the whole city;
    - `skybridges` (`rng(5150)`) re-rolls the peninsula's skybridges.
  - The spec's check that A4, A5, A6, B1–B4, G1 and G4 match the baseline will fail. Random re-rolls also make the "no clear loss elsewhere" gate noisy.
  - Plan step 7's "4 point lights from the buildings budget at high priority" pushes 4 shop lights out of the 1,450 somewhere else in the city.
- **The Jade cliff is cut at I-015's site.**
  - The spec computes `stepped = min(rampJ, step(dG))` wherever dG < 167 m. That includes the top of the Jade-facing cliff near the prow: 0.0043 km² where the Jade is the nearer river, at z 33..144, lowered by up to 40.7 m. For example, (270, 80) drops from 84 m to 60 m.
  - This is the south end of the I-015 stack (its cliff rule runs to about z = +120). That end is where A3 looks.
  - I-015 regenerates from `heightAt` at load, so a merge will not crash. But its level count, crest plaza and solver results there would change after its art direction and audit were done on the old cliff.
  - The two ideas also both target A3 (I-015 also targets G2). Whichever is judged second is judged against a different A3.
- **Walls and buildings collide.**
  - The wall stations are filtered only by the heightmap. Where the cut passes through the 42 lots, tier walls, coping and lamps will run through podiums.
  - Lot ground is sampled at only 3 × 3 points (12–27 m apart), so a 14 m tread between samples can leave a building base hanging over a 9 m drop.
- **The gentle bank is raised, not left alone.** `rampJ` uses the distance to the Jade River only, so on the Great River side it equals the un-ramped land. `min(landH, step)` is then higher than today's smooth ramp wherever that ramp lies below the step line. Measured: +3 to +6 m at x −900..−800 (0.008 km², up to +9.9 m). Where `stepW` is between 0 and 1 the steps are also blended to part height, with no walls.
- **Poses outside the forecast change.** Terrain-change share of each frame, terrain only:
  - A6: 5.8%, mostly behind the buildings at the bottom edge, but the 42 rebuilt lots are there.
  - G4: 1.1%, the waterfront at the centre of a pose the critics listed under "what works". Raised by up to 6 m and then cut into steps.
  - G1: 0.8%, the peninsula's south face at 2.3 km.
  - A1: 0.02%. A2: none.
- **GPU.** The total estimate (+0.03 ms on average) is plausible for the geometry, about 6 km of tier walls, which is less than the claimed 2.5 km × 8 tiers. Three items are not costed:
  - **Terrace mask, if computed per pixel.** The "compute it inline" option in step 6 would loop over about 150 river segments for every ground pixel on the hillside. That could cost tenths of a millisecond. It must be baked.
  - **Light clustering.** The fly-through passes the prow at 70 m (`dev.js` PATH point (260, 70, 120)). There the nearest-160 lamp pool fills with stacked tier lamps 9 m apart vertically, which lengthens the per-tile light lists for those seconds. This affects p99 more than the average.
  - **Shared headroom.** About 1.36 ms remains, shared with I-016 (capped at +0.30), I-014 (0.1–0.25), I-009 (0.1–0.2) and I-015 (0.04–0.08 on average). That leaves about 0.5 ms, so this idea needs a hard cap.
- **Smaller points.**
  - `garden.js` assigns `world.shared.gardenTrees = trees`. The terrain module initialises before the garden, so trees pushed from `terrainBank.js` would be overwritten. They must be appended later, at the end of the list, so the `rng(4242)` fixed-tree draws of existing trees do not shift. I-016 also appends park trees there, so the order must be agreed.
  - The stilt-site concern in plan step 8 is moot: the search only covers z ≤ 0.
  - The grand stair is anchored to the `raffles` site, which is also A3's look-at point. That is acceptable because it is a landmark rule, but its parameters must not be tuned on A3.

### What would make it stronger
- **Design the prow and the Jade side together with I-015** rather than separately. The highest-value version of this idea fixes the whole bare mound in A3: the stack steps down around the tip into the terraces, with one plaza level shared. Sequence it after I-015 is judged and build on whichever is then the best.
- **Make it a rule for steep urban banks generally**, not only the peninsula's south face. This would raise the changed share in the frames that see those banks; the share must then be recomputed with occlusion.
- **Treat it as a lighting composition at distance.** At 1–2 km the lamp lines, the LED coping lines and their reflections are what the judge sees; the treads are not. Test those first.

### Required fixes (for a prototype build)
1. **Keep every existing stream identical by not cutting under lots.**
   - Generate the heightmap, build the lots, then apply the stepped cut in a second pass with a keep-out mask: each lot rectangle plus 8 m, faded over 6 m. The lots' sample heights, gMin and gMax then stay the same.
   - Where the cut drops more than 2 m beside a lot, build a retaining wall around that lot's pad with the same extruder and material, so the buildings stand on built platforms.
   - The quick test must print these values and show them unchanged from the baseline:
     - the lot list (count, seeds, gMin, gMax);
     - `buildingStats`: parts 133,904, props 117,412, slots 58,627, lightsWanted 1,934, bridges 320, walkways 51;
     - `signStats`;
     - a hash of hamlet positions.
2. **Leave the Jade-facing cliff alone.**
   - Apply the step only where the Great River is the nearer river: dG ≤ dJ, blended over 10 m.
   - Where the terraces reach that line, end them with a designed prow: a closing wall or bastion and stair that faces the confluence, not open tread ends or ramps.
   - The measured change on the Jade side (now 0.0043 km², up to −41 m at z 33..144) must be 0.
3. **Never raise the terrain.** The final height must be at most the baseline height at every texel. Remove the measured raise (up to +9.9 m at x −970..−800) by taking `min()` with the existing carve result. End the stepped zone at a whole tier, not by blending heights with a partial `stepW`.
4. **Bake the masks.** No shader may compute the distance to a river per pixel. Bake the tier index, terrace mask and stair mask into a texture, or a spare channel, when the terrain is generated.
5. **Make the walls hold up at distance.**
   - Wall faces must extend at least 8 m below the lower tread, and the coping deck must cover the riser ramp, so terrain drawn with 8–16 m vertex spacing never shows in front of or through a wall.
   - Check this on a held-out camera 1.0–1.5 km from the bank: no terrain through walls, no sawtooth along the tier lines.
6. **No wall, coping or lamp inside a building.** Skip wall stations inside lot footprints plus 3 m and inside landmark footprints. A dev audit against the solid part boxes in `B.P` must report 0 intersections.
7. **Use separate light pools.**
   - The concourse lights come from their own `ctx.lights.reserve(...)` pool, not the buildings' 1,450 budget.
   - Tier lamps share the existing embankment pool of 160 and do not enlarge it.
   - Report the lighting-pass time on the fly-through segment over the prow.
8. **GPU cap for the whole idea.**
   - The fly-through may rise by at most +0.10 ms on average and +0.3 ms at p99.
   - A3 and G2 may rise by at most +0.15 ms each with `--stats`.
   - Measure each check as the mean of 3 alternating baseline and candidate runs on a quiet GPU. Report the gbuffer, lighting and terrain passes separately.
9. **Correct the forecast, counting occlusion.**
   - State the measured shares: A3 1.9%, G2 1.6%, G3 2.3%. In A3, only the left half of the slab changes.
   - Move A6, G4 and G1 from "must match the baseline" to forecast poses, each with an expected result.
   - Run the identity diff on A1, A2, A4, A5, B1–B4 and both motion bursts, against the measured capture noise.
10. **Held-out cameras chosen by rule, never at eval positions.** Add at least these three:
    - one that looks at the prow from the confluence: on the bisector of the two rivers, 400 m out and 20 m up, so the tread ends are tested;
    - the 1.0–1.5 km camera from fix 5;
    - the spec's boat camera due south of the tip.

    Set tread, riser, lamp spacing and emissive levels on these cameras only, before any capture of A3, G2 or G3.
11. **Stop rule in the quick test.** With plain shading, if the confluence camera shows a quarry or a sawtooth, or the distance camera shows the terrain cutting through walls, stop before building materials and props.
12. **Cover every riser.** Report the length of riser on the Great River face that has no wall, after rejected stations, stair edges and stair corridors are accounted for. The target is 0 m: use corridor side walls and bastions.
13. **Trees.** Append the planter trees to `world.shared.gardenTrees` after the garden module has published it, at the end of the list. Agree the append order with I-016's park trees.
14. **Sequencing with I-015.** Branch this idea from the best build after I-015 has been decided. Re-run I-015's dev audit (overlaps, unsupported pieces) on the combined terrain, because both ideas meet at the prow.
