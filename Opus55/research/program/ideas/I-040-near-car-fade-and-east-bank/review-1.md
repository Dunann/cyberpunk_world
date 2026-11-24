## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 3 | A standard camera-collision fade, and a second run of I-016's plan on land it left out. Both were handed over by the I-032 reviewers. Splitting I-032 was the right call, but nothing here is new to the program. |
| Feasibility and credibility | 5 | **Part 1 is sound, cheap and well specified** (8 on its own). **Part 2 is aimed at the wrong land.** I ran the plan on the CPU and it reproduces main exactly. With the spec's own rules, the second pass builds nothing inside the critic's G3 box: that land is the flank of Ovoo Hill, which the kept 45 m and slope rules exclude. Part 2 also has three isolation gaps the spec does not cover: the shared coverage map is read by `buildInfillRuns` and by the infill lamp validation; lamps are duplicated on shared streets; and the hamlets are not covered. |
| Expected impact | 4 | Removing the B2 car removes a critical defect, and B2 is likely a clear win. Part 2 changes at most 0.45% of G3 and 0.60% of G2 (upper bounds, ignoring occlusion), so neither pose becomes a target. The named G3 "empty brown lots" stay as they are. Adoption would rest on B2 alone, with part 2 riding along unproven. Expected critic gain: about +0.1 on zone B and about 0 on zone G. |
| **Overall (average)** | **4.00** | |

### Strongest reason it will fail
**The east-bank pass does not reach the land the critic named.** I-032 review 1 asked the spec to show that the G3 land is excluded *only* by the Ovoo line and the stilt keep-out, and not also by the hill-foot, slope or half-built rules. I-040 still does not show this, and it is not true.

**How I checked.** I ported the GPU height generator (`landBase`, district flattening, `carveWater`) to the CPU and ran the real `buildPlan` from `plan.js` on it. It reproduces the I-016 final-build numbers exactly:
- 94 candidates, 62 built cells, 169 lots;
- 252,051 m² of lots, 553,752 m² painted;
- rejects: 12 seam, 7 keep-out, 13 half-built.

So the simulation of the second pass below is trustworthy. Its outputs:
- **Ovoo summit:** `stats.ovoo` = (594, −296), 71 m high.
- **The G3 box land is hill.** The brown triangle at G3 1170-1800 x 690-830 lies at about x 320-790, z −650 to +130. West of the Ovoo line, the ground there rises from the bank wall to 40-70 m: for example 64 m at (550, −450) and 70 m at (610, −300).
- **What the second pass actually builds, with the spec's rules** (`rng(5679)`, every first-pass rule kept, the stilt keep-out skipped across the Jade):
  - 64 candidate cells, 31 built, **89 lots, 119,600 m²**;
  - lots rejected: 27 for slope, 16 above the 45 m hill foot, 20 for low ground, 14 reserved; 33 cells rejected as less than half built;
  - **every built lot lies at z −1351 to −663**: upstream along the Jade, north of the G3 box. No lot lies south of z = −650.
  - Skipping the stilt keep-out adds **0 cells**: the land across the river from the stilts is west of the Ovoo line anyway, and it is hill.
- **Projected frame shares** of the 89 lots (f = 1241.7, boxes to `maxTop`, no occlusion, so these are upper bounds):

  | Pose | Share | Where |
  |---|---|---|
  | G3 | 0.45% | x 1011-1399, y 587-685, above and left of the critic's box |
  | G2 | 0.60% | x 1572-2006, y 562-633 |
  | A6 | 1.48% | x 2018-2560, y 522-731, the right edge, partly behind peninsula towers |
  | G4 | 0.39% | |
  | A3 | 0.33% | |
  | G1 | 0.20% | |

  - The spec forecast G3 at about 1.2%, G2 at 1.3-1.8%, A6 under 0.1% and A3 at 0.
  - The 15-lot stop rule in quick test 0 would **pass**, with 89 lots, even though the pass misses the box. The rule counts lots, not where they are.
- **G2's "dark wooded bank" is Ovoo Hill itself.** In the G2 crop at 1500-1850 x 560-680 it is a forested hill above 45 m. The spec keeps that land as forest.

**Outcome under the declared rule.** The likely targets are B2 alone, with A6 possibly reaching 1% before occlusion. The spec has no rule for the case where *both* strip poses fall under 1%. In that case part 2 is adopted on B2's win, and its only check is "no clear loss".

### Other concerns
**Part 1 (car fade): I accept it as a real fix, not metric gaming.**
- It uses only the camera position, applies to every car, and fixes free flight too.
- B2 check:
  - The purple slab covers about 0-1030 x 900-1440 in the I-016m image, which is 13-15% of the frame, consistent with the spec.
  - The next car in that lane is far enough back to stay drawn.
- Other poses:
  - A4: the nearest car is more than 15 m away.
  - u12: cars are 10 m or more away.
  - B1: no cars near the camera.
  - So only B2 changes.
- The steep-slope fade and the run-end fades (`lp *= C.pf.w`, `trafficCars.js:49`) stay as scaling, so A4 and A5 are identical by construction.
- Packing `camFade` into the fraction of `pp.w` is safe: `paint()` truncates with `i32`, and 9.98 is exact enough in f32.
- Time in the dither band: a car alongside a lane-centre camera has a box distance of about 1.1 m. It passes through the 1.2-2.5 m band over about 1.6 m of travel, which is 6-12 frames at normal speeds. That is the standard dither-out and is acceptable.
- The burst check on held-out cameras is the right test.
- Minor point: the near list and the lamp buffer are filled with atomics, so their order is not deterministic today. "Order unchanged" is not a meaningful identity check. Check contents instead.

**Part 2: isolation gaps the spec does not cover.**
1. **`buildInfillRuns` reads `plan.coverAt`** (`trafficCars.js:433`: `plan.coverAt(x, z).built < 0.5`).
   - The spec has `plan.coverAt` gain the second pass's coverage.
   - Where a first-pass block is missing a lot on one side, its street was below 0.5 in main. A second-pass lot next to it can raise that street above 0.5. The segment then becomes valid, the existing run lengthens or merges, and every `rng(31338)` car re-rolls.
   - In my simulation the passes share **3 street edges**: cells (−3,5)/(−2,5), (−3,6)/(−2,6) and (−3,6)/(−3,7). All second-pass cells with i = −4..−3, j = 4..6 lie inside the first pass's bounding box (i −4..4, j 4..14), which is exactly where `buildInfillRuns` scans.
   - The key set in `buildInfillRuns2` protects only the new runs, not the old ones.
   - **Fix:** keep the second pass's coverage in its own array. Merge it into the GPU texture for paint only, and keep `buildInfillRuns` on first-pass coverage.
2. **The infill lamp validation also reads the shared coverage texture** (`infillLampValid`: coverage ≥ 0.9 and owner match, bilinear sample).
   - A first-pass candidate slot near a stamp edge can cross 0.9 once second-pass coverage is added. The second lamp instance then gets an extra lamp, and its 120-light selection changes.
   - **Duplicate lamps:** `infillLampCandidates` takes all four streets of each cell. A third instance built from `cells2` would place a second lamp mesh, and a second real light, on the 3 shared streets. The candidates need the same de-duplication by `(di, axis, line, j)` that the traffic runs get.
   - **Analytic pools:** the ground shader's analytic pools are faded against the second instance's real-light range (`TU.y`). A third instance needs its own range, or its streets get both the analytic pool and the real light.
3. **Hamlets are not in the identity table.**
   - `hillsideLife` skips any hamlet where `plan.blocks(x, z, 40)` is true (`gardenViews.js:843`). `blocks` reads `coverAt`.
   - The strip is forested slope at 14 m or more and 45 m or more from the water, so it is hamlet land.
   - A hamlet next to a new block would either be suppressed (its lights and geometry vanish, and its reserve moves to `suppressedReserve`) or left overlapping a block (floating terraces and stairs cutting into a box).
   - Decide which, and list it with its draws as an identity check.
4. **The "70 m quay depth" is not a lot rule.**
   - `QUAY_DEPTH` only sets the style of *unbuilt* park land (`plan.js:576`). Lots are rejected only within 12 m of the water (`plan.js:384`).
   - The simulation has 6 second-pass lots within 70 m of the water, and A3 is non-zero (0.33% upper bound).
   - To keep A3 unchanged, add an explicit setback for second-pass lots. With 70 m: 80 lots, A3 0.17%, A6 1.18%.
5. **The car lamp buffer "has room" is asserted, not measured.**
   - At G2 and G3, thousands of cars are visible. Report the per-frame `args[6]` count against `lampDraw` (36,000 at high quality) for main and for the candidate.
   - If it overflows, which lamps get dropped is decided by atomic order, and that shows across the frame (I-032 review 2).
6. **Seam with the first pass's squares.**
   - The ground shader does `urban *= 1 - park`, so park wins over built coverage.
   - Second-pass street stamps that reach into a first-pass pocket square or the quay strip will not paint. Expect a missing half-street along the 3 shared edges.
   - This is minor, but it is a visible seam on foot.

**GPU:** plausible. 89 lots, 47 lights, a few hundred cars, and a `discard` in the car pipeline. The estimate of about +0.1 ms is reasonable against 9.8 ms. No issue.

### How I-032's review findings were handled
| Finding | Status |
|---|---|
| C2 people fade made B1 worse | fixed: people untouched |
| Separate the camera term from the steep and run-end fades | fixed |
| Narrower band 1.2-2.5 m; the streak takes the fade | fixed |
| Check dithered cars in motion | fixed: held-out bursts |
| `discard` disables early depth | answered: split pipeline as a fallback |
| C5: own runs with de-duplication | partly fixed: the new runs are de-duplicated, but old runs still read the shared coverage (concern 1) |
| C5: lamp candidates, sign budget and car caps need the append-only treatment | partly fixed: own lamp instance and sign pool, but no lamp de-duplication (concern 2); car caps not measured (concern 5) |
| G2 not traced | traced, but it overestimates |
| **Show the G3 land is excluded only by the Ovoo line and the keep-out, not by STEEP, HILL_FOOT or half-built** | **not done, and false** (strongest reason) |
| C1, C3 and C4 split out | done |

### What would make it stronger
1. **Ship part 1 alone,** as a small idea targeting B2.
   - Add 3-4 held-out lane-centre cameras as extra targets, so adoption does not rest on one pose.
   - It is cheap, clean, and fixes a critical defect.
2. **Re-scope part 2 from the land outward, not from the critic box inward.**
   - The G3 brown triangle and the G2 dark bank are Ovoo Hill. Under user priority 3 ("parks with character, or bring the city to the water"), the right treatment there is a hillside: terraced hamlets and stairs, or a lit hill park on the Lantern Park pattern. Pushing 8-storey boxes onto 40-70 m slopes would mean dropping the hill-foot rule, and with it the reason Ovoo Hill exists.
   - The flat land the second pass can build, upstream at z −1350 to −660, is a separate and less visible gain. A6 is its main viewer.
3. If part 2 stays:
   - make the quick-test stop rule *"at least 1% of G3 or G2 changed by projection"*, not "15 lots";
   - keep second-pass coverage out of `buildInfillRuns`, `infillLampValid` and `blocks()`;
   - de-duplicate lamp candidates and give the third lamp instance its own analytic hand-off range;
   - add an explicit water setback for second-pass lots;
   - list hamlets in the identity table;
   - measure the car lamp buffer.
4. Forecast A6, and add it to the expected targets if it reaches 1%.

*Method note:* the CPU port and the simulation scripts are in the session scratchpad (`rv/height.mjs`, `plansim.mjs`, `sim.mjs`, `proj.mjs`). Any dev build can repeat the check by logging `infill2` from the real `eastBankPass` and projecting it the same way.
