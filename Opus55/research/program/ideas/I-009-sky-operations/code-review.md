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

## Code review round 3 (2026-11-24)

**Branch:** idea/I-009 at 3aa73ea (round 3 commits a283e8a, af57493, 3aa73ea)
**Verdict:** fail

**Why it fails.** The smoke life was changed from 240 s to 150 s after the eval stills had been judged. Review-1 fix 3 locks this constant ("Launch period, smoke lifetime and fade curve are as given in fix 5. The code reviewer must reject any later change to these values"). The change also alters 4 of the 6 target stills.

**What it takes to pass.**
- Restore `SMOKE_LIFE = 240`. `LAUNCH_ALIVE` follows from it, and the new 100 m width cap already removes the "wide" argument.
- Or: the coordinator records an explicit waiver of fix 3 in the spec or LOG, and, since the change was prompted by judgments of eval images, confirms the result on fresh cameras, as was done for I-014.

Everything else in this round is correct or minor, apart from two moderate motion problems in the beam rule.

### Matches the spec
- **Code matches DEVIATIONS round 3.** Specifically:
  - The trail is a chain of elongated Gaussian puffs whose optical depth falls about as 1/r^0.7, and it is neutral grey.
  - The halo cap is consistent: `haloPeak = 5.45 × intensity` equals the new halo maximum `exp(0)·5 + 0.45`.
  - Pad work lights and a haze glow are added.
  - At most one beam at a time, in 40 s slots.
  - Outline sprites (87) and the fin-edge material 6 are added.
  - The fins are framed and shaded, with the LED screen at 35%.
  - The ticker is larger, with 2 items per row, and the band is 34% of the hull height.
- **Sprite count.** 3 × (7 nav + 29 outline) + 5 red + 3 flood + 10 tower + 1 dome = 127, within `NSPR` = 144, and `init` throws if the count is exceeded. Unused slots have zero colour and are culled in the vertex shader.
- **The deck clip is kept.** Pixels with world height ≥ 1800 m are discarded, using `q.z` without the shift toward the camera, and puffs wholly above the deck are culled.
- **The near-camera thinning and fade are kept** on the same level-of-detail scheme. No divide-by-zero: `Sa ≥ sbE·|ca|`, and `sbE ≥ 0.8 px`.
- **WebGPU.** The trail varyings are still 10 locations (32 components). All buffer sizes are unchanged.

### Answers to the coordinator's questions
1. **The remaining 1.9 KB per frame.**
   - **No source-level allocations remain.** The per-frame code (`update`, `_updateShip`, `_updateLaunch`, `drawLate`, `afterLighting`) creates no arrays, objects, closures or template strings, which is the BRIEF rule ("no new arrays, objects, closures or template strings per frame").
   - **The remainder is V8 boxing.** It comes from doubles passed to, or returned from, calls that V8 does not inline:
     - `L.shipState(sh, t, st)` and `L.shipState(sh, t − dt, pt)`: 2 per ship.
     - `L.trackIndex(sh, t)`.
     - `w.heightAt(tx, tz)`: arguments and return value.
     - `cam.visible(x, y, z, r)`: 3 ships + rocket + port.
     - `ctx.lights.set(...)`: 4 calls, up to 8 doubles each.
     - `sstep(...)`: 2 per frame for the slot weight, 3 for the slot owner.
     - `this._buildingsNear(w, tx, tz)` and `this._lampW(sp, bw)`.
     - `this._rocket(a)` twice.
     - `L.rocketS`, `L.emitAge`, `L.smokeRadius`, `L.trailSeed` and `L.liveLaunches(t, …)`.
   - **Most of it can be removed simply:**
     - inline `sstep` as local arithmetic;
     - pass the time inside the scratch objects (`st.t = t`; `shipState(sh, st)`);
     - write the 4 lights directly into `ctx.lights.data` through a small index-based setter;
     - compute the view test inline.
   - **Some boxing will remain** in `heightAt` and the layout helpers. Other modules (`air.js`, `boats.js`, `lightshow.js`) call `lights.set` with doubles every frame in the same way.
   - **Classification: minor, not a BRIEF violation.** It is engine boxing, not allocations in the source, and `functional.mjs` passes its 2 MB/10 s heap gate (18/18 twice).
2. **The beam rule.**
   - **Building filter: correct as written.** `c.hy > 3` (taller than 6 m) and `c.hx < 40 && c.hz < 40` (under 80 m across in both half-extents) exclude bridge decks and the spaceport deck.
   - **Reproducible: yes.** The owner and slot weight depend only on `ctx.time`. The ship state, `trackIndex`, the outer-bank tables (built once from `heightAt`) and `_buildingsNear` (static colliders) are functions of time and world. The show dimming is a function of time. Nothing depends on the camera or on earlier frames.
   - **Pose times** (slot = ⌊t/40⌋, owner = slot mod 3):

     | t | Poses | Owner | Slot weight | Note |
     |---|---|---|---|---|
     | 15 | A5 | confluence | 1 | |
     | 40 | G1 | — | 0 | slot boundary, so no beam |
     | 45 / 50 / 70 | B1 / B4 / G4 | Bund–CBD | 1 | lit only if its rule passes |
     | 100 | B3, G3 (A poses, B2) | west ship | 1 | forest banks, lit 0.2% of the time |

     So G1 and G3, the two poses where judge A liked a beam on the lit city, now get no beam. That is evidence against the beam constants having been tuned to the eval set.
   - **Moderate: the beam brightness jumps (`skyops.js` `_buildingsNear`, `bw`).** The building count is an integer taken over a cross of 5 global 64 m grid cells, and `sstep(2, 5, n)` maps it to 0, 0.26, 0.74 or 1.
     - As the sweeping hit point crosses a cell line, about every 10 s (ship 6 m/s plus a ±120 m sweep), the set of cells changes. The beam, its lamp and its 170-unit point light then jump in brightness, or switch on or off, between frames.
     - The count is also of cell registrations, not of buildings: one building whose bounding circle spans 2–3 cells in the cross is counted 2–3 times.
     - Embankment parapet colliders (`terrainBank.js`: hy about 5.4 m, hx about 8 m) and transit pillars pass the filter. So an embanked promenade with no buildings counts as "lit city" (it is lamp-lit, but the docs say buildings).
     - Still frames are not affected. Live viewing and motion bursts are.
     - Fix: interpolate the count bilinearly between cells, or weight colliders by distance with a smooth falloff.
   - **Moderate: the beam target jerks on the turns (`skyops.js` `_updateShip`, `ti = L.trackIndex`).** The outer-bank direction `outerX/Z` and distance `bank` are looked up from the nearest sample, without interpolation.
     - On the 90 m-radius turns the outer direction rotates about 2.5° per 4 m sample, so the hit point jumps about 25–30 m every 0.67 s at a reach of about 600 m.
     - `bank` is quantised to 20 m steps, so the hit point jumps where the distance changes.
     - Fix: interpolate both between `ti` and `ti + 1` with the same fraction as `trackAt`. Better still, take the outer direction from the interpolated heading (`side·(hz, −hx)`), since `side` is constant on a convex racetrack.
3. **The trail constants: not keyed to cameras, but chosen after seeing eval images.**
   - **Radius (8 m + 0.55 m/s, cap 100 m; ground cloud 35 m).** The physical reason in DEVIATIONS (a real launch trail is about 16 m wide behind the nozzle and spreads to at most a few hundred metres) is camera-independent. It is a deviation from review-1 fix 6 (15 m + 2 m/s, cap 250 m), and DEVIATIONS records it as such. Fix 6 was written because reviewer 1 found the spec's original 6–94 m radius too thin to read at 3–7 km. The new values are close to that original, so whether they read is now a matter for the judges. Not blocking.
   - **Smoke life (240 s to 150 s): blocking.**
     - This value is explicitly locked by fix 3, and the reviewer is told to reject any later change.
     - **Effect on the stills.** At t = 40–70 (B1, B4, G1, G4), a 240 s life leaves the previous launch's trail (age 190–220 s) at opacity (1 − age/240)^0.7 ≈ 0.18–0.33. At t = 15 (A5) it would be ≈ 0.5. With 150 s, all of these are gone.
     - So the change removes content from 4 of the 6 target stills, in response to judgments of those stills.
     - **The stated reason no longer holds.** DEVIATIONS says "two old, wide trails". In fact, at most one old trail plus one young trail exist at once, and the 100 m width cap already answers "wide".
     - **Fix 5 still holds technically**: a trail younger than 150 s is always present. But for about the first 10 s after each ignition, only a short young column is in the sky.
   - **New constants.** `BEAM_SLOT` = 40, the bank-search constants and the trail-shape constants (`SIG`, `SB`, `TAU0`, `R_REF`, `CITY_KEY`) are new rules, not changes to locked values. The pose-time table above shows no sign that they favour the eval set. But this whole round responds to judgments of eval images, so a fresh-camera check before adoption is the right safeguard.
4. **Unused variables and the layout changes.**
   - **`dt` and `cam` in `_updateLaunch` are used, not unused.** `dt` sets the previous-frame rocket age (`this._rocket(((a − dt) % P + P) % P)`), which drives the rocket's motion vectors. `cam` drives `this.vis[I_ROCKET]` and `this.vis[I_PORT]`.
   - **The only dead value is `shownPrev`**, which is assigned and then discarded with `void`. Cosmetic.
   - **`trackIndex` is correct.** It uses the same arc-length expression as `trackAt`: `((s % len + len) % len) / ds`, floor, mod n. So the lookup index always matches the sample `shipState` interpolates from.
   - **`Math.sqrt` instead of `Math.hypot` is safe.** The values are unit-scale headings, so there is no overflow or underflow risk, and results differ at most in the last bit, which disappears in the float32 upload. Altitudes, tracks and phases are unaffected: those code paths did not change.
5. **Merge with current main.**
   - `git merge-tree --write-tree main 3aa73ea` reports no conflicts. Main differs from the merge base `7faf017` only in `buildings.js`, `buildings_text.js`, `buildings_wgsl.js` and the I-014 tools, and I-009 touches none of these.
   - **No semantic overlap.** I-014 adds no colliders, lights, Frame fields or module-order changes. It sets part flags and adds GPU buffers. So the airship altitudes, the light indices and the beam rule's building counts are unchanged by the merge.
   - **The merged tree builds and passes its tests.** I exported it to the scratchpad and ran: `node build.mjs --dev` (`out/dev.html`, 1027 KB), `node tools/skyops-test.mjs` (12 passed), `node tools/test-text.mjs` (all checks passed).

### Problems
- **serious: `SMOKE_LIFE` changed from 240 s to 150 s** (`skyopsLayout.js:35`). The value is locked by review-1 fix 3. The change removes the previous trail from B1, B4, G1 and G4 at their pose times, after those stills were judged. Revert it, or get a recorded coordinator waiver plus a fresh-camera check.
- **moderate: beam brightness jumps between frames.** The building count is an integer over grid cells (`skyops.js` `_buildingsNear` and the `bw` line in `_updateShip`). It double-counts buildings that span cells and counts embankment parapets. It does not affect stills.
- **moderate: the beam target jumps during turns and at 20 m bank steps,** because the outer-bank tables are looked up without interpolation (`skyops.js` `_updateShip`). It does not affect stills.
- **minor:** about 1.9 KB per frame of V8 boxing remains (sources listed in question 1). It is not a BRIEF violation, and most of it can be removed with simple edits.
- **minor:** the header comment of `skyops.js` (line 3) still says the smoke "spreads in a sheared wind for 240 s". `shownPrev` is dead code.

### Checks run
- `git diff 7dc6eb0 3aa73ea` — read every changed line of `skyops.js`, `skyopsLayout.js`, `skyopsWgsl.js`, `skyopsMesh.js`, `skyopsAtlas.js` and `tools/skyops-test.mjs`.
- `node build.mjs --dev` in the worktree — builds (999 KB). `node tools/skyops-test.mjs` — 12 passed.
- `git merge-tree --write-tree --name-only main 3aa73ea` — clean. The merged tree builds, and both the skyops and I-014 text unit tests pass, as described in question 5.
- Node one-liner — beam slot owner and weight at every pose time (the table in question 2).
- Not run: bench, GPU captures (no GPU lock taken), `skyops-check.mjs`.

### Evaluation untouched
`git diff 7dc6eb0 3aa73ea --name-only` lists only `Opus55/source/src/skyops*.js`, `Opus55/source/tools/skyops-*.mjs` and files in the I-009 idea folder. Nothing in `Opus55/eval/` or the metric folder changed.

## Code review round 4 (2026-11-24)

**Branch:** idea/I-009 at 7506f1e
**Verdict:** pass

The four round-3 items are fixed:
- **Smoke life:** restored to the locked value.
- **Beam brightness:** now continuous.
- **Beam aim:** now continuous.
- **Boxing:** reduced further.

No eval still changes its beam state as a result. The branch merges cleanly with current main, which includes I-014 and I-015.

### Matches the spec
- **Smoke life is exactly as review-1 locked it.**
  - `SMOKE_LIFE = 240`, so `LAUNCH_ALIVE = SMOKE_LIFE + 25 = 265`.
  - The trail shader takes `SMOKE_LIFE` from the layout file, so it is 240.0 there too.
  - The opacity curve is `(1 − age/240)^0.7` and the launch period is 150 s, both unchanged.
  - `skyops-test` now asserts the value.
- **Beam weight (`_cityWeight`).** It sums building footprints whose centres lie within 200 m of the hit point. The weight is full inside 60 m and falls off smoothly to zero at 200 m. A 20 × 20 m footprint counts 1, capped at 4. It maps to beam weight 0–1 by a smoothstep from 1 to 3.
  - **Each collider is counted once.** A collider is counted only in the 64 m cell that holds its centre, and that cell is always among the cells it is registered in. The cell hash cannot collide within the world (cells span ±96 per axis; the multiplier is 100003).
  - **The building filter matches the stated rule.** `hy > 4` (over 8 m tall), `3 ≤ hx, hz < 40` (6–80 m across both ways). This leaves out:
    - parapets (half-width 0.24 m);
    - promenades (half-height 0.9 m);
    - bridge decks;
    - the spaceport;
    - thin transit pillars.
  - **The weight is continuous in the hit point**, and the hit point is continuous in time. The implementer's 600 s, 60 fps measurement gives a largest weight step of 0.055 per frame.
- **Aim.** These parts of the aim are continuous:
  - `side` is one constant per ship, by majority vote over the track samples.
  - The outer direction is `side · (hz, −hx) · dir`, taken from the interpolated heading. Converting back to the track direction with `dir` is correct.
  - The reach is smoothed over ±40 m (21 samples) at load, then interpolated with `st.u`. `st.u` is the same sample index and fraction that `trackAt` uses for the position.

  The largest hit-point step is 1.0 m per frame (implementer's measurement). Removing `L.trackIndex` left no callers (grep).
- **Land-height gate removed.** The aim point is 60 m inland of the first dry ground by construction. If the sweep reaches water, `gy = max(height, 0)` lands the beam on the water surface, and the beam then shows only if real buildings stand within 200 m. That is acceptable.
- **Boxing cleanup.**
  - `sstep` is now inline arithmetic.
  - `_putLight` writes `Lights.data` and the dirty range exactly as `lights.set` does.
  - `_inView` repeats `makeCamTest().visible` using the same camera fields.
  - The dead `shownPrev` is gone.

### Answers to the coordinator's questions
1. **The radius and building rule have camera-free reasons and change no eval still's beam.**
   - **Reasons.** The filter is structural: it leaves out the embankment parapets, decks and pillars that made round 3 treat lamp-lit embankments as "lit city". The 200 m radius is justified by where buildings stand relative to the banks once those structures stop counting. Neither reason refers to a camera.
   - **Measured state at each pose time.** I ran the real app on three builds under `gpu-run.sh I-009cr`:
     - round 3 (3aa73ea);
     - round 4 (7506f1e);
     - round 4 merged with main (`git merge-tree` result).

     For each eval pose time I set `ctx.time = t` (frozen), let 3 frames run, and read the beam weights. Times with the same result are grouped. The result is **identical on all three builds**:

     | t | Poses | Slot owner | Slot weight | Show | Beam weights (conf / Bund–CBD / west) | City weight at owner's hit point (r3 count → r4 → merged) |
     |---|---|---|---|---|---|---|
     | 15 | A5 | confluence | 1 | 0 | **1** / 0 / 0 | 49 → 22.1 → 8.25 (≥ 3, so full) |
     | 40 | G1 | Bund–CBD | 0 (slot edge) | 1 | 0 / 0 / 0 | 34 → 47.7 → 47.7 |
     | 45 / 50 | B1 / B4 | Bund–CBD | 1 | 1 | 0 / 0 / 0: the ship is within 1.5 km of the show centre, so the beam is off during the show | 24 → 37.8 / 27.6 |
     | 70 | G4 | Bund–CBD | 1 | 1 | 0 / 0 / 0 (show; also no city: 0) | 8 → 0 → 0 |
     | 100 | A1–A4, A6, B2, B3, G2, G3 | west | 1 | 0 | 0 / 0 / 0 (forest banks: 0) | 0 → 0 → 0 |

   - **Conclusion.** The only lit beam at any pose time is the confluence ship's at t = 15, in A5, which is not a target, and it is lit in all three builds. No target still has a beam in round 3, round 4 or after the merge. So the new rule cannot have been tuned to the eval set through these stills.
   - **What the merge changes.** I-015's rebuild lowers the city weight near the A5 hit point from 22.1 to 8.25, but it stays above the full-weight threshold of 3.
2. **Smoke life: yes, exactly 240 s.** The fade curve and launch period are unchanged (see above).
3. **No new per-frame allocations.**
   - The new per-frame code creates no arrays, objects, closures or template strings. It writes only into preallocated arrays (`_lv`, `_vp`, `_cq`) and the existing `st`/`pt` fields; `u` is now declared up front.
   - `_cityWeight` passes only integers to `collidersNear`. It runs for the slot owner only, over at most 8 × 8 cells.
   - The new typed arrays (`raw`, `sh.reach`) are created once in `_planShips`.
   - Remaining boxing (`shipState`, `heightAt`, the layout helpers) is reduced from round 3. As noted there, it is not a BRIEF violation.
4. **It still merges cleanly.**
   - `git merge-tree --write-tree main 7506f1e` (main at 9eca4af, now with I-014 and I-015) reports no conflicts. Main's source changes are in `buildings*.js`, `signs.js` and `signPlace.js`, which I-009 does not touch.
   - The merged tree builds (`out/dev.html`, 1105 KB). `skyops-test` passes, and I-014's `test-text` passes.
   - In the merged app the airship altitudes are unchanged (530 / 390 / 290 m), and the beam states are identical, as shown in the table.

### Problems
- **minor:** DEVIATIONS round 3, section 2 ("Only on lit city"), still says "on land (height > 1–4 m)". The code-review-round-3-fixes subsection correctly says the land gate was removed. Wording only.
- **minor (carried over):** some V8 boxing of doubles in non-inlined calls remains. It is not a BRIEF violation, and `functional.mjs` passes.

### Checks run
- `git diff 3aa73ea 7506f1e` — read every changed line in `skyops.js`, `skyopsLayout.js`, `tools/skyops-test.mjs` and `tools/skyops-check.mjs`.
- `node build.mjs --dev` in the worktree — builds. `node tools/skyops-test.mjs` — all checks pass.
- `git merge-tree --write-tree --name-only main 7506f1e` — clean. I exported the merged tree to the scratchpad; it builds, and `skyops-test` and `test-text` pass.
- **Beam state at the eval pose times** on three builds (round 3, round 4, merged), one short headless-window run each, under `gpu-run.sh I-009cr`. The script is `scratchpad/cr4/beamstate.mjs`; it reads `window.__skyops` after frozen frames. Results are in the table above.
- Not run: bench, captures, `functional.mjs`.

### Evaluation untouched
`git diff 3aa73ea 7506f1e --name-only` lists only `skyops.js`, `skyopsLayout.js`, `tools/skyops-check.mjs`, `tools/skyops-test.mjs` and the I-009 DEVIATIONS file. Nothing in `Opus55/eval/` or the metric folder changed.
