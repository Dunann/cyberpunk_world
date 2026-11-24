---
id: I-007
title: Skyline media canvas and tower-scale signage
status: proposed
direction: Wild card / borrow from another field (stage pixel-mapping and media facades)
family: signage: tower-scale (facade text shows, mega neon, rooftop letters)
parent: none
proposed_by: idea generator
date: 2026-11-24
---

# I-007: Skyline media canvas and tower-scale signage

## Idea
Make signage work at the scale of towers, which is the scale every wide shot sees. Today all signs are street-level (blade signs end 21 m above the pavement, giant screens are at most 40 m wide and 30 m up), so in A3, A6, B3, B4 and G1 the towers are plain window grids with edge strips.

Three parts, all driven by rules, never by camera positions:

1. **Skyline media canvas (the main part).** Borrow the method of stage lighting and real media-facade shows. A media server holds one content canvas and "pixel-maps" it onto many separate light fixtures. This is how the Lujiazui and Chongqing riverfront shows put one message, such as a line of characters or a sweeping wave, across ten or more towers at once. Here each tower cluster that faces a river gets a **cylindrical canvas** centred on a point on the river. Every LED-flagged facade pixel that faces the centre takes its colour from the canvas at (arc length around the centre, height). The canvas holds large Chinese characters from the existing sign atlas, 50–110 m tall, plus colour wipes. From the water and the opposite bank they read as one message across the gaps between towers. From oblique angles they break into per-tower fragments, as real shows do. Text is quantized to the LED pitch (window columns × floor slabs), so it looks like real coarse facade LEDs rather than a projected texture. A cue list runs all night:
   - **During the river show:** it is synced to `F.show` (beat, phase) and alternates text cues with the existing colour modes.
   - **Outside the show (standby):** slow vertical columns of characters scroll up single tower faces, and a skyline-wide message passes every ~40 s.
   - **Canvas 1:** the Yuzhong peninsula tip, centred on the confluence.
   - **Canvas 2:** the CBD face toward the Bund, centred on the river point nearest the CBD.
   - Optional canvas 3: Jiangbei.
2. **Mega vertical neon.** Hong Kong blade signs scaled up to 25–60 m, hung from tower corners 15–40 m above the podium with bracket arms every ~8 m. They show 3–6 vertical characters of invented brand and place names, with a few point lights that wash the facade and wet streets. Placement: about 12% of towers over 90 m in the hillside, Bund, CBD and nearby urban districts, on the corner nearest a street or the water, chosen by a position hash.
3. **Rooftop channel letters.** These are common on real Chinese skyscrapers: big red, gold or white characters standing on the roof edge, with no backing board. They go on about 25% of towers over 120 m in zones A and B, facing the river or the widest street. The board pixels are discarded, so only the letters and their thin steel support frame show.

## Why it might work
- Both critics' biggest complaints about A6, A3 and B3 are "box extrusions with the same window texture". Tower-scale light content changes the reading of those shapes without touching their geometry. It also answers the user's 4th priority directly ("skyscrapers with text light shows").
- The B1 light show is already one of the best-liked elements ("Bund drone dragon and laser show"). It is also what real Shanghai and Chongqing shows are famous for. The existing LED facades only show abstract colour bands. Adding text and cross-tower messages is the missing signature of the real thing.
- Most of the machinery already exists:
  - LED facade flag (`FLAG.LED`) and `ledColor()` in `buildings_wgsl.js`
  - the Canvas2D glyph atlas with CJK fonts (`signAtlas.js`)
  - the sign pipeline and cells
  - `world.shared.ledFacades`, `towerTops` and `B.hillTowers`
- So the risk is in art direction, not in engine work.
- Brief fidelity: the rubric's brief asks for "dense, technological … sleek". Mega neon and rooftop characters are the most recognisable cue of Chongqing and Hong Kong at night after the stilt houses.

## What's new about it
- **No earlier ideas in this program cover signage.** I-001..006 are about layout, waterfront, buildings and Hongyadong.
- **Closest existing code:** the LED facade show (flag 4, `ledColor`). It is world-space colour patterns on CBD glass towers only, without glyphs, without a shared canvas, and off outside the show.
- **What is new:**
  - the pixel-mapped shared canvas, a cylindrical projection around a river point, so one message spans several towers;
  - quantizing glyphs to the facade's own LED grid;
  - an all-night cue list;
  - extending LED shows to the residential towers of zone A, as line-grid LEDs on slab edges and window jambs, as on real Chongqing towers;
  - two new sign families placed from tower geometry (mega vertical neon, rooftop channel letters), drawn up to 5 km away.
- No street-level sign logic changes.

## Expected effect on the metric
- **Pairwise:** wins on A3, A6, B1, B3, B4 and G1. These are the poses where towers fill the frame and signage is currently absent. The largest effect should be on character and brief, a smaller one on detail, since towers read as designed surfaces instead of window noise.
- **Rough size:** +0.3 to +0.6 on zone A and B means if executed well.
- **Possible regressions:**
  - the frame could look busier and more garish;
  - A3 is captured at t = 100 (show off), so the standby programme has to carry it.

## Quick test
About half a day:
1. Make the sign atlas a shared singleton (see plan step 1) and bind it to the buildings draw group.
2. Add a minimal `canvasLED()` with one hard-coded canvas (the CBD, centred on the nearest Great River point) and one phrase, sampled at LED-pixel centres. Apply it to existing CBD LED facades.
3. Capture:
   - B1 (t = 45) and B3 (t = 100);
   - two custom cameras: one on the Bund promenade 600 m north of B1's position, and one 45° off-axis from the river;
   - a 4-frame motion burst near B4.

Continue if all of these hold:
- the characters are legible at 1 km;
- the message visibly spans at least 3 towers from the Bund;
- there is no shimmer or moiré in the burst;
- `--stats` shows less than 0.1 ms added to gbuffer.

## Implementation plan
1. **Shared atlas.** In `signAtlas.js`, add `getSignAtlas(device)`, which builds the atlas once and returns the same object afterwards. Both `signs.js` and `buildings.js` call it; buildings initialises before signs, so it cannot wait for `world.shared.signAtlas`.
   - Add a `CANVAS_PHRASES` list of 10–14 short phrases of 4–8 characters in a bold CJK font. Use horizontal and vertical variants, for example 山城不夜, 霓虹江湖, 两江汇流, 渝, 申, 欢迎来到重庆. These are original slogans; avoid real brand names.
   - Check that the atlas still fits in 4096x3072. If not, raise H to 4096 (+4 MB).
2. **New file `mediaCanvas.js`:**
   - **`buildCanvases(world, towers)`:** clusters towers taller than 100 m in districts HILLSIDE, BUND, CBD and URBAN within 700 m of a river centerline. Each cluster's centre C is the nearest river centerline point (from `RIVERS`), pushed 150 m further over the water. R_ref is the distance from C to the cluster centroid. Glyph height Hg = clamp(0.3 × median tower height, 50, 110). Keep at most 3 canvases, the largest clusters first.
   - **A small uniform:** for each canvas, C.xz, R_ref, Hg, base y, a phrase table index and seed.
   - **`CANVAS_WGSL` with `canvasLED(wp, n, cellCenterWP, seed, canvasId) -> vec3f`:**
     1. Face test: `dot(n.xz, normalize(C - wp.xz)) > 0.3`. Otherwise fall back to the per-tower standby pattern.
     2. Canvas coordinates: u = atan2(...) × R_ref, v = wp.y - baseY, using the cell centre so every LED pixel is one flat colour.
     3. Atlas lookup with `textureSampleLevel`. Use the R channel thresholded at 0.5, so glyph pixels are either on or off.
     4. The cue list, driven by `F.show` during the show and by `time()` in standby.
   - **Cues:**
     - (a) skyline message scroll at about 8 m/s along u;
     - (b) one giant character per tower face (渝 / 福 / 龍 / 申), chosen by tower seed;
     - (c) vertical character column rising on single faces (standby);
     - (d) the existing colour modes from `ledColor` (keep them).
   - **Brightness:**
     - show: 1.0;
     - standby: column faces 0.35–0.5, skyline messages 0.6 for 6 s every ~40 s;
     - non-text LED pixels in standby: 0.04, as today.
3. **`buildings_gen.js` and `buildings_landmarks.js`:** mark towers for LED and canvas without consuming RNG calls. This matters: an extra `R()` would change the whole city. Use `hash(x, z)`.
   - CBD: keep the existing 35% LED towers.
   - Hillside and urban towers over 100 m that face a river (sample `world.waterDist` 100–500 m along each face normal; at least one face sees water): 30% get LED.
   - Landmark towers: raffles (4 towers plus the 2 tip towers) and ridge.
   - Pack the canvas id (0–7) into flag bits 18–20 (floats are exact to 2^24).
   - Publish `world.shared.towerFaces` from `buildings.js`, with x, z, angle, hw, hd, y0, top, district, seesWater per tower. This is used by parts 2 and 3 and by `mediaCanvas`.
4. **`buildings_wgsl.js`:**
   - In the glass/truss/crystal branch (mat 3/16/18): when `flags & 4`, call `canvasLED` instead of `ledColor`, with the LED pixel at the window-cell centre.
   - In the RES/OFFICE branch (mat 1/2): add a "line-grid LED" for LED-flagged parts. Emissive lines on slab edges and window jambs, 0.25 m wide, take their colour from `canvasLED` at the cell centre. They fade to the cell average with `fwidth` to avoid moiré, as the window code already does.
   - Extend the draw bind group with a uniform for the canvases, the atlas texture and a sampler (bindings 2–4) in `buildings.js`.
5. **`signPlace.js` and `signs.js`: mega neon and rooftop letters**, from `world.shared.towerFaces`:
   - **Mega vertical neon:** about 12% of eligible towers (hash), one per tower, on the corner nearest a road or the water. Width 4–7 m, height 25–60 m, mounted 15–40 m above the podium, projecting 1–1.5 m. Use KIND.BLADE with a new mesh variant that has N bracket arms spaced 8 m apart. Make sure the neon tube width scales so it stays visible at 2 km. Give each 1–2 point lights (radius 30–40 m), at most 80 lights in total.
   - **Rooftop channel letters:** a new kind 6 (CHANNEL). Shade as neon letters; discard board pixels where the glyph mask m.r is below 0.3, except for a thin steel frame grid behind the letters. Letter height 6–14 m by tower size. Colours: red 60%, gold 25%, white 15%. Place on 25% of towers over 120 m in zones A and B, facing the water (if seesWater) or the widest adjacent road.
   - **Distance:** put both families in a separate `Cells` list with maxDist 5000 m and the far mesh (front and back faces only), so they show from G1 (about 4.8 km from the CBD).
6. Do not change street-level sign placement or the LED colour modes outside the new cues.
7. **Checks:**
   - Capture A3, A6, B1, B3, B4 and G1, plus custom views from the opposite banks at other spots, so the work is not tuned to the eval cameras.
   - Run the motion bursts.
   - Run `--stats`.
   - Make sure the RNG change did not move any building: compare a capture with `disable=signs` against the baseline at A6.

## Cost
- **Effort:** about 2–3 implementer days.
- **GPU, about 0.1–0.2 ms average, from:**
  - **Buildings fragment:** one extra atlas sample and about 40 ALU ops per LED-flagged pixel. LED faces cover at most ~20% of the frame in B1/B4, so this is under 0.05 ms. The new residential LED faces in zone A only add the line-grid term, which is cheap.
  - **Signs gbuffer:** about 150–300 extra large sign instances, mostly far tier and few pixels, so under 0.05 ms.
  - **Lighting:** up to 80 new static point lights of radius 30–40 m, spread across zones A and B. That adds about 0.03–0.08 ms in tiles that have them.
- **Memory:** the atlas may grow by 4 MB.

## Risks
- **Kitsch or clutter:** too much light content can look like a screensaver. Mitigations:
  - keep standby restrained;
  - text only on faces that face the canvas centre;
  - at most 3 canvases;
  - most towers keep normal windows.
- **Legibility:** 20 LED rows per character is coarse. Characters with few strokes (山, 城, 渝, 福) read best, so the phrase list must favour simple characters.
- **Merge conflicts:** buildings ideas I-004..006 may edit `buildings_wgsl.js` and `buildings_gen.js` at the same time. The edits here are additive and isolated (new flag bits, one new function call per branch, new bindings), but merge order matters.
- **Moved buildings:** changing tower flags without using hashes would change the RNG sequence and move buildings.
- **Timing at A3:** A3 is captured outside the show, so its gain depends on the standby programme being visible but calm.
