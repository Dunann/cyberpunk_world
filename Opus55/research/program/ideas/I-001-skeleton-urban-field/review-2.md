## Reviewer 2 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 6 | The first idea in this program to change the layout itself. Splitting the ellipse into three roles (flattening, urban extent, grid and style) and growing the extent from water and infrastructure distance is a clean reframing. Growing a city along rivers and roads is a known procedural technique, so this is not a surprise to an expert. |
| Feasibility and credibility | 4 | The diagnosis is right and the code paths are real: `_buildLots` skips cells below an ellipse weight of 0.55, and `bakeNear`, `groundShade`, `roadMask` and `lampValid` all read `info.z`. But checking the plan against the code turns up several faults that would show on the target poses. The owner rule assigns land across rivers. The ground paint and forest removal follow the field, not the lots. The height cap is ambiguous and, read as written, collapses the infill to minimum-height podiums. The first lot loop is not actually left untouched. Shop lights, traffic and crowds are re-rolled across the whole city. The quick test does not exercise any of these risks. |
| Expected impact | 7 | It answers user priority 3 and the critics' third-biggest problem directly. Zone G is the lowest zone (5.12). Dark forest fills about half of B3 and a large part of G3, so wins there are plausible. Even a failure would tell the program whether "city to the water" beats "parks" (I-003). |
| **Overall (average)** | **5.67** | |

### Strongest reason it will fail
The spec forecasts only the three target poses, but the field changes many more, and some of those changes are likely losses. The band weight (0.75 × band) is written into `info.z` over every bank in the core within about 250 m of water. `bakeNear` then paves the base colour and removes forest wherever `info.z > 0.35`, with no slope test and whether or not a lot was built (terrainGen.js lines 156–167). On steep banks the lot test (`gMax − gMin ≤ 14`) rejects the cells, so they become bare grey slopes with no trees, no lots and no streets. These sites are in the frame of non-target poses.
- **G4:** the treed peninsula hillside on the left of the frame, at about (−1150, 420), has field weight 0.75. The right-hand foreground bank is owned by Yuzhong, across the river, so it gets hillside-type infill at close range.
- **A1 and A2:** the Hongyadong cliff top and the trees on the right of both frames sit at (240, −140), which has ellipse weight 0.30 and field weight 0.75. The `stilts` landmark has `r: 0`, so `_isReserved` does not protect it.
- **A3:** the peninsula-tip mound and the east-bank point.
- **A6 and G1:** the edges of the frame.

The spec says "no change intended" at A1, A2 and A6, and calls G1, A3 and G4 "likely gains" without examining them. Under the adoption rule, one clear loss blocks adoption. G4 is the most exposed pose: a bare, deforested hillside next to the cable car would be judged worse than the current treed slope.

### Other concerns
- **The owner rule crosses rivers.** The fallback "argmin e_i" uses distances normalised by ellipse size, so the big Yuzhong ellipse wins far from its own bank. I computed it for the CPU formula. On the south bank of the Great River, from x = −1200 to 400, the strip 20–50 m from the water is owned by Yuzhong and the land behind it by Nan'an. Ovoo Hill (590, −300) and the south bank at (−300, 700) are also owned by Yuzhong. This creates three problems:
  - The waterfront row gets the Chongqing hillside style and grid on the Nan'an side.
  - A seam runs along the promenade, which is the G2 and G3 foreground.
  - The two grids at that seam are 0.52 rad apart (Yuzhong 0.32, Nan'an −0.2). The spec's claim that neighbouring grids differ by at most 0.18 rad leaves out exactly these two districts and West Hills (0.5).
- **District ids are interpolated at the seams.** `worldInfo` samples the info map with a linear sampler (`sampClamp`), so along a 1↔5 owner seam the 6 m texels blend to ids 2–4, and slivers of Bund, Steppe or Jiangbei road layout get painted. Existing seams have the same problem, but this idea creates many new seams in close-up foregrounds.
- **The height cap is ambiguous, and as written it flattens the infill.** `L.maxTop` is an absolute Y in every generator (and in `prepareLots`). The bank rises 6 m at 10 m inland and 20–28 m at 100 m inland. So the absolute rule `12 + 0.18·waterDist` leaves 2–10 m above ground in the first 100 m. Multiplying by `0.6 + 0.4·tod` then pushes the cap below the ground away from stations, so almost every infill lot falls to the generators' minimum heights (6–12 m podiums). The "connecting ridges" and "peaks at stations" would not appear. If the cap is meant relative to the ground, the G2 numbers change: roofs reach up to 49 m above ground next to the G2 camera (a metro station is in G2's bottom-left, so `tod` is about 1 there), 16 m below the camera. The spec must say which it means.
- **G2 may be a loss, not a win.** With a cap relative to the ground, roofs at 100 m from the water (about 54 m absolute) cross the sight line from the camera (y = 90, 207 m inland) to the near water edge, which is about 44 m high at that point. They would hide the near bank and its reflections, the "transition" the pose is named for. The foreground becomes close-up boxy roofs, which is criticism #4, in place of blob trees, which is criticism #6. I rate G2 a coin flip. So the 2-of-3 target rule depends on B3 and G3 both winning.
- **Tuning to the eval cameras.** The spec admits that the waterfront plane is this low because of the G2 camera. Step 9 ("if a camera is within 10 m of a building, change the zoning rule globally") chooses global parameters by checking the fixed cameras. That is parameter selection on the eval set, even though the code holds no pose coordinates. Fix the zoning rule from first principles, in writing, before any capture, and accept what happens at G2. Note that `prepareLots` protects only the 10 in-game `POSES`. G2, G3, B3, A1–A3, A6 and B2 are not among them.
- **The "untouched" first lot loop is not untouched.** Step 1 redefines `World.districtAt` to return the field weight, and the first loop of `_buildLots` tests `districtAt(...).weight < 0.55`. As written, band cells would pass in the first loop and draw from `rng(1234)`, which re-rolls every later lot in the city. The first loop must call an ellipse-only function.
- **City-wide re-rolls that the spec does not mention:**
  - **Shop lights:** `buildings.js` shuffles about one priority-1 shop light per lot (≈2900, against a budget of 1450) with `rng(4242)`, a Fisher–Yates shuffle from the end. Adding about 700 lights changes the array length, so the whole selection is re-rolled. Existing districts also lose about 20% of their share. A4 (the best-mood pose) and B2 would visibly change.
  - **Crowds:** the crowd stream `R` runs across the traffic runs in order. The extended grid lines insert new runs in the middle of the order, so people near the A4, B1 and B2 cameras are re-rolled.
  - **Cars:** the same applies to car placement. B2's "giant purple box" foreground vehicle could appear or move at random.
  - **Signs:** the spec admits sign-light movement but proposes no fix.
- **Ground paint does not match the lots.**
  - The lot cap (700) and the slope test remove lots, but the field still paints streets, places lamps and clears forest on those cells.
  - Every inland edge of the infill (band 0.21–0.73) is painted and cleared but never built on.
  - These leftover areas become empty paved grids, the "huge empty flat plaza" that the critics already flag at burst-u12.
  - The spec never says how many cells qualify before the cap. At today's density (about 300 lots per km²), 3.5 km² would give about 1050, so about a third of the new area would be empty paving.
- **The GPU estimate is plausible for the gate but undercounted.** The gate has room: even +0.6 ms would leave the fly-through near 10.3 ms. But the +0.15–0.25 ms average leaves out four things:
  - The city ground branch of `groundShade` (road layout, puddles, two `lampValid` texture lookups per pixel) now runs over 3.5 km² that was forest. The spec's own B3 data shows that city ground is expensive: B3's gbuffer time goes up when buildings are hidden.
  - Real street-lamp lights and shop lights move into the near foreground of G2 and of the low fly-through legs, where each light covers more screen tiles. The fly-through passes over the south bank at about 60 m above ground (keyframes (600, 160, 1300) → (420, 80, 650) → (260, 70, 120)) and along the Bund at 25–30 m.
  - Car headlights (forward pass p99 is already 1.38 ms) and crowd compute on the new runs.
  - The props budget rises from 130k to 160k.

  My estimate is +0.3 to +0.6 ms on the average, which takes a third to half of the headroom that I-002, I-003, I-014 and I-015 also need.
- **The quick test cannot fail on the real risks.** It is CPU-only, with "no shader changes", so it shows lots standing in the forest. It does not test forest removal, painted empty blocks, seams or owner errors, and it measures GPU time only at G2 and G3, not on the fly-through. Yet changing `GEN_INFO` is about 30 lines.
- **The targets depend on I-003.** The G2 foreground and the B3 foreground are exactly I-003's Lantern Park and Silk Road Garden. If I-003 is adopted first, this idea "leaves those sites alone" and loses most of its G2 and B3 change.

### What would make it stronger
1. **Gate the ground on the lots, not the field.** After the lot pass, write a lot-coverage mask (each lot's footprint plus its half-street), the same way `gardenReserve` stamps a mask. Have `bakeNear`, `groundShade`, `roadMask`, lamps and street trees use the field weight only where the mask is set. Rejected cells (steep, capped, seam) keep their natural ground and forest. That removes the bare grey slopes at G4, A1, A2 and A3, and the empty paved blocks.
2. **Replace "argmin e_i" with a nearest-district rule that stays on the same bank.** For example, the owner is the nearest district reachable without crossing water (sample the water distance along the segment to the district's centre), or each band segment is assigned to a named bank side. Then recompute the seam map and the grid-angle claim, including the Yuzhong/Nan'an pair. Bake the owner as a nearest-sampled id, or snap ids at the seams.
3. **Define the cap relative to the ground** (`maxTop = gMax + cap`). Apply the station factor so it never drops below a minimum (for example `max(cap·(0.6 + 0.4·tod), 12)`). Fix the numbers from a stated rule (for example a 1:4 view plane from the opposite promenade) and never revisit them after looking at the eval captures. Then forecast G2 honestly, including whether the near bank stays visible.
4. **Keep every existing stream byte-identical:**
   - the first lot loop calls the old ellipse weight;
   - infill shop lights get their own pool and budget, added after the existing selection;
   - new traffic and crowd runs are appended after all existing runs, with their own streams;
   - new sign slots and sign lights get their own budget.

   Then the claim "A1, A2, A4, A5, B1, B2, B4 identical" becomes testable. Diff the images pixel by pixel against the baseline before hand-off.
5. **Protect Hongyadong.** Give the `stilts` site a real reserve (a landmark radius, or an exclusion of the field along the cliff). The stilt complex is the user's priority 2 and I-015's subject, and this idea should not touch it.
6. **Make the quick test exercise the risk.** Include the `GEN_INFO` change. Capture G2, G3, B3 and G4 plus two off-pose cameras. Print the number of qualifying cells before the cap, and the area that is painted but not built on. Run `bench.mjs` (the fly-through), not only `--stats` at two poses.
7. **Forecast every changed pose.** List G4, A3, A1, A2, A6 and G1 with the expected change and the loss risk, and decide the I-003 split before building, not after.

---
Note for the coordinator: a `grep` I ran over the idea folder for the word "light" accidentally printed three lines of review-1.md (its feasibility and impact rows and one bullet). I did not open the file. Every finding above was checked against the code or the images myself.
