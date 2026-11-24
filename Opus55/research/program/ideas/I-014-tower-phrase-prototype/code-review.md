## Code review round 1 (2026-11-24)

**Branch:** idea/I-014 at 020b679 (merge base with main: e80020e)
**Verdict:** pass

### Matches the spec
The code does what the I-010 plan, the seven I-014 changes and DEVIATIONS.md describe. I found no difference that is not recorded.

- **Content (change 1).** Front-row towers are grouped by bank (river id and side, from `world.segs`), ordered along the river, split into runs at gaps over 250 m, and then into phrases of 2–4 characters. Each tower gets one character on one face. A phrase reads left to right for a viewer on the water: the code sorts by right = (D.z, −D.x). That matches the engine's right-handed camera (`math.js:58–63`: yaw 0 looks along −Z, right = +X). The glyph's u axis uses the same tangent, so characters are not mirrored. There is no bank canvas and there are no back-row characters (deviation 3).
- **Readability (change 2).** Emissive blend: colour `one` / `one-minus-src-alpha`, alpha `zero` / `one`. The shader outputs rgb = character × panel and alpha = panel × (0.35 + 0.6 × halo). Windows under the panel are dimmed and the AO in emissive alpha is kept. No extra passes.
- **Shapes (change 3).** Faces are chosen by `kind` and `prm`, not `FLAG.ROUND`. I checked them against `ringEval`:
  - kind 0/1 face normals, and the face listing for kind 2 with N = 4;
  - triangle vertices, edge order and outward normals;
  - odd-polygon face angles and widths (2r·tan(π/N));
  - even-polygon, ellipse and lobed inner-radius handling.

  The JS rotation `rot` matches WGSL `rot2` (`common.js:22`). Twisted and profiled parts are skipped. Taper is handled by sizing the slot at its top edge; lean is handled by moving the axis with `P.d.xy × hf`, which is exact for profile 0, the only profile allowed.
- **Restraint (change 4).** The rule uses 100 m, the four districts, a 700 m reach, the front-row blocker test and a 40-tower cap with a fixed seed. Landmarks follow the same rule. A probe run reproduced the logged stats exactly: 5182 / 845 / 469 / 116 / 113 / 40, 11 phrases, Yuzhong 25, Bund 11, CBD 4.
- **Timing (change 5).** Text is always on. During the show, brightness is 2.6 × mix(1, 1.5 + 0.5 × beat, `F.show.x`), and the beat ripples along the phrase through `F.show.z`, which is a phase in 0..1 (`common.js:110`). No other time constants.
- **Distance (change 6):**
  - one texture-array layer per character, with a full mip chain and a clamp sampler, so layers cannot bleed into each other;
  - explicit LOD from metres per pixel;
  - `farK` is identical to the facade's (`buildings_wgsl.js:1032–1034`);
  - LED quantisation fades out between about 5 and 2.2 px per cell, and dots between about 10 and 4 px.
- **Cost (change 7).** No lights added (`LIGHT_BUDGET` and light code untouched). The overlay draws only flagged parts, through the same cull lists, with an equal-depth test, and discards outside the panel and on faces that don't face the lit direction.
- **Deviation 6 (Raffles).** Shape handling keeps the Raffles row towers (28.2 / 22.6 m slots), but the front-row rule excludes 3 of the 4. The probe confirms that (215, −68) and both tip towers, (150, −170) and (150, 45), carry characters. The spec's "do not drop the four Raffles row towers" is therefore met for shape handling but not in the outcome. This is recorded, and adding an exception would hand-pick a landmark. It is the coordinator's call, not a code fault.
- **Deviation 2 (cap order).** The cap now keeps the phrases nearest the water first, chosen after looking at participant lists, not captures. It uses no camera input, so it is acceptable.

### Problems
No serious or moderate problems.
- **minor:** `TEXT_STRIDE = 64u` is hard-coded in WGSL, not generated from `TEXT_MAX` — `buildings_wgsl.js:39`, `buildings_text.js:19`. Both are 64 now, and the per-list bind-group offset `l × TEXT_MAX × 4` = 256 bytes meets `minStorageBufferOffsetAlignment`. A future change to only one of them, or a `TEXT_MAX` that is not a multiple of 64, would break the overlay lists or fail validation. Generate the WGSL constant from `TEXT_MAX`.
- **minor:** the overlay's indirect `instanceCount` is not clamped to `TEXT_STRIDE` (only the write is) — `buildings_wgsl.js:79–80`. It cannot exceed 40 today, because at most 40 parts carry `FLAG.TEXT` (and never more than `TEXT_MAX`, after truncation) and each part is appended once. Harmless as it stands.
- **minor:** for triangle and odd-polygon faces, the slot centre `uC` is a fixed tangent offset that does not scale with taper, so on a tapered triangle the character drifts sideways by uC × (1 − taper) at the top — `buildings_text.js:84`, shader `buildings_text.js:421`. On rectangles and even polygons uC = 0, so this does not apply to them. It is a few metres at most and rare.
- **minor:** the 100 m tower height counts any non-prop part in the stack at least 12 m tall and 4 m wide, including crowns of non-shaft material — `buildings_text.js:150–155`. It is consistent with "tower top" and has no effect on the test.
- **minor:** `compute()` writes `textArgsBuf` every frame even when no tower qualifies — `buildings.js:229`. It writes an existing typed array, so it allocates nothing; it is 120 bytes of queue traffic.

### Requested checks
- **Per-frame JS allocations:** none. `compute()` adds one `writeBuffer` of the existing `argsTemplate`. `gbuffer()` adds a pipeline switch, one bind-group set and 6 indirect draws over pre-created bind groups. All other new allocations (selection, buffers, glyph texture, pipelines) happen once in `init`.
- **WebGPU validity:**
  - Bindings:
    - compute stage: 5 storage buffers;
    - text pipeline fragment stage: 3 storage buffers;
    - frame group: none.

    These are within the default limit of 8.
  - Formats and samplers:
    - `rg8unorm` is filterable float, sampled with the filtering `sampClamp` through `texture_2d_array<f32>`;
    - the emissive target (`rgba16float`) is blendable;
    - the other targets use `writeMask: 0`.
  - Uploads: `writeTexture` with `bytesPerRow` w × 2 is valid for queue writes.
  - Shader rules:
    - `fwidth` is called at function entry, before `discard`;
    - the overlay reuses the `@invariant` vertex shader and the same mesh list, so the `greater-equal` test matches the prepass depth.
  - The probe load reported no `__gpuErrors`, no device loss and no WGSL compile errors.
- **Eval pose coordinates:** none. `buildings_text.js` contains only rule constants (`RULE`), phrase lists and the palette, and it does not import `POSES`. The only world data it reads are `DISTRICTS`, `segs`, `waterDist`, `heightAt` and `districtAt`.
- **`TEXT_STRIDE` and `TEXT_MAX`:** both are 64, with the buffer size, bind-group offset and size consistent (see the first minor problem).
- **Baseline when no tower qualifies:**
  - no part gets bit 18, so the new cull branch never runs and `argsBuf` and `vis` are filled exactly as before;
  - `textCount = 0` skips the overlay draw;
  - the glyph texture (1 empty layer) and the 1-slot buffer exist only so bind groups stay valid.

  Output is identical to the baseline. The facade shader does not test bit 18, so setting it changes nothing for chosen parts either; the only change is the overlay.

### Checks run
- `git diff main...020b679 --stat`: 6 files: `buildings.js`, `buildings_text.js` (new), `buildings_wgsl.js`, `tools/test-text.mjs` (new), the built `index.html` and DEVIATIONS.md.
- `node tools/test-text.mjs`: all checks passed.
- `node build.mjs --dev`: builds `out/dev.html` (933 KB) without errors.
- A short probe load: 320×180, frozen at t = 113, through `tools/launch.mjs`, about 10 s, no bench. It found no GPU errors and stats matching DEVIATIONS.md. All 40 glyphs were listed and phrase orders checked: for example, the Bund 江城不夜 runs from z = −1352 to z = −1617 on east-facing towers, which is left to right for a viewer on the river looking west.

### Evaluation untouched
`git diff main...020b679 -- Opus55/eval` is empty, and `world.js` (which holds `POSES`) is not in the diff. No evaluation files, data or poses were changed.

## Code review round 2 (2026-11-24)

**Branch:** idea/I-014 at 7c8592b (code commits 26f1f79 and 2eddd37 on top of 020b679)
**Verdict:** pass
**Declared targets (by rule, measured before any official eval capture):** B1 only. Every other pose is a non-target, and a clear loss on any of them blocks adoption.

### Target declaration
**Rule (from the coordinator):** a pose is a target when at least 2 characters of one phrase are visible (not occluded and not faded), each with a character height of at least 20 px at 2560×1440.

**How I measured it.** I fixed this method before seeing any counts, and changed no rule or constant afterwards.
- I made a debug copy of the round-2 source in the scratchpad (`i014dbg/`). The worktree is not modified: `git status` is clean.
- In the copy, `fsText` writes a marker into the emissive G-buffer target for every glyph pixel that meets all of these:
  - ink value at least 0.5;
  - combined fade (grazing fade × facing) at least 0.5;
  - inside the panel;
  - not on a cap.

  The marker holds the slot id, the slot width and height in pixels, and the glyph's mean coverage.
- The marker is written with alpha 1, so it replaces the window emission beneath it. Pixels that lose the equal-depth test, or are covered by anything drawn later in the G-buffer pass (vegetation, signs), carry no marker. This makes occlusion exact.
- After each pose has settled for 48 frames, the emissive target is read back.
- Per character, I record:
  - **height:** the vertical extent of its visible glyph pixels;
  - **visible fraction:** the visible glyph pixel count ÷ the expected count. The expected count is the mean coverage × the slot area in pixels, so a character covered by more than half counts as occluded.
- **A character counts as visible** when both hold:
  - its height is at least 20 px scaled to the render height (10 px at 720);
  - its visible fraction is at least 0.5.
- **Run:** `capture.mjs --poses-file eval/poses-v1.json` at 1280×720, at each pose's own time, under `gpu-run.sh I-014cr`. I then rechecked B1, B3, G1, G3 and G4 at 2560×1440 to rule out low-resolution effects. Both runs gave the same target list.

**Per-pose results.** Each character is listed as height in px at 1440 / visible fraction, from the full-resolution run where one exists.

| Pose | Characters with any visible glyph pixels | Visible characters (rule) | Target |
|---|---|---|---|
| A1–A6 | none | 0 | no |
| B1 | 江上月: 江 35 / 1.14, 上 32 / 1.11, 月 32 / 1.07 | 3 (江上月) | **yes** |
| B2 | none | 0 | no |
| B3 | 江上月: 江 13, 上 13, 月 15 (all under 20 px) | 0 | no |
| B4 | none | 0 | no |
| G1 | 大江: 大 11, 江 10; 江上月: 2 specks of 1–4 px | 0 | no |
| G2 | none | 0 | no |
| G3 | 大江: 大 15, 江 15; 江上月: 江 6, 上 5, 月 7 | 0 | no |
| G4 | 大江: 大 22 / 1.05, 江 21 / **0.11** (mostly occluded); at 720, 江 had no visible pixels | 1 | no |

- **Target list:** B1. The spec's earlier target list (B1, A3, A6, G4, G1, G3, A1, G2) no longer applies: none of A1–A6 sees any character, and the G poses see only characters under 20 px or partly hidden ones. Under the adoption rule, the candidate must win B1 (at least 2/3 of one target) and lose clearly nowhere.
- **Poses that change but are not targets:** B3, G1, G3 and G4 show small characters. These are the poses where a clear loss could come from text, so the judges' clutter and pixelation checks matter most there. A1–A6, B2, B4 and G2 should be unchanged as far as text goes.

### Matches the rules
The code matches the DEVIATIONS round-2 section.
- **Faces (`partFaces`):**
  - flat faces only;
  - rounded and chamfered rectangles use 2hw − r (straight part plus half of each corner);
  - triangle and polygon (N < 12) normals, midpoints and widths match `ringEval`, as checked in round 1 and still true;
  - cylinders, ellipses, lobed plans, twisted and profiled parts are skipped.
- **One band (`fitBand`):** a single g and yC for the whole phrase, with 0.1 g side and vertical margins, taper measured at both slot edges, and the base at least 40 m above the ground. The iteration only ever shrinks g, and `fits()` is checked at the end, so the result always satisfies every constraint.
- **`fitPhrase`:**
  - normals are within 25 degrees;
  - characters are ordered along T = (Dm.z, −Dm.x), the viewer's right for a camera looking along −Dm (the round-1 check against `math.js` still holds);
  - spacing is 1.3–6 g, with evenness at most 1.8;
  - **Depth rule:** neighbouring face centres may differ in depth by at most 0.45 × their spacing, so the projected order can only flip beyond atan(1 / 0.45) = 65.8 degrees from the normal. This is correct.
  - **Hole rule:** another bank tower blocks a phrase when it reaches the band, lies strictly between two neighbours along T (with 0.5 g clearance), and stands less than 25 m behind the line joining them, or in front of it. The code does this correctly.
- **Selection (`bankPhrases`, `choosePhrases`, `pickText`):**
  - the pruning bounds are safe: g is an upper bound, and the along-bank break has 1.25× slack, so it can only drop candidates, never admit wrong ones;
  - larger phrases are kept first;
  - no tower is shared between phrases;
  - phrases on one bank are at least 500 m apart, with at most 2 per district and 8 overall;
  - no character repeats within a district. In the result, CBD has 不夜城 and 江上月, and Yuzhong has 山水城 and 大江, so no repeats; 江 repeats only across districts, which is allowed.
- **Blockers:** towers on podiums now count; skybridges and the vault garden still don't.
- **`uC`:** now scaled by the taper at the band height (round-1 minor 3 fixed).
- **Result:** reproduced exactly in my runs: 5182 / 845 / 469 / 101 front row, 33 candidates, 6 phrases on 15 towers, matching DEVIATIONS.

### SDF glyphs (`edt2d`, `signedField`, `buildGlyphArray`)
- **`edt1d`** is the standard Felzenszwalb–Huttenlocher lower envelope:
  - `z` has n + 1 entries;
  - `z[0] = −∞` stops the backtracking loop;
  - "no feature" is 1e20 rather than Infinity, so there is no NaN; this is the same convention as the reference code.
- **`edt2d`** runs columns then rows, which gives exact squared Euclidean distances to pixel centres.
- **`signedField`:**
  - inside: √dIn − 0.5; outside: 0.5 − √dOut, so the edge sits at 0 and the sign is positive inside;
  - the 2×2 mean ÷ 2 converts 512-px units to 256-texel units;
  - it is encoded as 0.5 + sd / 24, a ±12-texel range in 8 bits, about 0.09 texel per step;
  - the shader decodes it with the same constants (`SDF_RANGE` is interpolated from JS).
- **Antialiasing:** a one-pixel edge, dist / mean(texels per pixel along u and v) + 0.5. It blends to the box-filtered coverage mip (B channel) between 1.5 and 3 texels per pixel. Only level 0 of R is sampled, so the box-filtered mips of the distance channel are never used.
- **`test-text.mjs`** covers the distance field and passes.

### WebGPU validity
- **Glyph texture and shader:**
  - `rgba8unorm` is filterable float, which matches the layout's default `sampleType: 'float'`;
  - queue `writeTexture` with `bytesPerRow` w × 4 needs no 256-byte alignment;
  - 9 mip levels for 256²;
  - `fwidth(uv)` is called before any branch or `discard`;
  - `textureSampleLevel` is valid in non-uniform flow;
  - the grazing fade is `smoothstep(0.34, 0.5, dot(view, n))` with both vectors unit length.
- **Errors:** both capture runs and the probe reported an empty `__gpuErrors` list.
- **Cull lists and offsets:** `TEXT_STRIDE` is now generated from `TEXT_MAX` (round-1 minor 1 fixed). `TEXT_MAX` = 64 keeps the 256-byte bind offset.
- **Per frame:** the overlay pipeline, bind groups and draw loop in `buildings.js` are unchanged from round 1.

### Other requested checks
- **Per-frame JS allocations:** none added. `compute()` and `gbuffer()` are unchanged, and all new work (EDT, mips, selection) runs once in `init`.
- **Eval poses:**
  - the selection code contains only rule constants;
  - `text-views.mjs` cameras are either derived by rule from each phrase's centre and normal, or are round-1 held-out positions. None matches an eval pose. Its fixed cameras are at (−250, 8, 620), (2200, 10, −1550), (1200, 380, −300) and (−2400, 230, 2300); the nearest eval pose is G4 at (−1177, 53, 889).
  - Some constants were changed after looking at held-out views only (40 m slot base, podium blockers, 500 m phrase gap). DEVIATIONS records this, and it is allowed.
- **Random streams:** unchanged. The diff touches only `buildings.js` (shared stats), `buildings_text.js` and `buildings_wgsl.js`, plus tools. Selection uses only `hash01` with the fixed seed and runs after generation. No `rng` call was added or reordered.
- **Baseline when no tower qualifies:** unchanged from round 1. No flags are set, the cull branch never runs, and the overlay draw is skipped.

### Problems
- **minor:** the hole rule only tests the bank's other front-row candidates (`others` = `bankTowers`) — `buildings_text.js` `fitPhrase`. A tower between two characters that is not a candidate is never tested: one under 100 m, a cylinder, a tower whose own face is blocked, or one in another district.
  - Outcome check: a probe tested all 6 chosen phrases against every collider box. It looked for any box that reaches the band, overlaps the gap between neighbouring characters, and stands no more than 65 m behind the row (or anywhere in front of it, up to 300 m). The only boxes found were the member towers' own parts (offset 0, or equal to the gap), so the current result has no holes.
  - A future rule change could produce holes. To guard against that, test all `towers` (or blockers) between the characters.
- **minor:** DEVIATIONS says that beyond the order-flip angle (65.8 degrees) the grazing fade "has already removed the characters". In fact the fade is still about 0.4 at 65.8 degrees (dot = 0.41 in `smoothstep(0.34, 0.5, ·)`), and reaches zero only at 70 degrees. Between 66 and 70 degrees the characters already overlap on screen, so the risk to reading order is negligible. Only the wording is off.
- **minor:** the `REJECT` counter is a module-level object. It is reset at the start of `selectTowerText`, but candidate checks that `test-text.mjs` runs outside that function also add to it. It affects only the stats.
- **observation (not a code fault):** with 15 towers, only B1 qualifies as a target. The idea now rests on one pose, and a clear loss on B3, G1, G3 or G4 (small characters) still blocks adoption.

### Checks run
- `git diff 020b679 7c8592b --stat`: `buildings.js` (+3/−2), `buildings_text.js`, `buildings_wgsl.js` (+4/−2), `test-text.mjs`, the new `text-views.mjs`, the built `index.html` and DEVIATIONS. The worktree is clean.
- `node tools/test-text.mjs`: all checks passed.
- Debug build of a scratch copy (`node build.mjs --dev`): OK.
- Target measurement: `gpu-run.sh I-014cr node tools/capture.mjs --poses-file …/eval/poses-v1.json --w 1280 --h 720 --textstats` (debug copy, all 14 poses), then `--ids B1,B3,G1,G3,G4 --w 2560 --h 1440`. Logs: `scratchpad/targets-run1.log` and `targets-run2.log`. No GPU errors.
- Hole probe (`gpu-run.sh I-014cr node tools/holes.mjs`, debug copy): no foreign tower inside any phrase.
- bench.mjs not run, as instructed.

### Evaluation untouched
`git diff main...7c8592b -- Opus55/eval` is empty, and `world.js` (which holds `POSES`) is not changed. The eval poses file was only read.
