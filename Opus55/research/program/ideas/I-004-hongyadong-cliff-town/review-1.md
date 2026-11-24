## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 5 | A sensible, well-known procedural method: terrain cross-sections, shared terrace levels, clustered variation and a "nothing floats" support pass (as in Townscaper-style builders). It is new to this program and well matched to the defect, but it is not an unusual angle. |
| Feasibility and credibility | 5 | It fits the codebase: part fields, `prof`, `lx`/`lz`, MAT id 21 free, spare flag bits, prop budget, light priorities. The GPU gate risk is low. But the section geometry was never checked against the real cliff, and on that cliff it does not fit: no clearance rule between levels, roofs and galleries collide, the plaza test deletes the plaza (details below). The quick test cannot detect any of this. |
| Expected impact | 6 | It directly targets the user's named example (priority 2) and both critics' top two findings. A1 and A2 should win if the build is clean, which alone meets the 2-of-3 adoption rule. A3 is uncertain, and the zone A gain of +0.4 to +0.6 is optimistic because the A3 bare mound stays. |
| **Overall (average)** | 5.33 | |

### Strongest reason it will fail
The terrace section model does not fit the cliff it will be built on, and nothing in the spec checks what is *above* a piece, only what is under it. I probed the terrain at the site (`B.sites.stilts` = (240, −140)). The bank promenade is at about 6–8 m and the crest at about 94–96 m. The face between them is 45–50 m deep horizontally, with a 1.8 average slope and 2.3 (about 66°) in the middle. So the cliff is about 86 m high. That gives about 12 levels of 7.2 m, not the spec's "5–9". Each band is only `x_{k+1} − x_k` ≈ 3.1–4 m deep through the middle of the face.

With level spacing H = 7.2 m and default 2-floor units, three things follow:
- A unit on band k−1 tops out exactly at y_k, which is the height of band k's gallery. That gallery cantilevers 2.2 m out from `x_k − 3`, directly over the rear of the band k−1 units.
- Every pitched roof in the roof table (70% of units: `prof: 4` hip at 3.2 m tall, double eaves, gable, pavilion) therefore runs into the gallery and units above.
- So do the 15% of 3-floor units ("rise above the next gallery") and any family with a floor height above 3.6 m (2 × 3.9 = 7.8 m > 7.2 m).

The "merge bands shallower than 4 m" rule would merge most of the middle face. That leaves 14.4 m steps with 7.2 m of bare masonry between rows, not continuous galleries on every level. Either way, the build that results is either full of interpenetrating roofs (a messy, still "procedural" read that a blind judge can prefer the clean baseline over) or a quite different design. The quick test (plain boxes, no roofs, no galleries) would pass and never show this.

### Other concerns
- **The plaza test deletes the plaza.** "Stop it at … the `raffles` landmark radius": Raffles is at (220, −60) with r = 190, which covers the whole complex site and the cliff top. Read literally, the top plaza (and maybe the top bands) disappears.
  - The real obstacles are two specific tower boxes. The vault tower at (215, −68) has hw 15 and hd 12, so it spans x 200–230. Its base is at heightAt − 6 ≈ 79 m, and it already overhangs the cliff face. The tip tower at (150, −170) has hw 19.
  - Upper bands at z ≈ −80…−55 will run through the first tower. The support solver has no idea of obstacles. It needs a footprint and height test against existing parts, not a radius.
- **The spec breaks its own cantilever rule.** Galleries cantilever 2.2 m, but the solver table forbids cantilevers over 1.5 m ("shorten the piece"). As written, the solver would cut every gallery to 1.5 m.
- **The quick test does not test the GPU claim or the idea.**
  - "0 unsupported pieces" holds by construction, since the solver adds supports until everything is carried.
  - The "gbuffer +0.3 ms at A2" check runs on a skeleton without the cost drivers: roofs, galleries, lanterns, posts and dressing.
  - Nothing checks for intersections, and nothing checks that the result looks better.
- **The GPU estimate is low, but the gate is still safe.**
  - Curved roofs use the K48×32 list whenever their bounding radius exceeds 140 px. At A2 (about 90 m away) a typical roof is about 155 px, so nearly every near roof costs about 3.1k triangles in each of 2 passes.
  - 12 levels × about 30 units × 1.15 roofs ≈ 400 roofs, against about 120 today. That suggests +0.3–0.6 ms of gbuffer at A2, not +0.15–0.3.
  - Lighting is not costed at all. Moving 50 priority-3 lights into one view raises per-tile light counts at A1 and A2, even though the total count stays the same.
  - The fly-through does approach the cliff head-on (keyframes (600,160,1300) → (420,80,650) → (260,70,120)). But that is only about 5–8 s of 60 s, so the average rises by about 0.05–0.1 ms. That is well inside the 1.36 ms headroom. The per-pose times at A1 and A2 (10.6 ms) will rise, but they are not gated.
- **Part counts are underestimated.** With 12 levels and up to 420 m of bank:
  - galleries alone come to about 360 props per level (bracket, post and lantern every 2.5 m), so about 4.3k;
  - stilts, braces, dressing and planting add another 2–3k;
  - units, roofs and masonry add another 2–3k;
  - so roughly 8–11k in total, not 4–6k.
  - Props are at 117,412 of the 130,000 budget at high quality. `genLandmarks` runs first, so an overshoot would silently drop dressing in the districts generated last, possibly including A4's shopfronts.
- **"Other poses: no change" is wrong.** The complex is clearly visible in G2 (centre right, on the peninsula) and as a speck in G1. G2 is a non-target pose where a clear loss would block adoption. It will probably improve, but the spec should list it.
- **Tuning to eval cameras.** "Art direction on the A1 and A2 captures is essential" means iterating the generator's parameters while looking at two fixed eval cameras. Nothing is keyed to pose coordinates, so the code-review rule is not broken. But this is exactly the overfitting the eval warns about.
  - Art direction should be done on held-out cameras, for example 3–4 views from different stations, heights and distances along the 420 m bank.
  - A1 and A2 should be captured only to verify at the end.
- **A3 claim.** In A3 (and G2) the dominant defect is the bare mound at the tip, left of the complex, which this spec explicitly does not touch. A3 will at best be a small coherence gain. The +0.4 to +0.6 zone A estimate needs about +1 mean on both A1 and A2 plus a gain on A3.
- **The mood could be lost.** The baseline's one praised quality is the warm glow and its reflection. 45% dark timber, 25% plaster, sandstone masonry and planting will be darker per square metre. If lantern and window density falls, the judge may prefer the brighter baseline at A1 even with the defects.
- **`prof: 7` needs more than a branch next to `prof()`.** `vs` applies the ring scale to both axes, and the normal uses `dot(rg.n, rg.p) * dp.x` for every face. With scaling in z only, the gable end faces must stay vertical, so the normal path needs its own branch too.
- **Shop units.** "Reuse the `interior()` shop mode" refers to a WGSL function that is driven by material and mode, not a JS generator. The spec does not say how a WOOD unit selects the shopfront path.

### What would make it stronger
- Start from the measured section (about 86 m high, 1.8–2.3 slope, about 12 levels) and design a **façade-stack section** like the real Hongyadong:
  - each level's roof is the next level's gallery or street;
  - pitched roofs appear only as pent eaves on the front face, or on units at the front of deep bands or on top;
  - add an explicit clearance rule: a unit's height plus its roof must fit below the next band's underside within the overlapping depth, or the unit is set forward.
- Make the solver also test **obstacles above and beside** a piece: existing parts and colliders, with the two Raffles tower footprints named. Replace the radius test.
- Fix the gallery cantilever (1.5 m, or count brackets as support).
- Replace the quick test:
  - build a full-dressing **60 m slice** (all 12 levels, roofs, galleries, lanterns) and capture it from 2–3 non-eval cameras;
  - pass criteria: no roof or gallery interpenetration, measured gbuffer and lighting delta at a close non-eval camera, and an informal blind A/B against the baseline at the same camera.
- Give a part and prop count from the real level count, and keep a hard local cap so the global prop budget can never starve districts.
- Do art direction on held-out cameras only. List G2 as an affected pose.
- Keep the emissive density (windows, lanterns, eave glow) at least equal to the baseline's.
- Say whether the length clamp extends the complex south around the tip, since that is what would help A3 and G2.
