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

## Code review round 2 (2026-11-24)

**Branch:** idea/I-015 at 6cdfcf7 (code in e59c948)
**Verdict:** pass

Both serious problems from round 1 are fixed. The fix for the shared random streams is proven at the data level. The p99 gate passes on quiet back-to-back runs, which also show that round 1's p99 failure was GPU contention: my round-1 suspicion of a real spike at the plaza was wrong. The round-1 moderate items are fixed. What remains is minor and does not affect the evaluation.

### Round-1 findings, rechecked
- **Random streams (serious 1): fixed and proven.**
  - **Shared landmark stream.** `earlierStiltsFootprint()` (`buildings_landmarks.js`) replays the old `stilts()` exactly: the same seed search, the 17-column walk, `R()` once per column plus `floors` and three more draws per tier, and the same prop budget (`B.props` advanced only while under budget, as `B.prop` did).
  - **Part seeds.** Round 1 also missed something the implementer found: `Parts.add` gives a part without a seed the seed `(index × 7.31) % 997` (`buildings_gen.js:32`), so every district part after the complex was reseeded. Placing the first 1,306 complex parts at the old indices and appending the rest in `finishComplex()` keeps every other index, and so every seed. `hyd-identity.mjs` compares the full 24-float rows (seed included) index by index, so this is proven: 132,598 of 132,598 identical (equal hashes), and the 1,306 old indices all lie in the complex's box.
  - **Signs.** The complex's slots now come after all others and are tagged `own`. Signs: the first 83,457 rows identical. Sign lanterns and the 58,627 city slots identical. The city's sign lights are chosen from untagged candidates with the unchanged budget (2,150 in both builds). The complex gets 64 more (it has 88 signs, so its allowance is full).
  - **Lights.**
    - The 34-light allowance is right. The replay counts `1 + (k > 3)` per column, the same rule as the old code. The report shows exactly 34 baseline-only lights and 111 I-015-only lights (47 complex lights plus 64 complex sign lights), all inside the box, and the 4,999 shared lights in the same order.
    - Because the complex's lights are tagged and the city budget is `1450 − 34`, the same shuffled shop-spill lights survive.
    - Indices of later lights shift by 13 (for example, lightshow's `lightBase` goes from 2881 to 2894). That is an index offset only; nothing is keyed to it.
  - **Gap in the proof, checked by me.** The identity tool does not cover vegetation: fixed street trees are filtered by the exclusion mask and then given rotation and scale from one stream, `rng(4242)`, so a removed tree would shift every later tree. In both builds `nFixed` is 1,186 and `streetTreeCount` is 2,563, so no street tree was removed. The garden, bridges, towerTops and ledFacades states are also identical.
  - **Colliders.** The collider order differs (deck colliders are now added during generation). The only reader (`air.js` CBD corridors) makes yes/no tests, and the complex is not in the CBD, so the order does not matter.
- **GPU p99 (serious 2): passes, and the round-1 failure was contention.**
  - I read the gate reports in `out/I015/r2/gate`. The accepted pairs are: base 11.54 against I-015 11.70, and base 11.52 against I-015 11.77 (p99). Averages are 9.53 against 9.59, and 9.52 against 9.64. TAA p99/average is 1.05 in all four runs, and the maximum is 13.2–14.3 ms.
  - The traces settle round 1:
    - the quiet round-1 build (`trace-r1-045403`) is 9.63 / 11.79 / 13.20, with TAA at 1.05;
    - the contended one (`trace-r1-045139`) runs at 22–25 ms on every frame for the first 28 s, which is contention lasting the whole stretch, not a spike near the complex;
    - at t = 4–7 s the quiet round-1 build is only +0.2–0.3 ms over the baseline.
  - The dry plaza and the detail props are extra margin, not a fix that was needed.
- **Dev-only paths: fixed.** `devQuery` tests `__DEV__` (`buildings_stilts.js:52`), so it compiles to false in `index.html`. `this.devParts` is also dev-only.
- **Audit: fixed.** The blanket exemptions are gone. The joints are reported by category with their maximum depths (below the stated limits). The landmark obstacles are audited, and props have roles. Re-run: 0 unsupported pieces, and the overlaps as the implementer listed them.
- **Undercroft lights, comments, `maxDepth`, prop accounting, narrow-unit colliders:** all done as described.

### The coordinator's specific checks
1. **Identity proof: sound** (see above). Light selection is exact. Unseeded parts cannot shift, because every non-complex index is unchanged and the row comparison includes the seed.
2. **Underpinning masses and tower overlaps.** I checked with `upcheck.mjs`, `upexpose.mjs` and `upabove.mjs` in the scratchpad `cr15/`. All GPU runs went through `gpu-run.sh`.
   - **Shape.** There are 1,992 masses, total volume about 162,000 m³. 1,925 of them have a side under 1 m: banding by floor height turns a sloping rock face into stacks of 0.2–0.3 m slabs, one per 0.75 m sample row. 1,265 are taller than 7.5 m, and some reach 26 m.
   - **Cost.** Small: 1.4% of all parts, simple boxes, and the gate runs are within +0.12 ms on average.
   - **Exposure.** Analytic test: face samples 0.12 m outside each mass, counted as covered by terrain or by any box-shaped complex or landmark part. 154 masses have at least 1 m² not covered, 8,311 m² in total.
   - **Where they show** (painted flat green):
     - thin strips on both sides of the lift shaft (z −112 to −125), up to about 15 m tall;
     - the rear notches between tower bays seen from inland and above (z ≈ −228, −290).
   - **Where they do not show:** none appear in the river views (whole face, both ends, both end sides), the plaza view, or a high oblique like G3.
   - **How they look when visible.** In the normal render the visible faces read as plain timber walls, because they use the WOOD material at param 1.2. They are not a defect at any eval-like distance.
   - **Tower against facade.** In close shots of all three sampled tower/body overlaps (up to 2.08 m), including the 2.08 m one at (153, 72, −263), nothing is visible: the overlap lies inside the tower's footprint and under the tower block above. The tower/paving overlaps (0.11–0.15 m) are at plaza height and not visible.
3. **Shader inputs: valid.**
   - `occ = saturate(prm / 1.8)` and window style 6 apply only to materials 8 and 22–24, which only the complex uses (no other `MAT.WOOD` or 22–24 user in the code).
   - Every WOOD param in the complex maps sensibly: dark 0.06, dim 0.5, normal 1.15–1.35, bright 1.75; podium, skirt and underpin 1.2–1.3; deck 2.6 (occupancy 1, the lantern-lit underside still keys on `prm > 2`).
   - No derivatives were added inside the branches, and the runs report no WebGPU errors.
4. **Art:** see below.

### Problems
- **minor: underpinning is built from thousands of thin slabs.** `buildings_stilts.js:670–705`.
  - Grouping samples into 0.5 m floor bands per 0.75 m depth row turns a sloping rock face into stacks of 0.2–0.3 m slabs, up to 26 m tall.
  - Merge each column into one mass from the lowest floor in its band group, or step the bands at 2–3 m. Either should cut the count about tenfold.
  - Give underpins a dark param (about 0.06), so that their few visible faces (beside the lift shaft, the rear notches) read as plain timber or retaining walls rather than lit rooms.
  - Neither affects the evaluation.
- **minor: dressing skips break the eave lines.**
  - 217 eaves are skipped. The audit samples show a run on level 1 at the south end (z 44–93), skipped against the neighbouring unit's eave by 0.5 m, which leaves gaps in the lowest eave line.
  - 27 units are dropped by clearance.
  - Trim the neighbour's eave length, or let neighbouring eaves of the same level join (as the facade joints do), instead of dropping the piece.
- **minor:** the complex's 88 sign candidates exceed its 64-light allowance, so 24 complex signs have no light. This is cosmetic.

### Art (round 2, `out/I015/r2/compare/*.jpg` and the full-size `r2/` images)
**Verdict: varied enough. A1 is a likely win and A2 a probable win; the risk at A3 is low.**
- **Fixed from round 1.** The round-1 problem (one uniform glowing ochre band) is gone.
  - Dark, dim and bright units now cluster into vertical and diagonal patches.
  - Red lacquer, white-plaster and dark timber families read clearly at river distance (H2, H3, H5, the middle view).
  - Tower bays break the skyline at several heights, the dark slots and the lift add vertical rhythm, and the coloured blade signs add the cyberpunk accent the brief asks for.
  - The ends step down to end pavilions instead of the smooth bow (H5, H6).
- **A1 (far, from the river).** A grounded, continuous, varied cliff town against floating pavilions on a dark cliff; I expect a win.
- **A2 (close).** A probable win. The remaining weakness is the roofs: the hip roofs and upswept corners are small and dark, and from the river the crest still reads mostly as flat tops. The tower bays read as plain boxy mid-rises rather than pavilion towers, so a strict judge may call it generic dense housing rather than Hongyadong.
- **A3.** The south end now finishes in short steps against the mound. There is no hull shape and nothing floats or is cut open, so the risk is low.
- **If one more pass is affordable:** lighter, thicker ridge and eave edges on the crest roofs, so the upswept roof line reads at 100–250 m. It is not needed for a fair test.

### Checks run
- `git diff bb2de29 e59c948`: read in full for `buildings.js`, `buildings_landmarks.js`, `signPlace.js`, `signs.js` and `buildings_wgsl.js`; the changed parts of `buildings_stilts.js` (underpin, occupancy, unit, audit, return value); and `tools/hyd-identity.mjs` and `tools/bench-trace.mjs`.
- `out/I015/r2/identity/identity-report.json`, the gate reports (7 runs) and the trace files (3 runs), recomputed.
- `cr15/vegcheck.mjs` (via `gpu-run.sh`), `tr-base.html` against the rebuilt `dev.html`: vegetation, garden, bridges, towerTops and ledFacades are identical; only `gardenReserve` and `landmarkSites` grow.
- `cr15/upcheck.mjs`, `upexpose.mjs` and `upabove.mjs` (via `gpu-run.sh`, 1920×1080): audit re-run, underpinning statistics, the exposure test, and green-painted captures of 5 river views, 9 overlap close-ups, 8 exposure close-ups and 5 inland/plaza/high views. Images are in the scratchpad at `cr15/shots/`.
- `bench.mjs` was not run.

### Evaluation untouched
`git diff c43ed1f 6cdfcf7 -- Opus55/eval` is empty. `tools/bench.mjs` is unchanged; `bench-trace.mjs` is a separate dev tool.
