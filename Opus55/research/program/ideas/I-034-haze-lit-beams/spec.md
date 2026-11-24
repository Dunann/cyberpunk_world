---
id: I-034
title: Haze-lit beams - searchlights that scatter in the same rainy haze as the fog, fewer and aimed, with rain glints and oriented fixtures
status: in-review
direction: Combine / build on the best - the brief axis (critic 2 change 9: light effects that read as designed)
family: lighting: physically based single-scattering beams (phase function, shared medium, rain glints) plus a lighting-design count rule
parent: none (rebuilds the beam model of lightshow.js / showBeams.js, which every show pose uses)
proposed_by: idea generator
date: 2026-11-24
---

# I-034: Haze-lit beams

## Idea
Critic 2 says the beams read as hard-edged solid quads (B4, G1, G4) and that there are too many searchlights (G3, G4). In the stills, every searchlight looks the same: a saturated rod of constant brightness and width whether it points at the camera or away. It has the same smooth texture all along its length, it runs straight through the cloud deck, and it has a lamp drum whose lens always faces up. The beam model explains why (`showBeams.js` `beamGlow`):
- a single Gaussian across the beam;
- no phase function, so the scattering angle has no effect;
- haze that depends only on height (`0.3 + 0.7 exp(-0.0012 y)`), not on the fog the rest of the frame uses;
- a sinusoid as the only texture (`dust`);
- an HDR clamp of 40, so bloom flattens the core into a solid band.

This idea rebuilds the beam as light scattered in the scene's own medium. Real searchlights read as "real" because of five cues, and each becomes one step:
1. **Soft core and wide skirt.** Light scattered more than once around a beam in rain gives a soft halo. The profile becomes a two-term Gaussian (core r, skirt 2.5 r), with the same integral, a lower peak, and an HDR clamp of 12 instead of 40, so bloom no longer turns the core into a flat rod.
2. **Phase function.** Each beam's brightness depends on the angle between the beam and the viewer. A two-lobe Henyey-Greenstein mix (0.6 x g 0.75 for rain and aerosol, 0.4 x g 0.2 for the rest) is normalized to 1 at 90 degrees, so a beam seen side-on is as bright as today. A beam swinging toward the camera flares (up to x4), and one pointing away fades (down to x0.3). The scene then gets a hierarchy of a few bright beams and several faint ones instead of ten equal rods.
3. **Same medium as the fog.** Extinction along the beam and the beam's local density use the froxel fog's height-fog parameters (`F.fog`, rain boost `F.params.x`) and its 3D noise volume (`fog.js` `noiseTex`, 64³, already used for wind-driven fog). Beams therefore show the same drifting rain curtains and thin out with height exactly where the fog does. The `dust` sinusoid goes.
4. **Rain glints.** Inside the beam within 450 m of the camera, falling drops lit by the beam sparkle as short vertical streaks: a world-space cell grid that falls at 9 m/s with the wind. Each cell holds at most one drop, with cell size `max(1.2 m, 2.5 px footprint)`. The glints are weighted by the strongly forward phase of raindrops (g 0.9). The existing rain streaks within 46 m of the camera are also lit by the beams (`rain.js` `lightAt` adds the beam term per streak).
5. **The beam ends somewhere, and comes from something.**
   - Beams stop at the cloud base (1800 m, `SKY_CLOUD_BASE`) and light a soft spot on its underside, modulated by the cloud density (`skyCloudNoise`), instead of fading out in clear sky.
   - Rooftop fixtures turn with their beam: a yoke and a 2.6 m barrel whose lens disc faces along the beam and glows in the beam colour.
   - The two helicopter beams (`air.js` `BEAM_WGSL`, a 20-segment cone with `pow(facing, 2.5)`) move into the same beam store and model, so every beam in the city looks alike.

**Fewer, as a lighting designer would place them, tested as its own switch.**
- The show uses 6 rooftop searchlights instead of 10 (spacing 300 m instead of 160 m, at most one on the Bund side, landmark tops first). The ambient set has 2 instead of 3.
- Each beam carries x1.35 power, so the total flux is about 0.8x today and the show keeps its weight.
- Because removing light has cost earlier ideas their judges (I-021), this count change is judged separately in the quick test and kept only if it does not lose.

The laser emitters are **not** in scope: I-032 (C3, laser pontoons) builds them. The lasers do get the new medium, phase and glint terms, so they match whatever emitter I-032 adds.

## Why it might work
- **It answers a named critic change with its stated cure.** Critic 2's change 9 is "volumetric beams, emitters, readable drones", with the defects "searchlights and beams are hard-edged solid quads (B4, G1, G4)" and "too many searchlights (G3, G4)". Both I-022 reviewers said the program never addressed this ("If the goal is a sky the critics stop naming, include the `lightshow.js` beams: softer, with visible emitters", I-022 review-1). I-022 review-2 adds that those beams "appear in B3, B4, G1, G3 and G4".
- **The beams are among the largest bright shapes in four eval stills.** The show is on at B1 (t = 45), B4 (50), G1 (40) and G4 (70). In B4 and G1 the beams run most of the frame height, and in G4 about seven of them cross the sky over the skyline. Changes in that many pixels are noticed.
- **Physics gives the "designed" read cheaply.** In films and AAA games a searchlight looks real because of a phase-dependent glow, a soft multiple-scattering skirt, falloff and texture from the medium, glinting rain and a source you can see. Every one of those is missing today, and every one is a few lines of shader in a pass that already exists.
- **It keeps what the judges liked.** The choreography (8 s sections, palettes, beat pulses), the show timing, the water reflections and the colours stay. Only the look of each beam and their number change, and the number change has its own gate.

## What's new about it
- No earlier idea changed the beam model. I-009 added xenon sky beams in the same old style (blocked for its launch trail). I-022 (rejected) touched aircraft lights and was criticized for not touching these beams. I-032 C3 adds the laser emitters, and this idea is designed to work with it. I-024 (city light field) adds baked light to the fog, not beams.
- **The new parts:**
  - the beams are tied to the scene's own participating medium: the fog's height-fog parameters and its noise volume, so the beams and the fog agree;
  - a phase-function hierarchy (fewer-looking beams from physics rather than deletion);
  - rain glints inside the beam (most games show searchlights in rain without them);
  - termination at the actual cloud deck with a lit spot;
  - one beam model shared by the show, the ambient searchlights and the helicopters.
- The count rule borrows from concert lighting: a few strong fixtures in haze, visible as part of the rig, rather than many equal ones.

## Target poses (declared by rule, before any implementation)
- **Rule (step 0):** on main, add a dev flag `?beammask` that composites only the half-resolution beam texture (`lightshow.js` `beamsHalf`) over black, with the normal tonemap. Capture the 14 eval poses at their `t`.
- A pose is a **target** if pixels whose beam-only value exceeds 8/255 in any channel cover at least 1.5% of the frame.
- **Expected targets:** B1, B4, G1, G4 (show on). G3 is likely (three long ambient beams).
- `targets.json` is written before code and never changed. Bursts are reported only; `u62` has the show beams, and its motion (the phase flare as a beam sweeps toward the camera, and the glints) is judged in text for temporal artifacts.
- **Adoption (EVAL v1):** wins on at least 2/3 of targets and no clear loss elsewhere.

**Held-out cameras (quick-test go/no-go only).** Seed 20261127, written to `heldout-cameras.json` before code:
- 4 cameras at t = 30 + 8k (k drawn from 0-6, so every show section is sampled);
- position: 600-1500 m from a show source (drawn), 5-300 m above ground, looking at the source with pitch +5 to +25 degrees;
- reject views blocked within 100 m (depth check on main).

## Expected effect on the metric
- **Pairwise:**
  - B4 and G1, where the rods dominate: likely wins;
  - G4: likely win (fewer, softer beams over the skyline);
  - B1: tie or slight win (the beams are behind the drone dragon and the phrase towers);
  - G3: slight win if it is a target.
- **Critic means:**
  - removes a named major defect at B4, G1 and G4 (coherence and character +0.25 to +0.5 there);
  - critic 2's "too many searchlights" note is gone;
  - zone G about +0.15 to +0.25, zone B about +0.1.
- Small but targeted. It also improves every show minute of free exploration, which the eval does not see.

## Quick test
1. **Shader only, 10 beams as today** (steps 1-4 below, no count change, no fixtures).
   - Capture B4, G1, G4 and the 4 held-outs on main and the candidate.
   - One blind judge, both orders.
   - **Go:** at least 2 of B4, G1, G4 win and there is no clear loss. **Stop:** fewer than 2 wins.
   - **Tuning:** if the judge names "too dim" or "washed out", retune once (skirt weight, phase floor). No second retune.
2. **Count switch.** With the new shader, compare 6 beams against 10 at B1, B4 and G4 (blind, same judge prompt).
   - Keep 6 only if 6 wins or ties on all three with no clear loss. Otherwise keep 10, and the idea goes on without the count change.
   - This decision is declared now and recorded in DEVIATIONS.md.

## Implementation plan

### 0. Measure first
- Add `?beammask` (`__DEV__` only) and capture. Write `targets.json` and `heldout-cameras.json`.
- Run `--stats` with the show on at B1, B4, G1 and G4 on main, and record the `lightshow` pass ms. That is the cost basis for the cap below.

### 1. Beam profile and clamp (`showBeams.js` `beamGlow`)
- **Profile:** `prof = (0.55 * exp(-d²/r²) + 0.45 * exp(-d²/(2.5 r)²)) / 1.675` (same integral across the beam as today's single Gaussian, peak 0.6x).
- **Quad width** (`lightshow.js` vs): `w = 2.5 * r * 2.3 / max(sinT, 0.25)`, so the skirt is not clipped.
- **Clamp:** `min(c, 12)` instead of 40.

### 2. Phase function and medium
- **Phase**, at the closest-approach point:
  - `cosθ = dot(D, -rd)`;
  - `p = (0.6 * HG(cosθ, 0.75) + 0.4 * HG(cosθ, 0.2)) / 0.496`, clamped to [0.3, 4.0];
  - `HG` uses the same form as `fog.js` `phaseHG`.
- **Extinction from the lamp:** `exp(-σ(y_mid) * u)`, where `σ(y) = F.fog.x * exp(-F.fog.y * max(y - F.fog.z, -60)) * (1 + 0.7 * F.params.x) + 0.00016 * exp(-y / 1800)`, the non-noise terms of `fog.js` line 238-248. The camera-side fog transmittance stays as today (`fogTex` sample).
- **Density texture:**
  - `n = 0.55 + 0.45 * N1 * (0.7 + 0.3 * N2)`;
  - `N1 = noiseTex.r` at `(P + wind * t) / 300 m`, with the fall `P.y + 9 t` in the coordinate for rain curtains;
  - `N2 = noiseTex.g` at `/ 40 m`;
  - mip level from the pixel footprint, as `fog.js` line 234 does, so far beams do not shimmer.
- **Shared noise volume:** fog exposes its view as `ctx.fogNoise` (fog.init runs before lightshow.init in main.js module order).
- **Grazing views** (`sinT < 0.35`, looking along the beam): average phase, extinction and density over 4 points spread over ±`wAlong` along the chord. This covers the few pixels where the chord is long.
- **Remove** the `haze` and `dust` terms.

### 3. Rain glints (`beamGlow`, only when `F.params.x > 0` and `s < 450 m`)
- **Grid:** world grid of cell `c = max(1.2, 2.5 * pixAng * s)` m, shifted down by `9 t` and by wind × t.
- **Drops:** for the cell containing the closest-approach point and the cell offset by half a cell, a PCG hash gives a drop position and a 25% chance that the cell holds a drop.
- **Streak:** length `max(9 * F.camFwd.w, 1.5 px)`, the same exposure as `rain.js`; width 1 px.
- **Brightness:** the beam's local radiance x `HG(cosθ, 0.9) / HG(0, 0.9) * 0.15` x rain intensity. About 40 ALU, two hashes.

### 4. Cloud deck termination and spots (`lightshow.js`)
- **Termination:** `L_eff = min(L, (1800 - O.y) / D.y)` when `D.y > 0`.
- **Spot instances:** a third instance range, one per beam that reaches the deck, is a quad on y = 1800 centred on the hit point, with half-size `4 * r_hit`.
- **Spot shading:**
  - `power / (π r_hit²) * 0.8 * (0.6 exp(-ρ²/r²) + 0.4 exp(-ρ²/(3 r)²)) * (0.35 + 0.65 * cloudDensity)`;
  - `cloudDensity` from `skyCloudNoise(P.xz, detail)` (sky.js WGSL, included in the beam module);
  - fog transmittance from `fogTex`;
  - depth-tested against `depthTex` like the beams.
- **Honest note:** in most eval stills the hit points are above the frame (G1, G4 and B1 look at most about 30 degrees up). This step matters for free exploration and for the beams no longer passing through the clouds, and little for the metric.

### 5. Fixtures that aim (`lightshow.js` `FIX_WGSL`, `fixtureMesh`)
- **Data:** `Fix` gains `c: vec4f` (beam direction xyz, lens on/off). `update()` writes it every frame.
- **Mesh (static part):** turntable ring r 1.6 (16-gon), then a mast as today.
- **Mesh (yaw part):** two yoke arms (boxes) rotated by the beam azimuth.
- **Mesh (aimed part):** a barrel (16-gon, r 1.2, length 2.6) with 6 cooling-fin rings and a lens disc at the front, rotated by azimuth and elevation in the vertex shader. Motion vectors use the previous direction stored in `c` (the previous frame's direction is kept on the CPU).
- **Lens:** emissive in the beam colour x 25 when firing, 0.6 idle (as today). The existing lamp glare in `beamGlow` stays.
- **Size:** at B4 (300 m) the barrel is about 11 px long (focal length 1241 px), clearly a lamp rather than a point.

### 6. Helicopter beams (`air.js`, `lightshow.js`)
- `air.js` keeps computing apex and target in `update()`, with no change to the math or to `rng(555)`.
- It publishes them in `ctx.shared.heliBeams` instead of drawing its cone pipeline. The pipeline and its draw are removed.
- `lightshow.update()` (which runs after traffic) appends them as two beams: r0 0.35 m, spread from the old cone (`(9 - 0.35) / L`), and an intensity matched to the old cone's peak at side-on view.
- The two reserved point lights at the target stay as they are.

### 7. Count (switch `?beams10`)
- **Show sources:** 6, spacing 300 m, at most 1 west-bank source, landmark tops first (same candidate order as today).
- **Ambient:** `this.ambient` takes 2 landmark sources.
- **Power:** per-beam x1.35.
- **Unchanged:** `lights.reserve(this.lasers.length)` (2) and the air.js reserve (2), so every later light index in the frame is identical to main.

### 8. Rain lit by beams (`rain.js`)
- `lightAt(p)` adds the beam term:
  - the beam store is bound to rain's group;
  - loop over `count` beams, at most 24;
  - inside the cone, add colour x energy x `HG(dot(D, toCam), 0.9) / HG(0, 0.9) * 0.3`.
- It runs in the vertex shader, once per streak.

### 9. Checks
- Functional 18/18; no WebGPU errors.
- `git diff main --stat` touches only lightshow.js, showBeams.js, air.js, rain.js, and fog.js (one export line).
- **Lights:** a dev hash of the full light array (positions, radii, colours of static lights) at init is equal to main.
- **Sizes:** `--stats` at B1, B4, G1 and G4 against step 0.
- **Motion:** a 4-frame burst at u62 to check the glints and the phase flare for flicker or TAA smearing (judged in text, as EVAL v1 does).

## Cost
**Effort:** one implementer, about 2 days.

**GPU basis.** The baseline `perf-report.md` (eval/runs/baseline) gives the `lightshow` pass as 0.07 ms average, 0.39 ms p99 and 0.67 ms max over the 60 s fly-through. The bench starts at t = 30, so the show (t mod 180 in 20-80) is on for about 50 of the 60 s. The p99 and max are show-on frames with beams near the camera. Step 0 records the per-pose cost.

| Change | Effect on the pass | Estimate |
|---|---|---|
| Wider quads (skirt 2.5 r) | Searchlight fragments x2.5 | |
| Per-fragment ALU | Phase (2 HG ≈ 20 ops), extinction (≈ 6), 2 noise-texture samples + mip, glints (≈ 40, near only), skirt (≈ 10), against today's ≈ 90 ops + 2 tanh + 2 exp | ≈ x2.2 per fragment, 3 texture reads instead of 2 |
| Searchlight count | 10 to 6 (+2 heli, thin) | x0.6 fill |
| Reflection wedges | Unchanged shader; 6 instead of 10 searchlight wedges | x0.6 |
| Cloud spots | At most 8 quads, mostly off-screen in eval views | < 0.02 ms |
| **Lightshow pass** | Assuming today's pass is about half beams and half wedges: beams 0.5 x 2.5 x 2.2 x 0.6 ≈ x1.65 the whole pass's beam half; wedges x0.6 | p99 0.39 to about 0.75 ms; max 0.67 to about 1.3 ms; average 0.07 to about 0.13 ms |
| Rain | +18 beams x ≈ 20 ops per streak vertex, about 117k streak vertices | ≈ 0.01 ms |
| Helicopter cone removed | One forward cone draw fewer | about -0.01 ms |
| Fixtures | 6-10 meshes of about 400 triangles | ≈ 0 |
| **Frame** | | **average about +0.07 ms (9.8 to about 9.9; gate 11); p99 +0.35 to +0.4 (about 11.8 to about 12.2; gate 16.7); max +0.6 (about 14 to about 14.7; gate 25)** |

- **If the count switch keeps 10 beams:** the pass roughly doubles again in show frames (p99 about 1.2 ms, average about +0.13 ms), still inside every gate.
- **Cap:** `lightshow` p99 at most 1.3 ms in the bench, average frame +0.15 ms.
- **Fallbacks, in order:** skirt 2.0 r; one noise octave; glints only within 250 m.

**Shared random streams, and why they cannot move:**

| Stream | Status | Proof |
|---|---|---|
| `rng(808)` in lightshow.js | Lightshow-internal. It draws 5 values per source in source order; fewer sources change only lightshow's own choreography. audio.js builds its own `rng(808)` instance, so it is not affected. | Only lightshow.js reads it |
| `rng(555)` in air.js | No draw added or removed; the heli beam math has no random draws | Diff of air.js shows only the draw removal and the publish line |
| Light indices (`ctx.lights.reserve`) | Same reserve counts (lasers 2, heli 2) | Light array hash at init equals main |
| Buildings (`towerTops`, parts), signs, traffic, crowds, vegetation | Not touched; `towerTops` is only read | `git diff --stat` |
| Show timing (`showState`), drone show, phrase show | Not touched | Same |

## Risks
- **Fewer beams may lose the show poses.** This is the I-021 lesson: removing light lost the judges. The count change is a separate switch with its own blind check, the flux is kept at about 0.8x, and the shader part stands without it.
- **The phase function may make some beams too faint** (pointing away from G4's viewer). The phase floor is 0.3, normalized so a side-on beam matches today. One retune is allowed after the quick test, then none.
- **Glints could smear or flicker under TAA.** Beams render at half resolution and are composited in the forward pass, which runs before TAA (renderer.js:599-604), and the beam composite writes zero motion. Fast-falling glints could be smeared or rejected by the TAA history. Mitigations:
  - the glints are sized to at least 1.5 px and fade with the footprint;
  - if the u62 burst shows smearing, the glint term moves into the rain layer that `rain.js` composites after TAA (its header explains this is why rain is drawn there). That costs one extra half-resolution target.
- **Too soft could read as fog blobs.** The core term keeps a defined axis; the 0.55/0.45 split is the first thing to tune.
- **Cost could exceed the estimate** if the pass is more fill-bound than assumed. Step 0 measures; the fallbacks are ordered.
- **Overlap.**
  - I-032 C3 moves the laser origins to pontoon gantry heads. This idea reads the origins from `this.lasers`, so the merge is mechanical.
  - I-031 moves searchlights onto new landmark crowns through `B.tops`. The source rule reads `towerTops`, so nothing to merge.
  - I-024 changes the fog's light, not its density parameters. The beams read only density.
