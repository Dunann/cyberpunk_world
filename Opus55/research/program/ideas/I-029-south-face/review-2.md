## Reviewer 2 (2026-11-24)

**How I checked it.** I re-ran the whole CPU chain in `measure/` (`lots`, `dump`, `bank`, `sections`, `face`, `lanes 14.4 22`). Every number in the spec reproduces exactly: 2,880 lots (Yuzhong 917), 439 stations from (322, 103) to (-1317, 511), 1,032 / 476 / 248 m by class, 8 levels, 4,188 m of lanes, and the same frame shares. The projection uses fov 1.05 vertical (`controls.js:29`), so f = 720 / tan(0.525) = 1,242 px, which is right. Note that `lanes.mjs` defaults to DY 21.6 and DW 26, so it must be run with `14.4 22` to get the spec's numbers.

Then I wrote three checks of my own (scratchpad, not committed):
- the face envelope hits per pose, binned by 200 m of x;
- per station, the lane positions from the spec's L field and whether a unit fits under the spec's own depth rule, `clamp(strip - upper deck width - 1.5, 7, 12)`, with no unit below 7 m;
- the Yuzhong street segments that `buildRuns` (`trafficCars.js:299`) would give to traffic and crowds, against the face region R.

I also looked at G4, G2, G3 and A3 in `runs/I-016m` and read `world.js`, `buildings.js`, `trafficCars.js`, `crowd.js`, `gardenViews.js`, `vegetation.js`, `signs.js`, `terrainBank.js` and I-037's spec.

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 6 | Building on the exposed face, and leaving the terrain alone, is the right reading of I-002's failure. The lane field `max(height term, distance term)` is a neat single rule that gives contour terraces on slopes and bank-parallel streets on flats. As architecture, though, the plan is the standard Chongqing set (terraces, stair streets, hill escalator, lift, landings). I-002 and I-004 proposed it, and I-015 built a version of it. |
| Feasibility and credibility | 5 | The measurements are honest and the identity plumbing copies the I-016 patterns that worked. But four things in the plan are wrong or missing. (1) The "streets, traffic, crowds: not edited" row is false: 17 traffic segments run through R. (2) The unit count is about 190, not 300, and on the 600 m cliff only 11-19% of rows fit a unit. (3) The LOD fallback would make walls and units float. (4) The tip overlaps I-037. Details below. The 4-5 day estimate is optimistic for 4.2 km of decks, about 200 units, stairs, an escalator, a lift and landings, each with an identity check. |
| Expected impact | 6 | G4 is a likely clear win. It removes the critic's main G4 defect ("bump-texture hillside, city sits on top of slope with no step-down"), and it is the user's priorities 3 (city to the water) and 7 (stairs, lifts, streets above streets) in one view. But the other three targets mostly see the cliff, where the face is walls and not houses. I put adoption at about 40%. Even if adopted, zone G moves by about +0.3-0.5, far from 9. If it fails, the program still learns whether a hillside town reads at 400-1,000 m, which matters for user priority 7. |
| **Overall (average)** | **5.67** | |

### Strongest reason it will fail
**Only G4 sees the part of the face where houses fit. A3, G2 and G3 see the cliff, and there the plan builds stacked retaining walls, which critics punish as slabs.**
- On the cliff (x -400 to 200, slopes 1.0-2.4), contour lanes are 14.4 m apart vertically but only 6-14 m apart horizontally. Take away the 4.2 m upper deck and the 1.5 m gap, and the strip is narrower than the 7 m minimum unit.
- My per-station count, using the spec's own rules:

| x band | Rows with a unit | Upper-lane walls over 8 m |
|---|---|---|
| -1200..-1000 | 89% | 86 of 276 |
| -1000..-800 | 93% | 0 of 219 |
| -600..-400 | 49% | 67 of 74 |
| -400..-200 | 19% | 75 of 75 |
| -200..0 | 11% | 93 of 95 |
| 0..200 | 14% | 103 of 103 |
| 200..400 | 61% | 63 of 64 |

- Overall, 49% of the wall area has no unit in front of it.
- The frame shares fall the same way:
  - **G4:** 7.0 of its 9.5% is in x -1400..-1000, where units fit;
  - **G2:** 1.5 of its 2.2% is in x -400..400;
  - **G3:** 1.2 of its 2.2% is in x -400..400;
  - **A3:** 0.66% is in 0..200 and 1.89% in 200..400. The 200..400 band is the tip, which I-037 also claims (below).
- So on three of the four targets the change is mostly 8-15 m walls with a deck, a parapet and lamps every 9-14 m vertically, separated by strips of bare slope.
  - The walls use `BANK_WGSL`, the embankment shader that critic 1 already calls a critical "blank untextured slab" in A2.
  - The "lit vault bays" may turn these walls into lines of light at G2 and G3 distances (a 10 m wall is 10-14 px there). At A3 (306 m, about 40 px per wall) they will be judged as walls.
- Adoption needs 3 of 4 targets. With G4 at about 75% and A3, G2 and G3 at 45-50% each, the chance is about 40%.

### Other concerns
- **Traffic and crowd runs cross the face (the "not edited" row is wrong).**
  - Traffic and crowd streets come from `buildRuns`. It accepts Yuzhong grid segments wherever the block weight is at least 0.3 and the slope is under 0.4. Lots need a weight of 0.55, so these streets reach into the strip.
  - On the CPU port, 17 such segments (582 m in total) run through R. Examples: (-772,374)-(-704,396) is 100% inside R; (-909,328)-(-840,351) is 59%; (-613,351)-(-544,373) is 38%.
  - Face units become colliders, because `buildings.js` turns every solid part into one. `blockedAt` cuts a run at any collider within 1.5 m.
  - So either cars drive through the new houses, or the runs split, which re-rolls `rng(31337)` traffic and `rng(8080)` crowds city-wide. That is the same thing that happened in I-015's result review ("a freed street").
  - The terrain shader also keeps painting these streets (`terrainShade.js:429`), because the bake change is "rock and rubble, forest 0, no other shader changes". Lane lines would show between and under the decks. That is the defect critic 2 already named at A3 ("lane lines and zebra crossings on a steep hillside").
- **There are about 190 units, not 300.** "One per 20 m of lane" ignores the depth rule. 3,908 row-metres fit a unit, which at 14-26 m units with alleys is about 180-195 before the `overlapDepth` drops. Most of them are in x -1300..-650.
- **The LOD fallback makes things float.** The vertex sink lowers the drawn terrain by 6 m inside the mask. But walls only reach 3 m below the lowest ground, and unit bases 4 m below it. With the sink:
  - wall feet hang 3 m above the drawn ground, and units 2 m above it;
  - a 6 m trench opens wherever the mask meets unsunk ground (behind the promenade at 7 m, along the city line, at the corridors).
  Fix: either sink at most 1.5-2 m with a fade over 10-15 m at the mask edge, or embed walls and bases at least sink + 2 m.
- **Deck heights can fall below the ground.** "Highest terrain under the footprint + 0.15 m, smoothed over 5 stations" averages a series of maxima, so it drops below the raw maximum at local peaks. Use a running maximum, or `max(smoothed, raw)`.
- **It overlaps I-037 at the tip.**
  - The spec says the face meets I-031 at the Raffles disk (r = 190). I-031 is rejected, and its revision I-037 takes "all bare land at the tip… including its near-left part outside r = 190", within 320 m of (220, -60).
  - The face's stations from x of about 60 to 330 (z 100-230) are inside that range. They carry most of the face's A3 share and about 0.9% of G2.
  - The A3 wedge itself crosses the disk edge: the crest at (317, 73) is 164 m from the centre, the foot at (319, 156) is 238 m. So the face as specified fills the lower-left of the critical wedge, ends in a circular arc of return walls across a 45-degree bare slope, and leaves the upper part dark. A half-filled critical defect with a visible arc may score worse than either complete design.
  - The coordinator must assign the tip to one idea before either is built.
- **Order of parts against the decks.**
  - The decks and walls are built in the terrain module, before the buildings module exists.
  - The face layout keeps 6 m from lots and out of the disks. But it cannot test the decks against Hongyadong pieces, the Raffles parts, cableway towers or bridge abutments, because none of them exist yet.
  - Step 8's audit must cover the decks, walls, stairs and lamps against every solid part after generation, not only the units.
  - Separately, the "arcade row where only 4.5-7 m is free in front of an existing podium" contradicts "the face keeps 6 m from every lot". Say which rule wins.
- **Hongyadong seam.** The face starts with a stair 12 m from the complex's last piece, then plain `MAT.RES` boxes. At A1's left edge (1.1%) and in G2, a 12-level stack with its own identity ends next to an ordinary block row. The junction needs a designed transition, as I-037 proposes for its side ("joined to the Hongyadong end without a seam"). Otherwise A1, an I-015 win, carries a small loss risk.
- **Light budget for signs.** `signs.js:435` sets the sign light budget to `min(2150, 8192 - lights.count - 64)`. The face's 96-light pool and its lamp and shop lights are added in the terrain and buildings modules, before the signs module. Report `ctx.lights.count` at the start of the signs module on main and on the candidate. The city's sign lights must not drop.
- **Smaller stream points.**
  - **Moored boats** (step 7) must use their own stream and be appended after the `boats.js` `rng(4242)` draws.
  - **Parks.** R must be stamped into the vegetation mask after `plan.parkTrees(masked)` as well as after the street-tree filter. This matches where `stampLots` sits now (`vegetation.js:498`).
  - **Tower text.** Corner towers of 10-14 floors are candidates for `selectTowerText`. Limit it to the parts that existed before the face from the start, rather than "check, then limit".
  - **Shared streams.** `riverbankLife` (G4's existing stair set pieces) draws nothing from `rng(7070)`, so suppressing it is safe. `hillsideLife` must use the I-016 skip pattern. `rng(2929)` and seed 9139 are unused today, which I checked.
- **GPU.** The +0.10-0.20 ms estimate is plausible. There are fewer parts than I-016's 151 lots, plus about 45k deck triangles and a 96-light pool, and the +0.25 ms cap is right. The risk is p99 on the fly-through leg (420, 80, 650) to (260, 70, 120). It runs straight at the tip stack at 70-80 m, with the tip's top-row roofs at about 59-73 m plus up to 3 floors. That is close-range fill plus a full light pool. Report the lighting and G-buffer passes on that leg separately.

### What would make it stronger
- **Change the typology on steep ground so the cliff gets houses, not walls.** Where the strip is narrower than about 13 m, the unit's roof should be the upper lane: front on lane k, back against the slope, roof at lane k+1's deck height, and lane k+1 running on that roof as a roof street. This is how Chongqing's hillside blocks actually work, and it is user priority 7 ("streets stacked above streets"). Unit depth then becomes the whole strip, and the bare retaining wall disappears behind a lit facade. Re-run the per-band unit-fit table with this rule. The target is at least 60% of rows with a unit in x -400..200.
- **Lead with G4.** It is the one pose that sees the part of the face that works. Consider judging the first build on G4 plus the three held-out cameras, as the spec's risks section suggests, with G2 and G3 as non-target "no clear loss" poses until the cliff typology is proven.
- **Treat the streets explicitly.**
  - Keep all face parts and colliders 2 m clear of every district road corridor that `buildRuns` accepts today, or end those streets in designed stair heads.
  - Suppress the street paint inside the face mask.
  - Add the `buildRuns` output (run count, endpoints) and the crowd agent hash to the identity list in the quick test, not only in step 8.
- **Settle the tip with I-037.** Either hand the face's stations inside 320 m of (220, -60) to I-037, or merge the two into one tip design. Then recompute A3's and G2's shares and target list.
- **Fix the LOD fallback and the deck smoothing** as described above: limit the sink depth, fade it at the mask edge, embed walls and bases deeper than the sink, and use a running maximum for deck heights.
- **Make the coverage table say what is in it.** Split each target's share into "units and roofs" and "walls, decks and stairs only". The adoption risk depends on that split, not on the envelope.
