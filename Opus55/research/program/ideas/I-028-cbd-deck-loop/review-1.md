## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 5 | A deck network one storey above the traffic is a standard real-city and game move (Lujiazui, Central, La Défense, many cyberpunk games). The loop-and-cross plan, the roof tier and the separately gated sky ring are a sensible package. It is new to this program, but its sibling I-027 tests the same family, and Stage 2 is I-019's tower links at a lower height. |
| Feasibility and credibility | 4 | It is cheap on the GPU and can be built. But the numbers it is sold on do not hold up against the code. B2 coverage is about 1%, not 8–15%. Metro Line 6 runs diagonally through the site, and its lot reserve removes the north-west corner and most of the cross. The tree rule narrows or drops decks for street trees that the lot mask already removed. The "no sign light" claim is false for the sign request path as written. Stage 2 cannot form a ring. |
| Expected impact | 4 | On the eval poses the visible change is small. At B2 it is a ~300 × 130 px band around the vanishing point, and at B4 Stage 2 adds well under 1%. B2's critic complaints are about the near field (the foreground car, the curtain wall, flat storefronts), and the deck does not reach the near field. If it is adopted, it would probably be adopted on the idea's own held-out cameras, so the critic score (the goal) would barely move. Learning value is moderate: H10 is a real test of whether decks read as attached or as a lid. Priority 7 is answered in name. |
| **Overall (average)** | **4.33** | |

### Strongest reason it will fail
**The deck is too far from every eval camera to matter, and the site rule was never checked against the real lots.**

**Coverage at B2.**
- **The camera.** B2 stands at the centre of the x = 3050 / z = −1000 intersection (`poses-v1.json`; the grid lines are at 3300 + 125k and −1250 + 125k, from `districtRoad`). The vertical field of view is 1.05 rad (`controls.js`), so the focal length is 1242 px at 2560 × 1440 (310 px at 640 × 360). The pitch is about 4.8° up.
- **The distances.** The nearest new geometry is the south span of the south-west junction, 105–112 m ahead. The decks start at 138 m.
- **Size on screen.** At 108 m, a 26.6 m span with a 1.2 m girder and a 1.1 m balustrade (8.45–11.1 m) projects to about 306 × 31 px. A 6 m deck at 7–9 m above the eye, seen from 125–625 m, converges into thin wedges. Its soffit and fascia come to about 3k px per side at 2560 × 1440.
- **The upper bound.** I rasterised every Stage-1 piece on B2's avenue as boxes at 640 × 360, with no occluders at all. The pieces were decks and balustrades on both faces of four blocks, columns every 15 m, five junctions of spans and corner plazas, two lift towers, five escalators, and both roof bridges across x = 3050 at 16–19 m. The result is **1.1–1.4%** of the frame for podium insets of 4–8 m: decks and columns 0.27%, spans and plazas +0.6%, lifts and escalators +0.2%, roof bridges +0.25%.
- **The real number.** The metro gap (below) removes one of the four blocks, and cars, lamps and fog hide more. The real green share is about 1%.

**What follows from that.**
- **B2 misses the spec's own 2.0% target rule.**
- **The claimed gains are not credible.** The "+0.8 to +1.5 on B2" claim rests on 8–15%. Earlier ideas that changed about 1–2% of a frame got ties (I-002 was rejected for "about 2% of each target frame changes").
- **The change sits at the focal point.** It is a stack of five thin lit bars across the bases of the hero towers at the vanishing point (about x 1100–1460, y 730–860 at 2560 × 1440). A judge could just as well read that as clutter in the one spot that composes the frame.
- **The spec broke the program's own rule.** The LOG says coverage must be measured with occlusion before proposing (2026-11-24, line 31). This spec gives only an unmeasured guess.

### Other concerns
- **Metro Line 6 runs through the site, and the spec never mentions it.** The route (`ROUTES[1]`, clearance 24 m, Catmull-Rom through (2700, −1620), (3350, −1450) and (3950, −900)) crosses:
  - x = 3050 at z ≈ −1565, which is B2's avenue;
  - x = 3300 at z ≈ −1477;
  - z = −1375 at x ≈ 3458;
  - x = 3550 at z ≈ −1298.

  `_isReserved` drops every CBD lot whose centre is within 12 + 49.5 m of the route. Together with the twist (119.5 m) and crown (124.5 m) reserves, the lot cells around the site come out as follows (my replay of the reserve test on block centres):
  - **West side x = 3050:** the block from −1500 to −1625 has no lots on either side. The loop's north-west corner has 1 of its 4 corner lots, so it gets no roof tier and no lift plaza.
  - **East side x = 3550:** the outer (east) faces have a lot in only 1 of 4 blocks (the others are metro or crown reserve). The inner face at −1312 is also metro reserve.
  - **Cross arms:** about 5 of 16 faces have a host podium (twist reserve plus metro). The "cross" will barely exist, and H11 looks along an arm with one decked face.
  - **North side z = −1625:** two of the four south-face lots are missing.

  So "about 4.5 km of deck faces" and "one legible loop and cross from the air" are both overstated, and the spec has no rule for the gaps. It also has no rule for the 24 m viaduct itself: there are piers every 30 m (`i % 5`) in the open band, a girder bottom at about +20.8 m that roof bridges at 12–24 m can hit, and possibly a station. The overlap audit would find these clashes but gives no way to resolve them.
- **The street-tree rule removes decks for trees that are not there.**
  - **The replay.** I replayed rng(99). In the CBD, five of the six network lines are "tree-lined": z = −1625, −1375 and −1125, and x = 3050 and 3300. Only x = 3550 is not.
  - **The mask.** `buildMask` stamps every lot with a 2 m pad on 6 m texels, so it covers the sidewalk out to 11 m from the grid line. Street trees stand at 11.9 m, so most CBD street trees are filtered out. B2 shows none along x = 3050.
  - **The effect.** Moving the outer edge to 15.5 m leaves widths of `ins − 2.2` = 1.8–5.8 m. That drops about 30% of faces (`ins` < 5.2) on exactly the avenues that matter. It also contradicts the fixed 26.6 m span length; those spans would have to be 31 m.
  - **The fix.** Test the final kept tree list (or the mask), not the avenue choice. Note too that a kept broadleaf tree at scale 0.74 reaches about 9.2 m, plus its leaf cards, which touches a 9 m soffit.
- **"No sign light" is not what the code does.** `placeSigns` adds a light for every requested sign over 3 m² (`addLight(..., 1e5)`), at the highest priority. `selectLights` takes the highest priority first, and the 2,150 sign-light budget is binding (I-016 code review: 2,150 used). So each new lightbox over 3 m² evicts one existing sign light somewhere in the city. The spec should cap each sign at 3 m² or add a `noLight` flag to the requests, and assert that the sign-light list is identical. The new rows also land in the city's group-0 sign cells; giving them their own group, as I-016 did for infill, keeps those cells identical.
- **Stage 2 cannot make a ring, and it lands in B2's sky.**
  - **North and south sides.** CBD lots are never split in z (`nz = 1`), so across the east–west roads (z = −1125 and −1625) the tower faces are 56–85 m apart. Single towers have `hd` ≤ 34.5 m and two-tower lots `hd` ≤ 24.4 m with ±5 m offsets. The 60 m cap therefore removes almost every north and south candidate.
  - **East side.** Across x = 3550 the east lots are mostly reserved.
  - **What is left.** The likely result is a few east–west corridors across x = 3050. That is B2's avenue, and at 112–120 m they enter B2's frame from about 165 m out. At 250 m a 50 m corridor projects to about 250 × 40 px at y ≈ 275, which is the open sky slot above the vanishing point.
  - **The gate misses it.** Stage 2's gate tests H12, H10 and B1, but not B2.
  - **B4.** Stage 2 is not a plausible B4 target: about 0.07% per corridor at 500 m. This is I-019's lesson again.
- **Stage 2 colliders: the spec is unclear.** Item 8 says all collider tops are ≤ 120 m and that "the lowest corridor is at 150 m". In `cbdCorridors` the lowest band is 165 ± 10, so a collider is ignored only if its top is below 130 m (absolute). A corridor whose floor is at 120 m above ground, which is 8 m tall, on ground at about 8 m, tops out at about 136 m. That would shift rng(555) (aircraft in B4). State that corridors get no colliders, or that their absolute top stays below 129 m.
- **Small factual errors.**
  - The south-east loop corner (3550, −1125) is 245 m from `twin`, and its corner plaza is about 232 m away, so "nothing within 250 m of twin" is false. The Stage 2 exclusion is fine.
  - H10's coordinates are the intersection centre, not "on the sidewalk". At H10 the north-east corner has 2 of its 4 lots, because the crown reserve takes the east pair.
  - "Identity: the same list as I-027 step 2" should be written out, since I-027 may change.
- **The loop size gives B2 its avenue.** With H ± 125 m the west side would be x = 3175, and with ± 375 m it would be x = 2925. Only ± 250 m puts it on x = 3050. Given the 1% result this does little harm, but the spec should not claim the choice was independent of the camera.
- **What checks out.**
  - Parts are built outside `B.part`, so the index seeds in `buildings_gen.js` are safe.
  - The `cbdPods` and `cbdTowers` pushes draw no randoms.
  - Crowd blocking (bottom < ground + 2) and car blocking (< ground + 4) ignore 9 m deck colliders.
  - The sign-light budget `min(2150, 8192 − count − 64)` stays at 2,150 with 64 more lights: the total is about 5.2k.
  - Crowd modes 1 and 2 already carry a y value, so people can stand on decks.
  - The GPU estimate (+0.05–0.15 ms) is plausible for about 60k static triangles and 64 small lights.
  - New deck colliders will also shelter rain near the camera (`rain._occluders`), which is a small bonus.

### What would make it stronger
1. **Measure before re-proposing.** Run the green-mask coverage with occluders at the 14 poses and H10–H12, using the real lots, and replace the 8–15% guess with the measured figure.
2. **Bring the deck into an eval camera's near field with a district rule, not a camera rule.**
   - **The rule.** For example: every CBD podium face whose lot centre is within the district core (`distFromCenter` < 0.45), or every face of a block that touches a network road.
   - **Why.** B2's own block (z −1013 to −1112, 17–100 m from the lens) would then carry columns, a lit soffit and entrance bays in the part of the frame the critics scored down, with B2 coverage likely 5–10%.
   - **The cost.** The triangles are cheap: the budget allows 2–3× the deck length.
3. **Make Metro Line 6 the spine, not an obstacle.**
   - Detect the reserve band.
   - Bridge it with spans or a deck that runs under the viaduct (+10 under +24, with the roof tier above, gives four real levels).
   - Tie stairs or lifts to the metro station if one falls in the CBD.
   - Give an explicit rule for lots that are missing (deck continues as a free-standing walkway on columns, or the face is dropped and both ends get a stair).
   - Keep roof bridges clear of the girder by at least 3 m.
4. **Fix the tree rule** to use the kept street trees. Fix the sign path with a 3 m² cap or a `noLight` flag, and assert that the sign-light list is identical.
5. **Stage 2.** Drop the "ring" claim, or allow north–south corridors only where gaps permit. Add B2 to Stage 2's judged poses. Make the corridors non-colliding, or cap their absolute top below 129 m.
6. **Run the H10 lit-against-unlit A/B as planned, and add a "deck present against absent" pair at B2 itself** at 2560 × 1440. If a fresh judge cannot see the difference at B2, the target claim should be dropped before the full build.
