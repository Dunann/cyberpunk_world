---
id: I-010
title: Riverfront tower character show
status: proposed
direction: Wild card / borrow from another field (media-facade practice); revision of I-007 after review
family: signage: tower-scale facade text show
parent: I-007
proposed_by: idea generator
date: 2026-11-24
---

# I-010: Riverfront tower character show

## Idea
Every tall tower that looks onto a river shows large Chinese characters on its water-facing faces, all night. This copies how real Chongqing and Lujiazui riverfront shows actually read: each building is its own screen, with **one character fitted to each face**, and the whole front row takes part, so the bank reads as one display. This revision makes the per-face character the main feature. It keeps one message across several towers only where the geometry works: on a **flat canvas along the bank, applied only to the front row of towers**.

The text is drawn by a **separate additive overlay pass over the building faces**. The pass draws only the participating tower parts, writes only to the emissive G-buffer target, and uses the existing equal-depth test. So the shared facade shader (`buildings_wgsl.js` `fs`) is not changed at all, which avoids its register-pressure risk and most merge conflicts with I-005 and I-006. No point lights are added.

**What changed from I-007, point by point against the reviews:**

| Review point | I-010 |
|---|---|
| Cross-tower text tears apart, and too few towers are lit (35%) | The main feature is one character per face, scaled to the face. **Every** tower that meets the rule takes part. Cross-tower text only appears on a flat canvas along the bank, for front-row towers within a 50 m depth band. |
| Text mostly off outside the show, and timing could be tuned to capture times | Text is on **≥ 85% of the time**, in the show and outside it. All cue constants are fixed in this spec, before any capture (cycle 37 s, which does not divide the 180 s show cycle). |
| Landmarks and canvas centres hand-picked (raffles, ridge, confluence) | One stated rule picks every participating tower, landmarks included. Canvases come from a rule on `RIVERS` with no coordinates or place names. |
| Hard on/off glyph pixels shimmer at distance | A filtered glyph (explicit mip from the LED cell's screen size) replaces the LED dots once a cell is under 3 px. |
| Residential line-grid LEDs invisible | Dropped. The same overlay works on any facade material. |
| Mega neon and rooftop letters bundled in | Deferred to a later idea. |
| GPU estimate not credible; über-shader register pressure | Separate overlay pipeline. Realistic estimate 0.1–0.25 ms. Plumbing cost is measured first with the full `bench.mjs` fly-through, with stop rules. |
| New lights could push street-sign lights out | **No new lights.** |
| Atlas memory figure wrong | If the atlas has to grow, 4096×4096 rg8 adds about 11 MB (8 MB plus mips). |
| Complex characters will not read | Only low-stroke characters, at least 24 LED rows per character. |

## Why it might work
- **Priority:** the user asked for this directly (priority 4, "skyscrapers with text light shows"), and the coordinator confirmed it.
- **It reads at every viewing angle.** A character that fills one face is legible from any angle that sees that face. No parallax alignment is needed, which is why real shows rely on it. Rough sizes:
  - B1, a 40 m CBD face about 1 km away: about 34 m glyph, about 47 px tall.
  - A3, a 25 m peninsula-tip face about 500 m away: about 21 m glyph, about 58 px.
- **Front-row coverage:** lighting every participating tower, rather than 35%, gives the riverfront the "whole bank is a display" look that reviewers identified as the thing that makes real shows readable.
- **Cross-tower text where it works:** restricting it to the front row and a flat canvas keeps the depth spread at ±25 m. Tearing is then 50 m × tan(view angle): about 18 m at 20° off-perpendicular, which is under a third of a 60–100 m canvas glyph. Outside about ±25° the text degrades, but it is only 22% of the cycle, and the per-face characters carry the rest.
- **Cheap shading:** the overlay shades only visible pixels of the participating faces, because of the existing prepass and equal-depth test. Its fragment code lives in its own small shader, so it cannot slow down the other 95% of building pixels.

## What's new about it
- **Within the program:**
  - the only idea that puts text light shows on towers (user priority 4);
  - I-008's crown holograms are 3D objects above roofs, not facade content;
  - I-006 changes window lighting patterns inside the facade shader, while this idea adds emission on top in a separate pass.
- **Against the code:** the existing LED show (`FLAG.LED`, `ledColor`) is abstract colour bands on 35% of CBD glass towers, during the show only. This idea adds:
  - a rule-based participant set in every district along the rivers;
  - glyph content fitted to each face;
  - an all-night cue cycle;
  - a front-row bank canvas;
  - distance filtering;
  - an overlay pass that leaves the facade shader untouched.

## Expected effect on the metric
- **Targets:** A3, A6, B1 and B3. In each, river-facing faces of tall towers fill a large part of the frame and face the camera.
  - A3: peninsula-tip towers facing the confluence, 400–800 m.
  - A6: south-side peninsula towers facing the Great River, toward the camera.
  - B1: the CBD across the river, with the show on.
  - B3: an aerial view of the CBD's west faces.
  - Adoption needs 3 of these 4.
- **Expected no-loss poses:** B4 (most foreground towers are 700–1150 m from the river, outside the rule) and G1 (the CBD is about 4.4 km away, and characters are a few pixels and filtered).
- **Other poses:** street poses are unaffected. Burst-u62 is checked for shimmer.
- **Axes:** mainly character and brief, with a smaller gain in detail (towers read as designed surfaces).
- **Rough size:** +0.3 to +0.5 on zone A and B means. That is close to the 0.5 noise threshold, so the pairwise judge, not the critic means, is the deciding test.

## Quick test
About 1 day. All go/no-go captures use **held-out cameras only**, never the eval poses, at the **fixed times t = 13, 71, 100, 133, 167**:
- 3 points along each opposite bank: the Bund promenade at points other than B1, and the Nan'an bank facing the peninsula;
- 1 camera on the CBD bank looking back at the Bund, to check the effect is not one-sided;
- 1 camera on the water;
- 1 aerial camera.

1. **Plumbing cost.** Build the overlay pipeline, the cull append and the bindings, with every candidate part flagged but the fragment shader returning 0. Run `bench.mjs` 3 times, and the baseline 3 times. **Stop if the average GPU time rises by more than 0.15 ms.**
2. **Per-face characters only** (no bank canvas). Run the participation rule and report the participant count and the text duty cycle. Measure the duty cycle by sampling t from 0 to 1000 s in 0.1 s steps; it must be ≥ 85%. Capture the held-out cameras at the 5 times, plus a 4-frame moving burst at about 2 km.

Continue if all of these hold:
- characters are legible at 500 m–1 km;
- text is visible on each camera's towers in at least 4 of the 5 times;
- there is no crawl or shimmer in the burst.

## Implementation plan
1. **Shared atlas.** In `signAtlas.js`, add `getSignAtlas(device)`, which builds the atlas once and returns the same object; both `signs.js` and `buildings.js` call it (buildings initialises first).
   - Add these entries, rendered at about 200 px:
     - `CANVAS_CHARS`, low-stroke characters only: 山 城 江 火 龙 福 渝 天 光 月 云 水 风 飞 大 中;
     - `CANVAS_WORDS`, vertical words: 山城, 江火, 不夜城, 两江, 天光, 云中;
     - `BANK_PHRASES`, horizontal: 山城不夜, 江火天光, 欢迎光临.
   - If the atlas no longer fits, raise H to 4096 (about +11 MB).
2. **Participation rule** (new file `mediaFacade.js`, `selectParticipants(world, parts)`), run after generation and before upload. It uses no RNG calls, only hashes of positions and part indices.
   - **Candidate parts:**
     - material GLASS, OFFICE, RES, CRYSTAL or TRUSS;
     - not PROP or DETAIL;
     - part height ≥ 60 m;
     - the tower top (the top of the part, or of its stack) at least 100 m above the part's `baseY`;
     - district type HILLSIDE, URBAN, BUND or CBD, through `world.districtAt`.
     - Landmark parts follow the same rule; there is no named list.
   - **Water sight:**
     - from the part centre, march 16 directions (22.5° apart) in 20 m steps up to 700 m, using `world.waterDist`;
     - the direction "sees water" at the first step where the point is water;
     - the part takes part if any direction sees water within 700 m;
     - `waterDir` = the normalised mean of the directions whose hit is within 1.25 × the nearest hit.
   - **All candidates that pass take part.** Report the count. If it exceeds 300 parts, raise the top threshold from 100 to 130 m. This depends only on the count, never on captures.
   - **Data:**
     - set a new flag bit `CANVAS = 262144` (bit 18) on participating parts;
     - write a per-part buffer `canvasInfo` (2 × vec4 per part, zero for non-participants): `waterDir.xz`, glyph size, slot count, cluster id, front-row canvas id (or -1), hash seed. About 1.6 MB for about 50k parts.
3. **Glyph fitting** (in JS, per participating part):
   - **Flat faces** (parts without `FLAG.ROUND`):
     - a face is lit if `dot(faceNormal, waterDir) ≥ 0.45`, which allows 1 or 2 faces;
     - glyph size g = 0.82 × face width.
   - **Round parts:** the lit arc is centred on `waterDir`, with g = 1.3 × radius.
   - **Skip** when g < 16 m (too few pixels) or the part is shorter than 1.6 g.
   - **Slots:** up to 4 square slots, stacked down from 0.1 g below the part top, each 1.15 g tall, never lower than 20 m above the podium.
   - **LED pitch** = g / 24, so every character is 24×24 LED cells whatever the tower size.
4. **Bank canvases** (rule on `RIVERS`; no coordinates):
   - For each participant: nearest river centerline point, river tangent t, side s, and bank distance b (lit face centre to centerline).
   - Group by (river, side). Sort by position along the river. Split into runs wherever consecutive towers are more than 250 m apart along the river.
   - For each run with ≥ 4 towers:
     - b_min = the minimum b;
     - **front row** = towers with b ≤ b_min + 50 m;
     - keep the run only if there are ≥ 4 front-row towers spanning ≥ 300 m along the river.
   - **Canvas:** a vertical plane parallel to the run's mean river tangent, at bank distance b_min + 25 m. Glyph height Hc = clamp(1.3 × median front-row face width, 45, 100) m. Baseline at 0.55 × the median front-row height above the median base.
   - At most 4 canvases, the longest front-row spans first.
   - Pixel mapping is an orthographic projection onto the plane: u = dot(wp.xz − origin, t), v = wp.y.
   - Pass canvases in a uniform: origin, t, Hc, baseline, phrase index, seed.
5. **Overlay pass:**
   - **Culling:** in `CULL_WGSL`, a visible part with the CANVAS bit is also appended to 6 extra indirect lists, one per existing list and so with the same mesh LOD. That is one branch and one atomic per participating part.
   - **Drawing:** in `buildings.js`, `gbuffer()` draws those 6 lists after the shading pass with a new pipeline:
     - the same vertex shader;
     - depth `greater-equal`, no depth write (as the shading pass);
     - colour targets: write mask 0 on albedo, normal and motion; additive blend on the emissive target, with colour `one + one` and alpha `zero + one` so the AO in alpha is kept.
   - **Fragment shader** (`MEDIA_WGSL` in `mediaFacade.js`, a separate module from the facade shader):
     1. Compute the LED-cell screen size from `fwidth(wp)` in uniform control flow, before any branch.
     2. Face test against `waterDir`; return 0 if it fails.
     3. Find the slot and glyph UV from `fd`, `fl` and the stack position (round parts: projection onto the tangent of `waterDir`).
     4. **Near (cell ≥ 3 px):** sample the atlas R channel with `textureSampleLevel` at the cell centre, at LOD 0, with a soft threshold (smoothstep 0.35–0.65), times a round LED-dot mask (50% fill).
     5. **Far (cell ≤ 1 px):** take a continuous sample at explicit LOD log2(atlas texels per metre × metres per pixel), with no quantisation.
     6. Blend between near and far over 1–3 px.
     7. Output `colour × brightness × glyph`.
6. **Cue cycle.** The constants below are fixed by this spec and must not be changed after captures.
   - **Phase:** each cluster has phase offset `hash(cluster id) × 37 s`. A cluster is a bank run, or a single tower outside runs.
   - **Cycle of 37 s:**
     - **A, 0–24 s: face characters.** Each lit face shows a character from `CANVAS_CHARS`, chosen by `hash(part, face, floor((t + phase) / 5.3))`, in its top slot, changing every 5.3 s with a 0.5 s vertical wipe. On faces with ≥ 3 slots, a 2–4 character word from `CANVAS_WORDS` fills the column top-down during 30% of the 5.3 s periods (chosen by hash).
     - **B, 24–32 s: bank message.** Front-row faces show a `BANK_PHRASES` phrase on the bank canvas, scrolling at 6 m/s. Other faces keep cue A.
     - **C, 32–37 s: colour wipe.** A low-frequency colour sweep along the bank direction, with no text.
   - **Text-on fraction:** 32/37 ≈ 86%. Report the measured value.
   - **Brightness:**
     - outside the show: 0.45 (glyph emissive about 1.5–3 HDR, comparable to lit windows);
     - during the show (`F.show.x`): 1.0 with a beat pulse `0.8 + 0.2 × exp(−4 × F.show.z)`.
   - **Palette:** per cluster, from warm white, gold, red and cyan.
   - On CBD towers that already carry `FLAG.LED`, the existing colour bands stay in the facade shader and act as a background under the text, as in real shows.
7. **No point lights are added.** `SIGN_LIGHT_BUDGET` and `selectLights` are untouched.
8. **Checks:**
   - Run `bench.mjs` 3 times. **Stop if the average rises by more than 0.35 ms over baseline or p99 by more than 0.6 ms.**
   - Run the functional checks (18/18).
   - Capture the held-out cameras at the 5 fixed times and the bursts.
   - Run the eval captures only once the go/no-go is done.
   - Confirm no building moved: capture `disable=signs` at A6 and diff against the baseline.

## Cost
- **Effort:** about 2–3 implementer days.
- **GPU, about 0.1–0.25 ms average** (to be measured with `bench.mjs`; stop rules above), from:
  - **Cull compute:** one extra branch and atomic per participating part (≤ 300), negligible.
  - **Overlay vertex work:** ≤ 300 visible tower parts, mostly box and K24/K48 rings, about 0.02–0.05 ms.
  - **Overlay fragments:** only visible pixels of participating parts, thanks to the equal-depth test. Faces that fail the face test return after a few ops. Lit faces cost about 80 ops plus 1–2 atlas samples. At about 25–30% of the frame (A3, B1) that is about 0.05–0.12 ms; in the average fly-through frame it is far less.
  - **Emissive target:** one extra blended write, included in the above.
- **No change to the facade über-shader**, so its register use and occupancy stay the same.
- **No new lights.**
- **Memory:** `canvasInfo` about 1.6 MB, plus the atlas growth if needed (about 11 MB).

## Risks
- **Too much or too little:** every river-facing tower showing characters can read as garish. Standby brightness, low-stroke characters and plain windows on all other faces are the controls. Conversely, if the judge finds the standby text too faint at A3 or A6 (t = 100), the target wins depend on it. The brightness is fixed in advance and must not be tuned on eval captures.
- **Thin participant sets:** the rule may yield few participants in some clusters, for example if `waterDist` marching is blocked by nothing and picks distant water across a hill. Report participants per district and treat the count as a finding, not something to tune.
- **Cross-tower text is limited:** it reads only within about ±25° of perpendicular to the bank. Elsewhere it degrades to fragments for 8 s of each 37 s cycle.
- **Overlay pass pitfalls:** it depends on the cull lists using the same mesh LOD as the main pass (it reuses the same list index) and on the `@invariant` position already in the vertex shader. A mismatch would show as missing or flickering text, caught by the burst check.
- **Merge conflicts:** edits are in `CULL_WGSL` (one append), `buildings.js` (bindings, pipeline, draw) and `buildings_gen.js` and landmark code only through a post-generation pass. I-005 and I-006 changes to the facade `fs` do not conflict, but I-006's window patterns will show under the text.
- **Margin:** the expected gain is close to the 0.5 noise level on critic means, so success depends on pairwise wins in 3 of the 4 targets.
