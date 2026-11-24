## Reviewer 1 (2026-11-24)

**How I checked it.** I re-ran every script in `measure/` (lots, dump, bank, sections, face, lanes with `14.4 22`) on a copy outside the repo. All the spec's numbers reproduce exactly: 2,880 lots (Yuzhong 917), 439 stations from (322, 103) to (-1317, 511), class lengths 1,032 / 476 / 248 m, 8 lane levels, 4,188 m of lanes, and the envelope shares (G4 9.54%, A3 2.78%, G2 2.21%, G3 2.17%). The camera model is right: fov 1.05 (`controls.js`), so the focal length is 1242 px at 1440p. I then added three checks of my own:
- **Strip check:** for each station, I found where the section crosses each lane and applied the spec's unit rule (free = strip width − upper deck width − 1.5 m; a unit needs at least 7 m).
- **Coverage by part class:** I re-projected the face with units only where they fit (tops at the upper lane + 2, 3 or 5 floors), decks and walls at deck height + 1 m, and bare face ground. I overlaid the masks on the I-016m screenshots, and they land where the spec says.
- **Code and interaction checks:** I ran the Hongyadong walk (`stiltsSite` + `walkBank`) on CPU heights, checked the fly-through path, and read the code for roads, LOD, lights, hamlets and streams.

The scripts are in the scratchpad: `C:\Users\pdunc\AppData\Local\Temp\claude\71d1a506b11c03e8\7dd9aef4-6179-4c30-820b-ff3b0f510313\scratchpad\m029\` (`strips.mjs`, `mask.mjs`, `hyd.mjs`, `path.mjs`, `wedge.mjs`).

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 6 | The lane field (one `max()` that gives contour terraces on slopes and bank-parallel streets on flats) is a neat new device. So is the finding that the relief already exists and only the exposed face is empty. But the result is the image the critics asked for directly ("buildings stepping up slopes", "stepped revetments, piers, stairs"), and it reuses I-015's station method on the bank I-002 targeted. |
| Feasibility and credibility | 5 | The measurements are honest and reproduce, and the identity plumbing follows proven I-015/I-016 patterns. But the unit rule fails on exactly the ground that matters. On slopes steeper than about 1.13, which covers the cliff and the upper G4 hill, no unit fits, so those stretches become tiers of retaining walls. Several other parts of the plan conflict with the code or with other specs: the LOD fallback against the wall footings, the zeroed forest value against road painting, the tip against I-037, and the ends with no taper. Details below. |
| Expected impact | 6 | G4 changes a lot (6.4–7.7% of the frame by my realistic count, at 390–700 m where terrain spacing is 2–4 m). It removes a named critic defect, and it serves user priorities 3 and 7 directly. Measured with real part heights, A3, G2 and G3 fall below the spec's own 2% target rule. So the likely gain is G4 alone, plus part of A3: about +0.25 to +0.4 on zone G, against a 3.3–4.1-point gap. If it fails, the program still learns whether a built hill face reads at G4 distance. |
| **Overall (average)** | **5.67** | |

### Strongest reason it will fail
**On the steep ground, which is the most visible ground, the rule builds walls rather than houses.** A unit needs at least 7 m free between its lane and the next lane's deck (4.2 m deep) plus a 1.5 m gap. Contour lanes are 14.4 m apart in height, so that needs a horizontal spacing of 12.7 m, which means a slope below 14.4 / 12.7 = 1.13. Measured per station (`strips.mjs`):
- Overall, units fit on only **60% of the strips** (1,016 of 1,688).
- **x −400..200 (the tip and cliff seen in A3, G2 and G3): units fit on 11–19% of strips.** The rest are stacked retaining walls with a mean of 7.4–8.9 m exposed above the lower ground, with 3–4 m strips of bare slope between them.
- **x −1400..−1200 (the steep left hillside nearest the G4 camera): units fit on 55% of strips.** At (−1294, 507), lanes 3–7 sit 10.5–11 m apart horizontally (local slope about 1.37), so rows 3–6 are walls only (`UUU----U`). Only the bottom two rows and the top row hold houses.

Exposed walls with no unit in front have a median height of 6.4 m and a 90th percentile of 9.8 m. So the spec's "eight stepped rows of lit housing" in G4 and "stepped lit lanes and roofs" in G3 and G2 are mostly vault walls. Retaining walls that read as slabs are what the critics punish (A2's critical defect is the existing bank wall), and stepped walls on this bank are what I-002 was rejected for. The plan's "about 300 units" also ignores this; at 60% it is about 180–200 before overlap trimming, alleys and stair gaps.

### Other concerns
- **The target shares are inflated by the 22 m envelope.** With units only where they fit, and decks and walls at their real height (bare ground counted separately; tops at the upper lane + 2 / 3 / 5 floors):

  | Pose | Units | Decks/walls | Bare face ground | Total | Spec envelope |
  |---|---|---|---|---|---|
  | G4 | 3.6 / 4.3 / 5.8% | 0.7% | 1.2–2.2% | 6.4–7.7% | 9.5% |
  | A3 | 1.1 / 1.3 / 1.7% | 0.2–0.3% | 0.1–0.2% | 1.7–2.0% | 2.8% |
  | G2 | 0.6 / 0.7 / 0.9% | 0.3% | 0.4–0.5% | 1.4–1.6% | 2.2% |
  | G3 | 0.5 / 0.6 / 0.8% | 0.2% | 0.6% | 1.4–1.5% | 2.2% |

  A mask render of face parts (the spec's target rule) excludes the bare ground. That leaves G2 at about 0.9–1.2% and G3 at about 0.7–0.9%, both below 2%, with A3 borderline. The likely target list is G4, perhaps with A3. The pairwise rule then needs a G4 win with no clear loss elsewhere, which gives one pose of gain.
- **Conflict with I-037 at the tip (the spec's I-031 note is stale).** I-031 was rejected. Its revision I-037 ("Confluence Steps") claims "all bare land at the tip, covering the whole wedge, including its near-left part outside r = 190", joined to the complex's end. That is the face's first stations: (322, 103) to (235, 177), depths 54–99 m. In A3, 103 of the 213 wedge sample rays land outside the Raffles disk, on face ground. The two specs target A3 and G2 with the same land, so the coordinator needs an explicit boundary, for example: the face starts where I-037's domain ends.
- **The LOD fallback creates floating walls.**
  - Terrain spacing is 8 m at G2 (860–1470 m away) and 8–16 m at G3 (LEAF 64, N 32, ranges 368 × 2^l m).
  - On the carved cliff (a 28 m smoothstep), linear interpolation between vertices departs from the true height by roughly curvature × spacing² / 8, which is about 1–3 m at 8 m spacing and more at 16 m. Decks clear the true ground by only 0.15 m at their inner edge, so terrain will show through them at G2 and G3.
  - The stated fallback (draw the terrain 6 m lower inside the mask) then leaves wall feet (3 m below ground) and unit bases (4 m) hanging 2–3 m above the drawn ground, wherever bare strips show between walls. That is a floating-part defect, the user's priority 2.
- **Zeroing the forest value turns road painting on inside the face.** In `terrainShade.js` the live city-ground term is `urban = … * (1 − forest * 0.85 * …)`, fading out only above slope 0.35–0.5. The spec sets forest to 0 inside the mask and makes "no other shader changes". On the gentle shelf (x −1000..−500, slope about 0.3, district weight above 0.16), asphalt, lane lines and zebra crossings of the Yuzhong grid would then appear between the face's rows, out of line with its lanes. The face mask must also zero `urban`.
- **The ends are cut off, not finished.**
  - The walk stops at x = −1317 with the full 8 rows (up to 119 m high). I-015 steps down its ends (END_STEP), but this spec has no taper, so the west end is a 120 m vertical section that ends in forest.
  - The cableway corridor (14 + 8 m each side) cuts a 44 m slot through all eight tiers of the G4 hill. It shows as a dark forested gap about 180 px wide under the cables, a small copy of the "forested strip" the user wants gone. The bridge corridor does the same at x ≈ −600.
- **The bench path crosses the top of the face at the tip.** The fly-through passes (272, 144) at 70 m over ground at 24 m, and (260, 120) at 70 m over ground at 64 m, which is at the disk edge where the top row stands. A last-row unit at "three floors above the top lane" reaches about 75 m there. A stair-head "corner tower" (10–14 floors) could stand in the path. The camera may then pass through geometry; this is a worst-frame risk. The rule has to keep heights down here without being keyed to the path, for example by capping the top row at the crest + 1 floor everywhere.
- **The stair streets are too steep on the cliff.** Straight fall-line flights on slopes of 1.4–2.4 run at 55–67 degrees, which reads as ladders or slides. Above a slope of about 0.75 they need switchbacks or flights that run along the lanes.
- **Budgets and streams (mostly fine, with three gaps).**
  - **Props:** the global `B.propBudget` is 70,000 at quality 1, which the city already exceeds (117k props at q2). Face props sent through `B.prop` would therefore all be dropped at q1, and could crowd the 130k cap at q2 (plus infill). They must use their own counter, as the complex does, and bypass `B.prop`.
  - **Light identity:** the 96-light pool and the face lights must be reserved after all existing lights. Otherwise `hyd-identity`'s light-row comparison changes order (the light total of about 5,550 is well under 8,192, and the sign budget stays at 2,150).
  - **Sign lights:** the face's sign lights need their own pool, as `INFILL_SIGN_LIGHTS` does.
  - The hamlet and riverbank stairway suppression (the G4 "hot" hamlet zone at (−1060, 330), r = 560, and `riverbankLife`, which draws no random numbers) is handled correctly by the I-016 pattern. Yuzhong has no street trees (road 11 < 12), so the tree filter is not a problem. Traffic, crowds, routes and the monorail are untouched.
- **The quick test does not sample the failing ground.** Its two slices (west of the cableway, and around the tip) include little of x −300..100, where 81–89% of strips are walls only. The test's lane-spacing tuning would then be done without seeing the main problem.
- **GPU.** The estimate is plausible: +0.1–0.2 ms with a hard cap of +0.25 ms. Most of it is the 96 nearby lights during the tip leg (p99), and the part count is about 4% of the culling load. The cap should be kept.
- **"Same boxes" risk.** About 200 more `MAT.RES`/`MAT.TILE` boxes in G4 add to the critics' top complaint (one window texture everywhere), unless I-023 lands first.

### What would make it stronger
- **Make the unit rule hold on steep ground.** Where a strip has less than 7 m free, drop the upper lane's deck locally and let the unit span two levels (lane k to lane k+2). Carry lane k+1 across its front as a cantilevered gallery with the same lamps, as I-015's galleries do, so the lamp line and the "streets above streets" stay continuous. Report the share of strips with units again; the target is at least 85% on the cliff and on the G4 hill.
- **Narrow the targets to what changes, and measure them with real heights.** State G4 as the main target, with A3 only if a parts-only mask reaches 2%. Use held-out cameras, as the spec already plans, for the rest. Report the parts-only shares in the spec.
- **Agree the tip with I-037.** Either the face starts at the west edge of I-037's Steps domain, or I-029 takes the tip outside r = 190 and I-037 stops there. Write the hand-off line in both specs.
- **Make the LOD plan consistent.** Wall feet and unit bases must reach at least the sink depth + 2 m below true ground (for example 8–10 m if the sink is kept), or sink only under decks and units and never under bare strips. Test it on the H2 camera, as planned.
- **Zero `urban` inside the face mask** as well as forest, and say so as a shader change.
- **Finish the ends and corridors.** Step the rows down at both ends (for example two rows per 16 m, as I-015 does). Under the cableway, allow low units and the stair or escalator where cable clearance permits; the cableway station and the hill escalator are a natural pair. End the corridor walls with returns, not open tread ends.
- **Cap heights by rule:** the top row at the crest + 1 floor everywhere, and no corner tower within 60 m of the tip bisector. Both are general rules that also keep the bench path clear.
- **Use switchback stairs above slope 0.75.**
- **Add a cliff slice to the quick test** (x −300..−100, seen from H1 and from a G3-like held-out camera at 1.5 km). Add a stop rule: if more than 30% of that slice's lane length shows exposed walls over 5 m tall with no unit in front, stop and change the unit rule before building materials.
