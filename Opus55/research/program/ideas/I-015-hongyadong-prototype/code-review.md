## Code review round 1 (2026-11-24)

**Branch:** idea/I-015 at bb2de29 (code in c61e67d)
**Verdict:** fail

Two serious problems stop it from going to evaluation as it stands:
1. The change also alters random values outside the complex. Every neon sign in the city gets different text and colours, which is not recorded. The steppe landmarks and the market also change, and DEVIATIONS explains this wrongly.
2. Every fly-through run of I-015 fails the p99 gate. That includes a run sandwiched between two clean baseline runs. Nothing yet shows this is GPU contention.

The geometry code itself is careful and matches the spec. Both problems can be fixed without changing the design.

### Matches the spec
All ten required fixes are implemented, and the code matches DEVIATIONS with a few small exceptions (listed under minor).
- **Per-station level count.** `buildStations`: per-station crest, `floor((crest − 7)/7.2)`, erosion over ±2 stations, runs shorter than 3 stations merged into the lower neighbour, and the 480 m clamp trimming the end with the lower crest.
- **Ends.** End pavilions, corner returns (`sideEave`/`sideRail`) and the plaza balustrade.
- **Stilt toe.** Braced stilt frame at the toe.
- **Lift.** Inside the stack, with bridges of 0.4 and 4.1 m.
- **Raffles tower 4.** Podium treated as support, and a skirt in front.
- **Vegetation.** `gardenReserve` segments (checked: garden creates the array, buildings appends to it, and vegetation stamps it with the right angle convention).
- **Eave glow.** 0.32 m emissive strips.
- **Material ids.** New ids 21–25 and no flag bits.
- **Colliders.** Colliders on the decks.
- **Prop cap.** Scales with quality level.

The quick test went further than asked (the full complex instead of two slices, and six held-out cameras instead of three). The one unmet check is the `bench.mjs` gate.

No eval pose coordinates are used anywhere (searched for pose ids, `poses`, and the A1/A2/A3/G2 coordinates). The site comes from the landmark hint point plus rules. There is no new per-frame code: everything runs at init, so there are no per-frame JS allocations.

### Problems

- **serious: random streams outside the complex change, so every pose changes, not only the target poses.** `buildings_stilts.js:698`, `:983`; `buildings_landmarks.js:659`; `signPlace.js:23, 253`.
  - **Signs (not recorded).** `signPlace.js` draws every sign's word, colours, animation and flicker from one stream, `rng(9137)`, in the order of `world.signSlots`.
    - The old `stilts()` pushed no sign slots. The new complex pushes shop-sign slots and a lift slot during `genLandmarks`, which runs before the market and all district lots.
    - Every slot after them therefore takes different random values. Every sign in the city changes text and colour, and so do the sign lights.
    - Checked on the implementer's images: in base-H2 and v3-H2, a rooftop sign on a hillside tower behind the complex is orange in the baseline and cyan in I-015.
  - **Steppe landmarks and market (explained wrongly).** The old `stilts()` drew roughly 1 + 4 values per tier per column from the shared landmark stream `R = rng(9137)`, about 300–400 draws. Removing it shifts the stream for everything generated after it:
    - `gerdome`: hut radii and `gerHut` details;
    - `registan`: minaret heights 36–42 m and their details;
    - `genMarket`: which stalls exist, their offsets, fabric colours and goods, and the number of market sign slots.
    - A shifted stream gives completely different values, not "few-metre differences". `crystal` and `beacon` draw nothing, so they are unchanged.
    - The claim that only G3 sees the steppe is wrong. G1 looks almost straight at the registan (about 10° off axis, 4.9 km away) and the gerdome, and B3 has the registan near its frame edge at about 2.5 km. At those distances the minaret changes are about 1–2 px. The market changes are not visible in any eval pose.
    - Because the market's slot count changes, the market alone would also shift the sign stream.
  - **Light budget (not recorded).** Complex lights are priority 3, the old ones were priority 5, and both count as high-priority lights. `LIGHT_BUDGET` is 1450, so a different high-priority count changes how many of the shuffled low-priority shop-spill lights survive. The last few to about 20 in the shuffled list are now dropped or added at random places in the city. This is small but city-wide.
  - **Why it matters.** The judge compares the candidate with the current best on every pose. Changed signs on B1–B4, A4–A6 and G1–G4 add differences that have nothing to do with the idea. That can create, or hide, a "clear loss elsewhere".
  - **Fix:**
    - (a) Collect the complex's sign slots in a local list and append them after all other slots (one line at the end of `generate()` in `buildings.js`, after the walkways).
    - (b) Keep the shared landmark stream identical by replaying the old `stilts()` draw count: run the old column walk and its tier loop, which use only terrain queries, calling `R()` exactly as before without placing parts. This keeps gerdome, registan, the market and the market's sign slots identical to the baseline.
    - (c) Record the light-budget shift, or keep the number of high-priority lights equal to the old complex's.
    - After the fix, check that the B2 and A4 captures match the baseline pixel for pixel outside the complex's region.
- **serious (unresolved; likely real until shown otherwise): GPU p99 gate.** See "GPU p99" below. Every I-015 fly-through (bench-1, bench-2, ab-dev-1) has p99 22–24 ms. Both clean baseline runs, one finishing a minute before and one a minute after ab-dev-1, have 11.5 ms. Do not evaluate until a quiet back-to-back pair passes.
- **moderate: the dev-only paths run in production.** `buildings_stilts.js:45` (`devQuery`), `:245`, `:1157`.
  - `devQuery` tests `location.search` without checking `__DEV__`. `build.mjs` defines `__DEV__` false in production, but nothing here uses it.
  - Opening the production page with `?hydmask` repaints the whole city black and magenta. `?hydaudit` runs the pairwise audit at load.
  - The eval's query string contains neither, so results are not affected, but the requirement "dev-only" is not met.
  - **Fix:** `const devQuery = (k) => typeof __DEV__ !== 'undefined' && __DEV__ && …`. esbuild then removes both paths from `index.html`.
- **moderate: the audit's exemptions are wider than DEVIATIONS describes, so "0 overlaps" overstates what was checked.** `buildings_stilts.js:225`, `:1103`, `:1108`.
  - **Tower bays.** `joint()` makes any piece of a tower bay (including its eaves, lanterns, AC units, pavilion and roofs) a joint with any unit piece at level ≥ kb. `inner` then exempts these at any depth. DEVIATIONS says "units butting against a tower bay's sides". In practice, units are skipped over the tower span, so the real overlaps are small side wedges hidden inside the stack, but the audit would not catch a deep one.
  - **Podiums and underpins.** Every overlap with a podium or underpin is skipped (`continue`) and not even counted as a joint. DEVIATIONS says only burial into them is exempt.
  - **Not audited at all:**
    - props registered without a role (steps, plaza trees and canopies, lamp heads, potted plants);
    - complex pieces against the obstacles (Raffles parts are in `obstacles`, not in `pieces`), except where `resolve()` and `blocked()` handle units and dressing;
    - anything outside the complex (promenade, district buildings).
  - **Assessment.** I found no evidence that these exemptions hide visible clashes: dressing is placed with a 0.3 m joint limit against everything, including underpins. But 4,784 exempt joints against 9,363 pieces is a lot to leave unexamined.
  - **Fix:**
    - report the joints by category, with the maximum depth of each;
    - cap tower joints at about 1 m and limit them to body, core and tower roles;
    - store the carried unit's group on each underpin and exempt only that pair;
    - add the obstacles to the audit's piece list.
- **minor:**
  - Undercroft lights: `Math.round(D.t0) % 8 === 0` with `t0` in steps of 3 stations gives one light every 24 stations (96 m), not every 32 m as DEVIATIONS says (`:854`).
  - The comment on `FACADE` (`:35`) has the `END_STEP` comment pasted into it.
  - `stats.features` is on the same line as a closing brace (`:515`).
  - DEVIATIONS does not record `stats.maxDepth`, although it says units may exceed 20 m.
  - The complex's props no longer count towards `B.props`, while the old `stilts()` props (about 450) did. At low quality, where the 20,000-prop budget fills, districts now get those props. This has no effect at high quality.
  - Units narrower than 2 m get no collider (`buildings.js` skips `min(hw, hd) < 1`), so the plaza has small holes there.

### GPU p99: likely cause and fix

**What the reports show** (`<worktree>/Opus55/source/out/I015/*/perf-report.json`):

| Run | finished | GPU avg / p50 / p99 | lighting p99 | TAA avg / p99 | post p99/avg |
|---|---|---|---|---|---|
| ab-base-1 | 03:30 | 9.51 / 9.40 / 11.45 | 4.34 | 0.89 / 0.94 | 1.04 |
| ab-dev-1 (I-015) | 03:31 | 10.12 / 9.53 / 22.22 | 10.91 | 0.94 / 2.30 | 1.07 |
| ab-base-2 | 03:32 | 9.58 / 9.46 / 11.58 | 4.38 | 0.89 / 0.94 | 1.05 |
| bench-2 (I-015) | 03:28 | 10.24 / 9.41 / 24.25 | 12.21 | 0.97 / 2.55 | 1.06 |
| bench-1 (I-015) | 03:27 | 13.33 / 9.86 / 24.62 | 11.96 | 1.40 / 3.81 | 1.12 |
| contended runs (ab2/ab3, both builds) | | 15–31 avg | 15–25 | p99/avg 2–3 | 1.7–3.1 |

**What this means:**
- p50 is unchanged and only p99 and the maximum rise. That is a short event: the top 1% is about 30 GPU samples, or roughly 0.6 s of the 58 s run. It is not a steady extra cost. The 38 lights, the 10.9k parts and the shader would each raise the average and p50 across every frame where the complex is visible, and they do not.
- The signature differs from the contended runs. There, `post` (a tiny pass) is also inflated, with p99/avg 1.7–3.1. In the three I-015 runs it is not (1.06–1.12), while lighting, TAA, fog and SSR are.
- The event appears in 3 of 3 I-015 runs and 0 of 2 clean baseline runs, including the run between them. So I would not call it contention without a quiet back-to-back test.
- The rise in TAA p99 (a pass whose cost does not depend on the scene) still points to a clock or GPU-sharing component in those frames. A camera-motion effect (huge motion vectors at close range) is the other possibility.

**Ruled out from the code:**
- **The 38 priority-3 lights.** Radii are 10–18 m, against 22 m for the old complex's lights. `TILE_MAX` is 256 per tile, which a handful of small spheres cannot approach. The total stays at 5,033 because `LIGHT_BUDGET` keeps it fixed, and the per-tile culling loop over all lights costs the same.
- **The 10,942 parts.** `bld-cull` p99 is identical (0.54 against 0.55).
- **The shader change.** `interior()` is already inlined at three other call sites (lines 406, 789 and 870 of `buildings_wgsl.js`), and the new call sits in a branch with less live state. Peak register count should not rise. Divergence is limited to SHOPWOOD lower floors. There are no derivatives in `interior()`, so uniformity is fine, and all reports show no WebGPU errors.
- The gbuffer average does rise by 0.17 ms, against 0.02 ms between the two baseline runs. That is a real but small all-frames cost, well inside the 11 ms average gate.

**Most likely place: the low pass over the south end and the plaza at t ≈ 5.5–7.5 s.**
- The path segment (420, 80, 650) → (260, 70, 120) → (−200, 60, −500) passes about 20–30 m from the new south end, which reaches z +99, where the old complex did not. It then crosses the plaza a few metres above the deck and its props.
- In those frames the wet plank caps (`S.wet` 0.85, rough 0.4, which wet weather lowers to about 0.1) cover most of the lower screen. The SSR classifier treats every one of those pixels as reflective ground and traces them. SSR p99 roughly doubles (0.99 → 1.88).
- In the same frames the near plaza lights (r 16 at 4.5 m) and the tower-bay pavilions are at camera distance. Plaza trees and potted plants use `prof: 2` curved meshes, each with thousands of triangles.
- The implementer's static probes cannot see this event. A frozen camera has zero motion vectors, so the TAA and SSR history costs differ, and the probes were not placed in the 1–2 s skim window.

**Fix, in order:**
1. **Measure the window, don't guess.**
   - On a quiet GPU (check `nvidia-smi` utilisation under 5% and that no other `chrome --user-data-dir=*opus55*` is running), run base, I-015, base, I-015 with `bench.mjs --seconds 60`.
   - Reject any run whose TAA p99/avg is above 1.15. TAA cost does not depend on the scene, so it is a simple contention detector.
   - Have a dev-only copy of `__bench` record the per-frame GPU total with the fly time (not a change to the frozen eval harness). Then the p99 frames can be placed on the path.
2. **If the spike sits at the plaza skim** (my expectation):
   - Make the plaza caps less reflective than the galleries. For the top level's roof, set `S.wet` to about 0.5 and rough to about 0.55, which puts them under the SSR threshold except where wetness is highest. Keep the reflective planks on the narrow galleries, where they read best. This is a material rule for all top roofs, not a path-specific change.
   - Swap the `prof: 2` sphere foliage on the plaza and gallery props for the cheaper box or low-segment mesh.
   - Set `detail` on plaza lamps, planters and potted plants so the existing distance cull removes them.
   - Do **not** move dressing off the bench path; that would be tuning to the bench.
3. **If the spike also happens with I-015 hidden** (for example, run `?hydmask` with the complex's parts set to zero height in a dev build), it is contention or clock behaviour. Record that with the quiet-GPU pair and close the issue.

I could not run my own GPU captures. An I-016 `bench.mjs` (profile opus55-I016-bench) and an I-009 capture browser were running on both checks, and `nvidia-smi` showed 100% utilisation. Per the instructions I did not start a browser.

### Art (held-out images v3-H1…H6 against base-H1…H3)

**Verdict: repetitive enough to risk losing blind comparisons; fix before the A/B.**
- **What works.** The complex is now grounded, continuous and of the right scale, which fixes the two critics' top findings (it floated, and it was sparse). The stilt toe (H5) and the plaza (H4: wet reflective planks, pailou gate, lamp posts) are the best new detail.
- **The coordinator's reading is right.** At H1, H2 and H3 it reads as one 480 m wall of the same glowing ochre lattice, with 10–12 identical 7.2 m bands. It has two glow strips per level, every level, across the full length.
- **Little roof variety.** The upswept hip roofs, the most recognisable Hongyadong feature and present in the baseline, now exist only on the small tower-bay pavilions.
- **Variants don't read.** The eave colour variants (teal and red, 30%) and the wall families (plaster, lacquer) cannot be seen, because the lit lattice covers almost every facade.
- **No dark gaps.** There are almost no dark gaps or recesses; even stair bays glow.
- **The ends read as a ship's bow.** One level less every 8 m (a slope of about 42°) gives a smooth diagonal hull (H2 right, H3 left). From the river the whole thing reads like a cruise ship.
- **Likely outcome.** I expect a likely win at A1 (presence and grounding beat floating pavilions at 250 m). At A2 (close, where the regularity and missing roofs dominate) it is a toss-up. A3 is at risk from the bow-shaped south end. The baseline critics already criticised repetition, and this replaces one repeated module with one repeated band.

**Rule-based variety fixes** (all drawn from the complex's own seed, none keyed to cameras):
1. **Occupancy per unit.**
   - Each family draws a lit mix, for example 15% dark or closed (shutters, no lattice glow), 25% dim, 45% normal and 15% bright or red-lantern. Each unit draws from its family's mix, so dark patches cluster into vertical and diagonal gaps.
   - Widen `glow` from 1.1–1.5 to about 0.2–1.8.
2. **Fewer gold lines.**
   - Keep the emissive strip on the upper (roof-edge) eave only. Give the mid-level pent eave a dark tile edge.
   - Vary strip intensity per family (0, 1.2 or 2.4).
   - This halves the uniform striping and lets each level read as one band.
3. **Real roofs.**
   - On the top unit of each run, at every level-count step, and on a "pavilion" family (about 25%), replace the flat pent eave with a hip or gable roof (`prof: 4` with taper, upswept corners) that breaks the eave line.
   - Put gable ends facing the river on every tower bay.
   - Give the tile plates a lighter edge so the grey, teal and red families read at 250 m.
4. **Vertical rhythm.**
   - Place tower bays every 30–40 m instead of every 62 m, with heights of 3–8 levels, projections of 2–5 m and different crowns (double eave, gable, pavilion).
   - Add a 2–4 m dark recessed slot (an alley or stair, lit only by a few lanterns) at about half of the family boundaries.
5. **Readable materials.**
   - Plaster families: small windows and lower lattice cover, so the white walls and dark frames show.
   - Lacquer families: red walls with dark windows.
   - Limit full-lattice walls to about 40% of families.
6. **Gallery depth and dressing.**
   - Vary the gallery offset per family by ±1.5 m.
   - Add two-storey oriels and balconies projecting 1.5–2 m on about 15% of units.
   - Put greenery in 20–30% of galleries, and add more and larger vertical shop signs (the real Hongyadong has many).
7. **Skyline.** Per family, either drop the top level (a roof garden with a pavilion) or add a pavilion storey, so the crest is not one flat line.
8. **Ends.** Step two levels every 16 m with a pavilion roof at each step, or end on a taller tower bay. Avoid the smooth 42° hull.

### Checks run
- `git diff c43ed1f bb2de29 --stat`: only `buildings_stilts.js` (new), `buildings_landmarks.js`, `buildings_wgsl.js` and the idea's `DEVIATIONS.md` changed.
- Read the whole of `buildings_stilts.js` and the shader and landmark diffs. Traced the shared streams through `buildings.js` (`generate`, light budget), `buildings_gen.js` (`Builder.slot`, `Builder.light`), `signPlace.js` (single `rng(9137)` over `signSlots`), `buildings_landmarks.js` (R use in gerdome, registan and genMarket; none in crystal or beacon), `garden.js` and `vegetation.js` (`gardenReserve`), `build.mjs` (`__DEV__`), `dev.js` (bench path and statistics), `renderer.js` (`TILE_MAX` 256, wet and rough handling) and `waterSSR.js` (wet-ground classifier).
- Compared the pass tables of all 14 perf reports in `out/I015/`, and the finish times of the runs.
- Compared crops of base-H2 and v3-H2: a sign changes colour away from the complex.
- Viewed v3-H1…H6 and base-H1…H3.
- Not run: GPU stats captures, because an I-016 bench was running both times I checked (`nvidia-smi` 100%). Builds and `functional.mjs` are as reported by the implementer (18/18, no WebGPU errors in any report).

### Evaluation untouched
`git diff c43ed1f bb2de29 -- Opus55/eval` is empty. Nothing in `Opus55/eval/`, the pose set or the judge prompts changed.
