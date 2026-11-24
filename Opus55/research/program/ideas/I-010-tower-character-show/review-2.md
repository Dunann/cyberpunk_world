## Reviewer 2 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 5 | One character per facade, lit on every front-row tower, is how real media facades already work. The revision moved I-007 toward the standard method, which is the right call but less novel. Drawing the text in a separate additive pass is good engineering, not a new idea. It is still the only idea in the program aimed at user priority 4. |
| Feasibility and credibility | 6 | The engine plan matches the code, and the GPU claim is credible (checked below). But the forecast of which poses change is wrong. B3 is mis-described, and five non-target poses (G4, G1, G3, A1, G2) change a lot while the spec calls them unaffected or no-loss. The bank canvas still breaks into fragments because of the gaps between towers. And standby text, added on top of lit windows, may have too little contrast to read. |
| Expected impact | 5 | B1, and probably A3 and A6, can gain clearly on character and brief. But adoption needs 3 of 4 targets, B3 is likely a tie, and many non-target poses can veto adoption. The expected critic gain (+0.3 to +0.5) is at the noise floor, and the idea does not touch the critics' main complaints (bare hills, boxy massing, forest strips). |
| **Overall (average)** | **5.33** | |

### Strongest reason it will fail
The change is not limited to the target poses, and the adoption numbers work against it. Every tower within 700 m of water that passes the height rule lights up, city-wide. The Yuzhong peninsula sits between two rivers (district rz = 620 m), so almost all of its tall towers take part. Their lit faces point at the Great River (south) or the Jade River (east). That is exactly what these non-target cameras look at:
- **G4** (t = 70, show on): the south faces of the peninsula, head-on, 0.5–1 km away, at full brightness 1.0 with the beat pulse.
- **G1** (t = 40, show on): the same faces, 1–3 km away.
- **G3** (t = 100): the same faces from the air.
- **A1**: the east faces of the Raffles towers and of the hillside towers fill the top half of the frame.
- **G2**: the faces at the confluence tip.

The spec says "street poses are unaffected" and lists only B4 and G1 as expected no-loss poses. It never looks at G4, G3, A1 or G2. G4 is one of the two most-liked views in the baseline. There, 40–80 towers would each show a random character from a list of 16, all at show brightness and changing every 5.3 s. A strict art director could easily call that "garish" or "screensaver". One clear loss blocks adoption.

On the target side, B3 is unlikely to win (see below). So the idea must win all three of B1, A3 and A6, and lose clearly nowhere among about 10 visibly changed poses. I put the chance of adoption at about 30–40%.

### Other concerns
- **B3 is mis-described.**
  - The camera at (1450, 230, 60) looks north-east toward (2250, 30, −1050). Its main subject is the southern Bund, with the CBD as a background strip 1.5–2.5 km away.
  - The Bund towers' water faces point east, toward the river. The view direction is about (0.58, −0.81), so those faces point away from the camera.
  - Only a few southern Bund towers, where the river bends, would light a south face toward the camera.
  - CBD glyphs at about 2 km are about 20 px tall.
  - Forecast: a tie. The spec's "aerial view of the CBD's west faces" is not what the frame shows.
- **The bank canvas still breaks into fragments, from any viewing angle.**
  - The spec handles depth tearing but not the gaps between towers.
  - Hc = 1.3 × the median face width, so every canvas glyph is wider than the face it lands on.
  - CBD towers are 40–60 m wide on a 125 m grid, which leaves 65–85 m gaps. Peninsula lots repeat every 83 m.
  - So about half of each 52–100 m glyph falls into a gap or onto a back-row tower. "山城不夜" would read as broken pieces, which is the failure the I-007 reviews predicted, on a smaller scale.
  - Cue B also *replaces* the good per-face characters on the most visible towers (the front row).
  - Together with the text-free cue C, a front-row cluster shows clean characters only 24/37 = 65% of the time. B1 and A6 are each dominated by one front-row run, so each has about a 1-in-3 chance of being captured in a weaker state. That chance is fixed by `hash(cluster id)`. It cannot be tuned, but it is a lottery the spec builds in for no benefit.
- **Standby legibility, which carries A3 and A6 at t = 100.**
  - The pass is additive only, at 0.45 brightness, "comparable to lit windows". It is drawn on top of the window grid and cannot darken it.
  - On the Raffles and hillside facades (which have bright window grids and edge strips), a glyph about as bright as the windows becomes "a region about 2× brighter in the shape of a character". After tone mapping and bloom, that is weak contrast.
  - Real media facades read because the LEDs are much brighter than the windows, or because the screen area is dark.
  - The fix is cheap and needs no change to the facade shader. Use a colour blend of `one` + `one-minus-src-alpha`, and an alpha blend of `zero` + `one` so the AO is kept. The overlay can then dim the windows under a "screen" area (for example 60%) and add the glyph on top.
- **"Face width" and "radius" are undefined for most tower shapes.**
  - `FLAG.ROUND` is set for rounded rectangles (`kind 0, prm > 0`), lobed shapes and triangles, not only for cylinders (`buildings_gen.js:28`). So the "round" branch, `g = 1.3 × radius`, gets parts that have no single radius.
  - The four middle Raffles towers (`hw 15, hd 12, kind 0, prm 0.45`) have straight faces of only 13.2 m and 19.2 m. The spec's "25 m face → 21 m glyph" at A3 holds for the two tip towers (straight faces 22.4 m and 28.4 m). For the middle four, the result depends on a definition the spec does not give.
  - Define it: the projected width of the part across `waterDir` at the slot height, scaled by `uv.z` (taper).
- **Twist, lean and taper are not handled.**
  - CBD `kind 3` towers twist by 0.6–1.2 rad, the Raffles end towers lean ±9 m, and some towers taper to 0.7.
  - With twist, the face test against `waterDir` passes on only part of the height. With taper, a slot sized from the base width overflows near the top.
  - Exclude parts with a twist, or measure the width at the slot height.
- **There is no "stack" in the data.**
  - `tower()` emits separate parts for each setback, with no link between them.
  - The rule "the top of the part, or of its stack" needs a grouping step, for example parts with the same (x, z, angle) whose bases and tops meet.
  - It is small, but it must be written down, or the height rule will differ from what the spec intends.
- **The participant cap probably applies, and it decides A6.**
  - The peninsula alone probably passes 300 parts.
  - Raising the threshold to 130 m keeps only hillside towers of about 44 floors or more, roughly 15–20% of them. Those are the towers A6 and G4 depend on.
  - There is only one fallback step. If the count is still over 300, the spec does not say what happens.
  - The count, and its spread by district, decides whether A6 is a real target. Report it in step 2 of the quick test, before the eval.
- **Distance problems.**
  - The atlas packs entries only 18 px apart (`PAD = 18`, `signAtlas.js:5`). The far path samples at LOD 3–5 at G1 and B3, where neighbouring entries bleed into the glyph. Give the canvas glyphs their own region with at least 64 px of padding, or clamp the sample to each entry's rectangle.
  - The facade shader dims and desaturates distant emission (`farK`, `buildings_wgsl.js:1024–1025`). The overlay skips this, so at 2–4 km the glyphs will be relatively brighter than the windows around them. Apply the same factor.
- **GPU cost: credible.** I checked the claims against the code:
  - The emissive target is `rgba16float` with AO in alpha (`renderer.js:17`, `common.js:239`), so it can be blended.
  - `@invariant` is on the position (`buildings_wgsl.js:82`), so the equal-depth test will match.
  - There are 6 lists chosen by LOD, and flag bit 18 is free (`DETAIL` is bit 17).
  - The facade shader is untouched, so there is no register-pressure risk.
  - My estimate: 0.05–0.2 ms on average, and up to about 0.3 ms in frames like G4 or A6, where participating faces cover 30% or more of the screen. That fits within the 1.36 ms of headroom.
  - One gap: the plumbing stop rule (+0.15 ms over 3 runs) is only meaningful if the run-to-run spread of `bench.mjs` is known. Report the standard deviation of the 3 baseline runs.
- **Tuning to the eval cameras.** The revision is clean here:
  - no coordinates or place names;
  - constants fixed in the spec;
  - held-out cameras and fixed times;
  - count-based fallbacks only.

  One rule is still missing. If the held-out go/no-go finds the standby text unreadable, say whether brightness may be changed. Allow it on held-out cameras only, and record the value before any eval capture.

### What would make it stronger
- **Declare the real target set now, before any capture.** Add G4 and G3, where the change is large and points at the camera. Move B3 to the no-loss list. Then the 2/3 rule applies to the poses the idea actually changes (for example B1, A3, A6, G3 and G4: 4 of 5 needed).
- **Replace the bank canvas with characters placed in order along the bank.**
  - Sort the front-row towers along the river, and give the i-th lit face the i-th character of the phrase, at that face's own glyph size.
  - Real riverfront shows spell messages this way. It reads from any angle, has no gaps and needs no canvas plane.
- **Remove the text-free cue.** Run the colour wipe as a background under the characters, so text is on 100% of the time.
- **Cut the visual noise outside the target areas.**
  - In standby, show characters only on the front row of each bank run, plus a stated fraction of the rest (chosen by hash).
  - Use one character, or one word in sequence, per cluster rather than a random character per face. Coordinated content is what makes real shows look designed rather than noisy.
  - This lowers the veto risk at G4, G1 and G3.
- **Add contrast instead of brightness.** Dim the windows under the glyph's screen area with the `one-minus-src-alpha` colour blend (keeping AO through the alpha blend).
- **Define the geometry.**
  - Face width is the projected width across `waterDir` at the slot height.
  - Exclude parts with a twist, or handle them.
  - Write down how stacks are grouped.
- **Fix the distance details.** Give the glyphs a padded atlas region and apply `farK` to the overlay.
- **Report before the eval:** the participant count by district, and the `bench.mjs` run-to-run standard deviation. In the quick test, add held-out cameras that look across the Great River at the peninsula's south bank (like G4 and G3, but not those positions).
