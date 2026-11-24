## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 7 | The first idea in the program that changes the lighting model instead of adding content. Building the light field from the generator's own records and using a roof-height map for visibility is an unusual combination for this engine. The parts are known (irradiance volumes, emissive voxel lighting, volumetric fog lit by a light grid), so it would not surprise an expert. |
| Feasibility and credibility | 5 | The claims about the code are right, and the memory and bake estimates hold. But the design has four real gaps. (1) Every lit facade will light its own walls, which brings back the contrast loss that sank I-006. (2) The vertical mip levels collapse, so heights are lost beyond about 100 m. (3) A roof-height map cannot represent the multi-level city the program is now building. (4) The quick test uses a different field from the one that ships, yet it fixes the gains and the target poses. |
| Expected impact | 5 | A1, and perhaps A3, G2 and B3, can gain a real halo. The critics' named "black" defects mostly face away from the light source or sit under structures, so the field barely reaches them. Every pose changes, so any clear loss at A4, B1 or a skyline pose blocks adoption. The spec's own estimate is +0.2 to +0.3 in zone A, against a gap of 3.3 to 4.1 points. A clean failure would still tell the program whether this kind of lighting is worth pursuing. |
| **Overall (average)** | **5.67** | |

### Strongest reason it will fail
The field cannot tell a facade's own light from the light of the facade across the street, so it raises the dark wall between the windows of every lit building in the city. Plan step 2 puts each face's emission in the cell 6 m in front of it. The surface term reads the field at `P + n * 7.0`, which is that same cell. In the gather (step 4), directions that point into the facade stop at the first step at 9 m, because it lies below the roof map. Directions along the facade, to the left and right, pass through the source cells of the same face and add to the light. Those two directions cancel in the mean direction `fieldB`, so `length(B)` comes out small. The light is then treated as arriving evenly from all sides, and the wall receives `0.25 * (1 - |B|) + 0.08`, about a third of the field, from its own windows. Physically, a flat glowing wall lights almost nothing on its own plane.

With the spec's own numbers (Hongyadong facade radiance about 0.15-0.3, dark red wall albedo), this self-lighting is about as large as the "+30 to +45 on the 8-bit image" the spec expects on the quay. It falls on the stack itself, which fills most of A1 and A2, and on every residential and office tower in the skyline views. That is the "lower contrast between walls and windows across the city" that both reviewers cited when they rejected I-006 (I-006 review-2: "bases will glow as much as the windows do"). The spec presents "dimly lit walls and roofs between the windows" as a benefit and never checks wall-to-window contrast. The judges' likely reading is "washed out" or "flat", which is a stop condition in the go/no-go.

### Other concerns
- **The quick test does not test what ships, but it fixes what ships.**
  - The crude field is a blur of the source volume ("Gaussian, 2 cells wide, 1 layer high"). It has no 1/r² reach to 240 m, no step-length integration and therefore different units. So it cannot show the 50-200 m halo over the river that the spec gives as the main reason to expect a win, and the 50 m quay figure is out of its reach too.
  - It mostly shows the self-lighting described above.
  - Even so, "the arm and its gains are then fixed" from it, and the target poses are measured "with the off/on captures of the quick test" and frozen. After the full bake, gain 1 means something different and the changed-pixel map changes. The adoption targets would then belong to a field that no longer exists.
- **The vertical mip levels collapse.**
  - A 704 × 512 × 12 texture with 5 box-filtered mips has 12, 6, 3, 1 and 1 layers.
  - At the step distances where the gather reads mip 3 or 4 (roughly 95 m and beyond: the cone across a 45° azimuth bin is about 0.78 × distance), the whole 0-765 m column is one texel. So a crown at 400 m lights a street 150 m away as strongly as a shop at street level does, and street light lights the air at 200 m. That contradicts "a halo at its real height".
  - The layers are logarithmic (2.2 m thick at the bottom, about 190 m at the top), so a plain box filter also weights the thin ground layers far more than their volume. The spec has to say whether it stores totals or densities, and use mips weighted by volume or filtered only in x and z.
- **Light leaks through walls by design, not only through thin walls.**
  - The gather tests visibility only at 9, 15, 24, 38, 60, 95, 150 and 240 m. A tower 20-40 m deep that falls between the 95 m and 150 m steps, or between 150 m and 240 m, blocks nothing.
  - The wide mip reads at those steps also average sources from both sides of a building.
  - Step 5 fills cells inside buildings with the average of their open neighbours. With 12 m cells and towers 2-3 cells wide, after two passes the street behind a tower holds light from the street in front, and trilinear filtering at `P + n*7` reads it.
  - The planned dev check ("no bright cell behind a tower") looks at cells, not at the shaded result on the back wall. It will not catch this.
- **A height field is the wrong visibility model for where the program is going.**
  - "Raised to the top of every part" makes everything under an overhang solid.
  - The space under the stack's upper levels (the level-0 stilt frame in `buildings_stilts.js` lies under the level-1 bodies) and the lower streets under future decks (I-027 stacked streets, I-028 deck loop, user priority 7) count as "inside a building" and get filled averages.
  - The spec's claim that the stilts "gain much more" than the embankment is doubtful. They sit below and behind the stack's emitting faces, as the embankment does.
- **Most of the named defects are not reached.**
  - A2's critical embankment slab faces away from the stack (the spec admits this). A2 is then left with self-lit stack walls and a black wall: likely a tie or a loss.
  - The A3 wedge mostly faces the river, not the stack. It gets the even share and the floor term, which lights a blank primitive that critic 2 already called unexplained. That is the risk the spec names itself.
  - The B3 and G2 forest bands are far from bright facades. In A5, the "black voids" under the guideway sit next to point lights, not next to large emitters.
- **Rain changes meaning.** `rain.js` deliberately subtracts `fogAmbientLi` "so drops are not tinted by the general city glow and backlit areas do not make the rain look heavier". The field is added outside that function, so wide areas near Hongyadong and the CBD will show heavier, gold-tinted rain. It may help with critic 2's "rain is invisible", but it goes against a choice the authors made, and no check covers it.
- **The air term flattens into a plateau.** The glow grid's soft knee `x / (1 + 5x)` caps the term near 0.2. The field near the stack is well above the knee (by the spec's numbers, a mean radiance of 0.2 over a large solid angle). The halo will therefore be an even sheet over the whole river frontage rather than a gradient, and an even sheet is what reads as haze.
- **The luma limits are loose.** A rise of up to 15% in frame-mean luma on any pose is a large change for a night image. Combined with the selection rule (targets are the poses with the most brightened pixels), it chooses exactly the poses most at risk of looking washed out. The 3% limit on A4 is sensible. Use something closer to it everywhere.
- **Double counting at shops.** Shop fronts already have real point lights (`buildings.js` shop spill lights). The bake adds the shop-podium emission (0.35 × shop colour) and also 25% of the same point light. The hard-coded podium spill term (`buildings_wgsl.js:840`) stays as well. The spec should remove one of the three or account for it.
- **The `+ 0.08` "floor" is not a floor.** It is 8% of the field value on every surface, including surfaces that face away. Behind a bright facade it is the main term, and so the main source of leaks in the shaded image.
- **Checked and correct:**
  - `col += E.rgb` comes after all lighting, so emissive surfaces light nothing in the lighting pass. Emissives do still reach the image through bloom and the SSR reflections on wet ground and water.
  - `cityBounce` is as quoted.
  - 5,033 lights (perf report).
  - `exp(-hA / 55.0) * 0.88` in `fogAmbientLi`.
  - The spill terms in `buildings_wgsl.js` (lines 733 and 840) and the analytic lamp pools in `terrainBank.js`.
  - The lamp positions already exist as arrays (`terrainLamps.pos`, `terrainBank.lampData`).
  - Module init is awaited (`main.js`), so the bake can run in pieces with `await`.
  - Froxels evaluated per frame: 160 × 90 × 64 ≈ 0.92 million.
- **Memory and bake time hold, with room to spare.**
  - `fieldA` and `fieldB` at 704 × 512 × 12 × 8 bytes are 34.6 MB each (69 MB in total).
  - Working memory during the bake: atomic source sums about 52 MB, source texture with mips about 40 MB, roof map 13 MB. That is about 105 MB, so the spec's 130 MB is conservative.
  - Everything lives in GPU memory with no CPU copy, so system RAM is barely touched. On a machine that is low on RAM, the only risk is Windows paging GPU memory to RAM if the 6 GB GPU fills. Shrinking still costs nothing: `fieldB` fits in `rgba8snorm`, which is a storage format (17 MB), and `fieldA.a` is stored but unused.
  - The gather is about 1.1 billion filtered reads plus roof tests, roughly 0.2-1 s on this GPU, plus 96 waits for submitted work. The 3 s cap is realistic.
- **The tile-culling savings are plausible, not shown, and do not belong in this idea.**
  - 14,400 tiles × 5,033 lights ≈ 72 million tests is right, at roughly 40 operations each, plus about 1.2 GB of cached reads of light positions per frame. That makes 0.4-1.0 ms of the 3.5 ms pass believable on this GPU.
  - Sky-only tiles skip the loop, so the real figure varies by pose.
  - The proposed 16 × 9 block lists will overflow in exactly the dense aerial views (A6, G3) that are slowest today. The fallback to the full list then removes the saving where it matters most, and the list capacity is not given.
  - In the proposed measurement, `cnt = 0` must come from a uniform, not a constant. Otherwise the compiler may remove the `tList` writes and understate the cost of the tests.
  - The step has no effect on the image and is a separate engineering change. Remove it from this spec so it neither hides nor pays for the field's cost.
- **GPU per frame.** The cost is fine: about +0.1 to +0.2 ms in the lighting pass, with good cache reuse at 12 m cells, against about 1.4 ms of headroom on the bench average. Note, though, that single poses already render at 11.2-11.3 ms (A1, A4, G4 in `runs/I-016m/summary.json`).

### What would make it stronger
- **Remove the self-lighting.** Tag each source with the outward normal of its face. In the gather, count a source only when it lies in front of the receiving cell's surface: keep `max(dot(-dir, faceN), 0)`, so light from a face's own plane arriving at grazing angles adds nothing. Alternatively, store a 2-band directional field, such as first-order spherical harmonics per colour or an ambient cube, instead of one mean vector, so that light from left and right is not treated as light from everywhere. Then measure the wall-to-window contrast on A6, G3 and B4 with the field on and off, and add a limit for it to the checks.
- **Make the quick test use the real gather**, at half resolution (24 m cells, 16 directions) if that is what keeps it to one day. Measure the gains and the target poses again on the final build before any judging, or freeze the targets only after the full bake.
- **Use uniform-height layers** (for example 12 layers of 8 m up to 96 m, then a coarse upper texture), or build mips only in x and z. Then a halo keeps its height at every distance.
- **Make the visibility match the walls.** March at a fixed 6-8 m step up to 60 m and at 16 m beyond, instead of 8 sparse steps. Test visibility against an occupancy volume with the same layers rather than a roof-height map, so that overhangs, decks and stacked streets stay open.
- **Drop or shrink the 0.08 floor.** Replace it with a bounce term from the actual ground and water below, for example the field at the ground cell times its albedo.
- **Treat shop light once.** Count either the shop-podium emission or the shop point lights, not both, and remove the hard-coded podium spill term when the surface term ships.
- **Keep rain as it was.** Exclude the field from the rain lighting, or give it a separate gain that is checked on `burst-u12`.
- **Tighten the luma limits** to 5-6% on every pose. Add a check on the black level (for example the 5th luma percentile) so the halo cannot lift the deep blacks.
- **Split the tile-culling change** into its own spec, with the uniform-based measurement first.
