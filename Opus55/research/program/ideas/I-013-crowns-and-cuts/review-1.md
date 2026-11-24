## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 4 | This is the crown-and-massing half of I-005, which has already been reviewed. A crown library, a neighbour rule and refuge floors are standard procedural-city techniques. The new parts are good engineering: the dry-run that keeps the random stream unchanged, and fading the cut band with distance. They are not a new visual idea. |
| Feasibility and credibility | 5 | The GPU claim is credible and the code is easy to build. But the central claim that "every part that is not a crown stays bit-identical" is false as written, so the quick test's part-hash check fails. Rebuilding every kept crown with the new stream changes roofs across the whole city. The neighbour rule is too strict for the tower density. The refuge cuts have four unhandled rendering cases. Details below. |
| Expected impact | 5 | A6 is a plausible win. G1 is a coin flip. A3 will very likely tie, because almost none of its crowns are visible. So adoption needs both G1 and A6 to win. Meanwhile, cuts and crown changes reach B1–B4, A4 and B2, and none of those is watched. If it fails, the program still learns whether silhouette variety moves the blind judge. |
| **Overall (average)** | **4.67** | |

### Strongest reason it will fail
It changes far more of the image than the spec admits, and the adoption rule punishes that.

**1. Kept crowns change too.** Step A.4 says kept crown types are "still rebuilt with Rk". So every `machine`, `setback`, `garden`, `antennas`, `antenna`, `spire`, `helipad` and `pagoda` crown in the city gets new random details:
- spire heights (25–115 m) and antenna heights (20–60 m);
- the 40% roof masts;
- the 22% neon roof edges in `roofDress`, which are clearly visible as coloured roof outlines in A6;
- tank positions and aviation lights.

**2. Refuge cuts reach poses the spec does not list.** They apply to every RES, OFFICE or GLASS part over 90 m. That covers:
- the CBD and Bund skylines in **B1, B3, B4 and B2**;
- the towers above the street in **A4**;
- the **landmark towers**, because the post-pass runs over the finished part list and `genLandmarks` writes into it. The two `raffles` tip towers and two vault towers, and the 200 m `ridgeTower` shaft, all qualify (glass, kind 0 or 1, no lean, taper 1). The ridge tower stands at A6's look target.

**3. The watched list is too short.** It names only A1, A2 and G2–G4. B3 is missing even though the spec's own table counts 46 lit-crown tiers there.

**4. The targets are weak.** A3 is dominated by landmarks and the bare mound. Its 73 "lit-crown tiers" were counted without occlusion; in the baseline image almost no lot crowns are visible behind the mound. So A3 will tie. Adoption then needs wins at both G1 and A6, with no clear loss on any of about ten other poses that changed. At G1 the camera looks at Nan'an Old Town at 300–1500 m. There:
- the open frame (0.8 m posts), the halo (1 m band) and the blade (0.8 m) fall to about 1 px or less;
- about half of the replaced `lit` crowns become flat `machine`, `setback` or `garden` roofs (see the weights in B).

The probable G1 result is fewer glowing tops rather than visibly better ones. The spec itself calls the new types "calmer". I put adoption at roughly 20–30%.

### Other concerns
- **The "bit-identical" claim is false, so the step-1 go/no-go fails.**
  - `Parts.add` gives every part without an explicit `seed` the seed `(this.count * 7.31) % 997`.
  - Crowns change the part count, and dry-run parts record nothing. So every later part without a seed gets a different seed.
  - The shader uses the seed for window lighting, balcony patterns and grime (`windowGrid`, `winLit`). Parts without a seed include:
    - the hillside stacked low blocks (`genHillside` line 681, MAT.RES with windows, about 20% of hillside lots);
    - the Bund clock tower and the stepped deco storeys (MAT.STONE);
    - the walkways;
    - every EMIT part whose flicker mode uses the seed.
  - The non-crown part hash will not match. Fix: give `Parts` a separate seed counter. The dry-run advances it by the number of parts the original crown would have made. Replacement crown parts always pass explicit seeds.
- **Rebuilding kept types is unnecessary.** When T′ equals T, build with R directly and skip the dry-run. R then advances exactly as today and the crown is bit-identical. Only crowns that really change should differ. This one change removes most of the city-wide reshuffle described above.
- **The neighbour rule is too strict for this density, and it removes existing pagodas.**
  - "Never the same distinctive type anywhere in the 3×3 block of 150 m cells" allows each distinctive type in at most about 1 in 4 cells.
  - Yuzhong blocks are 72 m, so a 150 m cell holds about 4 blocks and, by my estimate, 5–12 crowned towers. `pagoda` is 1/8 of `CROWNS_RES`, which is several per 3×3 block today.
  - Rule A.4 applies the neighbour test to kept pagodas and spires too. So most existing Yuzhong pagoda roofs (several are visible in A6) would be re-rolled into sloped, frame or halo crowns.
  - That works against the spec's own "ties the Yuzhong skyline to the Chongqing brief". It also makes the part estimate of 207 replaced crowns too low.
  - Also, the "pavilion hat" is the existing `pagoda` code, which already appears on 12.5% of residential towers, so it is not a new type.
- **The weights in B are ambiguous.** A.4 replaces only `lit` crowns, but table B reads like a share of all towers, and gives about 50% of replacements to flat types. Say explicitly whether a replaced `lit` crown can become a flat roof. If it can, the number of glowing tops roughly halves. That hurts G1 and G4, where those tops are a large part of the night-time sparkle.
- **Refuge-cut rendering cases the plan does not handle:**
  1. **Soffits.** Tower parts have no `BOTTOM` flag, and `vs` drops bottom caps without it. An upper part copied "with the same flags" has an open underside. From the street (A4, B2, `burst-u12`) the 30% overhang shows a see-through ring into the empty shell. Add `BOTTOM` to the upper part.
  2. **CROWNLIT.** The crown wash is placed at `topY − 14 m` of each part (`fs` line 1013). Every shortened lower part on a CROWNLIT tower gains a lit band just under each cut. That is 8% of hillside towers, 50% of Bund towers, 30% of CBD towers and all the `raffles` towers, which is most visible in B3. Remove CROWNLIT from the lower parts, or decide that this is intended.
  3. **The fade covers only the core face.** The ledge of the lower part's top cap is drawn as dark gravel roof. The upper part's soffit is also unfaded. Both become regular 1–3 px dark lines across lit facades in A6 and G3, which is the shimmer source the fade was meant to remove.
  4. **The overhang has no support.** A 70% core with columns painted on the recessed core means 30 or more floors overhang 3–9 m on all sides with nothing at the facade line. Real refuge floors keep perimeter columns. On the B4 cylinder (kind 2, prm 48) the recess would be about 9 m. This risks the "detached / floating" look that is the user's priority 2. Either recess about 1.5 m, or add corner and mid-face column parts at the facade line.
- **The sloped glass top renders as a gravel roof.** The `prof: 8` top cap goes through `roofCap` (dark gravel, albedo 0.045) unless `CAPFACADE` (512) is set. CROWNLIT and EDGE also skip caps. From A6 and G1, which look down on it, the "glass" top would read as a dark wedge. Specify the cap shading. Also make `prof()` return scale 1 for profile 8; otherwise the default `mix(1, taper, t)` scales the top ring by the slope stored in `c.z`.
- **The held-out cameras do not cover the targets' generators.**
  - H3 (West Hills) and H4 (Jiangbei) are both `genUrban`, like G1.
  - Nothing tests `genHillside` (A6, the pagoda thinning, the pavilion hat) or the CBD and Bund towers seen close up (B4, B3, where cuts are largest).
- **A fix that tunes to the eval.** Risks says "if a watched pose loses, lower the weight of the brightest new types". That is fitting to the eval poses, and it contradicts "capture … only once, at the end". Weight changes must be decided only on held-out cameras.
- **The GPU estimate is credible, with small corrections.**
  - It is the one clearly solid part of the spec. Net parts fall by about 3k, and the 4.7k fin props (32 triangles each, drawn to about 1.4 px) go away.
  - "Almost every new piece uses the 32-triangle box": not quite. Cuts on rounded-rect towers (kind 0, prm > 0) and cylinders take the ROUND flag and use the K24 mesh (96 triangles) or the K48 mesh (192). Pagoda roofs are CURVED (480–3072 triangles).
  - Even so, the total stays well under +0.05 ms against 1.36 ms of headroom.
  - The stop rule of +0.03 ms is probably below run-to-run bench noise. Run 3 benches per side, or use +0.1 ms.
- **Which towers get cuts depends on part indices.** The cut seed `hash(seed, i)` uses the part index, which shifts whenever crown part counts change. Step 1 and step 2 then cannot be compared cleanly. Seed from the part's stored seed and position.
- **Merge risk with I-014** (tower text shows): cuts on the towers it uses would break up text facades. The two specs should agree on how to exclude those towers.

### What would make it stronger
- **Keep the change minimal:**
  - build unchanged crown types with R (no dry-run, no Rk);
  - freeze default seeds with a separate seed counter;
  - exclude landmark parts (the part index is below the count after `genLandmarks`) from refuge cuts.
- **Replace the neighbour rule** with a nearest-neighbours rule: no repeat among the 4–6 nearest towers within about 80 m. Apply it only to the new types and to `lit`, and never remove existing pagodas or spires.
- **Keep the glow on replaced crowns.** Every replaced `lit` crown becomes a lit distinctive type, so the skyline gains variety without losing sparkle. Size crown details (frame posts, halo band, blade) so that they read at 500–1000 m, about 2 m or more at 1000 m.
- **Fix the cut rendering:** `BOTTOM` on upper parts, no CROWNLIT on lower parts, ledge and soffit colours faded with the core, a shallower recess or facade-line columns, and `CAPFACADE` or a cap material for the sloped top.
- **Make the watched list and checks match what changes:**
  - list B1, B2, B3, B4 and A4 as watched poses;
  - add held-out cameras over a Yuzhong hillside area away from A6 and G1, and a CBD close aerial away from B4;
  - read the step-1 and step-2 go/no-go from those cameras.
- **Consider dropping A3 as a target** and targeting G1, A6 and G4, which actually show many `lit` crowns. Or keep only crowns for the first test, and run refuge cuts as a separate step that is judged on its own.
