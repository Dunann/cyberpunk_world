## Reviewer 2 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 5 | A faithful revision. The façade-stack section, the clearance rule, held-out cameras and the 60 m slice test were all asked for by the I-004 reviews. Grounding another module's floating landmark is the one new move. It is sound, but it is not an unusual angle. |
| Feasibility and credibility | 6 | Most of I-004's flaws are fixed. The level count, unit depth, gallery and cantilever rules are consistent in the middle of the cliff, and the GPU claim holds (see below). But the section model was measured at one station (z = −140). It does not hold over the length that the spec's own site rule selects, and the toe, lift and end rules contradict the stack geometry. Trees, the fly-through path and a flag-bit clash with I-010 are also missed. |
| Expected impact | 7 | It targets the user's named example and both critics' top finding, on the three lowest zone A poses. If it is built cleanly, A1 and A2 should win, and that alone meets the 2-of-3 adoption rule. My probe also shows the southern extension would cover most of A3's bare mound (screen x ≈ 500–1140 px), so A3 has more upside than the spec claims. The risk is all in execution. |
| **Overall (average)** | 6.0 | |

### Strongest reason it will fail
The geometry was designed from one cross-section, but the build covers a cliff whose height and steepness change a lot along its length. The places where the model breaks are exactly the ones the target poses see.

I probed a 10 m grid from z −520 to +240. The spec's cliff rule (at least 35 m of rise within 60 m inland) holds from about **z −370 to z +125**. That is about 520 m of curving bank, not "−300 to +120, 430 m", so the 480 m length cap cuts one end, and the spec doesn't say which.

Along that length the cliff changes:

| z | Crest height | Gradient |
|---|---|---|
| −340 | 66 m | about 0.75 |
| −300 | 77 m | 0.8–1.0 |
| −150 | 96 m | 2.2 (the measured section) |
| +60 | 87 m | |
| +120 | 79 m | 0.7–1.0 |

The spec sets one value, "N = round((crest − 7)/7.2) = 12", and calls the levels shared. At the ends, where the formula gives N = 8–11, the top 1–4 levels would then stand 10–27 m above the plateau. Their rear-depth rule `u(y_{k+1})` is undefined there, because the rock never reaches y_{k+1}, and the top plaza would end in mid-air.

If N is instead set per station, the spec doesn't define how the galleries, eave lines and plaza step down and end. These ends are what matter on screen:
- **South end:** the nearest and largest part of A3, covering the bare face from about x 500 to 1140 px, and the part visible in G2.
- **North end:** A1's right third (about x 2040–2560 px). Today trees grow there, and the vegetation mask will not exclude them (see below).

The quick test builds one 60 m slice in the middle (z ≈ −68), where the model fits. It never checks an end. So the most likely result is clean, convincing middle sections with clumsy block ends and trees through the north end. That is enough to lose A3 and risk A1.

### Other concerns
- **GPU: the claim holds, with some errors in the reasoning. The gate is not at risk.**
  - Box parts use the 8×1 ring mesh (32 triangles, lists 0 and 5), and the leaned eave boxes stay in those lists. Only `prof` ≠ 0 sets `CURVED`.
  - The old complex had about 150 `prof: 4` roofs on the K48×32 mesh (about 3.2k triangles × 2 passes each). Removing them probably offsets most of the new box triangles at A2.
  - `bld-cull` is 0.17 ms for about 134k parts, so +10.7k parts costs about +0.015 ms.
  - **The path is closer than the spec says.** The spec says the fly-through sees the face "only 5–8 s". In fact the `dev.js` PATH passes through the control point (260, 70, 120), and the camera is held at ground + 8 = 72 m. That is directly over the plaza or top level at the southern end of the extended complex, approached head-on from (420, 80, 650). Expect a short close-range spike rather than a distant view. Even so, the path covers about 17 km in 60 s, so it lasts about 2 s. The average rises less than 0.1 ms, and p99 (11.55 against 16.7) and the worst frame (13.34 against 25) have large margins.
  - **Register pressure in the shared shader is the only real GPU risk.** The facade fragment shader is shared by all buildings, and this spec adds MASONRY, three WOOD variants, a railing variant and DECK, while I-005 and I-012 also add branches. The fly-through check (+0.1 ms) is the right test. The slice bench in quick test 4 will catch it, which is good.
- **Toe stilts contradict the stack.**
  - Level 0 fills the toe from water distance 7 m back to the rock, and level 1 stands on it. So "the floor of levels 1–2 more than 3 m above the ground" is true everywhere, yet nothing is ever unsupported.
  - "Push those units forward 3–6 m" moves them over level 0's front and the promenade (deck at water distance 1–6.2 m). That leaves 0.8 m for "2–3 rows of columns every 3.2 m".
  - A braced frame only exists if it replaces level 0 at those stations. The spec must say so, with the resulting section. This matters because the critics named missing stilts, and the brief says "stilted riverside buildings". As written, the diaojiaolou character may shrink to a covered arcade.
- **Lift geometry is inconsistent.**
  - "4 m in front of the stack" and "behind the promenade" means water distance of about 3–6 m. That is on the promenade deck, and it sits under level 0's front, not in front of the face.
  - A vertical shaft there stands about 33 m in front of the top level (its front is at water distance 40 m), so the "short bridges at every third level" are 10–33 m long.
  - By rule it lands near z ≈ −120, the middle of A1 and A2.
- **Trees.** The vegetation mask (`buildMask` in `vegetation.js`) stamps lots, landmarks with r > 0, poses, bridges, routes, `gardenReserve` and embankments. `stilts` has r = 0. The Raffles circle (r + 25 = 215 m around (220, −60)) covers the middle of the site but not z < −275 or so. Trees on the north slope (visible today at A1's right) will grow through the stack and plaza. The overlap audit only checks parts in `B.P`, so it will not see them. Buildings run before vegetation in `main.js`, so publish the reserved region (for example into `world.shared.gardenReserve` or a new key) and stamp it.
- **Flag bits clash.**
  - Floats are exact only up to 2^24, so bits 18–23 are the only free flags. This spec takes four of them (18–21).
  - I-010 already reserves bit 18 (`CANVAS = 262144`), and I-007 reserved bits 18–20 before it.
  - Use new material ids for the WOOD variants (22–24) instead. Ids are free and cost nothing. Keep at most one flag bit, for DECK.
- **The Raffles podium is mostly redundant, and the spec's figures are slightly off.**
  - Probe: ground under tower 4's centre is 86.0, so its base is about 80. Its front edge is at water distance 37–46 m over ground of 42–64 m, so it floats 16–38 m above the face, not "about 20".
  - The stack's own levels 0–9 already fill that volume up to y = 79, and the level-10 front is at water distance 37. So the tower base lands on the level-9 roof, with a gap of about 0.6–1 m.
  - The real work is removing levels 10–11 under its footprint for about 34 m, in the centre of A1, and closing the 1 m gap. The podium step adds a third body that competes for the same volume. Define the order: obstacles, then units clipped against them, then a podium only where something still floats.
- **Eave glow is thinner than in the baseline.** `MAT.ROOFTILE` glows over the bottom 12% of the part's *height*.
  - On today's `prof: 4` roofs (h = 3.2) the glow band is about 0.38 m. On a leaned pent eave with about 0.6–0.8 m of drop, it is 7–10 cm. That is under 1 px at A1 (about 0.2 m per pixel) and about 1 px at A2.
  - The gold lines will come mostly from WOOD's existing floor-line glow, the railings and the lanterns. The glow gate should catch a shortfall, but the spec should give the eave glow band in metres, not as a fraction of the part height.
- **Held-out cameras.** The rule-derived cameras are legitimate, and no eval pose is used for direction, which is good. But the river camera (120 m out, 10 m up) is almost the same kind of view as A1 and A2, and the slice is centred on tower 4, which is the centre of A1. Add at least one held-out camera at each end of the complex, plus one high oblique, so that the end conditions are art-directed without looking at A3, G2 or A1.
- **Measurement and quick-test gaps.**
  - "Masonry share" and "slice screen region" need a per-part ID or mask capture. The capture tool has none, so say how they are measured.
  - The A/B "slice vs baseline crops": with only the slice built, the rest of the bank is bare or still the old complex. Say which, so the comparison is fair.
- **Smaller points.**
  - The length cap (480 m) and the starting seed don't say which end gets cut.
  - `D_top` "12–25 m" is used both as a free parameter and as the leftover to the crest.
  - At the centre the plaza (y 93.4) sits about 3 m below the crest (96–97). It will be buried at its back edge, which is fine, but it should be stated.

### What would make it stronger
- Make the section rule hold along the whole length:
  - set the level count per station, `N(s) = floor((crest(s) − 7)/7.2)`, smoothed, with levels ending on a stair bay or a tower bay wherever N drops;
  - let the plaza follow the crest down, as stepped terraces;
  - where the gradient is below about 1.2, use a defined end form: fewer levels, a deeper stilt toe, and a garden terrace;
  - require that no level stands more than 1 m above the crest behind it.
- Run the quick test on **two** slices: the tower 4 slice and the south-end slice around z +60…+125, the gentlest section, which A3 and G2 see. Add a third held-out camera at the north end.
- Redraw the toe section: at stations with a shallow toe, level 0 becomes an open braced frame (with stone footings on the slope) under levels 1–2. Give the column rows' water-distance range, clear of the promenade.
- Put the lift on the level-0 roof line (water distance of about 10–12 m) with its own footing, or drop it. Give the real bridge lengths.
- Publish the reserved region to the vegetation mask and add trees to the audit. Use new MAT ids instead of flag bits 18–20.
- Give the eave glow band in metres (for example about 0.25 m) for leaned eaves.
- Say which end the 480 m cap cuts. Do not let it remove the southern stretch, which is where most of the A3 gain is.
