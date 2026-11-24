## Reviewer 2 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 6 | New for this program: it is the first idea to change what existing content does to its surroundings, and taking emitters from generator records instead of voxelising them is a good fit for this project. As a technique, though, it is standard: a baked irradiance volume lit by emissive surfaces, used for both surface fill and volumetric fog, is what Unreal's volumetric lightmaps plus volumetric fog have done since 2017. |
| Feasibility and credibility | 5 | The diagnosis is correct (I checked the code), and the per-frame cost and memory estimates hold up. But there are four design gaps. Every lit facade lights itself. The quick test does not test the field that would ship. The sparse roof test and coarse mips will leak light behind buildings. And the spec does not see that one global gain must satisfy the A4 limit of +3% luma, at the very street-level sources (shops and lamps) that are strongest at A4. |
| Expected impact | 4 | The spec itself predicts +0.2 to +0.3 in zone A, which is below the program's smallest real improvement (0.5). It is a citywide change under a rule where one clear loss on any pose blocks adoption. Judges rank detail and finish first, and lighting alone mostly reveals existing plain geometry (the A3 wedge, flat embankment walls) rather than adding detail. The "removes a cap for later ideas" value is real but indirect. |
| **Overall (average)** | **5.00** | |

### Strongest reason it will fail
The field is not "strong beside the brightest places and small elsewhere". It is strong wherever there is a lot of nearby emitting surface in view, and that describes every dense street. Ordinary residential towers emit about 0.06–0.09 HDR on average (the `farE` formula with `inten` 1.25, litB ≈ 0.4, window share ≈ 0.35), not far below the 0.15–0.3 the spec gives the Hongyadong stack. In a street canyon, facades cover a large share of all directions. On top of that, the bake injects 25% of every static shop and sign light and of every street and bank lamp (intensity 95, `terrainLamps.js:274`), and these line every street. So the field will be about as strong in A4, B2 and every hillside street as in front of the stack.

There are two consequences:
- **The gain is capped too low to help the targets.** A4 has a mean luma of about 67/255 (measured from `runs/I-016m`), so the +3% limit allows about +2 luma across the whole frame. One global gain must satisfy that while still changing at least 20% of A1–A3 by 6 or more. At a gain low enough for A4, the target list is likely to come out short or empty.
- **At higher gains the idea repeats I-006.** It becomes a citywide warm lift of walls and haze, which I-006's reviewers rejected for lowering contrast.

The fill also lands on the emitting facades themselves. Each facade's sources are injected 6 m in front of it, and each surface reads the field 7 m in front of itself. The sources along a facade arrive from the sides, so their mean directions cancel, `length(B)` stays small, and the even share (0.25) plus the floor (0.08) applies. Every lit tower then brightens its own dark wall strips by its own windows. That is physically wrong (a flat facade cannot light itself), and it lowers the window-to-wall contrast that the aerial poses depend on (A6, B3, G1, G3). Those are mostly non-target poses, where one clear loss blocks adoption.

### Other concerns
- **The quick test judges a different effect from the one that ships.**
  - The crude field is the source volume blurred by about 2 cells (around 24 m), with no propagation. That is near-field spill: mostly facades lighting themselves, plus the shopfront zone.
  - The claimed wins depend on the 240 m gather: the gold halo over 200 m of river, and the quay, hill and tower bases lit from 50 m or more.
  - The go/no-go then fixes the arm and its gains on the crude field, and the full bake changes range, direction and visibility. Neither the pass nor the gains carry over.
  - The quick test should use the full gather with the roof test. Plan steps 1 and 4 are only about a day of extra work.
- **Some light is counted twice or three times at shopfronts.** `buildings_wgsl.js:840` already adds a hand-made spill term to podium walls, and `buildings.js` already places 1,450 "shop spill" point lights. The bake then adds 25% of each of those lights and also the podium emission ("0.35 × shop light colour"). The spec calls its changes "additive" and does not remove or account for the existing spill terms (podium, `terrainBank.js:81` lamp pools, Bund flood).
- **Light will leak through buildings, by design.**
  - Gather steps sit at 9, 15, 24, 38, 60, 95, 150 and 240 m, and each is roof-tested only at its own point. Beyond 38 m the gaps between steps (34–90 m) are wider than most tower footprints, so the test skips over intervening towers.
  - At mips 2–4 (48–192 m cells), the box filter mixes the lit front faces and unlit back faces of blocks into one value, so the dark side of a block receives the lit side's light.
  - The "Fill" step copies open-neighbour values into building cells. With 12 m cells, thin buildings (the Hongyadong terraces, row houses) then pass light through to the street behind.
  - The spec's dev-view check ("no bright cell behind a tower") will probably fail, and the spec has no plan for that case.
  - **Fix:** take the maximum of the roof map over each segment (a max-mip of the roof map chosen to match the step spacing), and inject light into the face-normal direction (for example as a 6-direction ambient cube), so the gather can reject back-facing sources.
- **Terrain-following layers break at the cliff.** Hongyadong sits on a cliff, and the peninsula is hilly. Mips are box-filtered in layer space, so at 48 m and above they average cells at very different absolute heights: the river column and the clifftop column at the same layer index are about 60 m apart in height. The stack's light then smears onto the clifftop streets behind it, at the wrong height. The spec's `fieldBase` exists only at mip 0.
- **The rain change goes against an explicit design choice.** `rain.js:63-69` removes the general city glow from what rain drops pick up, "so drops are not tinted by the general city glow and backlit areas do not make the rain look heavier". The spec leaves `fogAmbientLi` unchanged so that the field reaches the rain, which brings back exactly what the authors removed, across the whole city.
- **The parts are not boxes.** Part records are parametric: ring shapes, profiles, twist and taper (`buildings_wgsl.js:198-213`). "For each side face" and "rotated footprint" need perimeter sampling through `ringEval` and `prof`. The emission table also has to reproduce hash-driven values (`litB` from `hb1`, window share from style), which belong in shared WGSL so they cannot drift. This is more than a day of work for the quick test.
- **"Scaled by a rule, not by taste" is overstated.**
  - The gather's normalisation (`source × step length × 4π/32`) matches a point light only when each step length equals the depth of the mip cell along the ray. Layer thickness ranges from 2 m to 270 m, so the error depends on height and can be several-fold.
  - With only 8 azimuths, ray artifacts (star patterns around strong sources) are likely at mid range.
  - In practice the gain will be set by the luma limits, which makes it a matter of taste. That is acceptable, but the spec should say so.
- **The air term has no height falloff.** `fogAmbientLi` deliberately holds 88% of the glow below 55 m ("must not light up the sky"). The field reaches 765 m and includes lit crowns, so the haze in the sky between towers in A1, A3 and B3 will brighten. Combined with the soft knee, that may read as smog rather than atmosphere. The target rule (20% of the frame changed by 6 or more) will mostly pick poses with large sky or river areas, which are exactly where this risk is highest.
- **Memory and RAM are fine, with one correction.**
  - The stored textures are 704 × 512 × 12 × 8 B ≈ 34.6 MB each, so 69 MB for two, which is correct.
  - The bake's working memory is about 52 MB (fixed-point sums) + 40 MB (source with mips) + 13 MB (roof map). A two-pass Fill cannot run in place, so it needs a second copy of `fieldA` and `fieldB` (+69 MB). The peak is therefore about 245 MB, not 200 MB.
  - All of this is GPU memory on a 6 GB card and has little effect on system RAM unless VRAM is already full. It is not a real risk.
  - `fieldB` can be `rgba8snorm`, which saves 17 MB.
- **Bake time is plausible.** 1.1 billion trilinear reads plus 1.1 billion roof reads should take about 0.2–0.5 s on the GPU. Pipeline compilation and roughly 100 `onSubmittedWorkDone` round trips add to that, so 1–3 s is believable.
- **Per-frame cost is plausible, but the fog estimate is low.** +0.1 to +0.2 ms for the lighting pass is believable. For the fog, 0.9 million froxels each read a 35 MB volume along long rays with poor cache reuse, so +0.03 to +0.1 ms is more realistic than +0.02. Several hero poses already measure over 11 ms per pose (A1 11.23, A4 11.34, G4 11.27 in `summary.json`), although the gate is the fly-through average.
- **The tile-culling savings are plausible, but this step belongs in a separate idea.**
  - The loop at `renderer.js:98` does walk all of about 5,300 lights per tile. That is 14,400 tiles × about 21 iterations per thread, with a matrix transform and plane tests, plus about 2.4 GB of L2 reads of the light buffer per frame. 0.4–1.0 ms is a credible range, and the 1-hour measurement (`cnt = 0` against `lightCount = 0`) is correctly designed.
  - However, this idea does not need the savings (its own cost fits in about 1.2 ms of headroom), and they do not change the image. They should not count toward this spec's score. Give them their own idea under the GOAL's "freeing GPU budget in the lighting pass" direction.
  - In that idea, the screen bounding box of each light must be conservative for lights that cross the near plane.
- **Lighting reveals the current geometry.** At A3 the critical "wedge" is a large plain curved shape beside the stack. Lighting it turns a black wedge into a visible, plain gold slab. The A2 embankment faces away from the stack, as the spec admits. Two of the three "black" defects named as motivation are therefore not fixed.

### What would make it stronger
- **Stop facades from lighting themselves.** Store the field as an ambient cube (6 directions) or as L1 spherical harmonics instead of a mean direction plus an even share. Inject light in the face-normal direction, so that a surface receives nothing from sources in its own plane. If that costs too much memory, drop the even share for surfaces whose material is emissive, or weight it by `1 - |dot(n, faceNormal)|`.
- **Make the field local in practice.**
  - Drop lamp bounce and static-light bounce from the sources, since those lights already light their surroundings directly. Or keep only lamps beyond the real-light range, and remove the analytic pools there.
  - Or give the gain an explicit threshold: sources count only above a set radiance, such as the brightest 5% of facades.
  - Either way, the effect then stays concentrated at Hongyadong, lit crowns and neon streets, and the A4 limit stops controlling the gain.
- **Quick-test the real field.** Build the roof test and the gather in the quick test (one extra day), and fix the gains on that field. Add an arm with surfaces only and no self-lighting, to separate "lit surroundings" from "glowing walls".
- **Use a conservative visibility test:** the maximum of the roof map along each step segment, and layer-aware mips (or mips that do not cross columns whose ground heights differ by more than one layer).
- **Remove the double counting:** turn off the podium spill term, the bank lamp pools and the Bund flood term where the field covers them, so the field replaces the hand-made terms instead of adding to them.
- **Give the air term the same height falloff as the glow grid** (most of it within about 60 m of the ground or of the emitting face), and keep the field out of `rain.js` unless an arm shows it helps.
- **Split the tile-culling work into its own idea** with its own measurement, and state this idea's GPU source as the existing headroom only.
