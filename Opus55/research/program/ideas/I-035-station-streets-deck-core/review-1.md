## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 5 | This revises two rejected specs in the same family (galleries, cross bridges, a deck one storey up). The new parts are real: placement by district rules, the metro spine under Line 6, and a lift tower in the void below Liziba. But a deck network one storey above the street is the standard answer to "elevated walkways", and the code already has 320 skybridges and the podium walkways. |
| Feasibility and credibility | 5 | The measurement is honest, and I reproduced it exactly (it needs `EXGAP=150 CAP=10000`; the script's defaults give A4 2.07% and A5 2.74%). Most I-027 and I-028 findings are fixed. Four are not, or the fix creates a new defect. (1) The sign fix covers only one of the two sources of blade signs: existing sign boxes enter the gallery deck or railing volume on 24% of the gallery length. (2) The spec's own floor-line snap puts 37 of 41 CBD decks at +13.4 to +14.5 m, not +10 m. On 9 lots that is within 1.5 m of the podium roof or above it, and the measured table does not match the rule as written. (3) The Daping exit bridge and lift tower land inside an existing 200 m tower. (4) The metro spine is centred on the pier line. |
| Expected impact | 6 | B2 is the program's weakest pose, and this is the first idea to change its near field heavily (13.9% measured, 11.8% under the snap rule, almost all within 120 m). It is also exactly the user's priority 7. But adoption needs both B2 and A5 to win. A5 rests on one 6 m tower, which in the real frame stands in front of the lit street junction, not in the black void. A4 is a watched pose whose sign cascade the galleries cross. Even a clean win moves only B2 and A5: about +0.2 on zone B and +0.1 on zone A, against a target of 9. The program learns a lot either way: whether near-field layered decks move the judges. |
| **Overall (average)** | **5.33** | |

### Strongest reason it will fail
**The "deck on the roof, blades hang below" fix covers only half of the signs, so the Yuzhong galleries still collide with the existing signs, and the CBD decks are not built at the height that was measured.**

The spec says blades end 0.4 m or more below the podium top (`top = topAt - 0.4`), so the gallery passes over them. That is true only for the slot blades from `lotSigns` (`buildings_gen.js:444-478`). `placeSigns` adds its own street-edge layers on every hillside lot edge (`signPlace.js:137-153`), with no reference to the podium top:
- horizontal projecting boxes 2.2-3.8 m wide at street ground + 7.5 to 11 m;
- mid blades at + 7.5 to 10 m;
- tall blades at + 12.5 to 15 m.

Podium tops are 6, 9 or 12 m above `gMax`, so these signs straddle the gallery plane. They are A4's characteristic neon cascade (烤鸭, 江湖菜 and others).

I intersected the measured gallery slabs (the spec's own `geom.mjs` with `EXGAP=150 CAP=10000`, 7,856 m) with the real sign boxes from `signs.bin`, using a deck-plus-railing volume from the slab bottom to +1.45 m. Result: **a sign box enters that volume on 23.7% of the gallery length (350 sign hits, nearly all blades)**. Example: a blade from 146.0 to 148.2 m at (-1104.8, -701.0) against a gallery deck at 146.3 m on that lot. So the spec's rule ("split only where a real sign mesh box enters") cuts about one gallery piece in four. That is I-027's "row of separate balconies" again, at about half the rate. The alternative, letting the boxes pass through, gives signs piercing the deck, which is the detached and clipping read of user priority 2.

On the CBD side, the rule "deck top snapped to the first podium floor line at or above gMax + 9.5" (floors at gMin + 5k) gives:
- **+13.4 to +14.5 m above gMax on 37 of the 41 core lots**, because gMax - gMin is between 0.29 and 2.2 m, so gMin + 10 is below gMax + 9.5 on almost every lot;
- **deck top within 1.5 m of the podium roof or above it on 9 lots**, because `podH` is 12-24 m. On B2's own right-hand lot (3113, -1063) the podium top is only 2.6 m above the deck.

The measurement used gMax + 10. I re-ran B2 with the snap. Coverage stays a target (11.77%), but the decks become a 14 m colonnade on 13-14 m stilts that, on several lots, sits at the podium roof edge. The +10 m metro spine no longer meets the decks, and the "1:12 ramp up to 2.2 m" span rule now has to bridge floor-line jumps of up to 5 m.

### Other concerns
- **A5's target rests on a tower that stands in front of the lit street, not in the void.**
  - I overlaid `final_A5.png` on the I-016m image. The lift tower (2.04% of the frame) covers about x 410-600, y 740-1170 at 2560x1440.
  - That region is the lit hillside junction with its crosswalks, a street lamp and wet reflections, one of the few lit things in the lower left. Only its lower third is in the black ground.
  - The exit bridge (0.59%) fills the dark gap next to the station tower, which is good.
  - The critics' named A5 defects are not addressed: the untextured beam, no piers near the camera, and the black void under the guideway at the lower right.
  - The judge must prefer a 6.4 m box in front of a lit street over the street. With 2 targets, A5 must win, so this is a coin flip at best.
- **The exit position is a free parameter.** Why is the exit "centred at X = -10 m"? With the 15 m clearance, X = 0 would also be allowed. Give the reason, or show that A5's coverage holds for X in -15 to +5.
- **Daping's exit lands inside a building.**
  - The rule puts the Daping lift tower at (-120.7, -365.1) and the exit bridge at (-127.6, -356.5). Both lie inside lot (-122.2, -374.7): podium part 74628 runs from 44.4 to 62.1 m and shaft 74629 from 62.1 to 199.7 m. The beam is at 77.9 m.
  - The audit would flag it, but the spec has no rule for what happens next. Add one, for example: if the exit meets a building face within 16 m, end on that face with a lit entrance bay; otherwise build the tower.
  - Liziba is clear: 36 m from the nearest lot and inside the 50 m vegetation stamp.
- **The metro spine collides with every pier.** Line 6 has octagonal piers (r 1.15 m) with 2.6 × 5.4 m caps on the track axis every 5 samples, about 30 m (`transitStatic.js:351-358`). The spine is an 8 m deck centred on that axis at +9.65 to 11.1 m, and the piers run up to about +19 m, so every pier passes through it. Say whether the spine gets pier openings or splits into two 3 m walks on either side. The spine is invisible to the metric (0% at B2, 0.08% at H8), so it is fly-through value only.
- **Yuzhong lighting is thinner than in I-027.** I-027's reviewers called 48 lights for 1.9 km of gallery too thin. This spec has 48 Yuzhong lights for 7.9 km of gallery, about one per 160 m, all at landings and exits.
  - The deck-cover mask only darkens the ground. Nothing adds light under most of the gallery.
  - The existing blade-sign lights help. But many of those blades are exactly the ones that now clash with the gallery (above).
- **Cross-street gallery bridges skip the spec's own rules.** In `geom.mjs` the 57 `crossbridge` pieces get neither the 150 m existing-crossing test nor the lamp test. One of them is A4's largest new piece (0.91%, upper right beside the 理发 and 大排档 blades). Apply both rules to them, or say why not.
- **A4 can still only lose.**
  - The gallery runs along the podium-top band of A4's left-side sign cascade.
  - The CPU figure of 1.72% is under 2.0% only because bridges within 150 m of an existing crossing are skipped. Real stair flights in place of the measured solid blocks, and blade splits, could move it either way.
  - If the GPU puts it at 2.0% or more, there are three targets.
- **B2 reads, but the risk is real.**
  - **The oncoming car.** It fills about 0-1030 × 830-1440, the critics' "purple block". It sits under the deck, so the deck still reads. The nearest left column's foot lands behind the car roof (x about 700, y about 880), so that column appears to stand on the car.
  - **Placement.** I overlaid the deck on the I-016m frame. It lands as two diagonal bands across the top corners: over the left podium's lit office floors and the lower part of the right curtain wall. The mid-block span crosses the avenue at about 62 m, just under the hero towers' bases (y about 600-700).
  - **Lighting.** No deck light is near the camera (the CBD lights are only at spans and escalator feet). Downward faces get horizon sky ambient (`renderer.js:149`), and street lamps light them from 7.2 m, so the soffits will not be black. Whether they look designed depends entirely on the DECK material.
  - **What a strict critic may see.** An elevated expressway colonnade on 0.7 m stilts. With the snap it becomes a 14 m colonnade.
- **The quick test can tune on an eval pose.** Step 3 judges B2 itself, and the constants are frozen only at step 5, after "light, darken and populate". Freeze every constant before the B2 capture, and make H8 and H10 the go/no-go. Otherwise B2 becomes a tuning set.
- **Smaller points.**
  - Coplanar deck overlaps: each face's deck runs the full lot length, so the decks of two faces of a corner lot overlap in the forecourt corner at the same height. That gives z-fighting unless they are merged.
  - The deck's inner edge has no support where it runs past the podium ends (4-8 m of forecourt at each end, plus the 60% of podiums with rounded corners, kind 1, prm 0.15).
  - "Main is at about 9.77 ms" disagrees with the leaderboard's 9.51-9.57 ms.
  - `cover.mjs` defaults to `EXGAP = 12` and `CAP = 600`, not the spec's rules. Set the defaults to the spec values so the copy in `measure/` reproduces the table without environment variables.
- **What I checked and found correct.**
  - The CPU replay reproduces the table exactly under the spec's parameters.
  - The B2 overlay lines up with the I-016m image (column feet on the sidewalk line, the span below the hero towers).
  - No walkway crosses the 7 station lines, so there are no gallery-walkway clashes.
  - `buildTracks` is pure.
  - Streams 3501-3503 are unused elsewhere.
  - The requested-sign path really adds lights above 3 m² (`signPlace.js:314`), so `noLight` is needed. The Cells group function can take a fourth group for deck rows.
  - Signs build on the first update, so deck requests and the 112 lights both land before the sign-light budget is computed. That budget stays at 2,150.
  - The CBD colliders (bottom at about +13 m) cannot touch car runs, crowd blocking or air corridors.
  - The GPU estimate (about 265k frustum-culled triangles, 112 small lights, +0.08 to +0.18 ms) is plausible.

### What would make it stronger
- **Handle `placeSigns`' street-edge blades explicitly.**
  - **Option 1: cap them.** Make those blade layers respect `topAt - 0.4` on gallery streets. That changes the rng(9137) draws only if the cap returns before drawing; if it only clamps the height, the stream stays identical.
  - **Option 2: let them hang.** Treat the projecting boxes and mid blades as hanging from the gallery fascia: the gallery passes behind them, with the balustrade notched around each box.
  - **Measure the result.** Report the gallery length lost and the longest continuous run on each station street.
- **Fix the CBD snap so the deck lands where it was measured.** For example, use the floor line nearest gMax + 10 within ±2.5 m, or gMin + 10 on every lot (gMax + 7.8 to 9.7, still clear of the 7.2 m lamps). Assert that the deck top stays at least 4 m below the podium top, and drop or step the faces where it does not. Then re-measure B2 and H8 and check the spine joins.
- **Give the station-exit rule a building branch,** so Daping ends on a tower face, and assert the exit does not intersect any part.
- **Make A5's tower earn its pixels.**
  - Shift it downhill, or give the exit a stair that descends in view so the foot lands in the black ground, not in front of the lit junction.
  - Or pair it with something aimed at the named A5 void: a lit stair run down the slope under the guideway, placed by rule at every station.
  - Report how many of A5's lit-street pixels it covers.
- **Light the galleries.** Use a soffit downlight band (DOWNLIGHT material) every few metres, and spend the 48 Yuzhong lights along the station streets nearest each station, not only at landings.
- **Spine:** add pier openings or split it into twin walks, and give its height rule relative to the deck tops.
- **Freeze before judging B2.** Hash the constants before any B2 capture, and use H8 and H10 for the go/no-go.
