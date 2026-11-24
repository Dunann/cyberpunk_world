## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 5 | The first vegetation idea in the program, and it is rule-based rather than a plain asset swap. But each part is a textbook technique: lobed crowns, a trunk on every LOD, slope rules, Poisson-disc groves, cluster planting, plaza types chosen by hash. |
| Feasibility and credibility | 5 | Most code claims check out (see below), and the quick test has a real stop rule. But four claims are wrong or missing. Step 6 already exists on main. The slope rule misreads the forest mask. "Walks unchanged" is false for part 4. The GPU estimate counts vertices, not triangles. The identity check in step 21 also contradicts steps 6 and 17–19. |
| Expected impact | 5 | It fixes a defect that both critics and the judges name. But vegetation is only change 9–10 on the critics' lists, and the spec itself forecasts zone G +0.3 at most. Parts 3–4 take light out of exactly the parks that won I-016 its three targets, so G2, G3 and B3 carry real loss risk. |
| **Overall (average)** | **5.0** | |

### Claims checked against the code (main)
- **Correct.**
  - `broadleaf(lod >= 2)` is `M.blob(cc, …, 0, …)`: a subdivision-0 icosphere (12 vertices, 20 triangles) centred at 9 m with a vertical radius of about 3.1 m and no trunk (`vegMeshes.js:133-135`).
  - LOD 2 starts at 130 m (`v[13] = 130`). The far ring sets `s *= 1.65` and `lod = 3`.
  - `place()` sets `t.a.y = h - 0.3` from the centre height only.
  - Pine, bamboo and willow far LODs have no trunk either. The pine cone base is at about 2.6 m, the bamboo and willow blobs at about 2.7–2.8 m.
  - `ROW`/`WALK_ROW` spacings are 8–13 m at scale `0.72 + 0.12·R()`.
  - `UPLIT = 12` uplights 2,382 of 2,570 park trees (I-016 DEVIATIONS), which is 93%.
  - The `rng(4242)` fixed-tree loop always draws two values per tree, so changing y does not shift it.
  - `fixedPrefix` is 948 street and 238 garden trees.
  - `rng(6161)` is used only in `parkTrees`.
- **The spec understates how high the floating balls hang.** In the near ring beyond about 470 m, `s *= min(inverseSqrt(keep), 1.75)` combines with `s` up to 1.5. A LOD-2 broadleaf there has its crown bottom about 15 m above the ground and is about 22 m wide. This strengthens the motivation for step 3, which is the core of the idea.

### Strongest reason it will fail
Parts 3 and 4 remove most of the light that won I-016 its targets, and G2, G3 and B3 are judged from the air at night.
- **What changes.** Uplit park trees drop from 93% to about 25%, which also removes about 1,700 of the ground-glow discs that `bakeTreeLight` paints under them. The LED plaza floors (`plazaM` wave, `plazaEm`) go. A quarter of the plazas, with their pools and lantern rings, are deleted.
- **What happened before.** I-016 round 1 had a dark Lantern Park. Its code review called it "a black field with thin lines" and predicted a G2 loss of about 35–40%. The fixes that turned it into 3/3 clear wins were "uplight every tree within 12 m of a walk", ground glow under uplit trees, the LED plaza floors, and lantern rings around plazas.
- **What this spec reverses.** It undoes exactly those fixes on the three poses it most needs to win. G3 (see `runs/I-016m/G3`) reads the park as a chain of glowing plaza rings and uplit groves at 1–2 km. Stone terraces with a 0.24 m curb, plus 25% uplighting, will be close to invisible at that distance.
- **What the judge sees.** Judges named "decal-like plazas" and "lollipop rows" as defects, yet still chose the lit park clearly. A blind judge comparing a lit park with a darker, more naturalistic one is far from certain to prefer the darker one.
- **The safeguard does not cover the risk.** The 40% uplight fallback is tested only on H1 and H7, not on aerial views like G3. Nothing tests the plaza-emissive removal at all before eval.

### Other concerns
- **Step 6 already exists on main.**
  - `terrainShade.js:285-297` already fades the crown-dome relief with `domeK = smoothstep(220, 650, dist)`. It shows a flat, dark forest floor (`floorC`) close up, with the comment "where real trees stand on it".
  - G4's bumpy hillside at 200–600 m is that blend zone (domeK 0–0.9), not a missing feature.
  - Removing it there means pushing domeK beyond the near ring (650 m). Out there, only sparse 20 m far-ring clumps stand, so the result is either a bare dark band or a visible ring seam at the near-ring edge. That edge also moves with quality (480 or 650 m).
  - The spec needs a concrete rule, for example tying the floor and dome mix to the same per-cell density as the scatter. "One smoothstep" is not enough. The "removes the bump-texture hillside" claim is unsupported as written.
- **The slope rule removes dense forest that the mask keeps on purpose, and it is not needed for grounding.**
  - The baked mask already fades forest out at `1 − n.y` from 0.30 to 0.48 (`terrainGen.js:77`). That is a gradient of about 1.0 to 1.6.
  - The spec's thinning band (|∇h| 0.6–1.0, i.e. 31°–45°) lies entirely where the mask is still 1. Inside that band, 0–60% of trees are removed and every kept tree is forced to a shrub.
  - Those are the Chongqing hillsides: G4's left bank, G1's Nanshan slope (lower right of the frame), A5's forest, and Lantern Park's steep bank.
  - Near-LOD trunks already reach `−0.5·s − 0.3` below the centre height, so they do not float on a 1:1 slope. The floating comes from the trunkless far LODs.
  - So the rule trades tall forest for bald or shrubby slopes, a visible character change, to fix a problem it does not cause. No share of affected trees is measured.
  - Shrubs are "drawn only within 400 m" with no fade. That gives a pop ring at 400 m and leaves steep far-ring slopes bare.
- **Grounding is checked against the wrong surface.** The terrain mesh is CDLOD: 2 m vertex spacing at the finest level, doubling with distance, so about 8–16 m at 300–600 m. Step 22 compares trunk vertices with analytic `heightAt` samples. It can report 0 failures while trees at 300–2,000 m still float or sink by a metre or more against the rendered mesh. The audit should sample the morphed CDLOD height, or the trunk stub should be sunk by an error bound for its LOD.
- **The GPU estimate counts vertices, not triangles or tiny-triangle cost.**
  - Far LOD goes from 20 to about 248 triangles (12×). Shrubs are 3–5 lobes at subdivision 1, i.e. 240–400 triangles each, over "~8k instances". Together that is plausibly 4–6 M triangles a frame, against about 0.3 M today.
  - At 500–2,000 m these are 1–3 px triangles. Rasterization runs in 2×2 pixel blocks, so tiny triangles waste most of the fragment work, and triangle setup throughput becomes the limit.
  - I-016's "hiding all trees costs only 0.3–0.5 ms" was measured on today's 20-triangle far meshes. It does not carry over to meshes 12× heavier.
  - My estimate is +0.3 to +1.0 ms, not +0.05 to 0.15. The quick-test bench stop (+0.15 ms) should catch it, which is good, but then part 2 must be redesigned. Subdivision-0 lobes (60 triangles for 3 lobes) are enough for a 10–20 px far tree.
  - The "~8k shrubs within 400 m" figure also contradicts the near-ring counts. There are only about 13k near-ring cells within 400 m before the density thinning. Either most of the forest there becomes shrubs, which is a large unforecast visual change, or shrubs are extra instances, which is unbudgeted. The spec must say which.
- **"Walks unchanged" is false for part 4.**
  - `plazaAt` stamps `R.plaza` and, through `stampDisc → stampCoarse`, `R.lit`. It also adds `link` walks.
  - `secondaryPaths` reads `coverage(R)` and `R.lit` and draws from `R6` for each path. Pond acceptance also depends on `R.plaza` and draws from `R6`.
  - So deleting 25% of plazas and changing radii to 9–16 m changes the secondary-path network, ponds, lamps, posts and park lights.
  - `rng(6262)` is park-only, so this does not break any city-wide stream. But the spec's stream table and forecast are wrong. It must also say whether plaza types are applied inside the layout, which changes the lawn gate, or after it.
  - "Plaza index i in the existing order" includes the spur-end `terrace` plazas (r 4.5) and the `star`. That name already collides with the new "raised stone terrace" type.
- **The identity check in step 21 cannot pass as written.**
  - With `treeLodMask = 0`, step 6 still changes terrain shading on every forested slope in A3, A5, A6 and others.
  - The plaza geometry is garden mesh and the park-ground emissive is terrain shading. Neither is hidden by `treeLodMask`.
  - The check will either fail or be waived. It needs to exclude terrain-forest and park pixels explicitly, for example by also disabling step 6 and part 4 for the identity capture.
- **Mixing species on fixed trees.** Splitting species 0 by hash on the 948 street trees turns monospecific avenue rows into random dome, banyan and oval mixes. Real avenues are planted with one species. It also changes non-target poses with street trees (A4, B2), with no forecast. Apply the split to forest and park trees only.
- **There is no LOD-matching rule.** The far LOD's lowest lobe reaches "within 4 m of the ground" (mesh units or world units? scale reaches 2.6). LOD 0/1 has its crown base at about 5.6 m. LODs switch hard at 130 m (forest) and 420 m (fixed trees). That will pop visibly in the motion bursts and the fly-through unless the crown silhouettes match across LODs.
- **The bundle hides which part helps.** Parts 1–2 (forest meshes, city-wide) and parts 3–4 (park redesign with lighting changes) have opposite risk profiles, and only one pairwise result comes back. The quick test gates parts 1–2, which is good, but parts 3–4 go to eval untested on aerial views.
- **Shader updates are not listed.** New species need entries in the `sp ==` selects for AO height, uplight height, sway amplitude and far colour (`vegetation.js:203, 311, 320`), and `buildTreeMeshes`' LOD mapping needs extending. This is minor, but it belongs in the plan.

### What would make it stronger
- **Split the idea.**
  - **I-021a:** grounding plus crowns (steps 1–4 and 7–10, without the slope-removal band). Judge it on the 8 rule-placed forest cameras plus all eval poses. Targets come from the tile rule.
  - **I-021b:** park planting and plazas as a separate idea. Its own quick test must include aerial held-out park cameras (G3-like, 600–1,500 m) with a stop rule, and must keep park light at least equal to main. Keep the LED floor, or replace its light with lanterns, bounded-ring pools or lit planters. Keep uplight at 40–60%, with clusters' head trees lit.
- **Change the slope rule.** Sink the trunk and ground the crown at all slopes, and only thin above |∇h| ≈ 1.0, where the mask is already fading. Report the share of forest trees affected on the fly-through.
- **Replace step 6 with a concrete rule.** Either drop it, or tie the floor and dome mix to the scatter's per-cell density (`keep` and the near/far ring weights). Then the ground is bumpy only where no tree stands, with no camera-distance ring.
- **Size far LODs by triangle count.** Use subdivision-0 lobes (about 60 triangles plus an 8-triangle trunk) at LOD 2/3. Shrubs should be LOD'd as well (subdivision 0 beyond 100 m). Budget triangles a frame, measured with `__vegCounts` × triangles per list, not vertices.
- **Measure grounding on the rendered surface.** Run the floating audit against the CDLOD-morphed height at the tree's LOD, and add one low held-out camera on a steep forested slope at 300–600 m.
- **Fix the identity check.** Capture with trees hidden, step 6 off and part 4 off, then require a pixel match. Run a separate check for the street-tree prefix and species.
- **Correct the stream and layout table for part 4.** State whether plaza types apply before or after `secondaryPaths`, and re-measure the lawn gate in both cases.
