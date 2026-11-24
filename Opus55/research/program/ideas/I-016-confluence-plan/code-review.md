## Code review round 1 (2026-11-24)

**Branch:** idea/I-016 at d83534b (code in ad7a561; d83534b adds DEVIATIONS.md only)
**Verdict:** fail (one moderate correctness bug in a target frame, plus open spec checks; the stream identity and WebGPU plumbing are sound). The art risk at G2 is not a code defect, but it is large and should be fixed in the same round (see "Art").

### Matches the spec
- **Stage 1 and 2 built, stage 3 cut** (allowed by the spec). Plan data, infill pass `rng(5678)`, coverage map, `coverAt` / `cityInfo`, city ground, park ground, park trees with uplighting, approach avenues, infill lamps, shop lights, signs and traffic are all present.
- **Infill in `world.infillLots` instead of `world.lots`** (deviation 1). This is better than the spec's per-consumer skips: `prepareLots`, the sign lot loop on `rng(9137)`, `hillsideLife`'s `nearLot`, and the vegetation mask before the street-tree filter never see infill lots. Infill buildings are generated after skybridges and walkways with `B.slots`, `B.lights` and `B.prop` swapped out and restored in a `finally`. `genUrban` pushes nothing to `B.tops` or `B.led`, and `B.hillPods` is only read by `walkways`, which has already run. So the claim "identical by construction" holds for buildings, signs, shop lights, traffic, crowds and street lamps.
- **Review fixes:**
  - Done as asked: 2, 3, 4, 6, 7 (with the 18% Lantern / ~26% Silk lawn remainder that fix 7 allows inside designed parks), 8, 9 (within the cap, on 2 clean pairs rather than 3), 10 and 11.
  - Fix 5 (site edges): done with world features. But the frame shares were not recomputed and the forecast was not redone. The identity diff replaced it, and the diff shows that A1 and A3 change.
  - Fix 1: the stage-1 G2 gate was skipped (recorded).
  - Fix 12: the motion-burst diffs and the per-park shimmer bursts from plan step 11 are not reported.
- **Height rule:** factor 0.6–1.5 instead of 0.65–1.35 (recorded; reason not camera-based). Measured: 68 tower lots, largest 3 m band 19.1%.

### Problems
- **moderate:** An approach avenue runs through infill buildings, and cars are driven along it.
  - Where: `plan.js:396-428` (`streetTarget` picks the nearest grid crossing ≥ 40 m inland and never tests the segment against lots); `trafficCars.js:443-446` (each avenue becomes a traffic run).
  - Evidence (probe): the avenue from the Old Town Bridge north landing (1150, −40) to (1059, −84), 101 m long, has 13 of its 26 sample points inside infill lot footprints (+1 m). The ground paint skips built texels, so cars on that run drive through the walls of `genUrban` buildings.
  - Projected with the real G2 camera, this avenue lies at the right edge of the G2 frame (x 2428–2560 px, y 724–740, 535–580 m away). The other three avenues cross no lots and no water.
  - Fix: reject candidate targets whose segment passes within half the avenue width plus the sidewalk of any lot (infill or existing). Or compute the avenue corridors first and add them to the infill keep-out (`inRamp`-style) before lots are accepted.
- **moderate:** Non-target poses change, and the forecast was not redone (fix 5, fix 12).
  - A1 has 36 changed tiles outside the plan mask (max 5.2). A3 changes over the whole frame (mean 1.7, max 5.9, haze from the new lights). DEVIATIONS explains both; I found no code path that would make these anything other than real new content or new-light glow.
  - The adopt rule needs "no clear loss on any other pose", so the coordinator should know A1 and A3 are not identical.
  - The two eval motion bursts were not diffed against the baseline, and there is no burst over each park for path-line shimmer. These are process gaps, not known defects.
- **minor:** The `rng(4242)` fixed-tree identity is measured, not "by construction".
  - Suppressed hamlets drop their `reserve` rectangles. `world.shared.gardenReserve` is stamped into the vegetation mask *before* the street-tree filter (`vegetation.js:388`, `:466-469`).
  - In this layout it makes no difference. Probe, plan against `?noplan`: 1188 against 1195 reserve rectangles, but 948 filtered street trees in both, identical street-tree and garden-tree hashes, `garden.hamlets` 289 in both.
  - A future change to the plan or the hamlets could shift the stream. Keeping the suppressed reserves, or stamping them after the filter, would make it robust.
- **minor:** `?noplan` is not dev-only (`plan.js:278` reads `location.search` without `__DEV__`; the release build honours it). It cannot affect evaluation. Gate it like `dev.js` (`main.js:192`).
- **minor:** The second `StreetLamps` instance doubles a pre-existing per-frame allocation (`this.lastCam = [c.x, c.y, c.z]` in `terrainLamps.js` `update`). It is small, and `functional.mjs` heap check passes, but the BRIEF forbids per-frame allocations. No new per-frame allocations elsewhere: the signs `apart` set, infill runs and coverage texture are init-only.
- **minor:** Load time. `buildPlan` takes 843 ms, against the spec's estimate of under 0.2 s. The park-tree scan on a 1.5 m grid over the whole plan box adds more. Not gated, but a reason to scan only park texels.
- **minor:** DEVIATIONS numbers are slightly stale against the build at d83534b (probe): 1,866 park trees, not 2,026; avenue area 5,472 m², not 4,041; 68 tower lots, not 67.
- **minor:** Formatting `const VF =GPUShaderStage...` at `renderer.js:345`.

### Checks requested by the coordinator
- **Random streams.** Probe of the same build with and without `?noplan` (the switch removes every plan effect including hamlet suppression). Everything existing is identical:
  - Signs: 83,457 / 14,806 lanterns / 2,150 lights.
  - Building shop lights: 1,450. Existing parts: 133,904 (+2,016 infill). Existing props: 117,412 (+1,609 infill).
  - Street lamps: 5,749. Unfiltered street trees: 2,563, same hash. Filtered street trees: 948. Garden trees: 238, same hash. Hamlets: 289.
  - Existing light selections are unchanged. Shop lights take the first 1,450 of the `rng(4242)` shuffle exactly as before. The sign budget `min(2150, 8192 − count − 64)` is unaffected because the count before signs is about 3,000.
  - All new pools are added after the existing selections. Light index shifts (the +120 infill-lamp reserve comes before the garden and buildings) do not matter: flicker is stored per light, not derived from the index.
  - Hamlet suppression consumes exactly the same draws: `R()` calls are unconditional; `lantern` and `col` use no `R`; `hamlets++` still counts, so the `% 2` light parity is kept. Compounds after the hamlets get identical garden trees.
  - Traffic: existing runs use `rnd` (31337) unchanged; infill runs use 31338 and are appended. Crowds call `buildRuns` themselves and are unaffected.
- **Site edges and keep-out.**
  - No eval-pose coordinates in `src/`. Edges come from water, bridge crossings and bridgeheads, the Jiangbei–Bund centre line, the Ovoo summit (found by search), the 45 m contour, the Bund's last street, the Bund axis, and the 25% slope rule.
  - `PLAN_BOX` is a texture extent; no site touches it.
  - The stilts keep-out uses the shared `stiltsSite(world)`, which is now also called by `stilts()`. The site it finds is (240, −140). That equals the A1/A2 target, but it is the output of the existing search, not a literal.
  - The straight bridgehead chord is still visible as Lantern Park's inland edge in the western third (map4, H1). It is recorded, and it is a world-feature line, but the review asked for the park to reach the Old Town's first street.
- **WebGPU.**
  - Every pipeline that includes `WGSL_FRAME` uses `renderer.frameLayout` (renderer, buildings, lightshow, post, rain, waterSSR, and all `gbufferPipeline` / `forwardPipeline` / `computePipeline` users). That layout declares binding 7, and the frame bind group binds `coverTex`. `waterGen`'s `layout: 'auto'` pipelines include only `WGSL_LIB`. No WebGPU errors in two probe runs; DEVIATIONS reports functional 18/18.
  - Cost:
    - `coverAt` is 1 filtered sample plus 1 `textureLoad`, only inside the box.
    - `cityInfo` adds the `inPlan` test everywhere and those 2 reads inside the box.
    - `roadMask`, now built on `cityInfo`, is used only by the per-frame vegetation scatter (`vegetation.js:74`), after the mask and forest early-outs.
    - `groundShade` pays `inPlan` per near-terrain pixel, plus 2 reads inside the box (which also covers Jiangbei, the Bund, the Old Town and the peninsula tip). `parkShade` runs only where park > 0: at most about 5 `pkWalk` calls of 3 pools each, and the unrolled avenue segment loops (4 and 2 segments).
    - The infill lamp pools in `groundShade` add `coverAt` + `worldInfo` per lamp, only on built-coverage pixels beyond the infill real-light range.
    - This is consistent with the measured +0.05 ms gbuffer.
  - The existing `lamp-validate` shader includes `INFILL_LAMP_WGSL` but still calls `lampValid`, so its lamp list is identical (5,749 / 5,749).
- **Tools.**
  - `capture.mjs`: `--file` defaults to `out/dev.html`, as `launch()` did before. `--align` is opt-in.
  - `bench.mjs`: `--file` and `--profile` are passed only when given.
  - `functional.mjs`: `--profile` defaults to the old `opus55-functional`.
  - `probe.mjs`: `PROBE_FILE` defaults to `out/dev.html`.
  - `run-eval.mjs` calls none of the new options, so default behaviour is unchanged.
- **Merge with I-015.**
  - A textual conflict is certain in `buildings_landmarks.js`. I-015 (bb2de29) deletes `stilts()` and adds `import { hongyadong, devMaskComplex } from './buildings_stilts.js'` on the same line where I-016 adds `import { stiltsSite } from './plan.js'`. I-016 rewrites the first lines of the deleted function.
  - Resolution: keep I-015's deletion, and make I-015's `findSeed(world, L)` in `buildings_stilts.js` return `stiltsSite(world)`. The search is the same maths (`bankNormal` uses e = 3 and the same normalisation), so the site and `B.sites.stilts` stay the same. Otherwise drop the now-unused import.
  - No semantic clash found. I-015 does not touch `world.lots`, `prepareLots` or reserves that the plan reads. The plan land nearest the complex is about 516 m away, across the Jade River.
  - Both ideas target G2, so whichever is adopted second is judged against a different G2.

### Art (held-out images h4/H1, H3, H7, H8; h2/H2; map4)
- **What works.**
  - H2 (the Exchange from the north): the infill joins Jiangbei and the Bund into one continuous lit city with traffic and signs, and the dark plain is gone.
  - H3 (Silk Road Garden): the turquoise rings, star plaza and spokes read as a designed, lit garden.
- **What does not.** Lantern Park reads as a black field with thin lines.
  - H7 (top-down): a rigid gold lattice (cross walks exactly every 120 m, all at right angles) over pure-black rectangles of lawn. The plazas render as half-discs, cut by the `slope < 0.1` test and the 12 m inland offset. The river walk is barely visible.
  - H8: almost all lawn is black and one lit walk is visible. The near blur is a grove crown about 10 m from a camera at 40 m.
  - H1: dark canopy with a few gold uplit groves. The walks hardly register.
  - The reasons are in the shader numbers:
    - Lawn albedo is 0.036 / 0.054 / 0.025.
    - Bollard pools come from 3.5 m posts with a 15 m cut-off: emissive on lawn is about 0.04 at the post and below 0.001 at 10 m. So the lawn more than about 8 m from a walk is unlit, not just the 18% that is more than 25 m away.
    - Lantern Park has no lanterns. Stage 3, which carried the character (gates, pavilions), was cut.
- **Likely blind results (my estimate).**
  - **G2:** tie or loss as it stands, about 35–40% win. Lantern Park is about a third of the frame from 65 m up, and it will look like the image H7 shows from an angle: a dark void with a grid.
  - **G3:** likely win, about 65%. The central plain becomes lit blocks; the park band is a set of thin lines at 1–2 km.
  - **B3:** likely win, about 60%. The garden and the Exchange add designed, lit content. The risk is the boxy `genUrban` infill.
  - Adoption needs 2 of 3, so it currently rests on G3 and B3 both winning: roughly 40–45%.
- **Rule-based fixes** (tune on the held-out cameras only):
  1. **Light the lawn with real pole lamps, not bollards.** Lamp height 6 m, spacing 24–30 m, pool radius 30 m. Rule: every park point within 25 m of a walk receives at least a fixed minimum illuminance. Raise lawn albedo to about 0.06–0.08 (still dark grass), so pools show.
  2. **Make the unlit-lawn check a hard gate:** no more than 5% of Lantern Park and Silk Road Garden more than 20 m from a lit walk, plaza or lit grove. Meet it by adding secondary walks wherever a band between walks is wider than 40 m.
  3. **Break the waffle.**
     - Cross-walk spacing: hashed between 80 and 160 m.
     - Cross walks: curved, with a sine offset whose phase comes from the walk index.
     - Secondary paths: meander following low-frequency noise (the Chinese-garden rule: no straight path longer than about 60 m).
     - Plazas: centred on the flattest ground within 30 m of each junction (the search the Silk plaza already uses), so they are always full circles.
  4. **Put lanterns in Lantern Park.**
     - Strings of red lanterns along the river walk and every cross walk (one every 6–8 m, on alternating posts), using the existing lantern instances from the sign pass (`placeInfillSigns` already has its own stream and pool).
     - Add a warm-red pool term under each lantern.
     - This gives the park its name and character, and from 65 m it reads as dotted red lines rather than thin gold strokes.
  5. **Lit groves as islands.** Uplight every tree within 12 m of a walk (now about 30% of park trees), and add a ground glow disc of 5 m radius under each uplit tree on the lawn.
  6. **Water.** Turn closed low ground in the park (cells lower than all neighbours within 40 m) into lotus ponds with lit stone edges. The existing SSR then reflects the lanterns and pools, giving large mid-tone areas instead of black.
  7. **Restore a minimal stage 3** with existing part types, under 15 m: a paifang gate where each cross walk meets the inland edge, and a pavilion with lit eave lines on each plaza. These are vertical lit forms, which read from 65 m and 600 m.
  8. **Primary walk edges.** Use a physical LED curb of 0.2–0.25 m (not 0.07 m widened and dimmed). It then stays visible at G2 and G3 distances without shimmer. Check with a burst.
  9. **Inland edge.** Extend Lantern Park to the Old Town's first street (its 0.55 weight contour), as review-1 fix 5 asked, instead of the bridgehead chord. This removes the straight lawn/forest edge and the forest strip in map4 and H1.
  10. **GPU budget.** The cap stays +0.30 ms on the fly-through. Pole lamps stay analytic, and lanterns use the instanced lantern path, so cost should grow only in `parkShade`.

### Checks run
- `git diff 101026f d83534b --stat` and a full read of every changed `src/` and `tools/` file.
- Probe (`launch()` with `--profile opus55-I016cr`, 480x270, no bench running at the time), plan against `?noplan`. Streams, counts and hashes are as listed above. No WebGPU errors; the only console messages were a 404 and the powerPreference warning.
- Probe of the four approach avenues against `world.infillLots`, `world.lots` and the water. One avenue crosses infill lots (13/26 samples). It was then projected with the G2, G3, G1 and B3 cameras: in G2 at the right edge, in G3 and G1 at more than 1.8 km, and not in B3.
- `git diff main...idea/I-015 -- Opus55/source/src/buildings_landmarks.js` and I-015's `buildings_stilts.js` `findSeed`, for the merge.
- Held-out images h4/H1, H3, H7, H8; h2/H2; map4.png viewed.
- bench.mjs was not run. No eval-pose captures were made.

### Evaluation untouched
`git diff 101026f d83534b -- Opus55/eval` and `git diff main...idea/I-016 -- Opus55/eval` are empty. Nothing in `eval/`, the evaluation data or the poses changed.
