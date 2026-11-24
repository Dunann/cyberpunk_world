## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 6 | Using interior mapping to make an anamorphic corner screen correct from every viewpoint is a real transfer from game rendering, and Chengdu/Seoul-style 3D corner screens are new to this program. Holograms are the standard cyberpunk element. Glyphs above towers overlap I-007/I-010/I-014. Note that interior mapping can only draw content behind the glass, never content "bursting out" of the frame, so the result reads as a giant aquarium window rather than the Shinjuku-cat effect. The tank programme fits this best. |
| Feasibility and credibility | 4 | Both techniques can be built in this engine, but many of the spec's facts are wrong for this codebase. `towerTops` has no zone A towers. Hillside roads are 11 m, so the 16 m street-hologram rule excludes zone A. There are no "main roads". `lightshow` initializes after the new module. 渝 and 龍 are not in the atlas, and the G channel is a blur, not a distance field. Holograms in the forward pass will not appear in the wet-street or river reflections. Corner screens will cut through existing signs. The peak GPU cost is underestimated by about 3–6× (details below). |
| Expected impact | 5 | Street holograms answer a critic-named gap ("few holograms or drones at street level") and the brief. A hologram at the first A4 intersection would be a large, striking change. But under the spec's own rules, at most 1–2 of its 8 targets change visibly, and adoption needs 6 of 8. Even with fixes, whether a display lands in a street pose depends on placement density. A failure would still tell us whether 3D displays win blind comparisons. |
| **Overall (average)** | **5.0** | |

### Strongest reason it will fail
Under its own placement rules, the displays almost never appear in the target poses. I checked each target against the code:

| Target | What the rules put in frame |
|---|---|
| A3, A6 | Nothing. Crown holograms come from `world.shared.towerTops`, which is landmarks plus the 14 tallest CBD towers and 6 Bund towers (`buildings.js:110-113`). Hillside tops (`hill: true`, `buildings_gen.js:734`) and the Raffles towers are not in it. |
| A4, A5 | No street holograms: the rule needs roads of 16 m or more, and Yuzhong's grid roads are 11 m (`DISTRICTS`). Corner screens are limited to "main roads", which do not exist (`districtRoad` uses one width per district). A screen lands in A4 or A5 only by chance: about 5% with 12 screens spread over five district types. |
| B2 | Only by chance. The camera stands on the CBD intersection at x = 3050, z = −1000, with 4 intersections visible at 125–500 m. With 8 holograms among about 300 CBD and Bund intersections, the chance that one of those 4 is chosen is about 10%. |
| B1, B3 | Crown holograms are tiny. With the 60° vertical field of view (1242 px focal length), a 60 m hologram is about 50–100 px tall in B1 (CBD 1.2 km away), behind the drone dragon, lasers and searchlights. In B3 (about 2.3 km away) it is about 30 px. |
| B4 | The one pose where crown holograms are large (300–800 m away, about 90–250 px), but the tallest towers there carry searchlights and are skipped. |

So realistically 1–2 of 8 targets change, against the 6 wins needed. Meanwhile the extra lights and the far glows can still cause a clear loss elsewhere. `burst-u12` is not a scored pose and cannot count as a target.

### Other concerns
- **GPU: the peak estimate is several times too low; the average is plausible but not safe in the shared headroom.**
  - **Arithmetic.** 25% of 2560×1440 is 0.92 M pixels.
    - At the spec's own 48 steps × 25 ops, that is 1.1 G operations. That is already about 0.25 ms at 100% of an RTX 4050 Laptop's roughly 4.5 T lane-ops/s.
    - Divergent sphere tracing runs at roughly 30–50% efficiency, which gives 0.5–0.8 ms.
    - 25 ops per step is also unrealistic for the listed scenes. The hotpot (split bowl, wall, 8 bubbles, chilli capsules) and the bent koi with fins are closer to 80–150 ops per step without bounding volumes.
    - A realistic peak is 0.6–1.5 ms for one close corner screen, against the spec's 0.15–0.25 ms.
  - **The quick-test stop rule contradicts itself.** It requires under 0.15 ms at 25% coverage, but the spec predicts 0.15–0.25 ms for that case.
  - **The step rule raises cost where it is highest.** Holograms get 32 steps above 400 px tall, so the largest holograms get the most steps.
  - **The bench path passes the sites.** The scripted fly-through (`dev.js` PATH) passes through the CBD at 220–300 m, where crown holograms would be, and along the Bund at 25–30 m altitude, inside the 6–31 m street-hologram band. The camera can enter a proxy box, and the spec does not handle that.
  - **The headroom is shared.** It is 11 − 9.64 = 1.36 ms, shared with I-009 (capped at 0.35 ms), I-014 and I-015, and I-016 is next. The p99 claim does not matter, since p99 has about 5 ms of slack. The average is the binding gate.
- **Holograms will be missing from reflections.**
  - `waterSSR` runs in `afterLighting`, before the forward pass (`renderer.js:589-597`), so forward-pass holograms never appear in the river or wet-street reflections.
  - In this rainy city every sign leaves a long reflection streak (A4, burst-u12). A bright hologram over a wet intersection with no reflection will read as pasted on.
  - Corner screens are in the G-buffer, so they do reflect.
- **Corner screens will cut through existing signs.** Hillside and urban edges carry blade signs projecting several metres at 6–20 m height, plus fascia signs and kind-4 screens. Nothing in the spec removes them.
  - Sign placement runs at the first update (`signs._build`), after every module's init. A reservation published by the new module could therefore be honoured.
  - It must be a post-filter. Skipping inside `placeSigns` changes the shared `R()` stream and moves every later sign in the city, including A4 and B2.
- **Glyph extrusion will not work as described.**
  - 渝 and 龍 are not in the atlas, and 霓 exists only inside the word 霓虹. Atlas entries are whole words, so "any character for free" is not true.
  - The G channel is blur(7 px) plus blur(3 px), added with `lighter` on 104 px glyphs, so it saturates to 1 inside strokes. Its 0.5 contour is dilated by about 5 px, which closes the gaps in dense characters (龍 has 16 strokes). The result is not a metric distance, so the extrusion will be blobby.
  - A glyph rotating about Y shows mirror-reversed half the time and edge-on part of the time. In a frozen eval still there is about a 50% chance that the character reads backwards, which a judge who reads Chinese will see as an error.
- **The crown holograms conflict with three in-flight ideas.**
  - **I-014** puts characters on front-row riverfront towers, and its targets include B1, A3 and A6. Rotating 渝/福/龍 above nearby towers would compete with or break the I-014 phrases.
  - **I-009** airships fly at 280–420 m, clearing towers by colliders. Holograms 40–80 m above 250–400 m roofs occupy about 290–480 m and are not colliders, so airships can fly through them.
  - **The drone show** already draws an orbit-ring figure in B1, so the planet duplicates it.
- **The crown-site rules cannot be evaluated at init.**
  - `holo` would run before `lightshow`, so "skip tops with a searchlight" has no data. `lightshow.sources` is module-private and is chosen later.
  - `towerTops` carries no roof or crown type, so "flat-roofed" cannot be tested. CBD tops are `tw.top`, and crowns such as helipads rise above it.
- **Motion vectors.** With LED quantization, the strongest high-frequency pattern is the dot grid, which is fixed to the surface. Reprojecting it with the virtual-hit motion misaligns the dots during camera motion. Surface motion is right where dots are resolved, and virtual-hit motion is right only once they fade.
- **Light facts.**
  - `selectLights` limits lights to 3 per 20 m cell. It does not enforce the 256-per-tile cap; the renderer does (`TILE_MAX`) and silently drops the overflow.
  - BRIEF asks for radii of about 10–40 m, but the spec uses 30–60 m.
- **Content risk.** Four screen programmes and three hologram programmes is a lot of SDF art for 3 days. The kind-4 programme 0 already shows "koi-like blobs", so a koi screen adds little. The 变脸 mask with 4 painted faces behind a fan wipe is the hardest to make look non-placeholder.
- **Smaller points.**
  - The user's priority 4 in GOAL.md is "very large, striking signs, and skyscrapers with text light shows". The quoted "3D holographic billboards, wraparound LED screens" is not in any program file. The rubric's brief does name holograms.
  - The quick test edits `signPlace.js`, which shifts the sign RNG stream. That is fine as a throwaway test, but it must not ship.
- **Eval-camera tuning.** None is in the spec as written. The rule gaps leave room for it, though:
  - which 8 intersections and which 12 corners are chosen is not specified;
  - the phase constants are not fixed;
  - "major intersections" and "main roads" are undefined.

  An implementer who fills these in after seeing captures is tuning to the eval cameras.

### What would make it stronger: required fixes (for a revision, or for a prototype if the coordinator sends it there)
1. **Narrow the scope to street level.** Build the corner screens and the street holograms. Drop the crown holograms and the planet from this prototype:
   - they have no zone A data;
   - they overlap I-014's tower characters and I-009's airship band;
   - they are small in B1 and B3;
   - B1 is already the busiest sky.

   This also matches the critics' actual complaint, which is about street level.
2. **Fix the placement rules in the spec now, before any code.**
   - **Street holograms:**
     - Use every grid intersection in HILLSIDE, URBAN, CBD and BUND whose four corner lots exist.
     - The volume must be clear of `world.colliders` and of the reserved sign boxes (fix 8).
     - Diameter at most min(road width − 4 m, 10 m). Base 6 m above the road. Height 12–16 m on hillside roads and 12–20 m elsewhere.
   - **Corner screens:**
     - Only in CBD, BUND and URBAN. In hillside streets they would cover the blade-sign canyon that makes A4 the best-liked pose, and hillside lot edges are 25.5 m, barely over the 24 m rule.
     - Both edges must pass the `signPlace` street test.
     - The wall behind both faces must be solid from the screen bottom to its top, checked against `world.colliders`.
     - At least 150 m from any kind-4 screen, enforced as a post-filter.
   - **Selection, for both:**
     - Order candidates by a hash of (district, i, j) with a constant seed.
     - Accept them in that order with a minimum spacing of 220 m.
     - Caps: 40 holograms and 20 screens, scaled by quality level.
   - **Freeze the rules.** Commit the seed, all constants and the printed site list to the idea folder before the first eval capture. Never change them afterwards. The code reviewer rejects any later change.
3. **Declare the targets by a computed rule before judging.**
   - For each of the 14 poses at its pose time, render a mask of the display pixels that pass the depth test against the scene (occlusion included).
   - A pose is a target if the displays cover at least 1% of the frame. Any pose with at least 0.05% coverage is "watched".
   - Record the numbers in the spec.
   - If fewer than 2 poses qualify, report this to the coordinator instead of changing the rules or the seed.
4. **GPU, with a hard cap.**
   - **Corner screens: compute one ray per LED dot, not per pixel.**
     - A compute pass casts one ray per dot for at most the 2 nearest visible screens and writes a dot texture. The G-buffer shader samples it.
     - Dot pitch at least 0.10 m, matching kind-4's 0.11 m.
     - Use the 8-step per-pixel LOD once a dot is under 1 px.
     - Give each programme object a bounding sphere so that one step costs at most about 60 ops.
   - **Holograms:** at most 24 steps. The step count must not rise with screen coverage. Use one texture sample per step.
   - **Timestamps:** give the module its own timestamp passes (`holo-cs`, `holo-gbuffer`, `holo-fwd`).
   - **Gate:**
     - The mean of 3 candidate runs minus the mean of 3 baseline runs, interleaved, adds at most 0.2 ms on average and at most 0.8 ms at p99 in the full bench.
     - Also report two custom worst cases. The total module cost is at most 0.6 ms with a corner screen filling 25–35% of the frame at 30 m, and at most 0.4 ms with the camera inside a hologram volume.
   - **Quick-test stop rule:** replace it with these limits.
5. **Reflections.** Holograms must appear in the river and wet-ground SSR. Draw them into the lit HDR scene in an `afterLighting` hook ordered before `water`'s, or use an equivalent method. Verify on a held-out wet-street camera.
6. **Glyphs.**
   - Build a true SDF per glyph at init in the module's own small texture: a Canvas2D fill plus a CPU distance transform, about 128² per glyph.
   - Do not use the G channel, and do not add entries to the shared sign atlas, which I-009 and I-014 also touch.
   - The glyph must never read mirror-reversed or edge-on. Either swing it ±35° about the direction to the viewer, or flip u when the ray enters through the back.
   - Use low-stroke characters (福, 渝, 火), not 龍 or 霓.
7. **Content.**
   - Ship two screen programmes: the water tank and the 鸳鸯锅 hotpot. Defer the koi and the mask.
   - Ship two hologram programmes: the glyph and the koi pair.
   - Before any eval capture, judge every programme by eye on the held-out cameras. Drop any that reads as a placeholder.
8. **Signs.**
   - At init, the module publishes reserved boxes: screen faces plus the bezel, and hologram volumes plus 1 m.
   - `signs._build` drops any sign, lantern or sign light that intersects them, as a post-filter after `placeSigns`, so the RNG stream is unchanged.
   - Verify that A4 and B2 sign placement is identical to the baseline outside the reserved boxes.
9. **Motion and TAA.**
   - **Corner screens:** use surface motion while the dots are resolved, and blend to virtual-hit motion as the dots fade (the same `fw` term).
   - **Holograms:**
     - Rotate or swing at most 20° per second.
     - Handle the camera inside the volume: draw back faces and march from the near plane.
     - Clamp the HDR output to 15.
   - **Checks:** `burst-u12`, `burst-u62`, and a custom 4-frame burst at 25 m altitude along the Bund segment of the bench path.
10. **Lights.**
    - At most one light per screen and one per hologram, with radius at most 40 m.
    - Use `reserve()` plus `set()`. Apply the same 3-per-20-m-cell check as `selectLights`, counting sign lights.
11. **Timing.**
    - Programme phases, cycle length and glitch times come from `rng()` with a constant seed. Set them before the first capture.
    - The glitch probability per frame must stay at most 3%.
    - Nothing is changed after seeing a capture.
12. **Held-out cameras, fixed by rule now.**
    - For the first 3 screens and the first 3 holograms in hash order, place a camera at 1.7 m eye height on the road centreline, 40 m from the site, looking at it.
    - Add one camera 150 m away for each site type.
    - Write the exact coordinates into the idea folder before any code.
13. **Coordination.**
    - If I-014 or I-009 is adopted first, judge I-008 against that new best.
    - Register the module after `lightshow` in `main.js`, so that any later crown-site extension can read published searchlight positions.
