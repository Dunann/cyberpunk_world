## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 4 | This is the crown half of I-013 with the review fixes applied. A crown library with a spacing rule is a standard procedural-city tool. The glow-matched swap and the exact stream isolation are good engineering, not a new visual idea. |
| Feasibility and credibility | 6 | It is small and the GPU claim is credible. But as written it would fail two of its own go/no-go steps. The CBD stream still shifts because a caller draws from R depending on the crown height (step 1), and the sloped lantern cannot reach the glow target under the 2.5× cap (step 2). Three of the new types would also render with visible defects: the halo shows as a half ring from above, posts and lights float on round plans and above roof centres, and the glass cap shows a distorted window grid. Each has a clear fix (below). |
| Expected impact | 5 | The spec itself expects +0.1 to +0.2 on zone means. G4 is a weak target because its count ignores occlusion, so adoption needs wins at both A6 and G1, plus no clear loss at B3 or B4, where large lit crowns sit on focal towers. I put adoption at about 25–30%. Failure would still show whether crown variety alone moves the blind judge. |
| **Overall (average)** | **5.0** | |

### Strongest reason it will fail
**The targets cannot carry it.** The adoption rule needs 2 of 3 target wins, and G4 will very likely tie. Its "128 tiers > 15 px" was counted with no occlusion, the same mistake both I-013 reviews made about A3. G4 is a 53 m-high river-level view. In the baseline image the Yuzhong skyline is a wall of overlapping shafts, and I count only about 6–8 lit pyramids that can be seen, each 20–40 px wide, while the cable car fills the frame. The critics also listed G4 under "what works". So adoption rests on A6 **and** G1 both winning. That is hard for three reasons:
- In each of those images about 15–20 crowns change, among hundreds of towers.
- Three of the five new types (lantern box, blade, open frame) are boxes or box outlines. Each has fewer parts and less articulation than the stepped, finned pyramid it replaces. Against the critics' "boxy" complaint, a judge can as easily read them as plainer as read them as more varied.
- The large lit crowns on the focal towers of B3 (the white crown at the centre of the CBD cluster) and B4 (bottom left) also change. Both are watched, so either could produce a clear loss.

### Other concerns
- **The R stream still shifts in CBD lots, so the step-1 hash fails.**
  - `genCBD` ends each tower with `if (top > tw.top + 10) aviation(B, x, top, z, R() * 999)` (`buildings_gen.js:1009`), and A.3.4 says `crown()` returns the replacement's top.
  - A `lit` crown is at least 0.78·H tall, which is over 10 m for most draws. The lantern box is 7–9 m tall. So whether this R draw happens depends on the replacement type.
  - When it changes, the rest of the lot shifts, including the whole second tower of two-tower CBD lots (`towers = 2`).
  - I-013 handled this with `top0`; I-017 dropped it.
- **Aviation lights would float in the air** (user priority 2, "detached elements").
  - `genBund` (`:800`) and `genCBD` (`:1009`) place an aviation light at `(x, top, z)`, the centre of the tower.
  - The old pyramid's top is solid at the centre. The halo, frame and blade have nothing there, and the sloped top's surface at the centre is about (h − 2)/2 m below the high edge. In all four cases the red light (param 40, which blooms) hangs in mid-air.
- **The glow match does not measure light, and the sloped type cannot pass it.**
  - The spec adds side area × `param` for `MAT.CROWN` and `MAT.EMIT` as if they were equal. In `fs`, `MAT.EMIT` emits `col·prm`, while `MAT.CROWN` emits `col·prm·up·0.55·(0.2 + 0.8·slat)`, about 0.24·prm on average. One EMIT unit is about 4× one CROWN unit.
  - Worked example for a 30 × 30 m top (hw = hd = 15):
    - **Original:** g0 ≈ 1,700. Tiers ≈ 1,500 and ledges ≈ 220, both counted as the spec counts them.
    - **Sloped lantern:** the main part is `MAT.GLASS`, which the rule does not count (for glass, `param` is the share of lit windows, not emission). Only the 2 m beam counts: about 115 m² × param 3 ≈ 350. Even ×2.5 that is about 860, so step 2 fails.
    - **Blade:** a 30 m-tall CROWN wall gives about 2,300 (above g0), so it passes, even though it will look like a much taller lit slab.
  - "At least as much" has no upper bound, so the skyline is free to get brighter. That confounds the comparison.
- **The halo renders as a half ring from above.**
  - The ring is `kind: 2, prm: 48, NOTOP` with no `BOTTOM`: a one-sided open tube.
  - The pipeline culls back faces (`buildings.js`, `cullMode: 'back'`). From A6 and G1, which both look down, the far half of the band faces away and is culled. The judge sees a lit "C" floating over the roof, not a halo.
  - The ring is also unsupported. Its radius 1.1·max(hw, hd) lies outside the facade along the short axis, and the spec does not say where the 4 posts stand or that they reach the ring.
- **Square crowns on round plans.**
  - About 55% of CBD towers have round or chamfered plans (`kind 0 prm > 0`, `kind 1`, `kind 2`, `kind 3`), as do 30% of hillside towers.
  - The original `lit` tiers reuse the tower's `kind/prm`. The new types are sized from hw and hd as boxes, so:
    - the frame's corner posts stand up to 0.41·r outside a rounded corner;
    - on a cylinder they stand 0.41·r beyond the wall;
    - the 85% lantern box and the 112% plate overhang a cylinder's wall.
  - All of these float.
- **The sloped glass top shading is untested and will alias.**
  - `CAPFACADE` is used by no generator today. On a cap, the glass branch runs `windowGrid(fd, …)` with `fd` interpolated across the cap fan, from the centre vertex's ring value to each edge, so the window columns fan out and distort.
  - At 300–1000 m that becomes the "pixel noise" windows the critics already named (§4).
  - The material is also undefined: "high param" on `MAT.GLASS` raises the lit-window fraction, not a lantern glow.
- **"Every detail is at least 2 m" is false in the table:**
  - frame beams 1.5 m tall and 0.9 m deep (from above, the 0.9 m is what shows);
  - blade top edge 1 m;
  - coping 1 m;
  - lantern lip 1.5 m.
- **Held-out camera H5 was not checked against the terrain.**
  - `probe.mjs`: ground is 148.5 m under the camera (−1300, −1500), so the camera is only about 150 m above ground. Ground is 110.8 m at the target (−1000, −500), so the target point is 50 m underground.
  - Hillside towers there reach 250 m or more above ground, so the camera may sit below the crowns it is meant to show.
  - H6 is reasonable: ground 52 m under the camera; the target is in Lujiazui CBD.
- **The go/no-go judge setup is weaker than the eval's.** "Crops" judged by one subagent, in one order, is not the eval protocol. It should use `pairwise-judge-v1.md` on full frames, with randomised X/Y.
- **Small errors:**
  - `hashPos` does not exist. `math.js` has `hash2(x, z)`, which truncates to integers and returns a float in [0, 1).
  - The frame is 4 posts plus 2 × 4 beams, which is 12 parts, not 8.
  - Profile 8 stores the slope in `c.z`, which the cull shader also reads as taper (`max(1.0, P.c.z)` in the radius). This is harmless, since a slope above 1 only enlarges the radius, but it should be stated.
- **GPU: no objection.**
  - Removing about 5.4k parts, 4.7k of them fin props mostly culled below 1.4 px, and adding about 1k box parts lowers `bld-cull` slightly. Even with a segmented halo (about +0.4k parts) it stays near zero.
  - The halo's round mesh and the glass branch on a few cap pixels are negligible.
  - My estimate is −0.02 to +0.03 ms against about 1.36 ms of headroom. The repeated A/B bench with a +0.1 ms stop is adequate.
- **Tuning to the eval cameras: acceptable.** There are no pose coordinates in the code, the weights are fixed in the spec, no reweighting happens after the eval, and the held-out cameras are fixed in advance. Choosing targets from visibility counts is allowed, but the counts must include occlusion (see fix 7).

### Required fixes
1. **Keep caller R draws independent of the replacement.** `crown()` must give callers the dry-run top `top0` for every decision that consumes R. In particular, `genCBD`'s `if (top > tw.top + 10)` must test `top0`. The step-1 hash must cover the second tower of two-tower CBD lots.
2. **No floating aviation lights.** Each replacement type returns a supported anchor point (the blade's top edge, a frame post top, the lantern plate, the sloped top's high edge). The caller's `aviation(…, R() * 999)` keeps its R draw but uses that anchor in `genBund` and `genCBD`.
3. **Fit the plan.**
   - Parts sized to the plan inherit the tower's `kind/prm`, as the `lit` tiers do.
   - Posts and corners are placed inside the real ring (`ringEval`), not at (±hw, ±hd).
   - Overhangs are measured from the real wall.
   - Alternatively, restrict round plans (`kind 2`, `kind 3`, `kind 0 prm > 0.3`) to the types that fit them: the halo and the sloped top built with the tower's ring.
4. **Rebuild the halo** so it is visible from every angle and supported:
   - an elliptical ring of 12–16 closed box segments, at least 2 m tall and 1 m deep, at (1.0–1.05)·(hw, hd);
   - its posts on the ring diagonals, inside the roof edge.
5. **Specify the sloped top's cap shading.** For profile 8, give the cap a planar UV (`fd` = local coordinate along the ridge, height along the slope) and a dedicated glazing shade: mullions with a box filter, a far-field average and an interior glow. Do not use the room-window grid on the cap. State its material and emission, not a lit-window `param`.
6. **Measure glow correctly and bound it from both sides.**
   - Weight by material: `MAT.EMIT` 1.0 per `param`, `MAT.CROWN` about 0.24 (from the `fs` expression), CROWNLIT wash included, glass windows at their average emission.
   - Size each type at design time so that its glow is within 0.8–1.3× of g0 for the measured range of `lit` tower sizes, without any post-scale above 1.5×.
   - Step 2 prints the per-type distribution from a dev run before any capture. A type that misses the band is redesigned at that point, before any image is seen.
7. **Recount the targets with occlusion,** by rendering a crown-ID or depth-tested mask of `lit` parts on the baseline at A6, G1, G4, B3 and B4.
   - Keep G4 as a target only if it shows at least about 10 lit crowns over 15 px once occlusion is counted.
   - Otherwise target A6 and G1 only (2/2 needed) and state this plainly.
   - List B3 and B4 by name as watched poses with focal lit crowns.
8. **Make "≥ 2 m" true** for every part that carries the silhouette or the glow. Measure it in the dimension seen from above as well (frame beam depth, blade edge, lip, coping), or drop the claim.
9. **Fix the held-out cameras and the check protocol** before implementation:
   - capture baseline H5 and H6, and move H5 so that it sits clearly above the hillside crowns (for example 200 m or more above local ground) and shows at least about 10 unoccluded lit crowns;
   - fix both cameras in the spec;
   - judge full frames with `pairwise-judge-v1.md`, in randomised X/Y order and both orders;
   - go only if the candidate wins, or wins one order and ties the other, at both cameras.
10. **Correct the small errors:** use `hash2` or a defined integer hash for Rk, use the right frame part count (12), and add a `Parts.add` rule that profile 8 does not set `CURVED`.

### What would make it stronger
- **Make each new type at least as articulated as the pyramid it replaces.** Tiers, fins or a lit spine would add detail. The sloped top and the (fixed) halo change the silhouette; the lantern box, frame and blade mostly add more boxes. Consider replacing one or two of them with shapes that are clearly not boxes, such as a tapered needle with lit rings or a fin crown leaning outward, so that the change reads as "designed tops" rather than "different boxes".
- **Keep the skyline height:** no replacement taller than the crown it replaces, which is `top0` plus the spike. The comparison is then about shape, not height, and sight lines behave exactly as today.
- **Print the type mix per district** (Yuzhong, CBD, Bund, Urban) from the dev run, so that the neighbour rule's effect is known before any capture.
