## Reviewer 2 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 6 | Pixel-mapping one canvas across many towers, borrowed from stage lighting, is a real transfer from another field and nothing earlier in the program covers signage. Parts 2 and 3 (giant blade signs, rooftop letters) are standard set dressing. |
| Feasibility and credibility | 4 | All the pieces can be built in this codebase, but the geometry of the main part does not work. Messages across towers break apart from every point more than about 50 m from the canvas centre, glyphs are wider than zone A tower faces, and only 35% of CBD towers carry LEDs. Half of the target poses are captured outside the show, where the canvas is mostly switched off. The GPU claim is optimistic but probably fits. |
| Expected impact | 5 | It is the only idea that answers user priority 4 ("skyscrapers with text light shows"), and the robust parts (one character per tower face, giant blade signs, rooftop letters) should improve character on B1, A6 and B4. A realistic forecast is 2–4 pairwise wins out of 6 targets, so it will probably miss the 4/6 adoption bar. |
| **Overall (average)** | 5.0 | |

### Strongest reason it will fail
The headline feature, one message spanning many towers on a cylindrical canvas, only holds together when viewed from very close to the canvas centre C. It breaks apart from the places the spec says it will read. I worked through canvas 2 using the step 2 rule:
- **Where C lands.** CBD towers within 700 m of the Great River lie at about x 2560–3000. Their centroid is about (2780, -1150). The nearest centreline point is about (2300, -1150). Pushing 150 m over the water puts C at about (2150, -1150), with R_ref ≈ 630 m.
- **Tower depth.** Towers in the cluster lie 410–850 m from C.
- **Tearing seen from B1.** The B1 camera at (2080, -880) is about 280 m from C. From there, two LED pixels at the same canvas angle, one on a front tower (r = 410 m) and one on a back tower (r = 850 m), appear about 0.35 rad (20°) apart. One glyph is Hg / R_ref ≈ 60/630 ≈ 5.5° wide. So glyphs tear by more than 3 glyph widths between rows. Two front-row towers only 100 m apart in depth (r = 450 and 550 m) still tear by more than one glyph width.
- **The same holds on the "opposite bank" in general.** The viewing distance (about 600 m) is close to the depth spread of the towers (about 450 m). Real cross-tower shows avoid this by using only the front row, seen from 1–2 km.

The canvas also has little surface to draw on:
- **CBD.** Towers are 40–60 m wide on 125 m blocks, so about half of each arc falls in gaps. The spec keeps LEDs on only 35% of CBD towers (step 3). That leaves roughly 15–20% of a message on lit surfaces.
- **Zone A.** Faces are smaller than the minimum glyph. The Raffles faces are 24–30 m wide (`hw: 15, hd: 12` in `raffles()`), and hillside tower faces are about 25–50 m. The minimum glyph is Hg = 50 m (step 2: clamp 50–110), so no glyph ever fits on one face.

The likely result is scattered pieces of strokes, not a readable message. A judge may call that "garbled" or "noisy" rather than "a text light show". The quick-test gate "the message visibly spans at least 3 towers from the Bund" will probably fail, and the spec has no fallback plan for that case.

### Other concerns
- **Half of the targets are captured outside the show.** The show runs at t mod 180 ∈ [20, 80] (`SHOW_START = 20`, `SHOW_LEN = 60` in `world.js`).
  - A3, A6 and B3 are captured at t = 100, outside the show. The skyline message is on for 6 s every ~40 s (15% of the time), so in those frames the canvas shows only dim columns (0.35–0.5) on single faces.
  - B1, B4 and G1 (t = 45, 50, 40) are inside the show, but the cue list "alternates text cues with the existing colour modes". Whether text is on at those exact seconds depends on how the cues are timed.
- **Tuning to the eval cameras and capture times.**
  - **Cue timing.** The cue phase and period are free constants. Picking them so that text is on at t = 40/45/50/100 is tuning to fixed eval parameters, and nobody would notice it in code review. Fix the cue rules before any capture is taken. Make text visible for most of the time (≥ 60% of the show, and a standby programme that does not depend on a 6 s window), and report the duty cycle.
  - **Where C sits.** "Pushed 150 m further over the water" puts C at the Bund water edge, about 280 m from the B1 camera. Canvas 1, "centred on the confluence", sits a few hundred metres from the A3 camera (650, 20, 150).
  - **Landmark choice.** Step 3 hand-picks the `raffles` and `ridge` landmarks for LEDs. `raffles` (220, -60) is exactly A3's look-at target, and `ridge` (-600, -260) is next to A6's target (-520, 60, -260). `ridge` is also about 850 m from the Great River centreline, outside the spec's own 700 m rule. Use a stated rule for all landmarks (for example, every landmark tower within X m of water), not a list that matches the eval focal points.
- **The clustering is not defined.** Step 2 does not say how towers are clustered.
  - On the peninsula, most towers on the south side are within 700 m of the Great River centreline. That forms a strip about 2.5 km long. One cylinder centre cannot serve that strip, because most of its faces fail the `dot > 0.3` test.
  - The prose ("canvas 1 centred on the confluence") is not what the rule produces. The implementer will end up placing the centres by hand, which brings in the gaming risk above.
- **The GPU claim (0.1–0.2 ms) is optimistic, though it probably fits in the 1.36 ms headroom.**
  - **Work per pixel.** The arithmetic and the atlas sample are cheap. But the full cue list (scroll, per-face character, rising columns, phrase table) is well over 40 ALU operations.
  - **Register pressure.** This code is added to the building über-shader, and the RES/OFFICE branch also changes. That can lower GPU occupancy for every building pixel, not just LED pixels. Building G-buffer work is most of the 2.55 ms G-buffer pass, so a 5–10% occupancy loss alone costs 0.1–0.25 ms.
  - **My estimate.** 0.2–0.45 ms in total. That is a fifth to a third of the headroom that I-004..I-009 all compete for.
  - **The quick test's stop rule is too narrow.** It uses `--stats` at chosen cameras with the minimal shader. Gate on `bench.mjs` (the fly-through) after the full shader, the residential branch and the 5 km sign tier are all in.
- **Point-light budget.** `SIGN_LIGHT_BUDGET = 2150` goes through `selectLights()`. If the 80 new lights enter the same candidate list, they can push out street-sign lights, and A4 is the best-liked pose. A "clear loss elsewhere" blocks adoption. Add them as separate static lights (5033 + 80 is well under `MAX_LIGHTS = 8192`).
- **Shimmer at distance.**
  - Sampling the atlas at mip 0 at cell centres, then thresholding at 0.5, gives a hard binary pattern. Where an LED cell is smaller than a pixel (G1 at about 4.8 km, B3, and the aerial burst-u62), it will alias and crawl.
  - The window code fades to averages through `det`. The canvas needs the same fade, to a filtered glyph coverage chosen by cell footprint, in the glass branch too, not only in the residential line-grid branch.
- **Residential line-grid LEDs are below one pixel at every target pose.** At A3 and A6, 0.25 m lines on a 3–4.4 m window grid cover about 14% of a cell. Against lit warm windows (25–40% coverage), text will read as a faint tint unless the LEDs are driven much brighter, and then bloom takes over.
- **G1 is an unrealistic target.** The CBD is about 4.8 km away, and towers there are 60–100 px tall, so a character is a few pixels. The most likely result is a tie, with a risk of shimmer.
- **B4's foreground towers are mostly outside the canvas band.** Most of them stand at x 3000–3500, 700–1150 m from the river centreline, so B4 gains mainly from parts 2 and 3.
- **Small errors.**
  - Raising the atlas to 4096×4096 rg8 with mips adds about 10.7 MB, not 4 MB.
  - Rooftop letters that use `discard` should get their own pipeline variant, so that early depth testing is not lost for every sign.
- **Effort.** Atlas singleton, clustering, a uniform, WGSL cue logic, flag changes in the generators and landmarks, `towerFaces`, a new RES/OFFICE branch, two sign families, a 5 km cell list and lights add up to closer to 4–5 implementer days than 2–3. That matters little here, but it raises the merge-conflict risk with I-005 and I-006, which edit the same facade code.

### What would make it stronger
- **Make the per-tower content the main part:**
  - one whole character per face, scaled to the face width, not to a 50 m minimum;
  - rising columns of characters;
  - colour wipes synchronised across towers, which survive parallax because they are low-frequency.
- **Keep cross-tower text only where its geometry can work.**
  - Use the front-row towers only, whose water-facing face is in a narrow depth band (for example ±60 m of a line fitted along the bank).
  - Use a flat canvas parallel to the bank.
  - Give every front-row tower an LED flag through a hash, so the message is not 65% gaps.
- **Rule out timing and camera tuning in the spec itself:**
  - Fix the cue rules and the canvas-centre rule before any capture.
  - Set text visibility to ≥ 60% of show time, and make the standby programme visible at all times.
  - Pick landmark LED towers by a stated rule.
  - Make go/no-go decisions on non-eval cameras only (3+ points along each opposite bank, 1 from the water, 1 aerial), at several random times.
- **Re-forecast honestly.** Target B1, B4, A6 and A3, where tower-scale signs fill the frame. Treat B3 and G1 as no-loss poses.
- **Budget gate.** Stop if `bench.mjs` shows more than +0.4 ms GPU average with the full feature set on.
- **Add distance filtering.** Blend the canvas from the thresholded LED glyph to a filtered glyph coverage once a cell is smaller than about 2 px.
- **Keep street-level lighting unchanged.** Add the mega-neon lights outside `SIGN_LIGHT_BUDGET`.
