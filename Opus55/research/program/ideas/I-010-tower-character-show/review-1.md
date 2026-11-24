## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 5 | A careful revision of I-007, not a new angle. One character per face is how real media facades already work, and the separate additive overlay pass is a sound but modest engineering choice. It is still the only idea in the program that answers user priority 4. |
| Feasibility and credibility | 6 | The engine plan fits the code: flag bit 18 is free, the cull shader can append to 6 more lists, the emissive target is `rgba16float` with AO in alpha (so `one + one` colour with `zero + one` alpha is valid), and a separate pipeline does avoid the über-shader register risk. The GPU estimate is credible. But the face rule misclassifies about a quarter of the candidate towers (see below), the bank canvas still lands mostly in gaps, and the forecast of which poses change is wrong. |
| Expected impact | 5 | B1 and A3 are plausible wins. A6 and B3 are close to coin flips. The change also reaches at least six non-target poses, and any clear loss there blocks adoption. Text mostly moves character and brief, which are the judge's 3rd and 4th criteria, and does nothing for the critics' top complaints (bare hills, boxy massing). If it works, the gain is about +0.3 on zones A and B. |
| **Overall (average)** | **5.33** | |

### Strongest reason it will fail
The change is not limited to the four target poses, and its content is the kind most likely to read as noise. I reproduced the generation in Node with approximate terrain, applied the participation rule exactly as written, and counted lit faces that face each eval camera within its horizontal field of view (no occlusion). The rule gives 381 parts at the 100 m threshold, so the 130 m fallback applies; 181 parts then have a lit face. The counts per pose:

| Pose | Lit faces facing the camera | Median glyph height |
|---|---|---|
| A1 (non-target) | 87 | 20 px |
| A2 (non-target) | 85 | 50 px |
| G1 (non-target) | 131 | 9 px |
| G2 (non-target) | 84 | 17 px |
| G3 (non-target) | 132 | 12 px |
| G4 (non-target) | 105 | 37 px |
| A3 (target) | 84 | 18 px |
| A6 (target) | 94 | 26 px |
| B1 (target) | 36 | 26 px |
| B3 (target) | 45 | 18 px |

The spec says the only non-target poses that change are B4 and G1. For G1 it reasons only about the CBD 4.4 km away. In fact, the whole south front of the peninsula faces the Great River, and so faces G1 and G4. At G1 that is 131 faces 2.2–2.7 km away, during the show at full brightness. On every one of these faces, the character is chosen by `hash(part, face, period)` from 16 characters, independently for each tower. Each glyph is added on top of a lit window grid, at standby brightness "comparable to lit windows". A judge will see dozens of unrelated characters at once (龙 next to 水 next to 福), each low in contrast against the speckled windows. A strict art director is likely to call that cluttered or incoherent rather than "a riverfront show", and coherence is the judge's 2nd criterion. Adoption needs 3 of 4 target wins and no clear loss on any of the six or more other poses that change. If the look fails, it fails on all of them at once.

### Other concerns
- **`FLAG.ROUND` does not mean "cylinder".** `Parts.add` (`buildings_gen.js:28`) sets ROUND for rounded rectangles (kind 0 with prm > 0), triangles (kind 4), lobed shapes (kind 3), odd polygons and N ≥ 12 ellipses. Among the 245 candidates within 700 m of water:
  - 69 carry ROUND, but only 6 are real cylinders (N = 48);
  - 56 are rounded rectangles with flat sides, and 4 are the truss landmark's triangles.

  The spec sends all 69 down the round path (g = 1.3 × radius, projected on the `waterDir` tangent), and "radius" is undefined for a 30 × 24 m rounded rectangle. With radius = min(hw, hd), 30 parts drop below the 16 m skip. They include all four Raffles row towers (hw 15, hd 12: g = 15.6 m), which are A3's hero towers and A1's main subject. Whether A3 gets text on its focal towers depends on an implementation choice the spec does not make.
- **The bank canvas still lands mostly in gaps.** The I-007 reviews said a cross-tower message fails unless the front row is nearly continuous. The depth band fixes tearing but not coverage. With the stated rule, the CBD front row facing B1 is 4 towers, (2712, −1188) to (2738, −813), with faces 32–55 m wide over about 420 m. That is about 41% coverage, and Hc = clamp(1.3 × 43, 45, 100) ≈ 56 m. So about half of each 56 m glyph falls in a street gap. Over the whole CBD bank (918 m, 5 front-row towers) coverage is 22%. For 8 s of every 37 s, the most visible faces show these fragments instead of their per-face characters. B1's capture has about a 22% chance of landing in that cue.
- **Contrast.** The overlay can only add light. Under a glyph the windows stay lit, so in standby (A3, A6 and B3 at t = 100) the glyph is about as bright as the windows around it. Real media facades read because the screen hides the windows. The overlay pipeline could do the same at no extra cost: colour blend `one` / `one-minus-src-alpha`, alpha blend `zero` / `one` (AO kept). The shader then outputs a panel alpha over the slot that dims the windows, plus the glyph.
- **GPU cost: credible, with small gaps.** My estimate is 0.1–0.3 ms average. That is within the 1.36 ms headroom, but it uses up to a fifth of the room I-005, I-006 and I-008 also need.
  - The fly-through passes right by participants: it flies through the peninsula tip at 70 m, along the Bund toward the CBD's west faces, and into the CBD. In those frames, participating parts can cover half the screen.
  - Every covered pixel does a read-modify-write blend on an `rgba16float` target, including faces that fail the face test and "return 0". Use `discard` there. With depth writes off, early depth testing is kept.
  - p99 (11.55 against 16.7) and the worst frame are not at risk.
  - Bench run-to-run noise is not stated. The 0.15 ms plumbing stop rule with 3 runs against 3 runs needs the spread reported next to it.
- **The 700 m reach sits right at the edge for the A6 focal tower.** The `ridge` landmark (−600, −260) is 669 m from the water edge. Its march first hits water at 680 m (67.5° direction), so it passes by 20 m. It is next to A6's look-at point (−520, 60, −260), faces the A6 camera, and would carry a glyph of about 39 m (about 58 px). I-007 measured 700 m from the river centreline. Measuring from the water edge, as here, widens the band by the river's half-width (about 175–210 m). I-007's review 2 had flagged `ridge` as outside the old rule. This may be a coincidence, but code review cannot tell. Report which landmarks flip between reaches of 600, 700 and 800 m.
- **Atlas mip bleed at distance.** `signAtlas.js` pads entries by `PAD = 18` texels. At G1 and G3, glyphs are 9–16 px. The far-mode LOD for a 200 px entry is then about 4–4.5, a footprint of 16–23 texels, so neighbouring atlas entries bleed in. Clamp the LOD to about log2(PAD) and fade to the glyph's mean coverage beyond it, or pad the new entries more.
- **LED dots alias where the target poses sit.** Cells are 1–4 px at B1, A3 and A6, which is exactly the spec's 1–3 px blend band. A 50% dot mask at a 2 px period is at the Nyquist limit. The existing LED code fades its dots out between about 6.7 and 2.5 px (`smoothstep(0.15, 0.4, …)`). Reuse those thresholds. The quick-test burst at about 2 km is in far mode and will not show this. Add a burst at 600–1000 m.
- **The go/no-go relies on the implementer's own judgement** ("characters are legible"). The adoption test is a blind judge. The cheap proxy is the same judge on the held-out cameras, baseline against candidate.
- **Small errors:**
  - `world.districtAt` returns `{index, weight}`, not a type.
  - "Top of its stack" has no field in the part record; it needs grouping by xz.
  - `canvasInfo` is sized for about 50k parts. My High-quality generation has about 120k (props included), so it is about 3.9 MB. That is harmless, but the figure is wrong.
  - 渝 (12 strokes) and 福 (13) are not low-stroke at 24 rows.
  - The quick-test times include t = 100, the capture time of 9 eval poses. That is harmless with frozen constants, but times the eval does not use would be cleaner.

### What would make it stronger
- **Classify faces by shape, not by `FLAG.ROUND`.** Treat only kind 2 with N ≥ 12 as round. Light the flat side faces (odd `fid`) of rounded rectangles, chamfered boxes, polygons and triangles. Restate the glyph size for those faces.
- **Make the content coordinated, not random:**
  - Either every lit face in a cluster shows the same character at the same moment;
  - or a phrase runs one character per tower along the front row. Order the towers left to right as seen from the water: right = (n.z, −n.x) for lit-face normal n, sorted by dot(position, right).

  The second gives a cross-tower message that survives any viewing angle and any street gap. That removes the need for the bank canvas. Drop the canvas, or keep only its low-frequency colour wipe.
- **Use the "LED panel" blend** (dim the windows under the slot, then add the glyph). Fix the standby glyph brightness as a multiple of the measured window emissive (for example 3 times), before any capture.
- **Forecast every pose that changes:** A1, A2, A3, A6, B1, B3, G1, G2, G3 and G4. Say for each one why it should not be a clear loss, or make it a target.
- **Make the go/no-go a blind pairwise judge run on the held-out cameras**, at times the eval does not use, and add a burst at 600–1000 m.
- **Clamp the far mip LOD** to the atlas padding.
- **Report the participant set's sensitivity to the 700 m reach and the 130 m threshold.** Show that no eval focal tower sits right at a threshold.
