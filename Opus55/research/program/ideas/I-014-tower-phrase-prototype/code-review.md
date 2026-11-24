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
