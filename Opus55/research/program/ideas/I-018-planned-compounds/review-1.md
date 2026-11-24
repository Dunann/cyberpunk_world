## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 6 | Designing towers per block instead of per lot is new in this program and well grounded in how Chinese housing is really built. The plan types themselves (cross, Y, slab) were already listed in I-005, and block-level generation is a standard procedural-city technique. |
| Feasibility and credibility | 5 | The coverage was measured honestly and most of the random-stream isolation holds. But several core claims do not hold in the code: Yuzhong towers are already 18–23 m wide; the shader picks window proportions, lit share and light colour per tower from the seed, so "one design per compound" cannot be built by changing inputs only; and the Nan'an floor counts break the spec's own height check. The coverage numbers do reproduce (A6 48.8%, G1 14.3% with the plan's rule), although the attached patch does not build as given. |
| Expected impact | 6 | A6 is the largest frame share any idea has had (about half the frame). But the compound rules also remove most of what makes the current night aerials read well (lit crowns, roof billboards, most roof neon), and at A6 distances the finer windows make walls flatter rather than sharper. G1 and G3 will most likely tie. If it fails, the program still learns whether tower form and grouping move the judge. |
| **Overall (average)** | **5.67** | |

### Strongest reason it will fail
**At night, the spec takes away the accents that make the aerials read well, and adds changes that barely show.**

**What the compound rules remove** on all 1,033 lots:
- **Lit crowns:** the lit pyramid crown is 1/8 of `CROWNS_RES`, and every one on these lots goes.
- **Roof billboards:** the `billboard` crown (another 1/8) goes too. Its sign slots are marked dead, so those roof signs disappear. That works against user priority 4 (signage).
- **Roof neon:** most of the roof neon outlines go. Today 28% of hillside towers get a neon parapet line, and `roofDress` adds a 22% neon edge on top of that; the spec keeps one roof-neon line in 10% of compounds.

In the baseline A6 and G1 images, the lit pyramids and coloured roof outlines are the brightest and most distinctive elements of the tower field. They are the "jewels" of G1's Nan'an foreground.

**What the spec adds in their place shows little at night:**
- **Notches.** "Notches cut full-height vertical shadows" assumes a sun. These are night scenes, so a 5 m re-entrant corner is just another face at a different angle under ambient light, about 4–12 px wide at A6 distances.
- **Matched finishes.** These are mostly albedo, which `farK` pushes towards dark grey beyond 450 m.
- **Matched heights per block.** These can make a block of 3–4 identical towers read as one larger notched box from the air. That is "boxy" at block scale, the opposite of the goal.

So the most likely blind verdict on A6 is "plainer, darker, more uniform", and G1 loses its lit crowns in the foreground.

**What would avoid this:** keep the accent mix at today's level and change only form and grouping. That is required fix 5.

### Other concerns
- **The "slender towers" claim does not hold for Yuzhong.** Yuzhong blocks are 72 m with 11 m roads, so square lots are 25.5 m (`world.js` `_buildLots`). Today's single tower on such a lot is 25.5 − 2×(1.5–3.5) = **18.5–22.5 m wide**. The proposed W is 17–22 m: the same width.
  - Fat slabs exist only on the 45% of long lots that get one tower (about 18% of Yuzhong lots).
  - In Nan'an the claim is true: 62 × 29 m lots give 53–59 m slabs.
  - So in A6 (Yuzhong) the change in outline is the notches, not slenderness.
  - Also, a cross turned by up to 30° has to shrink to about 16.5 m to fit a 25.5 m lot with 1.5 m to spare. Contour-turned compounds would be thinner than today and show more bare podium deck from above.
- **"One design per compound" cannot come from the inputs alone.** `windowGrid` derives several things from each part's `seed`:
  - the window width and height fractions (`hs`: `ww` = 0.42–0.72, `wh` = 0.46–0.62);
  - the apartment width (`uw`);
  - the lit share (`hb1`: ×0.35–1.65);
  - the light-colour class (`hb2`: warm, cool LED or mixed).

  With a different seed per tower, the towers of one compound differ in window proportions and light colour, which are the things you actually see at night. With one shared seed, every tower gets the identical lit-window pattern, which is an obvious copy-paste. Neither gives "matched but not copied". See fix 4.
- **Finer windows make A6's middle distance flatter, not sharper.** In `windowGrid`, `det = 1 − smoothstep(0.18, 0.5, max(fw/cw, fw/floorH))`.
  - **Today:** with cells of 3.6 m and floors of 3.0 m, the floor term decides, so windows stay crisp to about 665 m and fade to the averaged state by about 1,860 m (1,242 px per radian at 1440p).
  - **With 2.1 m cells:** fading starts at about 465 m and finishes by about 1,300 m.
  - **What A6 covers:** the A6 camera is 885 m from its target. The spot-check masks show that the changed towers are at about 500–1,500 m, because the near riverfront towers are front-row and stay unchanged. Most of the changed area would move from crisp windows to the blended or averaged glow with floor bands.
  - **Nearer than 465 m:** windows shrink to 3–5 px. That is closer to single-pixel speckle, which the critics called "pixel noise", and it is more exposed to TAA shimmer.

  So the spec's statement that finer windows remove the "big pixel squares" is half true. Near towers get finer speckle, and middle-distance towers get smoother but less detailed. A blind judge tends to prefer visible detail. This needs its own A/B on a held-out camera (fix 6).
- **The Nan'an floor counts contradict the spec's own check.** On the Nan'an tower path, `genUrban` builds 7–19 floors half the time (k < 0.5), offices 25% of the time, and 22–45 floors (minus up to 10 for distance from the centre) 25% of the time. That is a mean of about 18 floors for housing.
  - The spec's Nan'an housing compounds have 18–40 floors (mean 29), about +60%. That cannot pass "mean tower height per district within 10%".
  - It would also raise half of the low-rise fabric in G1's foreground, which blocks the overlook's view of the river and of the Yuzhong skyline. It changes G2 and G3 too.
- **The rule in the patch is not the rule in the plan, and the I-014 count is out of date.** The patch excludes only lots holding I-014's chosen glyph towers. The plan excludes every lot whose tower passes the front-row test. These give different results; see the spot-check below. The plan's rule reproduces the spec's table, so the stated coverage is right for the plan as written. However, the I-014 branch now chooses 15 glyph towers, not 40, so "I-014's 40" in the spec is out of date. Tie the exclusion to the front-row test only, which is what fix 3 does.
- **I-014 selection is global, and compounds can change it.** The exclusion uses the full front-row test, including `minHeight` 100 m.
  - A waterfront lot with a 90 m tower is therefore a compound candidate. If its compound grows past 100 m, it becomes a new front-row candidate.
  - If a short blocker (40–100 m) is replaced by a thinner or turned tower, a tower behind it can become front-row.
  - `choosePhrases` ranks phrases globally, with caps per district and a cap of 40 towers, so either case can change which phrases are chosen in other districts. The spec's assertion ("must select the same 40 towers") would fail, and the spec gives no remedy.
- **Random streams and data flows (checked in code).** Most of the isolation claims hold; three outputs are not covered by the planned checks:
  - **Signs, rng(9137): holds.** Slot iteration in `placeSigns` stays identical if dead slots still run their `fascia` draws. `selectLights` sorts by priority and fills per cell, so dropping a chosen light afterwards re-picks nothing.
  - **Shop lights: hold.** No `B.light` call happens after `B.mark` in either generator. `shopLight` runs before the mark, so the `rng(4242)` shuffle of `B.lights` is unchanged.
  - **Skybridges, rng(5150), and walkways, rng(5151): hold**, because they run before the post-pass.
  - **Hamlets, rng(7070): hold.** They run in the `garden` module, which runs before `buildings` and reads only `world.lots` positions.
  - **Props: hold.** The post-pass runs after the whole budget is spent. The shader never hashes the part index (`vis` → `parts[pid]` only), so compacting the parts is safe.
  - **Not covered: colliders.** Colliders feed `crowd.js` (rng 8080 sidewalk placement, `blocked` with a +0.3 m margin), `trafficCars.js` (rng 31337, +1.5 m) and I-009's `maxTopNear` (airship altitude: the highest collider top within 250 m of the confluence track).
    - Compound towers turned on slopes, and lots where the uphill sidewalk sits above `podTop − 2`, could change crowd draws city-wide.
    - Compound height changes near the Great River could move I-009's confluence airship.
  - The dev checks cover only building outputs (fix 9).
- **Merge with I-016.**
  - Both ideas append parts after `walkways()`. `Parts.add` gives parts without a seed (most `crown()`, `roofDress()` and `acUnits` parts) the seed `(count × 7.31) % 997`, so whichever idea appends second changes the other's details.
  - I-016 also shares the prop budget, which this spec "returns".
  - I-016 targets G3 too, and fills the Nan'an river strip with ordinary `genUrban` boxes next to the new compounds. In G3 that would show per-lot boxes on the waterfront and compounds behind them.
- **A5 and G4 are "what works" poses and change by 13.2% and 11.3%.** At A5 the replaced tower is 20–60 m from the camera, so every re-entrant junction, rotated plan and painted-window seam is visible. With no clear win available there, any defect is a clear loss.
- **The patch does not build as described.** `buildings_text.js` from `idea/I-014` imports `TEXT_MAX` from `buildings_wgsl.js`, and the patch does not add it. I had to add `export const TEXT_MAX = 64` by hand. The `dbg` rule string used for the table is not recorded either. Both are small, but they make the numbers harder to reproduce.
- **The GPU claim is plausible.**
  - Part count goes down, and AC props are 87% of the replaced parts.
  - The depth prepass keeps facade shading at about 1× per pixel.
  - The window fade starts nearer, so interior parallax runs on fewer pixels.
  - I see no new lights and no new passes.
  - With about 0.5 ms of headroom left after the in-flight prototypes, a cost of +0.05 ms is acceptable. However, the stop rule of 3×3 interleaved benches cannot resolve +0.15 ms unless the spread between benches is measured. Benches under contention have varied by ±0.5 ms in this program (I-014, I-016).
- **No sign of tuning to eval cameras.** All rules are world-based, and H1 and H2 are separate from the eval cameras. H1 sees the same Yuzhong towers as A6 but from the opposite side, which is acceptable.

### Coverage spot-check (reproduction)
**Setup.**
- A scratch copy of the main source with `coverage-patch.diff` applied, plus `buildings_text.js` from `idea/I-014` (now commit 2eddd37).
- The build failed until I added `export const TEXT_MAX = 64` to `buildings_wgsl.js`.
- A6 and G1 were rendered at 640x360 with `rain=0`, through the shared GPU lock, and counted with `coverage-count.py`.

**Rule strings.** I wrote them from the spec's text, because the spec does not record them:
- **Shared part of both rules:** `((L.district===1 && L.towerPath) || L.district===5) && D(220,-60)>250 && D(-600,-260)>130 && D(-1250,-900)>105`, combined with `tower` and one of the two front-row exclusions below.
- **Patch rule:** `!L.front`, which excludes only lots holding I-014's chosen glyph towers.
- **Plan rule:** `!L.frontRule`. I added this to the patch: a lot is excluded when any of its parts belongs to a tower passing I-014's front-row test (`groupTowers`, `waterHits`, `faceWater` and `blocked` with the `RULE` constants). That covers 101 towers city-wide.

| Rule | Lots (Yuzhong / Nan'an) | Parts (props) | A6 | G1 |
|---|---|---|---|---|
| Spec's table | 1,033 (698 / 335) | 40,767 (35,698) | 48.9% | 15.1% |
| Patch rule, with today's I-014 branch (15 glyph towers) | 1,045 (712 / 333) | 41,537 (36,419) | 61.5% | 15.5% |
| **Plan rule (step 2 as written)** | **1,002 (684 / 318)** | **39,594 (34,661)** | **48.8%** | **14.3%** |

**Conclusions.**
- The spec's numbers reproduce for the rule the plan actually builds (A6 within 0.1 points, G1 within 0.8). The I-015 60 m exclusion was not applied, so the real numbers are slightly lower.
- **The masks show where the change falls.**
  - **A6:** the large riverfront towers at the bottom of the frame are front-row and stay unchanged. The changed towers are the middle ground and background, about 500–1,500 m away. That is exactly the distance band where finer windows go to the blended or averaged state.
  - **A6 also gets two window scales side by side:** today's 3–4 m windows on the kept foreground towers and 2 m windows behind them.
  - **G1:** the changed area is the Nan'an foreground below the railing. That includes the lit pyramid crowns that the compounds would remove.
- Scratch files are in `C:\Users\pdunc\AppData\Local\Temp\claude\71d1a506b11c03e8\7dd9aef4-6179-4c30-820b-ff3b0f510313\scratchpad\rev018\` (`out/base`, `out/spec`, `out/plan`, masks in `out/mspec` and `out/mplan`).

### Required fixes
These fixes are needed if this goes to the prototype track. Fixes 1–4 come before any code beyond the post-pass skeleton.

1. **Record the measurement.** Add the `TEXT_MAX` line, the exact `dbg` rule strings (the plan rule, using the full front-row test) and the I-014 commit they were run against to the idea folder. State the coverage as "plan rule: A6 48.8%, G1 14.3%", and note that I-014 now picks 15 glyph towers, not 40.
2. **Keep each district's height mix.**
   - In Nan'an, the share of lots that are low-rise today (7–19 floors) becomes low-rise compounds (for example mid-rise slabs or point blocks of 7–19 floors). They are not raised to 18–40 floors.
   - The dev print must show, per district, (a) the mean tower height, (b) the number of towers over 100 m and (c) a histogram in 10 m bands, each within 10% of the baseline.
   - Anchors on the crest must come out of the existing 7% tall share, not be added on top of it.
3. **Make the I-014 interaction hold by construction.**
   - Exclude every lot that holds a tower with an unblocked water-facing face within `RULE.reach`, at any height. This drops the 100 m `minHeight` from the exclusion test.
   - Also exclude every lot holding a blocker for such a face.
   - Run I-014's selection on the parts before compounds are built, and remap its part indices after compaction.
   - Then "same glyph towers" is an assertion that cannot fail, rather than a hope.
4. **Make towers matched, not copied, without changing the shader.**
   - Port `hash11u` to JS.
   - For each compound, draw one target class: `hs` band (window proportions and apartment width), `hb2` class (light colour) and `hb1` band (lit share, ±0.1).
   - For each tower, draw seeds from the compound stream and reject them until `windowGrid`'s hashes fall in that class. Then lit-window patterns differ between towers while proportions and colour match.
   - Dev-assert the classes.
5. **Keep today's night accents.** The idea should change form and grouping, not the accent mix.
   - On the replaced lots, keep the shares of lit crowns, billboard crowns, roof neon lines (parapet plus `roofDress` neon), `EDGE` and `CROWNLIT` within ±20% (relative) of their baseline counts per district, as one choice per compound.
   - Add compound billboard slots at the end of `world.signSlots`, after every existing slot.
   - Dev-assert that every sign from an existing slot is byte-identical (dead slots apart). Their light candidates go in a separate pool after `selectLights`, as I-016 does for its infill, so the existing light selection is unchanged.
6. **Test finer windows on their own.** On H1 at 2560x1440 (both X/Y orders, fresh judge), compare compounds with today's `winW` range (2.8–4.4 m Yuzhong, 3–4.5 m Nan'an) against compounds with 1.9–2.4 m. Keep finer windows only if they win in both orders; otherwise keep today's range. Apply the same rule to contour turns: off by default, and on only if an H1 A/B with turns wins.
   - If turns are kept, never shrink a wing below 18 m. Reduce the turn angle instead.
7. **No block-scale boxes.** Within a compound, the gap between neighbouring towers must be at least 0.6 W. If a lot cannot fit the plan with that gap, it gets one tower. Report the mean plan area per tower and per lot against the baseline per district, so the "slender" claim is stated with real numbers.
8. **Treat the Liziba station as a landmark.** Exclude lots within 120 m of `MONORAIL_STATION`, in the same way as the `raffles`, `ridge` and `beacon` margins. This is a world rule, and the station is a landmark of the brief. Decide and record it before any eval capture.
9. **Extend the bit-identity checks beyond the buildings module.** Hash and assert as equal to the baseline: the crowd placement arrays (rng 8080 and 9191), car spawns (rng 31337), `cbdCorridors`, the signs array apart from dead slots, and the chosen light list.
   - After an I-009 merge, assert that the airship altitudes do not change. If the confluence altitude moves, cap compound tops within 250 m of the airship tracks at the original lot's top.
10. **Fix the merge order with I-016 now.**
    - Generate compounds after `genInfill`, and compact after both.
    - Give every part a compound adds an explicit seed by wrapping `B.part` and `B.prop` during compound generation, so no part falls back to the count-based seed.
    - Return the prop budget only after I-016 has run.
    - State in the spec that I-016 infill lots stay per lot, and that G3 is judged against whichever of the two is the current best.
11. **Make the bench stop rule measurable.**
    - Run baseline against baseline in the same session to get the spread between benches.
    - The +0.15 ms stop rule applies only if the 3×3 interleaved difference has a standard error under 0.05 ms; otherwise run more pairs.
    - Report gbuffer and total at A6, G1, G3, H1 and H2 with `--stats`, and run all GPU work through the shared lock.
12. **Freeze before the eval.** Record a hash of the compound rules and weights after the H1 and H2 tests. The eval capture must be built from that hash, and any change after the eval capture voids the run.

### What would make it stronger
- Show the idea on H1 as three separate A/B pairs: (a) form and grouping only, with today's windows and accents; (b) plus finer windows; (c) plus contour turns. Then the program learns which part moves the judge, even if the whole idea fails.
- Treat matched heights as a hill profile, not a flat cap. Within a compound, step floors by plus or minus 1–3 floors along the slope, as real xiaoqu do, so a block never reads as one box.
- Give compounds the street-level identity real compounds have: a gate arch with the compound's name sign on its street face, using the existing sign slots and appended as fix 5 describes. It is cheap, and it adds both signage and "planned place" character where A4-type street views can see it.
