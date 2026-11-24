---
id: I-006
title: Facades that filter: glass reflects a baked image of the real city, and windows light in coherent patterns
status: proposed
direction: Attack the weakness (user priority 1: "pixelated")
family: shading representation: baked city reflection cubemaps + semantic occupancy + scale-aware facade bands
parent: none
proposed_by: idea generator
date: 2026-11-24
---

# I-006: Facades that filter

## Idea
The "pixel noise" the critics see comes from three shading causes. Fix all three while leaving the geometry alone.

1. **Glass reflects a fake city.** `cityRefl()` in `buildings_wgsl.js` draws an imaginary skyline from hashes: per-window dots at a fixed angular frequency (2520 columns around), plus neon strips 150 columns around.
   - On a flat glass wall seen from the street, this gives a screen of tiny dots at the wrong scale. Cropping B2 confirms it: the right-hand podium is covered in reflected dots.
   - On a cylinder, every neon strip becomes a vertical coloured line down the whole tower. These are the "stripe seams" on the B4 cylinder. The dot pattern also beats against the window grid, which is the moiré.
   - **Fix:** replace `cityRefl()` with **reflection cubemaps of the actual city**. Bake them once at load time by rendering the real building parts from 3–4 elevated probe points, with a cheap emissive-only shader. Glass then samples the cubemap with a mip level set by the reflection's pixel footprint and the roughness. Reflections become correct, blurred where they should be, and cannot alias.
2. **Windows light randomly at a scale where each one is 3–8 px.** From A6, a tower reads as a black box sprinkled with random bright squares.
   - **Fix:** a **semantic occupancy model**. Light windows in the patterns real buildings show at night:
     - a stair and lift core: one always-lit cool-white column of windows;
     - corridor windows;
     - apartment stacks that are correlated vertically;
     - offices lit as whole floor plates;
     - a lit lobby at the base;
     - a wide spread of overall occupancy between buildings, from nearly dark new developments to fully lit hotels.
3. **One switch between "detailed window" and "averaged" shading.** Both are wrong in between.
   - **Fix:** **three representations chosen by window size in pixels**, not by distance:
     - near (cell > 10 px): the full parallax interior, as now;
     - mid (2.5–10 px): flat, box-filtered windows with no interior ray cast, frames or curtains, and reduced lit/dark contrast, with dark windows filled by the cubemap reflection;
     - far (< 2.5 px): the existing floor-band average.
   - Walls also get a dim, visible cladding (ceramic tile, render, panel joints) with a street uplight, so a facade between windows is a surface, not a black void.

## Why it might work
- **The defects are named.** Findings §4: "window textures look like pixel noise or are at the wrong scale (B2, A6)"; "the cylinder tower in B4 has stripe seams, and one tower shows moiré". The user names "pixelated" as part of priority 1.
- **Each defect has a traced cause in the code** (see the Idea section), so the fix targets the cause rather than tuning.
- **Prefiltered environment maps are the standard alias-free answer** for mirror-like surfaces: mip level from roughness and footprint. The parallax-corrected cubemap method (Lagarde and Zanuttini, "Local Image-based Lighting with Parallax-corrected Cubemaps", SIGGRAPH 2012) makes one probe usable across a district.
  - Baking the probes from the real part buffer means the CBD glass reflects the actual twin towers, LED facades and Bund lights.
  - The current version reflects a pattern unrelated to the scene.
- **Real night aerials of Chinese cities read through structure:** lit cores, floor plates, stacks. They do not read as uniform random noise. Structured lighting tells the viewer what kind of building it is, which feeds the "character" axis as well as "detail".
- **Speed.** The three-band representation removes the parallax interior ray cast from the mid band, where it is invisible anyway. That is the most expensive part of the facade shader, so this idea should be cost-neutral or faster.

## What's new about it
- **Closest existing code:**
  - `cityRefl()`: a procedural fake reflection.
  - `windowGrid()`: per-apartment and per-floor lit state, with a 2-state near/far blend through `det`.
- **What is new:**
  - Reflections baked from the real geometry.
  - Lighting semantics by building type: cores, lobbies, stacks, occupancy spread.
  - A mid band defined by pixel size, with no interior ray cast.
- **Other ideas this round:**
  - I-005 adds geometry (relief, massing).
  - I-004 rebuilds Hongyadong.
  - This idea changes only facade shading and adds a load-time bake. It works with or without them.

## Expected effect on the metric
- **B2:** the reflected dot noise disappears and the glass podium reflects the real street and towers. Detail axis +1.
- **B4:** the stripe seams and moiré disappear, and the cylinder and twin towers show coherent reflections of their neighbours. Detail +1, coherence +0.5.
- **A6, G3 and G1:** towers read as designed buildings (lit cores, floor plates, varied occupancy) instead of noise. Detail and character +0.5 to +1.
- **A1 and A3:** the glass towers above the peninsula reflect real surroundings.
- **Zone means:** B about +0.4 to +0.6; A and G about +0.3.
- **Target poses for adoption:** A1, A3, A6, B2, B4, G1, G3.

## Quick test
Implement only the cubemap bake for one probe (the CBD) and swap `cityRefl()` for a cubemap lookup in the glass branch. Then capture B2 and B4 with `--stats`, plus one custom low camera facing a glass podium from 15 m.

Pass if all of these hold:
- the dot noise on the B2 podium is gone;
- the vertical stripe seams on the B4 cylinder are gone;
- the reflections look like the city;
- the buildings pass costs no more than before.

About 1 day.

## Implementation plan
Files:
- `buildings_wgsl.js`: `fs`, `windowGrid`, a new `fsProbe`.
- `buildings.js`: the bake at `init`, new bindings.

### A. Baked city reflection probes
1. **Probe points.**
   - Probe centres are the centroids of the 4 largest built districts with towers: CBD, Bund, Yuzhong, Jiangbei. Find them from `DISTRICTS` in code, not from poses.
   - For each, test candidate points on a 3×3 grid (±200 m) at 80, 140 and 200 m above ground. Pick the point with the most clearance from part bounding boxes. It must be outside every part.
2. **Bake pipeline.**
   - Reuse the buildings vertex shader `vs` with a new fragment entry `fsProbe`.
   - Make 6 Frame-sized uniform buffers per probe: copy the current frame data, then set `viewProj`, `view`, `camPos` and `res` for a 90° cube face.
   - Build a probe frame bind group with `ctx.renderer.frameLayout`: the same entries as `renderer.frameGroup`, except binding 0.
   - Draw every part through an identity visibility list using the cheapest mesh (K8 box for boxes, K24 for round parts), with no culling.
   - Render target per probe: a cube texture, `rgba16float`, 256² per face, with a depth texture.
   - Clear to a sky gradient: sample `skyRadiance` in a full-screen pass, or clear to a dark violet and add the sky in the lookup.
3. **`fsProbe`** returns only emissive radiance plus a dim lit albedo:
   - the far-field facade average (`windowGrid` with det forced to 0, the `farE` path);
   - emissive materials (`EMIT`, `CROWN`, `TV`, `LED` at their mean show level);
   - wall albedo × 0.02 for silhouettes.
   - It must not call `interior()` or `cityRefl()`.
4. **Mips and timing.**
   - Build mips with a small compute box-filter: 256 → 4, about 7 levels.
   - Encode and submit at the end of `buildings.init`, once. The load-time cost should be about 30–100 ms of GPU time.
5. **Lookup in the glass branch (`mat` 3, 16, 18).** It replaces `cityRefl()`.
   - Choose the two nearest probes and blend them by inverse distance.
   - Correct for parallax with a sphere proxy: radius 700 m around each probe, intersect the reflection ray, then look up the direction from the probe to the hit.
   - Mip level = `log2(dR · 256 / (π/2))` + roughness × 4.
   - Add a small dynamic term: during the light show, tint the reflection by `ledColor` at low frequency, so the show still shows in glass.
   - Keep Fresnel and the existing weighting.
6. **Dark window glass.** Dark residential and office window glass (`mid` 2 cells with `L.a < 0.5`) also gets the cubemap reflection at mid and near size, weaker than curtain glass.
7. **Bindings.** Add the cube array texture and a sampler to `drawLayout` (group 1, bindings 2 and 3).

### B. Semantic occupancy (`windowGrid`, `winLit`)
1. **Per-building occupancy level.**
   - Draw from a wide distribution by type. Residential: 25% of buildings 0.05–0.2 (new and empty), 50% 0.3–0.55, 25% 0.6–0.8. Hotels and offices are set by type.
   - This replaces the narrower `litB` spread.
2. **Residential.**
   - **Core:** one window column per tower, on the face with the lowest `fid`, at a seeded bay. Always lit, cool white (0.8, 0.9, 1.0) × 0.7. Applies to 70% of towers.
   - **Apartment stacks:** the lit state of apartment column c on floor f mixes a column tendency (hash of c) with a floor hash, so some stacks are mostly lit and others mostly dark.
   - **Colour:** one dominant temperature per building, with 10% accents. This replaces the full `roomLight` spread per window.
3. **Office:**
   - whole floor plates on or off, as now;
   - plus 1–3 "late-working" floors at full brightness;
   - cleaning bays: partial floors of 4–8 cells;
   - lobby: the first 2 floors are lit warm across the full width.
4. **Hotel type** (new, about 10% of Bund and CBD non-glass towers): a uniform warm grid, 75% lit, with curtains drawn on half.

### C. Scale-aware facade bands
1. **Representation by cell size.** Let `cpx` = the window cell size in pixels, from `fw` and the cell size.

   | Band | Cell size | What is drawn |
   |---|---|---|
   | Near | > 10 px | Current path: parallax interior, curtains, cages, frames |
   | Mid | 2.5–10 px | Flat window rectangle, box-filtered with `pulse`. Lit windows are a flat room colour × occupancy colour. Dark windows show the cubemap reflection × 0.3. No frames, curtains or cages. |
   | Far | < 2.5 px | Floor-band average (current `farE` with `bv` runs) |

2. **Blending.** Blend between bands over a 30% overlap. Use the same lit state in every band, so nothing changes as the camera moves.
3. **Wall cladding** (residential, concrete, office walls). Visible at mid and near size. Choose one per building:
   - ceramic tile: fine 0.3 m grid with a slight albedo lift; typical of Chongqing;
   - render: smooth;
   - precast panels: joints every bay and every floor;
   - metal panels.
   - Remove the `S.alb *= mix(0.5, 1.0, G.det)` darkening.
   - Add a street uplight emission: `S.alb × warm × 0.25 × exp(-yRel / 25)`, so tower bases glow and the upper walls stay readable but dim.
4. **Moiré audit.** Every periodic pattern in the buildings shader must fade to its average once its period is under 2 px: LED dots, crystal seams, truss lines, AC grilles, ribs and girih tiles. Check each one with a far `--cam` capture.

### D. Checks
- **Build and functional:** both builds succeed, `functional.mjs` passes 18/18, and there are no WebGPU errors.
- **Temporal stability:** with the burst captures (`burst-u62`), confirm that glass reflections and mid-band windows do not flicker when the camera moves.
- **Not tuned to the eval cameras:** probe placement comes from district data and part clearance, never from pose coordinates.

## Cost
- **Effort:** one implementer, 2–3 days. The bake is about 1 day; occupancy and bands about 1–1.5 days.
- **GPU per frame:**
  - The bake runs once at load: 4 probes × 6 faces × about 50k parts × about 30 triangles, roughly 36M triangles in total, a one-off of about 30–100 ms.
  - Glass `fs`: 2 cube samples replace `cityRefl()`, which is about 40 ALU operations with 4 hashes. Equal or cheaper.
  - The mid band skips `interior()`, the costliest call in `fs`, for windows of 2.5–10 px. That should save about 0.05–0.2 ms on aerial poses (A6, G3, B3).
  - Occupancy logic costs about the same as the current `winLit` and apartment logic.
  - **Expected net:** −0.15 to +0.05 ms average.
- **Memory:** 4 probes × 6 faces × 256² × 8 bytes × 1.33 for mips ≈ 17 MB of GPU memory.
- **Load time:** +0.1–0.3 s.

## Risks
- **Probe parallax.** A single probe per district is wrong for glass far from it, and towers near a probe reflect themselves. The sphere proxy and roughness blur hide most of it. If a tower visibly reflects itself, mask probes per tower by pushing the probe outside the tower's bounding box, or blend toward the far-field sky.
- **Bake integration.**
  - Rendering with a substitute frame bind group must match `frameLayout` exactly.
  - `init` runs before the first frame, so the textures it uses (`heightTex`, `infoTex`, fog) must exist at that point. The fragment shader can avoid fog and terrain lookups.
- **The look may get duller.** Removing the fake dots removes "sparkle". The baked probes must contain enough small bright detail: render at 256² and keep the lit windows' far-field average bright.
- **Mid band losing detail.** If the critics read the flat mid band as simpler, lower the near threshold from 10 px to 7 px. The cost saving shrinks, but the look holds.
- **Merge overlap.** I-005 also edits `fs` (array element branch, `GEOBALC` in `windowGrid`). Expect textual conflicts only.
