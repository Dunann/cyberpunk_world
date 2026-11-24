---
id: I-023
title: Recessed facade systems - each window bay is a small recess solved per pixel (no added triangles), with an exact distant average and glass that reflects the city's real light
status: in-review
direction: Wild card / break an assumption (the facade shading model)
family: shading representation: per-pixel analytic facade relief (the room parallax extended to the wall), with closed-form filtering
parent: none (uses the review lessons of I-005, I-006 and I-012, and the I-018 window test)
proposed_by: idea generator
date: 2026-11-24
---

# I-023: Recessed facade systems

## Idea
Every tower facade today is a flat picture. `windowGrid()` in `buildings_wgsl.js` paints window rectangles on the flat face of a box. Only the lit rooms behind the glass have depth (`interior()`). Every idea so far kept that picture and added things on top of it (I-005, I-012: instanced boxes) or filtered it (I-006). Both strict critics on the current best now rank "several facade systems, filtered, no moiré" as change 1, naming 11 of 14 poses, and detail is the weakest axis (4.86).

This idea replaces the picture with a small 3D model of each window bay, solved exactly in the fragment shader. It adds no triangles and changes no generated data.

1. **A bay is a recess.** In each cell (one bay wide, one floor high) the wall face stays where it is. The opening becomes a box-shaped recess of a given depth, with the glass on its back wall. The view ray is intersected with that box in closed form, the same kind of arithmetic `interior()` already does for rooms. The pixel then shows one of three things:
   - the glass, with the lit room behind it, seen at the shifted position;
   - the back wall around the glass;
   - a side of the recess: the reveal (the side of a window opening), the sill, the underside, or the floor, side walls and ceiling of a loggia (a balcony set back into the building).
2. **Facade systems.** A system is a set of numbers for that model: recess depth, openings per bay, opening shape, glass shape, and which parts stay flush with the wall face. A hash of the tower's existing seed picks one of 11 systems by material (table below). The continuous numbers also vary per tower.
3. **An exact distant average.** The model is closed-form, so its average over a cell is closed-form too: for a given view direction, the visible share of glass is a product of two overlap lengths. Far facades use this average. They change brightness with the view angle exactly as the near model does, and there is nothing left to alias. Two faces of one tower stop looking identical.
4. **Own-window light.** The sides of a recess are lit by that cell's own window: bright next to the glass, fading toward the wall face. This makes the relief readable at night in a renderer that has no shadows.
5. **Glass reflects real light.** `cityRefl()` draws an imaginary skyline of dots (2,520 columns around) and neon strips (150 around). It is the traced cause of the "pixel-noise curtain wall" in B2 and the "stripe/moiré" cylinder in B4. It is removed. Glass gets a slight tilt per pane (each pane reflects a slightly different part of the sky, as real curtain walls do) and a smooth city-light term read from the fog module's existing light map.

## Why it might work
- **It is the change both critics rank first.** Critic 1: "one window texture on every tower" (A6, G1, G3); change 1 lists A1 A2 A3 A5 A6 B2 B3 B4 G1 G3 G4. Critic 2 ranks the same change first. The user's priority 1 is "too boxy and pixelated".
- **Per-pixel parallax already reads in this renderer.** The I-012 reviewer called the parallax office interiors on B2's left wall "the brightest detail in the shot". This idea applies the same method one layer further out, to the wall in front of the glass.
- **Relief needs no shadows here, because the windows are the light sources.** It shows in three ways:
  - **Occlusion of light.** Seen at an angle, reveals, parapets and fins hide part of the lit glass. A facade seen square-on is bright; the same facade seen along the street shows lit fin sides and less glass.
  - **Own-window light** on the recess sides (point 4 above).
  - **Real normals.** The G-buffer gets the normal of the visible recess side, so street lamps and signs light sills and reveals differently from the wall.
- **It avoids each failure of the geometry route.**

  | I-005 / I-012 review finding | This idea |
  |---|---|
  | Elements pop when culled; morph and cull use different measures | No geometry. The recess depth is evaluated per pixel and blends to its own closed-form average with the existing `det` factor |
  | Thin geometry at 1-2 px shimmers in aerials | Every edge is a box-filtered `pulse()` in face coordinates, as the painted windows are today |
  | Opaque boxes black out lit windows | The window is the back of the recess and keeps its light |
  | "The renderer has no shadows or SSAO" | Own-window light and occlusion of lit glass (above) |
  | A4 and A5 are built from parts the kits never touch | Step F applies the same function to the Liziba tower; shop podiums stay untouched on purpose |
  | Triangle and cull cost in aerial views | No triangles, no cull change |
- **The distant look is designed, not left over.** I-018's quick test found that finer windows "lost 4/4: distant facades break into a coarse, blotchy mosaic". Window sizes are not changed here. The distant path is the exact mean of the near model, so there are no lit and dark blotches added by this idea.
- **The B2 and B4 defects have a traced cause.** Two I-006 reviewers confirmed with crops that `cityRefl()` produces the dot grid and the full-height strips. I-006 failed on its bundle and on blurry cubemaps, not on this diagnosis.

## What's new about it
- **Closest ideas in this program:**
  - I-012 (rejected, 5.0): real boxes for balconies and fins. This idea gives the same depth cue with no geometry, no LOD and no change to the part list.
  - I-006 (rejected, 4.67): filtered flat facades, cubemap reflections, new window occupancy. This idea keeps the lit-window logic as it is, uses no cubemaps, and changes what a window is rather than which windows are lit.
  - I-018 (in evaluation): designs towers per block. It changes shapes; this changes surfaces. They do not overlap in code.
- **Closest existing code:** `interior()` (rooms behind glass) and the painted `BALC` balcony rail.
- **Closest known work:**
  - Interior mapping (van Dongen, 2008): closed-form rooms behind a flat window. This is its counterpart for the outside of the wall.
  - Relief and parallax occlusion mapping (Policarpo et al. 2005; Tatarchuk 2006): ray marching through a height texture. Here there is no texture and no marching: one box per cell, solved exactly, which is what allows an exact filtered average.
  - Haegler, Wonka, Müller Arisona, Van Gool, Müller, "Grammar-based Encoding of Facades", Computer Graphics Forum 29(4), 2010: a facade grammar built for per-pixel access on the GPU. I checked the citation but not whether it includes depth.

## Expected effect on the metric
- **Near and mid views (cells of 6 px or more):** recessed windows, deep loggias with lit ceilings, fin and egg-crate facades, and glass without dot noise. Detail +1, character +0.5 on poses dominated by these facades.
- **Far views (cells under 6 px):** towers differ by system (vertical lines, horizontal bands, grid, dark glass with lit floors) and each tower's two visible faces differ in brightness. Detail +0.5.
- **Zone means:** about +0.2 to +0.4 in each zone if the targets are won. This is one step toward 9, not the whole distance; it is the step the critics rank first.

### Target poses (declared rule)
- **Eligible pixel:** a pixel shaded by the new cell function with a recess depth above zero and a cell of at least 4 px in both directions, or a glass pixel (materials 3, 16, 18) with a cell of at least 4 px.
- **Rule:** a pose is a target when eligible pixels cover at least 30% of the frame. If more than five poses qualify, the five with the largest share are the targets.
- **How it is measured:** a dev-only debug output paints eligible pixels (it needs only material, flags, plan kind and cell size, so it runs before any recess code exists). The implementer runs it on all 14 poses in quick-test step 1 and writes the frozen list to `DEVIATIONS.md` before the first comparison capture.
- **My prediction from the current images:** A6, B4 and B2 qualify; A5 qualifies once step F ships; A3, B3 and G4 are near the threshold. The measured list decides, not this prediction.
- **Every other pose** must show no clear loss. The design keeps the largest risks out: LED and tower-text facades stay flat, and shop podiums, Bund stone, brick and the whole Hongyadong complex are untouched.

## Quick test
About 1.5 days. Run all GPU jobs under the shared lock.

1. **Measure first (2 hours).**
   - The buildings' share of the G-buffer pass: `--stats` with and without `--query disable=buildings` at A6, B2, B4, A4 and G3.
   - The eligible share per pose, with the debug paint. Freeze the target list.
   - Four held-out cameras, computed from part data by a script before any render is viewed, and written to `heldout-cameras.json`:
     - **H1:** the residential part with `FLAG.BALC`, box plan and median height among those of at least 60 m in Nan'an Old Town (ties: lowest part index). Camera 45 m from the centre of its widest face, 50° off the face normal, 25 m above the part's base, looking at the face centre at 45% of its height.
     - **H2:** the same rule for an office part in West Hills (no balcony flag needed).
     - **H3:** the glass podium part (height 30 m or less) with the median face length among those of at least 40 m in the CBD. Camera 1.7 m above the ground, 18 m from the face, 70° off the normal, looking along the face.
     - **H4:** 300 m above a point 500 m south of the West Hills centre, looking at the centre, pitch -35°.
     - If a camera is inside a collider or below the terrain, mirror the angle; if still blocked, take the next part in the sorted list.
2. **Build two pieces behind dev switches (1 day).**
   - **Recess:** `cellRecess` with three systems only (residential punched windows 0.3 m deep; loggia columns on `BALC` parts; office fins), own-window light, and the distant average.
   - **Glass, three arms:**
     - main as it is;
     - a cheap control: `cityRefl()` with its dot layer faded once its period is under 6 px and its strips limited to a 0.1 rad band of elevation;
     - the light-map term with pane tilt.
3. **Judge blind, in both orders.**
   - Recess on against main: A6, H1, H2, H4.
   - The three glass arms pairwise: B2, B4, H3.
   - Also capture A2 and A4 and run `pixdiff --noise`: tiles that show only untouched materials must not change.
4. **Bench:** three alternating pairs of main and candidate. Report the mean difference and each pair.

**Go / no-go:**
- **Recess:** go if it wins at least 3 of the 4 views in both orders with no clear loss. Otherwise stop and record which views lost and why.
- **Glass:** ship the arm with the most wins. If the cheap control ties the light-map arm, ship the control.
- **GPU:** the bench average may rise by at most 0.30 ms. If it rises more, limit the per-pixel recess to cells of 6 px or more and re-measure.

## Implementation plan
Files: `buildings_wgsl.js` (most of the work), `buildings.js` (one new binding), `transitStatic.js` (step F only). No file in `eval/` changes.

**Random streams:** nothing in generation changes. No JS generator code runs differently, no `R()` call is added, moved or removed. Every choice is made in WGSL from fields each part already has (seed, material, flags, plan kind). `tools/hyd-identity.mjs` must report every part, sign, sign lantern, light, sign slot and collider identical to main.

### A. The cell function
```wgsl
// One facade system. Lengths in metres; rectangles as fractions of one sub-cell.
struct Sys {
  dep: f32,              // recess depth (0 = flat, as today)
  sub: vec2f,            // openings per bay (x) and per floor (y): 1 or 2
  o0: vec2f, o1: vec2f,  // opening in the wall face
  b0: vec2f, b1: vec2f,  // glass on the back wall
};
struct Cell {
  glass: f32, back: f32, side: f32,  // box-filtered coverages; their sum is the opening's coverage
  q: vec2f,                           // where the ray meets the back wall: window content is looked up here
  sn: vec3f,                          // normal of the visible recess side (x along the face, y up, z into the wall)
  sz: f32,                            // depth of the visible side: 0 at the wall face, 1 at the glass
};
fn cellRecess(f: vec2f, fw: vec2f, cellM: vec2f, d: vec3f, S: Sys) -> Cell
```
- `f` is the position in the sub-cell, `fw` its pixel footprint, `cellM` the sub-cell size in metres (width times the ring scale, so tapered parts work).
- `d` is the ray direction in the face frame: x along increasing face distance, y up, z into the wall. Take the x sign from `tAlong`, which the shader already computes, and clamp z to at least 0.05.
- With `s = d.xy / d.z * S.dep / cellM` (the sideways shift over the recess depth, in cell fractions), per axis:
  - opening coverage: `pulse(o0, o1, f, fw)`;
  - the ray reaches the back wall where `f + s` is still inside the opening: `pulse(max(o0, o0 - s), min(o1, o1 - s), f, fw)`;
  - glass: `pulse(max(o0, b0 - s), min(o1, b1 - s), f, fw)`; return 0 when the interval is empty;
  - `side` = opening minus back-wall coverage; `back` = back-wall coverage minus glass.
- The visible side is the first of the four recess walls the ray meets: compare the two exit distances `(edge - f) / s` per axis. That gives `sn` (left or right reveal, sill or underside) and `sz`.
- `q = f + s`. The existing window code (frames, curtains, cages, `interior()`) is evaluated at `(q - b0) / (b1 - b0)` instead of at the flat position.

### B. The distant average
For the same `s`, the cell means are closed-form. Per axis, `v = max(1 - abs(s) / (o1 - o0), 0)`:
- back-wall share = opening area × v.x · v.y;
- glass share = the product over the two axes of the length of `[max(o0, b0 - s), min(o1, b1 - s)]` (zero if empty);
- side share = opening area × (1 - v.x · v.y).

Blend from the per-pixel result to these means with the existing `det` (1 at cells of 5.5 px, 0 at 2 px). The existing distant emission `farE` is multiplied by glass share ÷ flat window share, and the side share adds the own-window light of step D. For systems that keep today's window size, the result at a square-on view equals today's value.

### C. Systems
`fn sysOf(mat: u32, flags: u32, kind: u32, prm: f32, seed: f32) -> Sys`, chosen by `hash11u(u32(seed * 29.0) + 211u)`. The seed is shared by all segments of a tower (`tower()` passes `o.seed` to each), so a tower has one system.

| Material | System | Depth | What it looks like |
|---|---|---|---|
| Residential, box plan, no `BALC` (half) | Punched windows | 0.2-0.45 m | Today's window in a reveal, with a sill |
| Residential, box plan, no `BALC` (half) | Frame grid | 0.5-0.7 m | Flush piers and floor bands; the window wall is set back in every bay, above the flush sill band |
| Residential, `BALC` | Loggia columns | 1.2-1.5 m | On the columns that have painted balconies today: a deep balcony behind the flush parapet, lit ceiling and side walls, a door-window on the back wall |
| Residential, `BALC`, 30% | Balcony bands | 1.2 m | Loggias in every bay: continuous parapet bands |
| Residential, not box plan | Narrow pairs | 0.35 m | Two tall narrow windows per bay |
| Office | Recessed ribbon | 0.4 m | Today's ribbon behind flush spandrels (the wall bands between floors) |
| Office | Egg-crate | 0.7 m | Piers and floor shelves in front of each window |
| Office | Fins | 0.55 m | Two fins per bay; lit fin sides when seen along the street |
| Glass | Flush panes | 0.06 m | Pane tilt only |
| Glass | Capped mullions | 0.15 m | Vertical lines with real parallax |
| Glass | Panel mix | 0.06 m | 25-40% of panes are opaque metal panels, chosen by hash: a pattern that reads from far away |

Rules that keep things attached and unchanged where they must be:
- **Flat (depth 0):** every part with `FLAG.LED` or `FLAG.TEXT` (the light show and the I-014 tower text keep their flat screen), materials 16 and 18 (truss and crystal patterns), and every material not in the table. For these the function returns exactly today's coverage.
- **AC units stay attached.** `acUnits()` mounts each unit on the face (centre 0.32 m out, 0.6 m deep), in the band from 0.1 to about 0.28 of the floor height. It is called for box-plan residential parts and for shophouse blocks (shop material, untouched here). On box-plan residential parts the wall below the sill (below 0.3) always stays flush, and loggias open only above the flush parapet (0.33). Systems that recess the full bay height are limited to parts that never get AC units (office, glass, non-box residential).
- **Corner piers are solid.** No opening within half a recess depth of either end of a face, so a ray near a corner never shows a recess that would lie outside the building.
- **Glass depths are small on purpose.** At 0.15 m and a 1.5 m pane, a wall seen 75° off its normal still shows about 60% of its glass, so B2's lit office interiors stay visible. (The I-012 review showed that 0.35 m opaque fins would hide them.)
- **The tower text overlay** draws with an equal-depth test on the same faces. Depth is not changed, so it keeps working.

### D. Shading the new surfaces (the residential, office and glass branches of `fs`)
- **Recess sides and back wall:** the wall albedo (before the window mix), `ao` falling from 1 at the wall face to 0.45 at the glass, and the side normal written to the G-buffer, mixed by coverage.
- **Own-window light:** emission `albedo × window colour × lit state × (0.08 + 0.37 · sz²)`, using the cell's existing `winLit` result. Unlit windows add nothing. Loggia ceilings and side walls use the same term.
- **Loggias** reuse the existing balcony column rule (`fract(id.x · 0.5 + 0.25 · hash)`), the painted rail, balusters and laundry, which stay on the flush parapet.
- **Energy check:** set the two constants above once so that the frame-mean 8-bit luma of A6, G1 and G3 stays within ±5% of main. The city must not get darker.

### E. Glass reflection (only if the light-map arm wins the quick test)
- Add the fog module's blurred light map (`ctx.fogLi.glowView`, 48 m cells, already used by `rain.js`) to `drawLayout` as binding 2, fragment stage. If the fog module is disabled, bind a 1×1 black texture.
- Replace `cityRefl()`:
  - for reflection directions at or below a soft skyline band, read the light map at two points along the reflected ray (half way and at the point where the ray comes down to street level, at most 400 m out) and average them;
  - scale so that the mean glass brightness on the B2 podium stays within ±30% of main, so the comparison tests structure, not brightness;
  - sky reflection is already added by the lighting pass for glass, so nothing is counted twice.
- **Pane tilt:** add `tAlong · jx + up · jy` to the normal of glass panes, with `jx, jy` in ±0.012 from a hash of the pane id, faded out with `det`. Point lights and the sky then reflect slightly differently in each pane.

### F. The Liziba tower (after the quick test passes)
`transitStatic.js` shades the monorail tower with its own `residential()` function, so it would stay the one flat facade in zone A's most recognisable view. Export the cell function as a WGSL string and call it there with the punched-window system (0.3 m) around the existing window content. Curtains, plants, TV flicker and lit states stay as they are. It has its own dev switch. If A5 then meets the 30% rule, it is a target.

### G. Checks before evaluation
- Both builds succeed; `functional.mjs` 18/18; no WebGPU errors.
- `hyd-identity`: all parts, signs, lights, slots and colliders identical to main.
- `pixdiff --noise` on A2 and A4: tiles showing only untouched materials do not change.
- A camera sweep toward one tower of each system, 800 m to 40 m in 12 steps: no visible jump where `det` blends, no moiré at any step.
- `burst-u12` and `burst-u62`: no flicker on recess edges or glass panes.
- All dev switches are compiled only into the dev build. The production build has one look.

## Cost
- **Effort:** one implementer, 4 to 5 days including the quick test.
- **GPU, per frame:**
  - **Added:** about 60-70 arithmetic operations per facade pixel in the near and mid band (three filtered interval tests, one exit comparison, the side shading), and about 12 in the distant band. No new texture reads for residential and office facades.
  - **Removed (if the light-map arm ships):** `cityRefl()` on every glass pixel (three hash calls, an `atan2` and an `hsv`), replaced by two reads of a 256² texture.
  - **Estimate:** +0.10 to +0.25 ms on the bench average, less on glass-heavy views. This is an estimate from operation counts, not a measurement; quick-test steps 1 and 4 measure it. The scripted path is mostly at 45-330 m (per the I-005 review), where many facade pixels are in the cheap distant band.
  - **Where the time comes from:** the existing headroom. The current best averages about 9.8 ms against the 11 ms gate, and p99 (about 11.7) and the worst frame (about 15) are far from their limits. This idea is capped at +0.30 ms by its own stop rule. If other adopted ideas need the headroom, I-024's optional light pre-cull step returns budget in the lighting pass without changing the image.
- **Memory and load time:** none.

## Risks
- **The relief may not read at the distances that matter.** At 6-10 px per cell a 0.3 m reveal is under one pixel; only its effect on brightness shows. The deep systems (loggias, fins, egg-crate) carry the result there. The quick test includes an aerial held-out view (H4) for this reason.
- **Judges may prefer the brighter, flatter original.** Occlusion removes some lit glass at steep angles. The own-window light and the ±5% luma check are the guard; the blind quick test is the decision.
- **Smooth glass may look duller than dot noise.** I-006's reviewers raised this. The pane tilt and the lit floors are the answer, and the three-arm test includes the cheap control so the simpler fix can win.
- **A larger shader can slow every building pixel,** not only the changed ones. The bench in the quick test would show it; the fallback is to move the recess branches into a second pipeline for near lists only.
- **Depth is not corrected.** The recess is drawn on the flat face, so fog, reflections and the tower text see the old depth (an error of at most 1.5 m), and TAA reprojects the recess content with the wall's motion, as it does for rooms today. Bursts check this.
- **Curved and twisted parts.** The face frame changes per pixel on cylinders and lobed plans; depths above 0.5 m may look sheared there. Deep systems can be limited to straight faces if the sweep shows it.
- **Silhouettes do not change.** Towers stay box-shaped against the sky. This idea makes surfaces better, not outlines; outline changes are a separate family (I-013, I-018).
- **Citywide change.** Every tower facade changes, so every pose can change. One clear loss on a non-target pose blocks adoption even if the targets win.
