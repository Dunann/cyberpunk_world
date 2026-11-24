## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 6 | Solving a box recess per cell in closed form is the outside counterpart of the existing `interior()`. Using its exact cell mean as the distant level of detail is a neat fit for this shader, and it is clearly unlike the geometry route (I-005, I-012) and the filtering route (I-006). Recessed-window parallax is still a known game technique, though, and the glass half repeats I-006a with a different light source. |
| Feasibility and credibility | 6 | I checked the algebra and it is right for closed recesses: the back-wall interval `[max(o0, o0-s), min(o1, o1-s)]`, the glass interval, the side share, and `v = 1 - abs(s)/(o1-o0)`. The `det` thresholds (5.5 px / 2 px), the `cityRefl()` counts (2,520 dot columns, 150 strip columns), `tAlong`, the shared `o.seed` in `tower()`, the AC band and the unchanged JS random streams also match the code. The GPU estimate is credible. Gaps: 3 of the 11 systems are open recesses that the formula does not cover. The light map holds only point lights, blurred with a sigma of about 170 m. Two of the "one system per tower" and "text towers stay flat" rules break on real data. |
| Expected impact | 5 | At night the city reads through its window light, and for most systems the spec keeps the lit pattern, window sizes and occupancy unchanged. The relief shows only at lit windows and is 1–2 px at A6 distances for the common residential systems. G1 and G3 are below 2 px per cell, where the idea reduces to one brightness factor per tower. B2 and B4 will be decided by the glass fix, which the cheap control may deliver alone. A failure would still teach the program something: it would show that per-pixel relief is not the answer to "facade systems" at night. |
| **Overall (average)** | **5.67** | |

### Strongest reason it will fail
The change the critics rank first ("one window texture on every tower", A6, G1, G3) is mostly a complaint about the emissive pattern: same-size lit squares on near-black walls (see the A6 crop: 6–12 px cells, identical window proportions on every tower). This idea deliberately keeps that pattern. Window sizes are unchanged, occupancy and `winLit` are unchanged, and the punched and frame-grid systems use "today's window". The new surfaces are dark walls in a renderer with no shadows and almost no light on the walls. They become visible only through the own-window term `albedo × window × (0.08 + 0.37·sz²)`, which is about 10–15% of the glass brightness, and only at lit windows.

At A6 a 0.3 m reveal seen 40–50° off the normal shifts the glass by 0.25–0.35 m, which is under 1 px at 6–10 px per 3 m cell. Only loggias (1.2–1.5 m) and fins (0.55 m) move anything by 2–4 px, and they are 2 of the 5 residential and office systems. G1 and G3 are almost entirely in the `det = 0` band, where a system collapses to one scalar (glass share times view factor) per face. That contradicts the spec's claim that far towers will show "vertical lines, horizontal bands, grid". So A6 most likely ties or wins slightly, and G1 and G3 do not change.

The predicted targets B2 and B4 then rest on removing the `cityRefl()` dots and strips (confirmed in my B4 crop: coloured full-height strips plus a fine warm dot field on the cylinder). The spec itself offers a cheap control that does exactly that in a few lines. The likely outcome is that the recess passes its quick test on the close held-out views (H1 and H2, at 45 m, where it will clearly read), ships city-wide, and adds little measurable gain on the eval poses. Every pose is then exposed to a non-target "clear loss".

### Other concerns
- **Three systems are open recesses, and the formula does not cover them.**
  - Office fins ("two fins per bay") and capped mullions have no wall above or below inside the bay. Recessed ribbon has no wall to the left or right if the ribbon is continuous.
  - With `o0 = 0, o1 = 1` on that axis, the box formula puts a false sill or reveal at every floor line or bay line.
  - `q = f + s` then leaves the cell, so `interior()`, the lit state and the curtains are read with the wrong cell id. Fins are one of the three systems in the quick test, so this shows up on day one.
  - The fix is an "open axis" mode: `v = 1`, no side on that axis, and window content looked up at `id + floor(f + s)` with `fract(f + s)`.
- **The glass arm's light source is weaker than described.**
  - `glowB` is a splat of the point lights only (signs, shops, lamps; `fog.js` splat), blurred with `BLUR_R = 8` and `BLUR_SIGMA = 3.5` cells, which is a Gaussian sigma of about 170 m. It contains no tower windows.
  - It is also 2D. Reading it "half way along the reflected ray" gives ground glow for glass 150 m up, which in reality reflects other towers' lit facades.
  - The likely result is near-uniform tinted glass. This is the "dull smear" that both I-006 reviewers predicted, and here it is softer still.
  - Removing `cityRefl()` also removes its warm skyline band (`wcol × 0.16`) and its colour strips on every glass tower in B1, B3 and G3. The glass luma check covers only the B2 podium, and the glass arms are judged only on B2, B4 and H3.
  - B1 is where I-014's win came from, so a glass change that wins at street level can still lose there.
- **"Text towers stay flat" breaks the "one system per tower" rule.**
  - `FLAG.TEXT` is added per part at init (`buildings.js:140`), only to the shaft part that carries the character.
  - On 2–3 segment towers the other segments would get recesses while the text segment stays flat. These towers are the B1 phrase towers.
  - Flattening is not needed anyway. The overlay draws on the same depth and only blends into the emissive target, so the recess can run everywhere outside the character panel.
- **Hillside cross wings get a different system.** The wing in `genHillside` (`buildings_gen.js:726`, 12% of box towers) has its own `seed: R() * 999` and no `BALC`. A loggia tower can therefore get a punched-window wing. Both parts share the centre `(T.x, T.z)`, so hashing `P.a.xz` instead of the seed gives one system per building without touching any JS.
- **"Panel mix" may bring back the B2 complaint.** 25–40% opaque panels picked per pane by hash is salt-and-pepper noise at 3–8 px per pane, which is what critic 1 called a "pixel-noise curtain wall". Structure it by column, floor band or corner zone instead.
- **The B2 lit interiors are at risk.** The spec's 60%-at-75° figure is right, but B2's left podium is seen at 55–88°. At 80°, capped mullions (0.15 m) leave about 43% of the glass. Panel mix replaces up to 40% of the lit rooms with metal, and the I-012 review called those rooms "the brightest detail in the shot". With one system in three per glass tower, B2 has a fair chance of getting a worse wall.
- **The "exact" distant average is only partly exact.**
  - In the 2–5.5 px blend band, `pulse()` overestimates intervals narrower than the filter width (peak `0.5 + width/(2w)` instead of `width/w`). This is the same in today's code, so the near and far paths do not meet exactly.
  - The distant own-window light needs the mean of `sz²` over the visible side area, which the spec does not give.
  - The far path also keeps the hard per-floor run steps in `bv` (`run = floor(cx/4, cy)`, at a 1.5–3 px period). These are a likely source of the aerial moiré, and the idea does not touch them.
  - So "nothing left to alias" is not supported. The moiré sweep is in step G (before evaluation), not in the go / no-go.
- **Choosing the visible side is a hard switch.** Choosing between sill and reveal by comparing exit distances switches the G-buffer normal within a pixel with no filtering. At 4–8 px cells under TAA jitter, that can make specular highlights from lamps and the sky flicker on recess corners. Blend `sn` by the two sides' filtered shares.
- **A6 is both a quick-test view and an eval target.** Tuning the system constants against the A6 quick-test pair is mild tuning to the pose. Use a fifth computed held-out aerial instead, and keep A6 for the evaluation.
- **The GPU estimate is credible and probably conservative on ALU.**
  - About 100 extra ops on roughly 2M facade pixels is around 0.05 ms of raw ALU on this GPU.
  - The real risk is register pressure in the 1,100-line `fs` uber-shader (Cell plus Sys is about 25 live floats across `windowGrid`), which slows every building pixel. The spec names this risk.
  - The depth prepass keeps shading at 1× per pixel, and no triangles are added, so there is no overdraw change.
  - The cap leans on I-024's unreviewed pre-cull for headroom. I-024, I-027 and I-028 all want the same roughly 1.2 ms.
- **Things the spec gets right:**
  - The cheap-control arm for glass.
  - Held-out cameras computed from part data by a script before any render is viewed.
  - Judging in both orders.
  - Three alternating bench pairs.
  - The `hyd-identity` and `pixdiff --noise` checks.
  - AC attachment: the units are at 0.1 to about 0.28 of the floor, 0.02–0.62 m out, and only on box residential parts, as stated.
  - No JS `R()` changes. I confirmed that the only new inputs are part fields, and that the new hash input `u32(seed·29)+211` does not collide with the existing `seed·13+7`, `seed·17+31`, `seed·23+57` and `u32(seed)` hashes.

### What would make it stronger
- **Make systems differ in their light, not only in their dark relief.** Give each system its own lit signature at 4–10 px:
  - full-height door-windows and lit loggia soffit strips for loggias;
  - lit fin edges and vertical light slots for fins;
  - continuous lit ribbons with dark spandrels for offices;
  - paired tall slots for narrow pairs;
  - structured panel bands for glass.

  Keep window area within ±10% of today's (the I-018 lesson), but change proportion and grouping. Show a before and after crop of A6 at native resolution in the quick test.
- **Specify open-axis recesses** (fins, mullion caps, ribbons): `v = 1` on that axis, and the window content looked up in the neighbouring cell's id and lit state. Give the closed-form mean of `sz²` for the far band.
- **Fix the glass arm's content, or say it is the control's job.**
  - Either add a smooth building-window term (the per-district or per-cell mean of `farE` from towers, splatted into a second channel) so glass reflects lit towers,
  - or keep `cityRefl()`'s skyline band and strips in averaged form and drop only the dots.
  - Judge the glass arms on B1, B3 and G3 as well as B2, B4 and H3, and extend the luma check to those poses.
- **Key flatness and the system choice to the building, not the part.** Hash `P.a.xz` (shared by all segments and by the hillside wing). Let the recess run on TEXT parts outside the character panel, or flatten every part of a text tower.
- **Protect lit glass interiors.** Use at most 0.06 m depth on glass podiums of 30 m or less, and use structured, not random, panels.
- **Fix the far band too.** Filter the `bv` floor-run steps by `fwc.y` (a smooth blend instead of `floor` steps once floors are under 3 px). Move the 800 m to 40 m moiré sweep and a `burst-u62` check into the quick-test go / no-go.
- **Separate the cost of register pressure from the cost of the arithmetic.** Bench a build with the recess code compiled in but switched off by a constant, against main. If that alone costs more than 0.1 ms, move the recess branch into a second pipeline from the start.
- **Ship fewer systems first.** For the first adoption, ship about 6 systems (punched windows, frame grid, loggia columns, fins, recessed ribbon, flush panes). Add the rest only after a sweep shows no moiré.
