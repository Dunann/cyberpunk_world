## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 5 | The first idea in the program to change the beam model, and tying the beams to the fog's own medium plus a count rule taken from concert lighting is a sensible combination. But every part is a standard real-time technique: a two-lobe HG phase, a core-and-skirt profile, noise density, beam ends at the cloud deck, aimed fixtures. Procedural rain glints are the only uncommon part, and they barely reach the eval poses (see below). |
| Feasibility and credibility | 5 | Most code references are right, the quick test has real stop rules, and the gate margins are large. But the central mechanism does not do what the spec says at the eval cameras. The phase function, normalized at 90°, dims nearly every searchlight that the eval poses see and brightens the B1 laser fan about 4x. The "thins with height like the fog" claim is not in the formulas. The glints are backscattered (invisible) at B4/G1/G4, rendered before TAA, and seen in frozen captures that hide the TAA problem. The helicopter beams would be classified as lasers. The p99/max estimate leaves out the views that set p99/max. |
| Expected impact | 5 | It answers a defect critic 2 names (change 9: B4, G1, G4). The beams are large shapes in four stills, and the count switch is a clean experiment either way. But by the spec's own forecast the gain is zone G +0.15–0.25 and B +0.1, below the 0.5 noise floor and far from 9+. B1, a target and the pose I-014 won, is exposed to a clear change the quick test does not look at. |
| **Overall (average)** | **5.0** | |

### Claims checked against the code (main, 41c93e1)
- **Correct.**
  - `beamGlow` (`showBeams.js:30-68`) has a single Gaussian, no phase, `haze = 0.3 + 0.7 exp(-0.0012 y)`, the `dust` sinusoid, and the lamp glare. The final clamp is `min(c, 40)` (`lightshow.js:168`).
  - The searchlight spacing is 160 m with at most 2 west-bank sources (`lightshow.js:292-294`). The ambient set has 3 beams (`:321`).
  - The helicopter cone is 20 segments with `pow(facing, 2.5)` (`air.js:193-235`). `air.js` reserves 2 lights and lightshow reserves 2.
  - `fog.js` `phaseHG` has no 1/4π factor, so the `/0.496` normalization is right (I computed 0.6·HG(0,0.75) + 0.4·HG(0,0.2) = 0.496).
  - `noiseTex` is 64³ and mipmapped. fog comes before lightshow in the module list (`main.js:68`), and traffic (which owns air.js) comes before lightshow.
  - The forward pass runs before TAA (`renderer.js:596-615`), and rain composites after TAA (`rain.js` header).
  - `audio.js:531` builds its own `rng(808)`, so the stream claim holds. `F.fog` = (0.00045, 0.0045, 0) (`main.js:55`).
  - The barrel at 300 m is 2.6/300 x 1241 ≈ 11 px.
- **Wrong or incomplete.**
  - **The phase range is not x0.3 to x4.** HG with g > 0 is monotonic, so the minimum is at cos = −1: (0.6·0.0816 + 0.4·0.556)/0.496 = **0.55**. The 0.3 floor never binds.
  - **The eval cameras see the beams in backscatter, not side-on.**
    - At B4 (camera y 280, beam origins on supertall tops above it, pillars at el 1.42 in section 3 at t = 50), every visible beam point is above the camera, so cos(D, −rd) ≈ −0.5 to −0.8 and the phase is about 0.6–0.7.
    - At B1 the Pudong beams fan east, away from the Bund camera: phase about 0.6–0.75. G4 is similar for the beams that lean away.
    - Combined with the 0.6x peak of the new profile, the B4 core drops to about 0.4–0.55x today. The spec's "few bright beams and several faint" does not appear at B4. There, every beam just gets dimmer. That is exactly the I-021 "less light" and I-024 "washed out" pattern.
  - **The B1 lasers point almost at the B1 camera.**
    - The direction from the z = −700 emitter (x ≈ 2515, per I-032) to the camera (2080, 8, −880) is az = WEST + 0.39. At t = 45 that fan spans WEST −0.85 to +0.19, so its nearest beam is about 11° off the line of sight. The z = −1250 fan's nearest beam is about 33° off.
    - So cos ≈ 0.84–0.98, and the phase is about 3.6 to 4 (clamped). The lasers' near-emitter brightness of about 4 HDR becomes the 12 clamp, with 5 beams overlapping per emitter.
    - The spec applies phase and glints to the lasers on purpose. The glint phase HG(cos, 0.9)/HG(0, 0.9) is about 29 at cos 0.9 (x0.15 ≈ 4x the beam radiance).
    - The forecast for B1 is "tie or slight win", but the brightest change in the whole idea lands there. B1 is not in quick-test step 1 (only in the count step).
  - **"Thin out with height exactly where the fog does" is not what step 2 builds.**
    - σ is used only for extinction from the lamp: exp(−σu) ≈ 0.8–0.9 over 1 km at these densities.
    - `haze` (0.57 at 800 m) is removed and replaced by height-independent noise (mean about 0.74).
    - So the upper half of each beam gets brighter relative to its base, and the beams become more uniform along their length, which makes them more rod-like.
    - If the implementer instead uses the fog's σ(y) as the scattering density, the beams fall to about 1/5 at 800 m (exp(−0.0045 y)) and the upper beams disappear.
    - The spec must say which height profile it uses.
  - **The clamp is not what makes the core flat.** With colour ≤ 1.3, r0 1.8 and energy r0²/(r·rEff), a side-on searchlight core is about 0.5–4 HDR, so `min(c, 40)` binds only at sinT < 0.1. The flat cores in B4 come from tonemap saturation of a narrow Gaussian. The skirt and lower peak address that; the clamp change does not.
    - At grazing views the new clamp of 12 *cancels* the phase flare: today's value there is about 33, and x4 gives 130, which is clamped to 12.
    - The clamp at line 168 also applies to the water wedges (x1500) and the laser mirror reflections, which the spec calls "unchanged".
  - **TAA.**
    - The composite does not "write zero motion". `forwardPipeline` sets `writeMask: 0` on the motion target (`renderer.js:447`), so beams and glints inherit the motion of the geometry behind them, or camera rotation only in the sky. The falling glints have no motion vectors of their own.
    - With TAA alpha 0.1 and a variance clip over the 3x3 neighbourhood (`renderer.js:298-312`), moving 1–3 px glints are suppressed or smeared. That is the reason `rain.js` draws after TAA.
    - The capture tool uses `&freeze` (`capture.mjs:21`, `main.js:146-147`): dt = 0 and the clock stops. The stills will therefore show fully converged, static glints that never appear in play, so judges would see a look the game does not have.
  - **The glint grid is unstable, and the glints are inside the beam pass.**
    - The cell size `max(1.2, 2.5·pixAng·s)` varies continuously per pixel and with camera distance, so the hashed grid rescales as the camera moves. The drops shuffle (swimming at u62), and neighbouring pixels sample different grids.
    - The streak length uses `F.camFwd.w`, which is dt (`common.js:103`), not rain's 0.032 s exposure (`rain.js:285`). That makes it 0 in captures and frame-rate dependent in play.
    - The glints are drawn into the half-res target and then tent-blurred over ±1 half-res texel, so a "1 px" glint ends up as a soft blob of about 4–6 px.
  - **The glints do not reach the targets.**
    - With g 0.9 backscatter, glint/beam is about 0.075 at B4 (cos ≈ −0.6). At G1 and G4 the beams are more than 450 m away.
    - So step 3 is invisible on three of the four targets and risky on B1. The quick test (B4, G1, G4, and held-outs 600–1500 m from a source) never exercises it.
  - **The helicopter beams would be treated as lasers.**
    - With r0 0.35 < 0.5, every `d.w < 0.5` branch in `lightshow.js` (`:38`, `:93`, `:114`, `:154`) treats a helicopter beam as a laser. It would get a mirrored beam instance instead of a water wedge, a tight 0.04 lobe, and x0.25 reflections.
    - The spec needs an explicit beam-type flag.
    - Also, `ctx.shared` does not exist; `world.shared` does.
  - **The GPU estimate is built from the wrong frames.**
    - The x0.6 count factor does not apply to the 10 lasers, which stay at full count and also get 2.5x quads and the new ALU.
    - The grazing path (4 points x phase, extinction and 2 noise samples) is left out of the per-fragment cost. Grazing views are also where quads are widest (`/max(sinT, 0.25)`, up to 4x), so they are the frames that set p99 and max.
    - The bench averages 0.07 ms in `lightshow`, which means it rarely frames a beam. The worst case is a free-exploration view inside the fan, and the gate does not see it.
    - The absolute risk is low: p99 has about 5 ms of headroom (11.55 baseline) and max about 11 ms (13.34). But the 1.3 ms cap is not supported by any measurement. The 10-beam fallback gives an average of 0.07 x 3.25 ≈ +0.16 ms, above the spec's own +0.15 cap.
    - The starting numbers (9.8 / 11.8 / 14 ms) have no source. The baseline report says 9.64 / 11.55 / 13.34.

### Strongest reason it will fail
The phase function is normalized to a side-on view that no eval camera has. Every show pose looks up at beams that point up and away, so the shader change mostly dims the searchlights. At B4 the core drops to about 0.4–0.55x, with no bright/faint hierarchy, just dimmer rods with a skirt. Meanwhile the same term makes B1's laser fan, aimed within 11–33° of the B1 camera, about 4x brighter and adds forward-scattered glints on top. The likely pairwise outcome is "dimmer / washed out" at B4 and G4 (the I-021 and I-024 lessons) and a blown-out emitter-less laser fan at B1. B1 is a target that step 1 of the quick test never shows the judge, so the go decision can be made on B4/G1/G4 and the B1 loss found only in the full eval. Adoption needs 3 of 4 targets (4 of 5 if G3 qualifies) with no clear loss elsewhere.

### Other concerns
- **The count switch tests only show-on poses.** The ambient change (3 to 2) and the source re-pick under 300 m spacing move or remove the ambient beams in every t = 100 pose (B3's beam from the hero supertall, G3's three beams, A-zone views). None of these is in the count check, and B3 and G2–G3 are I-016's clear-win poses. At 300 m, only one of the three Lujiazui supertalls keeps a beam, which thins B4 more than "6 of 10" suggests.
- **The heli move changes free-exploration motion, not the eval.** Removing a full-resolution forward cone that has soft depth fade and putting it into the half-resolution pass is fine. But its target-point lights stay at the old radius while the beam look changes, so check that they still match.
- **Fixture motion vectors** need the previous direction as well as the current one: `Fix` needs `c` and a fourth vec4, so the stride becomes 16 floats, not 12.
- **Beam ends at the deck.** The cloud deck is broken (`skyCloudNoise`), so stopping every beam at y = 1800 in clear-sky gaps looks like clipping. The spec also does not say whether `lenFade` uses L or L_eff.
- **Reflections keep the old `haze`** (`lightshow.js:109`) and get no phase, so a beam and its reflection will disagree in brightness.
- **Overlap with I-032 / I-040.** I-032 was rejected and a split (I-040) requested, so the emitter for the laser fan may never ship. Brightening an emitter-less fan makes critic 2's named B1 defect more prominent. If I-040 does carry the pontoons, both ideas rewrite `fixtureMesh()` and the `FIX_WGSL` kind switch, so the merge is not purely mechanical.
- **The novelty claim on glints** ("most games show searchlights in rain without them") is unsourced and irrelevant if the glints are invisible on the targets.
- **Held-out cameras** at t = 30 + 8k with 4 draws from k 0–6 cannot sample "every show section".

### What would make it stronger
1. **Normalize the phase to the eval reality, not to 90°.**
   - Either set per-beam brightness so the mean beam-mask luma at B1/B4/G1/G4 matches main, or narrow the phase to about [0.75, 2.0].
   - Cap the phase for lasers at about 1.5, or exclude lasers from the phase and glint terms until an emitter exists.
2. **Put B1 and one t = 100 pose with ambient beams (B3 or G3) into quick-test step 1.** B1 is a target, and the brightest change lands there.
3. **State the in-scatter height profile.** Keep `haze`, or use σ_s(y)/σ_s(y_ref) with a floor of about 0.35. Show the beam-mask profile along one beam at B4 on main and on the candidate.
4. **Fix or drop the glints.**
   - Drop step 3 and keep step 8 (rain lit by beams, after TAA). Or draw the glints into the post-TAA rain layer from the start, not as a fallback.
   - Quantize the cell size into power-of-two distance bands with a cross-fade.
   - Use rain's 0.032 s exposure, not dt.
   - Bound the glint/beam ratio at about 2x.
   - Judge the u62 burst unfrozen.
5. **Add an explicit beam-type field** (searchlight / laser / heli) and replace every `d.w < 0.5` test with it.
6. **Apply the 12 clamp to `beamGlow` only.** Leave the wedge and mirror-reflection clamps as they are, or say why they change.
7. **GPU.**
   - In step 0, run `--stats` at a worst-case held-out camera: inside the show fan, looking up along a beam, with 4 or more beams on screen and lasers near.
   - Include the lasers in the fill estimate and cost the grazing 4-sample path.
   - Make the 10-beam cap consistent with the fallback.
8. **Count switch.** Include G3 and B3 in the 6-vs-10 (and 2-vs-3 ambient) check. Report which towers lose their beams under 300 m spacing before judging.
9. **Fixtures.** Add a previous-direction field for motion vectors. Agree a fixture kind-code layout with I-040 now.
