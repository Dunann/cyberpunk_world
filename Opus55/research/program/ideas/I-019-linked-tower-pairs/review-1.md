## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 6 | Making generic CBD towers into composed two-tower buildings by rule is new in this program, and composite towers are a real part of what makes Asian skylines memorable. But a linked pair is exactly the identity of the existing `twin` landmark, Yuzhong already has 320 skybridges, and "add bridges between neighbours" is a standard procedural-city move. |
| Feasibility and credibility | 4 | The coverage numbers reproduce (B4 46.4%, B2 14.0%, H4 26.7%). But the geometry the links depend on is not what the spec describes. Same-lot pairs stand 12 m apart and have heights that differ by 25–45%. 13 of the 16 across-road pairings it measures are more than 60 m apart (up to 148 m), so the spec's own 60 m cap rules them out. The shader picks edge and crown-wash colours from each part's seed, so the planned "one lighting identity per pair" cannot be set through the inputs. The spec also misses one random stream: new link colliders change the CBD air corridors, which draw from rng(555). |
| Expected impact | 5 | B4 is a large target. But "46.5% changes" counts tower sections that keep their centre, height, footprint and (for most same-lot pairs) already their glass colour. What the judge will actually see change is the link geometry in 12 m slots: a few percent of the frame, mostly below camera height and partly hidden. Every pair runs east–west, so from H3 and B1 the links are hidden end-on. Forty-odd "unequal pair plus lit bridge" buildings also dilute the `twin` landmark. |
| **Overall (average)** | **5.0** | |

### Strongest reason it will fail
**What the spec counts as "changed" is not what a judge will see change, and the part that does change is small, cramped and repeated.**

**Almost all of B4's coverage comes from same-lot pairs, and these are cramped.** With the plan's rule and only buildable pairs kept (across-road gap of 60 m or less), B4 coverage is 41.9%, and same-lot pairs alone give 40.8%. In `genCBD`, a two-tower lot is always a 99 m lot with `hw = L.w/4 − 6 = 18.75 m` and centres at ±24.75 m. That leaves:
- **a face-to-face gap of 12 m** (plus up to ±5 m of offset along z);
- **a second tower 0.55–0.75 times the height of the first** (`H *= 0.55 + R()*0.2`).

**What this does to each link type:**
- **Gate.** It cannot be "the top 15–20% of both towers" when the tops differ by 25–45%. It would have to sit at the lower top and plug into the taller tower's side, which is the shoulder deck.
- **Shoulder deck.** The rule "cantilever at most 0.4 times the gap" means it stops 7 m short of the taller tower. It cannot both obey that cap and plug into the taller tower.
- **Sky atrium.** Filling a 12 m slot from the podium to 0.3–0.4H fuses the two shafts into one wide block for their lower third. That is more boxy, not less (user priority 1).
- **Ladder bridges.** 12 m bars, 4–8 m tall. At B4's 300–800 m that is about 20–50 px by 6–30 px each, and many sit below the camera behind nearer towers.

**What the judge sees.** The shafts keep their centre, top and footprint. 82% of CBD towers are glass in the lot's single `glassC`, so most same-lot pairs already share their colour. The "46.5% of B4" is therefore mostly pixels that look the same. The visible change is a few percent of thin links in narrow slots, plus lost setbacks (see below). That is the profile that gave I-014 one "slight" judge and one loss.

**Every pair runs east–west.** Same-lot towers are offset along the lot's x axis, and across-road pairs are columns 2k/2k+1. The CBD angle is 0, so every link lies along world x. Consequences:
- **H3** looks almost straight down −x (from 4350 to 3300). It sees the pairs end-on, with the links hidden behind the near shaft. The spec's main check against copying the landmark ("needs checking on H3") cannot be done there.
- **B1** (view direction (971, 155)) also sees them end-on. That lowers B1 risk, but it also means the change is invisible from the most-viewed pose.
- **Composition.** Forty parallel links in one grid read as a rule, not as designed places.

**It dilutes the landmark.** The `twin` landmark is two unequal towers (420 and 355 m) joined by one lit mid-height bridge. Same-lot pairs become two unequal towers (ratio 0.55–0.75) joined by lit bars at 0.3–0.85H. At B1, G3 and H4 distances, "unequal pair plus glowing horizontal bar" is the whole read. The library's exclusion ("not a single rhombus truss") is a detail no judge will see. H4 frames the twin landmark at the end of its avenue, about 430 m ahead, so a dilution loss would show up exactly there.

### Other concerns
- **Across-road pairing mostly cannot be built, and the rule is ambiguous.**
  - **Gaps (measured, plan rule).** The 16 candidate pairings have face gaps of 44, 45, 59, 60, 64, 71, 72, 78, 94, 95, 96, 97, 112, 113, 145 and 148 m. The spec's "about 30–50 m" holds only for narrow (47.5 m) lots facing each other across the road. 99 m lots give 65–85 m, and a narrow lot paired with the far lot of a split block gives about 145 m.
  - **Ambiguity.** CBD blocks are split in x only (`nx`), never in z, so "same row, |dz| < 5" matches both lots of a split partner block. 10 lots have two candidates, and the spec gives no tie-break.
  - **What survives.** With the spec's own 60 m cap, about 3 across-road pairs remain. The real pair count is about 41 (38 same-lot + about 3), not 54.
  - **H4 coverage.** It falls from 26.7% to 13.9% when unbuildable pairs are dropped, because H4's large changed tower is an across-road candidate.
- **Coverage reproduces, but for a set that will not be built.** Rule run against `idea/I-014` @ 2eddd37, front-row test as in I-018's review:

  | Rule | Lots | Parts | Props | B4 | B2 | B1 | B3 | G3 | H3 | H4 |
  |---|---|---|---|---|---|---|---|---|---|---|
  | All CBD tower sections | 115 | 2,441 | 1,823 | 61.3 | 18.1 | 12.9 | 5.0 | 2.0 | 27.5 | 27.0 |
  | Spec's table | 67 | 1,691 | 1,256 | 46.5 | 14.0 | 4.9 | 2.3 | 1.1 | 18.3 | 26.7 |
  | Plan rule (any partner) | 60 | 1,499 | 1,107 | 46.4 | 14.0 | 3.6 | 1.8 | 0.8 | 17.9 | 26.7 |
  | Buildable (across gap ≤ 60 m) | 44 | 1,269 | 938 | 41.9 | 12.6 | 3.2 | – | – | 14.1 | 13.9 |
  | Same-lot pairs only | 38 | 1,160 | 858 | 40.8 | 12.3 | 3.2 | – | – | 13.7 | 13.9 |

  - Two-tower CBD lots: 43, of which 5 are front-row (the spec says 42 and 4).
  - The spec's `dbg` rule string is not recorded, and the patch still needs `export const TEXT_MAX = 64` in `buildings_wgsl.js` to build (the same issue as I-018).
- **Removing setbacks makes towers boxier.** "Setbacks only above the highest link" straightens 23% (stepped `segs` 2–3) plus some kind 1 and kind 2 towers up to 0.85H of the lower tower. Setbacks are one of the few things that break the box today; the stepped tower at the centre of B4 is one. Taper and lobes are dropped too. The spec counts this as a trade; for priority 1 it is a loss.
- **Matching colours is not possible through the inputs (the same issue as I-018 fix 4).**
  - **Colours come from the seed.**
    - The edge strip colour is `hsv(fract(seed*0.0137))`.
    - The crown-wash colour is `hsv(fract(seed*0.0291+0.1))`.
    - The window proportions, lit share (`hb1`) and light-colour class (`hb2`) also come from `seed` in `windowGrid`.
  - **Neither obvious choice works.** If both shafts get one seed, their lit-window patterns are identical: two copy-paste walls 12 m apart, clearly visible from B4's 280 m. If they get different seeds, the colours do not match.
  - **The LED rule conflicts with the plan.** "LED towers keep the flag" means that in 35% of the tower draws, one shaft of a "matched" pair is a screen and the other is not.
- **Night accents and signs.**
  - **Crowns.** Re-running the taller tower's crown on both tops keeps the crown mix in expectation. But a gate pair drops one crown, and two identical lit crowns 12 m apart read as repetition.
  - **Billboard crowns.** If the taller tower had a `billboard` crown, the re-run calls `B.slot`. That contradicts the dev check "slot list unchanged". If billboards are skipped instead, CBD roof signs are lost (priority 4). New slots must be appended after every existing slot.
  - **Lighting identity.** "One lighting identity per pair" may raise the share of `EDGE` and `CROWNLIT`. A judge win could then come from more edge lights rather than from the form. Keep each flag's share per district within ±10%.
- **Random streams (checked in code).**
  - **Signs, rng(9137): holds.** `genCBD` makes no `lotSigns` calls, and its only slots are billboard crowns. Dead slots keep their draws.
  - **Shop lights: hold.** The only `B.light` in `genCBD` is the podium light, before `B.mark`.
  - **Skybridges, rng(5150), and walkways, rng(5151): hold.** They use `hillTowers` and `hillPods` only, and run before the post-pass.
  - **Searchlight `towerTops`: hold.** The values are unchanged. 4 of the 12 CBD searchlight tops are on paired lots: (3588, −1063), (3838, −1185), (2963, −935) and (3238, −1187). Their beams must still leave from the same point after crowns are re-run.
  - **Crowd (8080) and cars (31337): probably hold.** Links over roads are at least 40 m up, and car blocking only counts colliders whose bottom is below ground + 4. This needs an assertion.
  - **Not covered: CBD air corridors, rng(555).** `cbdCorridors` in `air.js` tries up to 300 random corridors per altitude band (165–345 m) and rejects any that pass within 20 m of a collider. That is exactly the band where links sit, and full-width shafts that lose their setbacks also make taller, wider colliders.
    - Every extra rejected try shifts rng(555) for all later draws: the CBD eVTOL and drone placements (air.js lines 496–501), which are in B4's frame.
    - Through `trafficBands`, the corridors also set I-009's airship altitudes. I-009's `maxTopNear` alone would hold, because tops are unchanged and crowns are not solid.
    - So B4's aircraft move between baseline and candidate (a confound), and I-009's airships may change altitude after a merge.
- **Link lighting.** Soffits are `MAT.EMIT` with no point light, so a glowing slab between two dark walls 12 m apart casts no light on them. In this renderer that reads as pasted on, which is the "detached" defect (priority 2). Ladders on 40 pairs, each with a lit underside, also add up to 100+ lit horizontal bars to a B4 frame that is already full of edge lines, LED bands, searchlights and drones. The judges have already marked down clutter (I-009's beams).
- **Joints on round shafts.** "Ends embedded 1.5 m, measured from the real ring" works on a box. On a cylinder (kind 2, prm 48, such as the large cylinder that fills B4's left third, which is a paired tower), a link as deep as the shaft leaves gaps at its corners: up to the radius, measured at the link's edge. Ends must run to the shaft's centre line, with link depth at most 0.8 of the inscribed width.
- **GPU.** The claim (−0.01 to +0.03 ms) is plausible:
  - parts are about level;
  - links are boxes in list 0/5;
  - there are no new lights or passes.

  The stop rule is not measurable as written, however. 3×3 benches cannot resolve +0.15 ms when benches in this program have differed by ±0.5 ms under contention. With about 0.5 ms of headroom left after I-009 (+0.07), I-016 (+0.19) and I-014, the spread must be measured. Large glass atria are also visible at street level (B2, H4), and that pixel cost was not estimated.
- **Conflicts and merge order.**
  - **I-014.** Its selection is global (phrase caps, at most 40 towers). Paired shafts that lose setbacks or change from lobed to octagonal plans change the `blocked` test for front-row candidates near them, and new link parts may be grouped by `groupTowers`. The planned assertion can fail, and the spec gives no remedy. The fix is the same as I-018 fix 3: run the selection on the parts before pairing and remap indices after compaction.
  - **I-016.** `genInfill` appends after `walkways()`, and its seedless parts take the seed `(count × 7.31) % 997`. If I-019 compacts or appends before it, every infill detail changes. Its prop thinning also shares the budget that I-019 "returns".
  - **I-018.** Both ideas plan to own the shared post-pass. The order and seed rules must be fixed once for both.
  - **I-009.** Through the rng(555) corridors, as described above.
- **Tuning to eval cameras.** None found. All rules are world rules, and there are no pose coordinates. H3 is close to a mirror of B4 (same core and altitude band, opposite side), which is acceptable as a proxy, but it sees the pairs end-on (see above). H4 sits on a real grid road.

### Required fixes
Required if this goes to the prototype track. Fixes 1–5 must be settled in the spec before code.

1. **Record the measurement.**
   - Add to the idea folder: the exact `dbg` rule strings, the `TEXT_MAX` line, the I-014 commit (2eddd37), and a list of the pairs with their face gaps.
   - Restate the coverage for buildable pairs only: B4 41.9%, B2 12.6%, H3 14.1%, H4 13.9%.
   - Report a second number for each pose: the share of pixels whose colour actually differs between baseline and candidate (|ΔRGB| > 8). Use that, not the replaced-part mask, as the expected change.
2. **Fit each link type to the real geometry.**
   - **Gate:** only for pairs whose tops are within 10% of each other, with a gap of 20 m or more. In practice that means across-road pairs, so state the expected number of gates.
   - **Shoulder deck:** for same-lot pairs, and it spans the full gap. Delete the 0.4 × gap cap and replace it with "supported by the lower roof, embedded in the taller shaft".
   - **Sky atrium:** at most 0.25H tall and set back 3 m from both faces, so the shafts still read as two.
   - **Gaps:** drop any across-road candidate over 60 m. For two candidates, use a written tie-break (the nearest one).
3. **Mix the orientations.**
   - Add north–south pairs: same-column lots in block rows 2k/2k+1, across the east–west road.
   - Or, for same-lot pairs, alternate which axis the link faces, for example with a deck on the north or south face.
   - Report the share of links per axis; neither axis may exceed 65%.
   - Replace H3, or add an H5, with a view direction 30–60° off the x axis, and test there.
4. **Keep the landmark unique.**
   - No generic link may be a single lit bar between 0.35 and 0.6H. Ladders need at least 3 bars, and their soffits must be dimmer than the edge lines (`param` ≤ 2).
   - Exclude lots within 400 m of `twin`. This is a world rule around the landmark site, like the existing landmark margins.
   - Judge H4 (which frames the twin) specifically for "repetition of the landmark".
5. **Matched, not copied, through the seed.**
   - Port `hash11u` to JS.
   - Choose the second shaft's seed from the pair stream so that `fract(seed*0.0137)` (edge) or `fract(seed*0.0291+0.1)` (crown wash) is within ±0.02 of the first shaft's value, while `windowGrid`'s `hs`, `hb1` and `hb2` fall in the same class but the window hash differs.
   - Give LED to both shafts of a pair or to neither, and keep the district's LED share within ±10%.
   - Dev-assert all of this.
6. **Keep setbacks.** Do not straighten stepped towers. Links attach below the first setback, or a stepped tower pairs only with a link type that fits under its setback. Report the number of stepped, tapered and lobed towers before and after; each must stay within 10% of the baseline.
7. **Keep the CBD air corridors and I-009 unchanged.**
   - Compute `cbdCorridors` on the pre-pairing colliders (or replay rng(555) to that point).
   - Reject or lower any link that comes within 25 m of a corridor.
   - Assert that the corridor list and every rng(555)-drawn placement are bit-identical to the baseline.
   - After an I-009 merge, assert that the airship altitudes are unchanged.
8. **Keep the accents and signs.**
   - Billboard crowns that are re-run append their slots after every existing slot.
   - The per-district counts of `EDGE`, `CROWNLIT`, `LED`, lit crowns and billboard crowns stay within ±10% of the baseline.
   - The 4 searchlight tops on paired lots keep their crown type.
9. **Light the links honestly.** Soffit and atrium emission no brighter than lit windows. Also either add a faint emissive wash band on each shaft face next to a link, or add one dim point light per link, put in a separate pool after `selectLights` so the existing light selection is unchanged.
10. **Build the joints properly.** Link ends run to the shaft's centre line, with depth at most 0.8 of the inscribed width, so there are no corner gaps on round, rounded or octagonal shafts. Include one close capture of a joint on a cylinder (100 m away) in the quick test.
11. **Extend the bit-identity checks** to:
    - the crowd arrays (rng 8080 and 9191);
    - the car spawns (rng 31337);
    - the signs array, apart from dead slots;
    - the chosen light list;
    - `towerTops`;
    - the colliders whose bottom is within 4 m of the ground.
12. **Fix the merge order** with I-016 and I-018 now:
    - pair generation runs after `genInfill`;
    - compaction runs once, after everything;
    - every appended part gets an explicit seed (wrap `B.part` and `B.prop`);
    - the prop budget is returned only after the infill has run;
    - I-014's selection runs on the parts before pairing, and its indices are remapped after compaction.
13. **Make the bench stop rule measurable.**
    - Run baseline against baseline in the same session to measure the spread.
    - Apply +0.15 ms only when the standard error of the difference is under 0.05 ms; otherwise run more pairs.
    - Report gbuffer and p99 at B4, B2, H4 and the new H5, and run all GPU work through the shared lock.
14. **Freeze before the eval.** Hash the link rules and weights after the held-out tests. The eval capture must be built from that hash.

### What would make it stronger
- **Fewer, bolder pairs.** User priority 1 asks for "a few places look great". Instead of 40 cramped pairs, merge 6–10 pairs of adjacent lots into real composites with 25–45 m gaps: across-road gates, a few big sky decks, a portal over an avenue. Make each one a distinct, lit, readable place on the B4 and H4 sightlines by world rule (for example, the tallest pair per 400 m cell). Every pair being different is what landmarks have and rule-made pairs lack.
- **Test form before light.** Run two A/B pairs at H5 and H4: (a) links unlit, with matched shafts; (b) links with lit soffits. Then the program learns whether composite form moves the judge, or only the extra light.
- **Use the existing street grid.** A pedestrian bridge network at 40–60 m between CBD podium roofs, across the roads, is visible from street level (B2, H4) and reads as "layered city", which links at 0.3–0.85H cannot.
- **Measure what the judge will see.** A cheap first step: build links only (no shaft changes) with the dbg green paint and count their pixels at B4 and H5. If they are under 5% of the frame, the B4 target is not realistic.

Scratch files: `C:\Users\pdunc\AppData\Local\Temp\claude\71d1a506b11c03e8\7dd9aef4-6179-4c30-820b-ff3b0f510313\scratchpad\rev019\` (the patched source with the pairing pre-pass in `src/buildings.js`, renders in `out/base`, `out/plan`, `out/viable`, `out/same`, `out/allcbd`, masks in `out/m*`, run logs `cov2.log`).
