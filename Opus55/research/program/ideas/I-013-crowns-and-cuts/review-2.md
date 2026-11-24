## Reviewer 2 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 5 | A crown library with a spacing rule and set-back floor bands are standard procedural-city tools. Both come straight from I-005 §C. The new parts are good engineering rather than new ideas: the dry-run that keeps the random stream in step, and the far-distance shading fade. The Chongqing refuge floor is a nice local touch. |
| Feasibility and credibility | 6 | The GPU claim is credible: fewer parts, about 70k extra box triangles, a cheap new shader branch. The stream isolation is mostly sound. But as written, the neighbour rule works against the idea in Yuzhong. Steps A.2 and A.4 contradict each other. The "bit-identical" claim is false because of count-based default seeds. The cut post-pass has three unhandled cases (CROWNLIT, bottom faces, landmarks). Details below. |
| Expected impact | 5 | Crown sameness is real but is a sub-point of the critics' finding §4. At best this adds +0.1 to +0.3 to the zone means, below the 0.5 step. A3 has almost no visible crowns, so 2 of 3 target wins rests on G1 and A6 both winning. B4, which shows the most change of any pose, is not listed at all. If it fails, the program learns whether silhouette variety alone moves a blind judge, which is useful. |
| **Overall (average)** | **5.33** | |

### Strongest reason it will fail
**The neighbour rule is sized for the CBD, not for Yuzhong, so A6 ends up with fewer distinctive crowns than today, not more.**

**Tower density in Yuzhong.**
- Yuzhong uses 72 m blocks (`world.js:36`).
- Lots are split 2×2 (60%) or 2×1, and 80% of lots get towers. Long 2×1 lots get two towers 55% of the time (`genHillside`).
- That gives about 2.9 towers per block, or about **12–13 towers per 150 m cell**. A 3×3 neighbourhood holds about 110 towers.

**What the rule allows.**
- Under "never the same distinctive type anywhere in the 3×3", each type can appear at most once per 2×2 cells. Sequential placement reaches only about 0.19–0.25 per cell.
- With the 8 listed distinctive types, that is roughly 1.5–2 distinctive crowns per cell, or **about 12–16% of Yuzhong towers**.
- Today Yuzhong is already about 25% distinctive: `lit` 1/8 plus `pagoda` 1/8 in `CROWNS_RES` (`buildings_gen.js:655`).
- Step A.4 makes existing pagodas subject to rejection. Re-rolls draw from a table that is 43% flat types, and then fall back to `machine`.

**The result.**
- The stepped lit crowns and the many pagoda crowns visible in baseline A6 get replaced mostly by water-tank roofs.
- The new types and the pavilion hat (merged with pagoda as one type) are spread very thin: the pavilion reaches about 2% of Yuzhong towers, not 10%.
- Seen from mid-air, the peninsula gets flatter and darker. That is the opposite of the claimed "Character +1" at A6.

**Effect on adoption.**
- A3 contributes almost nothing on crowns. The spec's 73 "lit-crown tiers > 15 px" counted no occlusion. In the baseline image the left-hand Yuzhong towers have flat roofs, and the rest are behind the mound.
- So losing A6 leaves at most 1 of 3 target wins.
- The same density problem reaches the Yuzhong skyline behind A1, A2 and G4.

### Other concerns
- **B4 is the most exposed pose, and it is neither a target nor watched.**
  - The camera sits at 280 m among CBD towers 150–700 m away. The CBD uses the highest new-crown weights (74% distinctive).
  - 82% of CBD towers are `MAT.GLASS` and 130–330 m tall, with taper 1 in most shapes, so most qualify for cuts.
  - At B4's range, a 4–5 m recess every 60 m is 15–25 px tall on the near towers. These will be the largest, closest changes in the whole eval.
  - The visibility table lists A6, G1, A3 and B3 but not B4 or B1. B4 could easily be a clear loss, or it could be the best win.
  - Either make B4 a target, or add a CBD held-out camera that matches it in type, so this risk is known before the eval.
- **Steps A.2 and A.4 contradict each other, and the real scope is every roof in the city.**
  - A.2/A.4 rebuild every non-billboard crown with `Rk`. That includes `machine`, `setback`, `garden` and `antennas`, and so their `roofDress` too: AC rows, the 22% neon edge rings and corner aviation lights.
  - So every roof's clutter is re-randomised, not just the 218 `lit` crowns.
  - The cost table (207 × 6 new parts) assumes only former `lit` crowns draw from the new table. But A.2.2 says every crown chooses T′ "using the table".
  - Pick one reading. If all crowns draw from table B, the part and triangle counts in the cost section are wrong.
- **"Bit-identical" is false as written.**
  - `Parts.add` gives any part without an explicit seed the seed `(count * 7.31) % 997` (`buildings_gen.js:32`).
  - The `lit` ledges and spike, masts, the rooftop neon accent, minaret parts and others have no explicit seed.
  - Because the crown swap changes the part count, every seedless part generated after the first swapped crown gets a different seed, so the Step 1 part-hash check will fail.
  - Fix: `dryRun` must advance a separate seed counter by the number of parts it would have created. New crown parts must take explicit seeds from `Rk`.
  - `dryRun` must also advance `B.props` as if the props were recorded. Otherwise removing about 4.7k fin props changes which later props pass `propBudget` (130k), if the budget is ever reached.
- **Refuge cuts on CROWNLIT towers add glowing bands.**
  - The crown wash is measured from the part's own top (`topY = P.a.y + P.b.z`, applied to the top 14 m; `buildings_wgsl.js:544, 1010–1017`).
  - Shortening the lower part moves that wash to just below each cut.
  - CROWNLIT is on 8% of hillside towers, 30% of CBD towers, half the modern Bund towers, and the Raffles and tip landmark towers. Each of these would show a lit band under every refuge floor.
  - Remove CROWNLIT from every part below a cut.
- **The overhang over each recess will be see-through.**
  - Bottom caps are dropped unless `FLAG.BOTTOM` is set (`vs`), and the pipeline culls back faces (`buildings.js`, `cullMode: 'back'`).
  - The upper part copies the original flags, which have no BOTTOM. The 3–6 m overhang above each recess would show through the tower to the sky.
  - Aerial poses rarely see this, but A3 and A1 look up at towers from water level and would.
  - Set BOTTOM on every upper part.
- **Landmarks are not excluded from the post-pass.**
  - These landmark towers all meet the candidate rule:
    - the two middle Raffles towers (`buildings_landmarks.js:458`, lean 0);
    - both tip towers (`:478`);
    - the 200 m `ridgeTower` shaft (`:493`, the pink-topped tower in A6).
  - So 55% of them get cut. A3's hero towers would change in ways the spec never mentions, with CROWNLIT bands and EDGE strips broken at each cut.
  - This is a design decision, not something that should happen by accident. Exclude landmark parts, for example by running the pass only over part ranges written by `gen*` lot generators.
- **`prof: 8` collides with the default branch of `prof()`.**
  - `prof()` falls through to `mix(1.0, taper, t)` using `c.z` (`buildings_wgsl.js:159–168`). Storing the slope in `c.z` would therefore also scale the top ring.
  - Profile 8 needs its own branch that returns a ring scale of 1, and the top-cap normal needs to come from the slope.
  - This is fixable, but the spec says `c.z` is "unused by this profile", which is wrong.
- **The fade matches emission only.**
  - On `MAT.GLASS` parents, the far look comes mostly from material terms in the G-buffer: `mid`, metal and roughness, which drive reflections.
  - A core that fades only its emission to `farE` will still differ from the facade in the lighting pass.
  - In practice the fade rarely matters at the target poses anyway. A 3 m band is 2 px only beyond about 1.9 km (about 1242 px per radian), so A6 and G1 see full dark bands. Whether those bands look good is the real question, and only the go/no-go answers it.
- **Cut placement edge cases.**
  - "Below its top" has no margin, so a cut can land a few metres under a `tower()` setback ledge and leave a thin sliver. Require at least 2 floors of clearance from the part's top.
  - In the flat CBD, `baseY` varies by at most 12 m, so cuts on neighbouring towers sit at nearly the same heights. This may read as skyline-wide striping in G1 and B3.
- **Tuning to the eval cameras.**
  - The code has no pose coordinates, which is good.
  - But the risk section says: "If a watched pose loses, lower the weight of the brightest new types". That is tuning weights on the outcome of the eval pose set, which EVAL.md forbids.
  - Any reweighting must be decided on held-out cameras before the eval is run, or it counts as a new candidate.
  - Choosing targets from pose visibility counts is fine.
- **The held-out cameras miss the districts that matter.**
  - H3 (West Hills) and H4 (Jiangbei) are both `URBAN` districts at medium density.
  - Neither tests the Yuzhong density problem above, the pavilion hat (Yuzhong only), or the CBD weights and close cuts that B4 will show.
  - A go result from H3 and H4 would not predict A6 or B4.
- **The bench stop rule is below the noise.**
  - "+0.03 ms average" is probably within the run-to-run noise of one 60 s laptop fly-through. The baseline has no repeat-run variance recorded.
  - Either run 3 alternating baseline/candidate pairs, or use a threshold that matches the real risk. With about 1.36 ms of headroom and a near-zero expected cost, +0.1 ms is still conservative.
- **GPU (no objection).**
  - Removing about 5.7k parts, about 4.7k of them tiny fin props, and adding about 2.35k mostly box parts lowers both `bld-cull` and triangle counts.
  - The 1.1k cut parts add about 70k triangles over both passes.
  - My estimate is −0.02 to +0.05 ms on the bench average, well inside the gate.

### What would make it stronger
- **Make the neighbour rule relative to density.**
  - No repeat of a distinctive type among the 6–8 nearest crowned towers, or within about 60–80 m.
  - Leave baseline types that are not being replaced (pagoda, spire) out of rejection, or count them without re-rolling them.
  - Give the pavilion its own type, separate from pagoda.
  - Before any capture, print the distinctive-crown share per district for the baseline and the candidate. Yuzhong must not fall below today's ~25%.
- **Resolve the A.2/A.4 contradiction.** Re-roll only former `lit` crowns, plus crowns that the neighbour rule rejects. Leave every other crown and its `roofDress` exactly as built with `R`.
- **Fix the seed counter and the prop budget in `dryRun`** as described above, so the part-hash check can actually pass.
- **For cuts:**
  - remove CROWNLIT below each cut;
  - set BOTTOM on the upper part;
  - exclude landmarks;
  - keep at least 2 floors of clearance from part tops and segment joins.
- **Replace A3 with B4 as a target,** or at least list B4, B3 and B1 as watched.
- **Add two held-out cameras:**
  - a Yuzhong mid-air view looking west or north, away from A6's frustum;
  - a CBD camera at 200–300 m altitude away from B4.
- **Decide fallback weights before the eval** from held-out results only, and remove the "lower the weights if a watched pose loses" rule.
- **Use a repeated A/B bench** with a stop threshold larger than the measured noise.
