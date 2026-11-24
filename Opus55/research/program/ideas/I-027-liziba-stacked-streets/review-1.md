## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 6 | This is the first idea in the program about pedestrian circulation. It treats the street quarter as one designed network (two gallery tiers, stepped bridges, alley stairs, a public lift, station exits), and it answers the user's priority 7 directly. But stacked walkways are the standard cyberpunk-city move, the code already has 320 skybridges and the podium walkways, and the kit is the obvious answer to the user's own wording. |
| Feasibility and credibility | 4 | The stream and identity plan is good: a separate mesh, data-only pushes, new crowd and light pools appended last, colliders above ground + 4 m. But the site analysis behind the expected targets is wrong in the code. (1) No run can be chosen on A4's axis, so A4 cannot be a target and H9 is undefined. (2) The 60 m camera clearance deletes most of what A5 would see. (3) The approach pier lands 3 m from an existing column. (4) The sign-split rule cuts the gallery every few metres. (5) Street lamps and trees are left out of the overlap audit. Details below. |
| Expected impact | 5 | If the kit works, it is reusable (I-028 shares it) and it is exactly what the user asked for. On the frozen metric, though, the only eval pose that can change is A5. There, the main new element is a covered footbridge seen edge-on at eye level, plus at most a lift tower. The named A5 defects (no piers near the camera, black void) are mostly not addressed. At best that is about +0.1 on the zone A mean, far below the claimed +0.2 to +0.4. A failure would teach little about the street-level "3D feeling", because no eval pose looks down a chosen run. |
| **Overall (average)** | **5.0** | |

### Strongest reason it will fail
**The street quarter is built where no eval pose can see it, and the rules remove most of what A5 would see.**

**A4 cannot be a target.** The station sits on the north edge of the Yuzhong district. In grid coordinates (angle 0.32), the station is at qx −480, qz −494. Blocks are built only where the block centre has district weight ≥ 0.55, which is ellipse e ≤ 0.85 (`_buildLots`, `districtWeight`). At qx ≈ −468 the last built block row is centred at qz −468, with its inner edge at −496. The next row (−540) has e = 0.95 and is not built. So the whole half of the catchment north of the guideway has no lots. It is the forest on the right of A5.

Every road line on A4's axis (it runs along qz) is cut by the catchment circle symmetrically about qz −494. So at most about half of its clipped length has podiums, and less after the station keep-out (lot centres ≥ 58–73 m from the station) and the route keep-out (≥ 25–40 m from the guideway). For A4's own line (qx −432, 48 m from the station), about 340 of 794 m have lots: 43%, below the spec's 60% "both sides" rule. No line on that axis can pass. The consequences:
- "the best run on each axis" picks nothing on one axis;
- all three runs are on the qx axis, about 10° off the track, which repeats I-019's "all on one axis" failure;
- H9 does not exist;
- A4 sees only cross streets, end-on, through 17 m openings at 170–400 m.

The spec's "window can fall anywhere from 130 m to about 900 m" is also wrong: there are no lots beyond about 470 m.

**At A5 the clearance rule removes most of the change.** "Nothing new within 60 m of any app viewpoint camera (`POSES`)" includes the A5 camera itself (`POSES[3]`). That camera is at local X = +60 m, Z = −9 m from the station centre, 37 m from the east end face, and 13 m from the centre line of A4's road (which passes under the guideway about 21 m east of the tower).
- **East approach pier:** about 30 m from the camera, so it is removed.
- **East guideway crossing:** about 35 m from the camera, so it is removed. A west crossing would stand behind the tower, which fills screen x 770–1700.
- **Exit doors:** a door on a long face is allowed only at X ≤ 0 (south) or X ≤ 5 (north). The spec gives no position along the face.

What A5 can still show:
- **The south (left, downhill) exit.** The camera is at platform height (y 141, `yb`), so this covered footbridge is seen edge-on, as a flat band about 70 px tall at the horizon (f = 1242 px for fov 1.05 at 1440 px, distance about 62–65 m). The band runs from x ≈ 800 to the left edge, over the row of hillside signs at y ≈ 600–800 that is one of A5's best features.
- **The north exit.** Its first 15–20 m are hidden behind the tower, and it lands at grade in the forest.
- **The total.** Coverage is about 0.8–1.2% for the bridge, plus about 1.4% only if the exit ends on a stair and lift tower in the void. That is borderline for the 2.0% rule.

So the adoption decision most likely rests on one pose, with a judge comparing a dark void against a horizontal bar across it.

### Other concerns
- **The approach pier is misplaced, and "14–30 m unsupported" is wrong.** `buildLizibaTower` already puts a tapered column with a cap under the beam at HX + 3 = 27 m on each end (the "guideway support just outside the opening", when the ground is low enough, as it is at A5). The spec's pier at "the first sample more than 27 m" is the 30 m sample, 3 m from that column and almost on the same line of sight from A5. The real gap runs from 27 m to the first regular pier. That pier is at an `i % 4 === 0` sample outside `inStation`, which is 38 m for `stationLen` 72, so it falls at 42–60 m. The critic's "no piers" refers to the beam near the camera, at 40–60 m. That pier is in the 60 m clearance anyway.
- **The sign-split rule cuts the gallery every few metres.** In `lotSigns`, hillside street faces get a blade every 4.6 × (0.7–1.3) m (85% chance), and a second blade on half of them. Both are capped at `topAt − 0.4`, which is 0.05 m below the gallery soffit (deck top = podium top, slab 0.35 m). With `podH` 9 the first blade is capped about half the time, and with `podH` 12 most second blades are. So "split around any slot within 0.3 m" fires every 5–15 m. The result is a row of separate balconies with 1 m gaps, not a continuous gallery. People pacing along "gallery centre lines" will cross those gaps, or walk through blades: floating people (user priority 2). The 10% loss target hides this, because it measures length, not continuity.
- **Street lamps collide, and the audit cannot see them.** Lamps stand at `hw + 0.7` from the road centre (`lampPos`), which is 2.3 m from the podium face. They have `LAMP_H` 6.9 m and alternate sides about every 36 m. The gallery reaches 2.5 m out, so every pole stands 0.2 m outside the gallery edge, with its head at gallery height on 6 m podiums. A lower bridge every 30 m across the 11 m road, with a soffit about 5.6 m above the sidewalk, will hit lamp heads. Lamps are validated in WGSL and are not part boxes, so the planned spatial-hash audit misses them.
- **Trees are ignored.** The trees are cleared only inside a ±50 m box around the station (`stampRect(MONORAIL_STATION…, 50, 50)`). A north exit that "lands at grade within 60 m" can run 74 m from the axis, into GPU-placed trees. The audit does not cover vegetation. A covered bridge ending in a dark forest is also a "bridge to nowhere" read.
- **Alleys and the upper tier.**
  - About 45% of terraced lots with more than 9 m of fall already have a 3.2 m stair street in the 5 m alley (`terracedPodium`), which leaves no room for a stair tower.
  - Skybridges span gaps of 3–34 m, including alleys, from `y0 + 8.6` upwards. They cross the upper gallery plane (podium top + 12 m) and the alley stair towers.
  - Tower faces are 1–3 m behind the podium face, so the 2.2 m upper gallery sits almost on top of the lower one, and from the street it reads as a thicker single ledge.
  - The split rule is written only for the lower gallery, and it needs a rule for these cases too.
- **Run steepness is unknown.** The runs that can be chosen run about parallel to the monorail, which follows the hillside. If these streets mostly follow the contour, the steps, stepped bridges and lift (the "3D" read) will barely appear. Report the rise of each candidate run before building anything.
- **Lighting is thin.** 48 lights over about 1.9 km of gallery (both faces of 3 runs) is one pool per about 40 m of face. The soffit strips are emissive and cast no light. So most of each gallery has no visible light on the sidewalk below, which is the "pasted-on glowing slab" read the spec wants to avoid.
- **People are small.** The crowd mesh distance is 110–210 m, so beyond that, deck people are glints. A person at 150 m is about 14 px tall at 1440p.
- **Smaller points:**
  - The beacon landmark (−1250, −900) is 239 m from the station, inside the catchment ("no landmark nearby" is wrong).
  - The current best is 9.51–9.57 ms on the leaderboard, not "about 9.8 ms".
  - "One covered footbridge … 70 m or more from each tower end" does not say which side it is on.
  - The quick-test go/no-go uses one judge at two cameras that were placed to frame the change, which is a weak gate for 3.5 days of work.
- **What holds up (checked in code).**
  - Using a separate mesh avoids the seedless-part index seeding in `buildings_gen.js`.
  - Section 5 with its own rng(2702/2703) and its own copy of `push()` is needed, because `push` draws its seed from rng(8080). The spec does this right.
  - Car runs only treat colliders with bottoms below ground + 4 m as street blockers (`buildRuns`), so decks 4.5 m up are safe.
  - The sign light budget is `min(2150, 8192 − lights.count − 64)`. That is unaffected as long as the 48 new lights are added after `signs.js` runs, so state this module order explicitly.
  - The GPU estimate (40–70k triangles, 48 small lights, frustum skip) is plausible within the about 1.4 ms of headroom.

### What would make it stronger
- **Fix the run rule to fit the real site.**
  - Measure the 60% over the part of the line that lies in the built district, not over the whole chord.
  - Or allow one-sided galleries on edge streets.
  - The best candidate is the street visible on A5's left. It is the line about 62 m south of the station, with lots only on its south side and the dark void on its north side. A one-sided gallery on its north-facing podiums, with stair flights and the lift descending into the void and the south station exit landing on it, would attack the A5 defects the critics named ("black voids below the guideway and under the hillside street") with structure that A5 actually sees. It is still placed by a world rule ("edge street facing the station").
- **Replace the 60 m sphere** with the existing sightline clearance (the `POSES` sightline stamp from the camera to 85% of the way to the target, 9 m wide) plus about 15 m around each camera. Otherwise the rule deletes the pier and half of the exits for reasons unrelated to sightlines.
- **Place the pier halfway** between the 27 m portal column and the first regular pier, and assert that no new pier is within 6 m of an existing one.
- **Do not split the gallery on blades that hang below the soffit.** Treat them as hanging from it. Split only where a box enters the deck or railing volume. Clip people's paths to the gallery pieces, and assert that no agent is more than 0.3 m from a deck surface below it.
- **Add lamps and trees to the audit.**
  - Compute lamp positions in JS from `lampPos` and `lampValid`.
  - Skip bridges within 3 m of a lamp head, and skip galleries where the soffit is less than 1 m above a lamp head.
  - Stamp new pieces into the vegetation mask, or clip them to the cleared area.
- **Make the A5 exit read in 3D, not as a band at eye level.** Have it turn and descend in view: a stair to a landing, or a lift tower in the void below the platform, visible from A5's angle.
- **Write the site facts into the spec before code.**
  - The run list with rise and axis.
  - Which lines fail the 60% rule.
  - An estimated coverage at A5 under the clearance rule.
  - A replacement for H9 (for example, the second run on the qx axis, seen from a gallery).
  - Then predict the targets again: as written, the spec's own prediction (A4 and A5) cannot come true.
