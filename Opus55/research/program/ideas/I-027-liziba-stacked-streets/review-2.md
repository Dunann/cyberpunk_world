## Reviewer 2 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 6 | It is the first idea in the program about pedestrian circulation. Designing one connected network (galleries, two bridge tiers, stair and lift towers, station exits, a crossing over the trains) is a real step beyond the scattered `skybridges()` and `walkways()`, and it answers user priority 7 directly. But galleries and bridges across streets are a standard procedural-city move, and the code already has two versions of it. |
| Feasibility and credibility | 5 | The world rules are clean, and the identity, rng and GPU plans are mostly right when checked against the code. But several steps conflict with the code or with the spec's own rules. (1) The sign-slot split rule cuts the gallery at almost every blade sign. (2) The A5 pier repeats a column that already exists, and the spec's own 60 m camera clearance forbids the pier and crossing on A5's side. (3) Mode-1 pacers have a single fixed height, so people on stairs and stepped bridges would float. (4) Requested signs larger than 3 m² automatically add sign lights with priority 1e5. (5) The spec never says how the "continuous" gallery crosses the 4 m alleys and the cross streets. (6) It assumes box towers for the upper tier. |
| Expected impact | 5 | The eval poses barely see the change. A4's part of the site starts 128 m ahead of the camera, so even the best window is about 1% of the frame, below the spec's own 2.0% target rule. A5 sees only the ends of the exit bridges beside the tower, about 1.5–2.5%. Most likely the idea is judged on A5 alone or on the fallback held-out cameras, and the critic zone mean barely moves (the spec's +0.2 to +0.4 is not credible). What saves the score: H7 is a good street-level test of the user's priority 7, so the program learns something either way. |
| **Overall (average)** | **5.33** | |

### Strongest reason it will fail
**The two poses the spec counts on barely see the quarter. A4, the best-liked pose, becomes a watched pose that can lose and cannot win.**

Measurements, using the camera's real focal length (`fov: 1.05` rad vertical, so f = 720 / tan(0.525) ≈ 1242 px at 2560x1440; this reproduces the Liziba tower's edges in A5 at x ≈ 804 and 1707, against 800 and 1700 in the I-016m image):

- **A4.**
  - **Geometry.** A4's line passes 56 m from the station (confirmed), so the 400 m catchment starts 128 m ahead of the camera.
  - **Street width.** Yuzhong's road is 11 m with 3 m sidewalks, and podium faces sit 0.5 m inside the lot, so face to face is 18 m. At 130 m the whole street canyon is about 170 px wide.
  - **Coverage.** Take the most favourable window (130–450 m):
    - galleries on both faces: about 3k px in total (the near-side one is almost edge-on, directly above the camera's line of sight);
    - 11 lower bridges (18 m × about 2.5 m visible): about 13k px;
    - a similar upper tier: about 13k px.

    That is about 30–35k px, or **0.8–1.0% of the frame before occlusion**. The existing blade signs and the sign cluster at the vanishing point hide part of it.
  - **People.** The crowd mesh distance is 210 m at q2 (`crowd.js` line 606). Deck people beyond that are invisible except for LED-umbrella glints.
  - **Shimmer.** The 0.08 m LED handrail is 0.2–0.75 px wide at these distances, so it shimmers anyway. The "0.08 m so it does not shimmer" rule does not hold here.
  - **Result.** A4 cannot reach 2.0%. Yet it still changes exactly where its neon cluster and the pink and cyan skybridges are, and those are what the judges defended in I-018. It is therefore a watched pose with downside only.
- **A5.**
  - **The A5 camera is itself an app viewpoint** (`POSES[3]`, "Monorail station"). The spec's "nothing new within 60 m of any app viewpoint camera" therefore removes:
    - **the A5-side approach pier**, which is 31 m from the camera;
    - **the A5-side guideway crossing**, which needs a landing at least 94 m from the station centre (70 m beyond the tower end). That is within 60 m of the camera or behind it. The far-side crossing is hidden by the tower.
  - **The south exit sits at the 60 m edge.** At X = 0 on the long face it is 60.5 m from the camera. A 3 m-wide bridge has to sit at X ≤ −1.5.
  - **How much of each exit shows.** Reconstructed from the camera pose and `buildLizibaTower`:
    - the south exit appears left of the tower silhouette only after its first 3.2 m;
    - the north exit appears right of it only after its first 15 m;
    - both sit at about 55–75 m depth, at platform height, about 60–80 px tall.
  - **Coverage.** About 1.5–2.5% in total, depending on which landing branch fires: terrain, a tower face, or a stair and lift tower. Only the stair and lift tower branch puts geometry into the dark lower-left that the critics named.
  - **What it does not fix.** Nothing in the spec reaches the critics' "black void below the guideway" (the lower right of A5).

So the likely outcome is one of two cases:
- **A5 is the only target.** Adoption then needs 1/1 on one pose. Judges in this program have split on single poses repeatedly (I-014, I-018).
- **No target passes 2%.** The idea then falls back to H7–H9. A win there would serve the user, but it moves the critic score (the GOAL metric) by almost nothing.

### Other concerns
- **The sign-slot split rule cuts the gallery to pieces.**
  - **Blade height.** In `lotSigns` (hillside street faces), blades are placed every 4.6 m × (0.7–1.3), with 85% probability, plus a second blade on 50% of positions. Their height is capped at `top = topAt − 0.4`, so most blades end exactly 0.4 m below the podium top.
  - **Blade reach.** The blade mesh projects 0.5 + w (w = 0.8–2.2 m) from the wall (`signPlace.js`, `sl.vertical`), so it lies under the 2.5 m cantilever.
  - **The clash.** With "deck top = the strip top" and a 0.35 m slab, the gap between slab bottom and blade top is 0.05 m. Almost every blade is within 0.3 m, so the gallery is split every 3–5 m. The "10% or less lost" target is not reachable; the true loss is more like 20–40%, and what remains reads as separate balconies.
  - **Fix.** Set the slab bottom at the strip top (deck on the roof, 0.4 m clear of every blade). Treat blades that end under the deck as "hanging from the gallery", which is the Hong Kong look. Split only where a real sign mesh box intersects the deck.
  - **New hanging signs.** The new "hanging signs under the gallery fascias" sit in the same band as the outer ends of the existing blades (0.5–2.7 m out). They must be placed only in gaps between those blades.
- **The A5 pier repeats an existing column.**
  - **What exists.** `buildLizibaTower` already builds a tapered column with a cap at HX + 3 = 27 m from the centre on both ends (when the ground there is more than 2 m below the beam).
  - **Where the gap is.** It lies between that column and the first regular pillar. `inStation` skips samples within 38 m (stationLen 72 / 2 + 2), and pillars stand only at `i % 4 == 0`, so the first pillar is at 42–60 m.
  - **The spec's pier.** "The first sample more than 27 m" is the 30 m sample, 3 m from the existing column. The new pier should go at the middle of the 27 m to first-pillar gap.
  - **The clearance problem remains.** On A5's side it is still inside the 60 m clearance.
- **People float on stairs and stepped bridges.**
  - **Why.** Mode 1 agents have one fixed `b.y` (`agentState`), and mode 0 walkers always follow the terrain.
  - **Where.** A pacer whose segment crosses a gallery stair, or a 1–7 m stepped bridge, hovers or sinks. That is exactly the "detached" defect of user priority 2.
  - **Fix.** Pacers only on flat stretches, segment length at most the flat length minus 1 m, and none on stepped bridges. People who stand still may stand on landings.
- **Requested signs add sign lights automatically.** `signPlace.js` line 315 runs `if (w * h > 3) addLight(..., 1e5)`. These candidates enter the city's `selectLights` with the highest priority and use up the 3-per-20 m cell slots. The result is that existing sign lights near the site move. Either keep every new sign under 3 m², or add a `noLight` field to requests. The assertion alone would only catch the problem late.
- **The gallery is not continuous across alleys and cross streets.**
  - **Where the breaks fall.** Hillside lots are 25.5 m with 4 m alleys between them, and blocks are 72 m with 17 m cross streets. Neighbouring podium tops differ by up to 6 m from `podH` alone (6, 9 or 12 m, drawn per lot) plus the slope.
  - **What is missing.** The spec does not say whether a gallery bridges an alley, steps across it, or ends.
  - **Why it matters.** Without a rule, the "street above the street" is a row of lot-length decks at random heights.
  - **Fix.** Specify alley bridges (flat at 1 m or less, stepped up to 4 m, otherwise end with a stair tower), and report the longest continuous walkable run.
- **The upper tier assumes box towers.** About 30% of hillside towers are rounded or kind 1 (`shapeR < 0.3`), 35% have setbacks, two-tower lots have a 4 m gap between shafts, and 20% of lots are stacked low blocks with random insets and no `hillTowers` entry. A 2.2 m straight deck at podium top + 12 m leaves gaps at rounded corners and runs across window bays. Restrict the upper tier to box towers (kind 0, prm 0) whose face is within 3.5 m of the podium face, and report its coverage.
- **The exit that lands on terrain lands in forest.** A5's right side is forest at about platform height. Vegetation clears only a 50 × 50 m stamp around the station (`vegetation.js` line 387), so a terrain landing up to 60 m out ends among trees, with no path. That reads as a bridge to nowhere, and nothing stops trees intersecting it. Either clear a landing pad in the vegetation stamps (no random draws) and give it a path, steps and a lamp, or drop the terrain branch.
- **Street lamps sit next to the gallery edge.** Lamps stand at `road/2 + 0.7` = 6.2 m from the road centre, alternating sides about every 36 m, with heads at 6.9–7.1 m. The gallery's outer edge is at 6.5 m, at 5.65 m or more above the sidewalk. Lamp heads will graze the fascia on low podiums (podH 6). Add `terrainLamps` positions to the overlap audit, which today lists only parts and props.
- **Module order is not specified.**
  - **What the layout needs.** `world.shared.lizibaTower` exists only after `Transit.init`. The new colliders must exist before `Cars` and `Crowd` init (and must not matter to `Air`), and the new lights should come after every existing light.
  - **The problem.** These cannot all hold unless the layout runs inside `traffic` between parts. Adding the lights "after every existing light" then means after `lightshow` as well.
  - **Fix.** State where `layered.js` runs. Prove the order of the light list, not only its content.
- **Smaller points.**
  - "One covered footbridge … 70 m or more from each tower end" is ambiguous between one crossing and two.
  - A 6 m terrace step at 35° needs 8.6 m of run, which is longer than a 6.4 m strip (n = 4). Say what happens then.
  - `TILE_MAX = 256` per tile: check the maximum tile light count at H7 and A4 with the 48 new lights, since an overflowing tile drops lights in an unpredictable order.
  - The cost (3.5 implementer days) is large for an eval effect this small.
- **Checked and correct.**
  - The A4 geometry (56 m, a 128–920 m window).
  - A5 looking at the end face from 34–41 m.
  - The parts list is untouched (`deckKit` is a mesh, so the index-seeded `(count × 7.31) % 997` parts and the I-016 infill after `walkways()` are safe).
  - Colliders with bottoms 4.5 m or more above the ground do not trigger the car rule (`k.cy − k.hy < g + 4`) or the crowd rule (`< h + 2`).
  - `cbdCorridors` only looks at the CBD.
  - The sign budget `min(2150, 8192 − count − 64)` does not bind, so the 48 lights do not change it.
  - The GPU estimate (+0.04 to +0.12 ms, 40–70k triangles, frustum skip) is plausible, with about 1.2 ms of headroom.

### What would make it stronger
- **Move the judged view to where the network is, by rule.**
  - Accept that A4 and A5 are watched poses and make H7–H9 the primary judged set from the start, with two judges and an X/Y order swap each. Add a fourth rule-placed camera (H10, a street-level view under the stair and lift tower).
  - Then state honestly that the critic zone mean will not move much, and argue the case on priority 7.
  - Alternatively, apply the kit by a district-wide rule (the N steepest street runs in Yuzhong), not only inside the 400 m catchment. If A4's own street qualifies in its first 130 m, it becomes a legitimate target without tuning to the pose.
- **Make the A5 change real.**
  - Drop the A5-side pier and crossing (they are blocked by the clearance rule and the existing column).
  - Always use the stair and lift tower ending on the downhill (south) side, 12–20 m out. That puts a lit, grounded vertical in A5's dark lower-left quarter, at about 480 × 90 px.
  - Re-measure A5 coverage with the clearance rule applied before claiming A5 as a target.
- **Fix the deck and blade interface** as described above (deck on the roof, blades hang under it). The interface becomes a strength, signs hanging from galleries, instead of a reason to cut the gallery.
- **Grounding first (priority 2).**
  - Brackets every 6 m are not enough for a 2.5 m cantilever seen from below. Add a visible column under every bridge landing to the sidewalk (outside the lamp line).
  - Make the soffit light pools mandatory at every bridge, and show one close capture (30–60 m) of a cantilever joint and a stepped bridge in the quick test.
- **Thin lines.** At street distances of 130 m and more, handrails should be at least 0.15 m and LED rails at most as bright as the existing walkway rails (`param 3`). Otherwise the bridges become rows of sub-pixel glowing lines that change between frames.
