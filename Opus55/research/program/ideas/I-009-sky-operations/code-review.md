## Code review round 1 (2026-11-24)

**Branch:** idea/I-009 at 6fa0b38
**Verdict:** fail

The core is sound. The Frame change, the G-buffer writes, motion vectors, the placement rules, the timing and the random streams are all correct, and there are no per-frame allocations. Three rendering problems should be fixed before the evaluation:

1. **Searchlight beams are erased by the water.** The airship searchlights are drawn before the water, and the water then paints over them. In the aerial target poses, most of each beam over the river disappears.
2. **Fix 7 is only partly met.** Smoke is still drawn up to about 150 m above the 1800 m cloud deck.
3. **The worst-case cost inside the trail has no limit.** A camera standing in the smoke trail pays for many full-screen layers of smoke.

### Matches the spec
The code matches the spec plus review-1 fixes 1–15 and DEVIATIONS.md, apart from the items under Problems. Checked one by one:
- **Scope (fix 1).** Only the airships and the launch are built. `buildings_gen.js` and `buildings.js` are untouched.
- **Locked constants (fix 3).** All of them are in `skyopsLayout.js`, and the airship phases and directions come from `rng(909)`. I cannot confirm from git that they were set before the first capture, because the branch is a single commit.
- **Airships (fixes 4, 10, 11).**
  - Three ships, on stretches derived by rule from `RIVERS`, `BRIDGES`, `DISTRICTS` and `SHOW_CENTER`.
  - Laps are 1.68–1.77 km at 6 m/s.
  - The altitude is the lowest value of at least 280 m that clears every tower top by 70 m. Tower tops come from colliders, `LANDMARKS` and terrain within 250 m. The altitude also avoids ±50 m bands around `LANES`, `CIRCLES` and the CBD corridors within 300 m of the track.
  - One searchlight per ship. Strobes flash for 0.12 s at 1 Hz. During the show, ships within 1.5 km of the show centre turn their beams off and dim their LEDs to 30%.
- **Launch (fixes 5, 6, 8).**
  - Period 150 s, smoke life 240 s, opacity `(1-age/240)^0.7`, at most 2 trails.
  - Smoke radius is 15 m + 2 m/s × age, capped at 250 m, with ×0.7–1.3 noise. Wind shear: the drift turns 75° and doubles between 300 m and 1800 m.
  - The gravity turn reaches 43° due east at the deck.
  - No sky beams at the spaceport.
  - The cloud-deck glow goes through `skyCityGlow`.
- **Spaceport site (fix 9).**
  - The search runs 4.5–5.5 km out, ±20° around the bearing from the city centre to the CBD district centre, and stays inside |x|, |z| ≤ 5900.
  - It picks the patch with the smallest height range.
  - The deck sits on a 5×5 pile grid that includes every corner and edge midpoint.
  - DEVIATIONS.md says the site is "24° from the CBD bearing". That is wrong. 24° is the site's absolute bearing (south of east). The CBD bearing is −17.6° and the site is at −23.6°, so the site is 6° off the CBD bearing, inside the ±20° that fix 9 allows. The deviations file should be corrected so nobody reads it as a fix-9 breach.
- **Separate LED atlas (fix 12).** The shared sign atlas is untouched.
- **Timers and motion (fixes 13, 14).**
  - The module has its own timers, `skyops-gbuffer` and `skyops-fwd`.
  - Every CPU-moved mesh writes a previous-frame transform.
  - The plume core is clamped to 50.
- **Fix 7.** See Problems.

**Nothing is keyed to eval poses.** No skyops file reads `POSES` or pose coordinates.
- The only fixed coordinates are `CITY` (300, −300) and `SHOW_CENTER` (2380, 215, −1000). Both are given in the spec and review-1.
- The fix-2 target tool reads poses only to measure them.

### Problems
- **moderate: The water paints over the airship searchlight beams and the nav-light halos.** `skyops.js:449-464` draws the beams (and the sprites) in the module's own pass, inside `afterLighting`. The water's opaque forward pass then paints over them.
  - Evidence: `water.js:268` builds the water with `blend: null`. It is a y = 0 plane, depth-tested only against the opaque depth (the riverbed), so it replaces the scene colour wherever water lies behind a beam pixel. All that remains is the water's refraction of the beam, which is absorbed: `exp(-(0.42, 0.16, 0.13) × path)` at `water.js:177` leaves a dim blue-green trace.
  - **Effect.** For any camera above a ship, the whole beam over the river is affected, and the spot where the beam meets the water vanishes. For lower cameras, only the part of the beam below camera height is affected.
    - G3 (camera at 600 m) looks down on the confluence ship at 530 m.
    - G1 (325 m) is above the west ship at 290 m.
    - B3 (230 m) loses the lower part of the Bund–CBD beam.
    - The spec says the searchlights "shine down onto the water".
  - This makes the idea look worse in target poses where hulls are 111–141 px, so it could change the result.
  - The held-out cameras would not show it: they are low on the Nan'an bank, where the beams are seen against the sky.
  - The codebase convention is to draw transparents in the `forward` hook, after the water (as `air.js` does with its searchlights).
  - **Fix:** draw the beams and the sprites from a `forward(ctx, pass)` hook. The pipelines already use the forward layout, so only the draw calls move. Their cost then falls under the shared `forward` timer, so record that as a deviation. The SSR will no longer reflect the beams, which `air.js` also accepts.
- **moderate: Smoke is still drawn above the cloud deck (fix 7 only partly met).** In `skyopsWgsl.js:418` and `:429`, the deck fade `1 − smoothstep(1650, 1800, y)` is applied to each puff's centre height, not to the height of each pixel.
  - Each puff quad extends up to 1.4 × its radius, and smoke radii near the top of an old trail are 200–325 m. A puff centred at 1700 m keeps 74% of its opacity, and its Gaussian profile still has about 0.25 alpha half a radius above its centre.
  - So smoke shows about 100–150 m above 1800 m, roughly 50–60 px at B1/B3 distances. The clouds are not in the depth buffer, so this smoke is drawn on top of the cloud deck, which fix 7 forbids ("draw nothing above 1800 m").
  - The trail is the content behind all six targets.
  - **Fix:** pass `c.y` and `rr` to the fragment shader, take the pixel's height as `c.y + (q.x·camRight.y + q.y·camUp.y)·rr`, and fade on that height. Do the same for the plume halo, which fades on the nozzle height (`skyopsWgsl.js:323`).
- **moderate: The cost inside the trail has no limit.** `skyopsWgsl.js:427-433` gives puffs no fade near the camera.
  - A puff within about 2.4 × its radius of the camera covers the whole screen. Its quad is pulled toward the camera by `min(rr, dist/2)` and is 2.8 × rr wide.
  - With a spacing of 0.4–0.8 × the radius, that is about 6–12 full-screen premultiplied rgba16float layers per trail. Each layer runs two `vnoise2` calls and a read-modify-write blend, so the cost is about 1–3 ms at 2560×1440. The 384-puff cap is the only bound.
  - **This is reachable.** `WORLD_BOUND` = 5200 lets the camera get within about 300 m of the pad (5.5 km from the origin) at pad height. The ground cloud there is 55 m + up to 325 m in radius.
  - The bench and the eval poses do not go there, so the eval result is not affected. The coordinator asked about this case, and the fix-13 custom cameras do not cover it.
  - **Fix:** scale the opacity by something like `smoothstep(0.6·rr, 2·rr, dist)` and cull puffs that fade out. Then measure `--stats` from the world boundary nearest the pad.
- **minor: The trail's noise seed can flip for a single frame.** `skyops.js:379` derives the launch index as `Math.floor((t − A)/150)`, where `A = t − j·150`. Floating-point rounding sometimes gives j − 1.
  - Over 3000 s at 60 fps, 68 of 318k (trail, frame) pairs got the wrong index (checked in Node).
  - On those frames, the puff radius noise (×0.7–1.3) and the puff hashes jump, giving a one-frame pop in the bench and in free flight. Pose captures at integer t are not affected.
  - **Fix:** have `liveLaunches` return j, or use `Math.round`.
- **minor: The rocket disappears all at once** as soon as its nose reaches 1800 m (`skyops.js:278`). The cloud deck should hide it gradually from the nose down. A per-fragment upper clip, like the existing lower `a.w` clip, would fix this. The rocket is a few pixels tall at eval distances.
- **minor: The plume can slightly exceed the HDR 50 clamp.** The flame core is clamped to 50, but the additive halo adds up to about 6.3 on top (`skyopsWgsl.js:350,360`). Fix 14 asks for 50 or less. The effect is negligible.
- **minor: Some later glows are not dimmed by the smoke.** The trail is drawn before every other module's forward pass, so additive lights behind it, such as light-show beams and air-traffic lights, show through at full strength. Moving the trail to the forward hook as well, after `lightshow`, would fix this. It also costs SSR reflections of the trail.
- **minor, not verified: trees may grow through the deck.** The vegetation forest mask knows nothing about the spaceport. Trees on the mountain under or through the 160 m deck should be checked in a near capture.

### Checks run
- **Frame buffer, 144 → 148 floats.**
  - The struct is 6 mat4 (96 floats) + 13 vec4, which is 148 floats (592 bytes, 16-byte aligned).
  - `renderer.js` fills it in order: o = 144..147 holds `launch`. It defaults to (0, 0, 1, 0), so there is no division by zero in `skyCityGlow`.
  - Every consumer uses the shared `WGSL_FRAME_STRUCT`: `common.js` WGSL_FRAME and the `fog.js` march, which binds the whole `frameBuf` with no `size`.
  - No other `struct Frame`, `Float32Array(144)` or explicit `minBindingSize` exists in `src/` or `tools/`.
  - The `if (F.launch.w > 0.0)` branch reads only a uniform, so control flow stays uniform in every stage.
- **Other WebGPU checks.**
  - The `LaunchU` (144 B), `SkyU` (160 B), `Beam[3]` (96 B), `Inst` (128 B per instance) and `Spr` buffers match their CPU sizes.
  - The opaque pass's attachments (scene, normal, motion, depth) are not bound in either of its bind groups.
  - The forward-group binds (depth read-only, normal, sceneCopy) do not conflict with the forward pass's attachments (scene, motion, read-only depth).
  - The r8unorm atlas is filterable.
  - All derivatives are taken before any non-uniform branch.
  - Sprites: 21 + 5 + 3 = 29, within the 32-slot `NSPR`.
- **G-buffer writes** (`skyopsWgsl.js:220-221`).
  - Normal = (n, metal), which matches `gbuf()`.
  - Motion = (`motionVector(wp, pwp)`, material 0, wet 0). After lighting, only the waterSSR reads `M.w`, for wet reflections, so wet 0 means no wet SSR on the hulls. The material channel is read only by the lighting pass, which has already run.
  - The albedo and emissive targets are not written. After lighting they are read only by the SSR (A.a, when wet > 0), so that is safe.
  - TAA reads motion and depth, and both are written.
- **No per-frame JS allocations.** `update` and `afterLighting` use preallocated typed arrays, scratch objects (`_st`, `_pt`, `_r`, `_p3`, `_tp`) and cached pass descriptors. `prof.ts` returns cached descriptors. The only allocations are in `_metrics`, which is dev-only.
- **Random streams unchanged.**
  - `air.js` calls `cbdCorridors(ctx.world, rnd)` exactly as before and only stores the result.
  - skyops uses its own `rng(909)` closure.
  - The spaceport colliders are about 800 m outside the CBD corridor query area, and no district street grid reaches them. They do not affect vegetation.
  - The 4 reserved lights do not bind the signs' light budget (`min(2150, 8192 − count − 64)`).
- **First-frame altitude.**
  - `_planShips` runs on the first `update`. By then every module's `init` has run, including `traffic`, which publishes `airCorridors`, and every module's colliders.
  - `afterLighting` returns early until the ships exist.
  - The altitude does not depend on time or on the camera.
  - It is a one-off CPU cost of a few ms.
- **`cd Opus55/source && node build.mjs --dev`:** builds (`out/dev.html`, 985 KB).
- **`node tools/skyops-test.mjs`:** 11 checks passed.
- **Node script on `liveLaunches`:** confirmed the launch-index flip described under Problems.
- **Not run, as instructed:** bench, GPU captures and `skyops-check.mjs`.

### Evaluation untouched
`git diff main...6fa0b38 --name-only` lists only `ideas/I-009-sky-operations/{spec.md, DEVIATIONS.md}`, seven `src/` files and two new `tools/skyops-*.mjs`. Nothing in `Opus55/eval/` (poses, judge prompts, `run-eval.mjs`) or the metric folder changed.

## Code review round 2 (2026-11-24)

**Branch:** idea/I-009 at bab3950 (code) + 7dc6eb0 (DEVIATIONS round 2)
**Verdict:** pass

All three moderate problems from round 1 are fixed. The minor ones are fixed or reasonably recorded as deviations. No new problems were found that could change the result.

### Matches the spec
Round-1 findings, one by one:
- **Beams under the water: fixed.** `skyopsLate` is listed after `water` in `main.js`. Its `forward` hook calls `skyops.drawLate`, which draws the beams and sprites in the shared forward pass, after the water's opaque plane. The trail and plume stay in `afterLighting`, so the SSR still reflects them. The timer change is recorded in DEVIATIONS round 2.
- **Fix 7: fixed.**
  - Puffs now fade on the height of each pixel: `wy = c.y + (q.x·camRight.y + q.y·camUp.y)·rr`, the plane through the puff centre, without the shift toward the camera.
  - Pixels at 1800 m or higher are discarded, and puffs wholly above the deck are culled in the vertex shader.
  - The plume halo fades on `hc.y + off.y`.
  - The rocket is clipped per pixel at 1800 m (`skyopsWgsl.js` opaque fs). `_rocket` hides it only once its base reaches the deck.
- **Cost inside the trail: bounded.** There is a near-camera fade (`smoothstep(0.6·rr, 2·rr, dist)`) plus thinning by screen size, and the measured worst case at the world boundary is 0.92 ms. Details:
  - The thinning reuses the existing LOD scheme. I checked that the visible puff positions stay continuous when `lod.y` wraps and the CPU doubles `lod.x` while the extra levels are at their cap.
  - Opacity compensation `1 − (1 − a)^m`: m > 0 whenever the puff is drawn, because a puff with keep = 0 has op < 0.01 and is culled. The `pow` is only evaluated behind `if (aux2.z > 0.0)`, so a non-finite value cannot leak through `mix` with weight 0.
  - At distances of at least 2·rr and gate 0, the expressions reduce exactly to the round-1 opacity. The old `round(s/lod.x)&1` equals `j&1`, and op equals `min(lod.x/(0.8·rr)/(1 − 0.5·lod.y), 1.6)`.
- **Seed flips: fixed.** `liveLaunches` writes each launch index j, and the seed is `trailSeed(j)`. A new unit check (3000 s at 60 fps) passes.
- **Plume cap: fixed.** The flame is clamped to `50 − haloPeak`, and haloPeak = 3 × the halo intensity × colour is the halo's true maximum (`exp(0)·2.5 + 0.5`). The total stays at or below 50.
- **Trees through the deck: fixed** with a mask stamp. See question 2.
- **Bearing wording:** corrected in DEVIATIONS (6° off the CBD bearing).
- **Glows behind the smoke:** kept as a recorded deviation. The reasoning holds: in the normal views the city's additive glows (drone show, beams, air traffic) are in front of the trail, so moving the trail later would wrongly dim them. Minor.

### Answers to the coordinator's questions
1. **The 2 km thinning limit is sound, and it is safer than a pure screen-size rule.**
   - **Distance and screen size are equivalent here.** The field of view is fixed (`fov: 1.05` in `controls.js`, so tan(fov/2) = 0.577). A puff's screen fraction is `1.4·rr / (dist·0.577)`. The distance gate is therefore just a screen-size threshold that depends on the puff's radius.
   - **Where the cost problem lives.** A puff can cover the whole screen only within about 2.4 × its radius, and the largest radius is about 380 m (325 m smoke + 55 m ground cloud). So full-screen layers exist only within about 0.9 km. A gate with full thinning inside 1.5 km and none beyond 2 km leaves about 2× margin, which is a geometric basis, not an eval-pose one.
   - **Beyond 2 km**, a puff is at most about 0.46 of the screen half-height. Overlap is bounded by the column's own puffs, about 3–7 per pixel per trail, and the bench measured `skyops-fwd` at 0.024 ms average and 0.16 ms p99.
   - **A pure screen-size rule would not be safer for the eval.** With no distance cut, thinning would start at sf > 0.25, which at 2.5 km means rr > about 257 m. That would thin the old ground-cloud puffs in B4 (2.58 km, trail 523 px), where there is no cost problem, and make the smoke lumpier than the look tuned on held-out cameras.
   - **Does the gate make the idea look better than it is?** No. It keeps the eval views identical to the round-1 look, which gives the idea no advantage. The only rule that would change the eval stills is a larger or absent cut.
   - **The implementer's 2.49 km figure is plausible.** I spot-checked two cameras:
     - B2 is 2.36 km from the pad itself. At t = 100, the base puff (age 97) has drifted about 290 m along the wind (0.92, 0.38), which puts it about 2.51 km away, minus up to about 25 m of wobble.
     - B4 is about 2.53 km from the pad, and the drift moves the puffs farther away.
   - **What to fix in the write-up.** DEVIATIONS justifies the 2 km value by the eval cameras' distances. It should give the geometric reason (full-screen coverage only within about 2.4 × r_max ≈ 0.9 km) as the basis, and the eval distances only as a check. This is wording only, not a code problem.
2. **The tree keep-out adds no random draws.**
   - `stampRect` only writes mask texels.
   - The forest scatter on the GPU only rejects positions against the mask; its hashes are by position, not random streams.
   - The mask is also used to filter the fixed street trees before `rng(4242)` assigns rotation and hash per tree. Removing a street tree would shift that stream, but none can be inside the stamp. Street-tree candidates exist only inside district ellipses with `road ≥ 12`. The nearest is the CBD ellipse, which ends at x ≈ 4080, while the stamp starts at x ≈ 4880.
   - `world.shared.spaceport` exists only when skyops initialised, because skyops comes before `vegetation` in the module list. Otherwise the stamp is skipped.
3. **`skyopsLate` is safe when skyops is disabled, and its timing is accounted for.**
   - With `?disable=skyops`, or after a failed skyops init, `skyops.ships` is undefined or null, so `drawLate` returns before binding or drawing anything.
   - `skyops-late` has no `init`, `update` or `resize`, and its distinct name lets it be disabled on its own.
   - `drawLate` rebinds groups 0 and 1 to the same frame and forward groups that the renderer bound, so later modules are unaffected. The leftover group-2 binding is ignored by pipelines whose layout has no group 2. Those that do have one, such as the water, set their own.
   - Timer accounting: beams and sprites now count under the shared `forward` timer (+0.006 ms average in the bench); `skyops-fwd` covers only the trail and plume. This is recorded in DEVIATIONS.
4. **The varyings are within limits.**
   - The trail's vertex output uses locations 0–9: 10 inter-stage variables, against the WebGPU default `maxInterStageShaderVariables` of 16. They hold 30 scalar components (34 counting the position), within the older 60-component limit.
   - The other pipelines use up to 7 locations (opaque 0–6, beam 0–3, plume 0–2, sprite 0–1).
   - DEVIATIONS reports `functional.mjs` 18/18 with no WebGPU errors.

### Problems
- **minor:** DEVIATIONS round 2 justifies the 2 km thinning limit by the eval camera distances. It should state the geometric basis instead (see question 1).
- **minor:** the per-pixel deck fade uses the billboard plane. When the camera looks steeply up at the deck, the smoke's true extent above 1800 m is somewhat underestimated. Discarding at 1800 m still prevents any drawing over the clouds, so this does not matter for fix 7.

### Checks run
- `git diff 6fa0b38 bab3950` — read every changed line in `main.js`, `skyops.js`, `skyopsLayout.js`, `skyopsWgsl.js`, `vegetation.js` and `tools/skyops-test.mjs`.
- `cd Opus55/source && node build.mjs --dev` — builds (`out/dev.html`, 989 KB).
- `node tools/skyops-test.mjs` — 12 checks passed, including the new launch-index check.
- Distance check by hand from B2 and B4 to the pad and base puffs, as described in question 1.
- Not run, as instructed: bench, GPU captures, `skyops-check.mjs`. The bench pairs in DEVIATIONS (I-009 +0.07 ms GPU average, p99 within noise, module timers about 0.04 ms) are the coordinator's evidence.

### Evaluation untouched
`git diff main...7dc6eb0 --name-only` lists only `Opus55/source/src/*`, `Opus55/source/tools/skyops-*.mjs` and files in the I-009 idea folder. Nothing in `Opus55/eval/` or the metric folder changed.
