## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 4 | Tracing each critic-named shape to the code that draws it is good work, and it is the right way to handle "placeholders". The fixes themselves are standard: coverage for thin wires, a near-camera fade for cars and people, a model at the laser source, retaining walls, and a second run of the I-016 plan. Most of the ideas are not new to the program either: the near-camera fade was handed over by the I-025 reviewers, and C5 reruns I-016 on land it left out. |
| Feasibility and credibility | 4 | Most of the identifications hold when I check them against the code and the images (below). But the central claim of C1 is false for this renderer. The TAA resolves in tone-mapped space and clips history to the 3x3 neighbourhood, so sparse stochastic samples at 5–17% coverage come out 2–4 times dimmer and flicker. The average emission does not stay the same. Other gaps: C2 makes people at 2–4.5 m full size again (a big cropped head at the bottom of B1); C3's "existing fixture mesh" is shared by every rooftop searchlight; C4 walls stand on the sidewalk where walkers follow the terrain, so people would clip through them, and the "few hundred parts" is not supported by a count; C5's second pass would merge into existing infill traffic runs unless the runs are rebuilt separately and checked for duplicates. |
| Expected impact | 5 | Removing the B2 car is a real, likely clear win, and it removes a critical defect. Turning the G3 brown strip into city is a likely win. The rest is small (the B1 pontoon is about 60 x 18 px inside the beam glare) or risky (C1 changes every bridge in G1, G2, G3, G4, A3, A6, B1 and B3, and it dims G4's hero cables). The spec's own estimate is +0.2 to +0.3 on zone means; the goal is 9 and the zones are at about 5.6. With the pixdiff rule, C1 adds about 8 target poses, which makes the 2/3 rule harder to meet. |
| **Overall (average)** | **4.33** | |

### Strongest reason it will fail
**C1 does not keep the brightness of the bridge cables. It will dim, and at low coverage almost erase, the most attractive thing in G4, and it touches about 8 poses.**

The spec says kept fragments get emission/cover, so "the average emission stays exactly as now". That holds before TAA. It does not hold after it. `TAA_WGSL` (renderer.js 216–322) does two things to sparse bright samples:

- **It averages in tone-mapped space.** It works on `tmw(c) = c/(1+luma)`, so bright samples count for less. For a cable at coverage p whose full-strength emission has luma L, the resolved value is about p·L/(1+L), against p·L today.
  - p = 0.15 and L = 4 (show colours, `k` up to about 4x): 4.4 times dimmer.
  - L = 1: 1.9 times dimmer.
- **It clips history to the current 3x3 neighbourhood** (mean ± 1.25σ). A 3x3 window on a 3 px ribbon has no kept sample with probability (1−p)^9:
  - 0.23 at G4 (p ≈ 0.15);
  - 0.63 at G1 (p ≈ 0.05).
  
  In those frames the history is pulled back to the background, so the result is darker again and changes from frame to frame.

Coverage per pose, using f = 1242 px, r = 0.13 m and the real minimum half-width of 1.5 px:

| Pose | Distance to the Peninsula South pylons | Coverage |
|---|---|---|
| G1 | ~2100 m | 0.05 |
| G2 | ~1600 m | 0.07 |
| G3 | ~1300 m | 0.08 |
| G4 | 620–710 m | 0.15–0.17 |
| A6 | ~500 m | ~0.2 |

In G4 the pink fans are drawn as bold, separate lines. With their water reflections, they are the strongest element of the frame. A blind judge comparing bold pink sails with faint stippled ones will likely prefer main, a clear loss on a pose that is either a target or under the no-clear-loss rule. The spec puts G4's risk down to judge taste and calls it limited by the unchanged emission. The emission is not unchanged.

The spec's fallback, a pattern anchored to the cable, fixes the sparkle but not the dimming. C1 also turns kind 2 members (suspension main cables at r 0.42, hangers, arch truss members at r 0.35) into dithered members. That changes the Bund Suspension in B3 and B1 and the pink arch in the centre of G1, where nothing was named as a defect.

### Checks of the claimed identities (code + images)
- **G1 pyramids = Peninsula South Bridge stay fans: confirmed.**
  - I estimated the water span along the bridge at s ≈ 196–550, so mainA ≈ 238 and Ht = 95.
  - The pylon top then projects to (71, 736) in G1, and the right pyramid's apex is at about (75, 737).
  - The second pylon is just off the left edge, which explains the partial left pyramid.
  - The view is only about 18° off the bridge axis. The 14 cables on each side therefore land about 2.4 px apart, and with ribbons 3 px wide they merge into a solid sheet.
- **A6 bars = the same bridge's cables seen from above: probably right.**
  - The pylon top projects off-frame at (−442, 1359).
  - The cables run almost horizontally to deck anchors that lie on a falling diagonal, as the spec says.
  - My estimate of the anchor x is about 250 px left of the bar ends. That is within the error of the estimated pylon position, but quick test 0 is needed.
  - Even with C1 the bars still float, because their pylon is out of frame.
- **B2 = oncoming car about 1.1 m from the lens:** consistent with the image and with the I-025 reviews.
- **B1 grey head = a person shrunk by `smoothstep(2.0, 4.5, dist)`:** confirmed (crowd.js:98, `sc` at line 241).
- **B1 fan origin = the z = −700 laser: confirmed.**
  - The ray at (1580, 940) is (0.924, 0.005, 0.382).
  - The emitter at about (2385+, h+6, −700) projects to (1581, 952), 471 m away.
  - Correction: the fixture's base ring is 1.8 m across (radius 1.0 x scale 0.9), so about 4.7 px, not 2 px. It still cannot be read.
- **A4 slope = the bare bank between road and podium: plausible, but the spec gives no ray hit for it.**
  - The code allows it: the sidewalk strip is 3 m wide plus up to 8 m of trim slack (`streetFacesBox`), podiums stop 0.5 m inside the lot, and nothing fills the strip.
- **G3 brown land = east bank of the Jade River left out by the Ovoo line or the stilt keep-out: consistent with plan.js, but not shown texel by texel.**
  - The box corners hit (230–1480, −650..190) at y ≈ 8, so the left edge of the box is the river bank itself.
  - The spec does not show that the land is excluded only for those two reasons and not also for the STEEP, QUAY_DEPTH, RAMP or less-than-half-built rules.
- **Fact error:** the ribbon minimum is a 1.5 px half-width (`w = max(r, pix*1.5)`, vertices at ±w), so ribbons are 3 px wide, not 1.5 px. That matters for the fix (see below).

### Other concerns
- **C2 for people is worse than today at 2–4.5 m.**
  - Today people closer than 4.5 m are shrunk.
  - Under C2 they are drawn full size, and only people within 0.8–2.0 m of their capsule fade.
  - The B1 grey-head person passes the umbrella rule (its 2.3 m point is above the bottom fifth of the frame). At full size it would become a head and shoulders several hundred px tall, cut off by the bottom edge next to the spectators. That is a likely B1 loss.
  - Keep the current distances (fade out by about 4.5 m), or hide people whose head falls below the frame, instead of moving the thresholds in.
- **C2 is not gaming the metric, but its gain is local.**
  - The fade uses only the camera position and applies to every car, which is standard practice and also fixes free-flight views. I accept it.
  - Among the eval poses it changes only B2, plus B1 through the people.
  - Cars 2–4 m away are drawn half-dithered. In the u12 burst a moving car in that band will show as stipple noise, because TAA cannot settle on a fast car. Check this in the burst-u12 frames, not only in a still.
  - Separate the size factor `A.c.w` from the fades before replacing `pf.w`.
- **C3.**
  - `fixtureMesh()` is one instanced mesh for all fixtures, scaled per instance (`q = p * F0.a.w`). Putting the pontoon into it would add a pontoon to every rooftop searchlight. It needs its own static mesh, or a kind that only lasers draw.
  - The current emitter stands 4 m inland at h+6. The spec does not say how the pontoon and gangway meet the promenade wall (terrainBank) or whether boat lanes pass within 15 m of the bank.
  - At 471 m most of the pontoon sits inside the bright fan origin and its bloom. Expect a tie.
- **C4 creates new detached and clipping parts.**
  - Walkers walk on `terrainHeight(xz)` at road/2 + 0.7 to 2.3 m, which is 0.2–1.8 m on the lot side of a wall placed 0.5 m behind the kerb.
  - Where the lot is higher, people would walk in a trench behind the wall. Where it is lower, they would walk on the slope under the deck.
  - The wall has no top surface from its crest to the podium face, so from above (A6, G3) it reads as a free-standing fin with bare slope behind it.
  - The wall line (3.0 m from the podium face) runs into the existing kerb handrail at 2.95 m and the stepped pavement props (0.1–2.8 m) from `shopfrontFaces`.
  - **Cost.** Yuzhong alone has about 470 blocks with about 240 m of lot street frontage each. Even 10–30% qualifying frontage with bays every 8 m, stairs, railings and lamps means thousands of parts, not "a few hundred". The prop budget (130,000 at q2) may already be close. Give a count.
  - Lamps or bays must not add point lights to `B.lights` (the `rng(4242)` shuffle would change which city shop lights survive) or sign slots to the shared list.
- **C5 isolation.**
  - `buildInfillRuns` walks the bounding box of all `plan.cells` for each district and merges consecutive segments into one run. New cells next to old ones would lengthen existing runs, which moves the cars generated on them from `rng(31338)`.
  - A street between an old cell and a new cell is already a run (one side is built), so a second pass would duplicate it, putting two sets of cars on one street.
  - Lamp candidates (`infillLampCandidates`), the sign light budget, and the car caps (`nearCap` 2600, `lampDraw`) also need the append-only treatment.
  - The new blocks are the same flat 8-storey `genUrban` boxes that critic 2 called "districts as flat slabs with geometric corners" (critical, G3). Brown land becoming city should still win the pairwise comparison, but the critic scores may not move.
  - C5 also changes A3 (the I-016 spec says this land is the only plan land A3 sees) and G2 (which I-016 won).
- **Bundle and adoption.**
  - With the pixdiff rule, C1 alone will likely make G1, G2, G3, G4, A3, A6, B1 and B3 targets. Together with B2 and A4 that is about 10 targets, 7 of which must be won.
  - C1 is likely a tie or a loss at most of them, so the bundle can fail even if B2 and G3 win clearly.
- **GPU.** C1 and C2 add `discard` to the ribbon, car and person G-buffer pipelines, which turns off early depth for every car and person, not only fading ones. The cost is probably small, but bench it. C4's cost is unknown (see above). The other estimates are plausible. The total should stay well under the 11 ms gate.

### What would make it stronger
1. **Replace C1 with a deterministic change.** Reduce the minimum ribbon half-width from 1.5 px to about 0.5 px (1 px wide) and keep the existing `cover = r/w` emission scaling.
   - At G1 this opens gaps between cables 2.4 px apart, so the fans read as lines without any stochastic noise.
   - The brightness per line goes up 3x, so the energy stays the same.
   - If you want true transparency, use a coverage-alpha forward pass (the standard "phone-wire" anti-aliasing), but keep the G-buffer copy for the SSR reflections that make G4.
   - Apply it to stay cables only (kind 0) until held-out views show that kind 2 members gain.
   - Test it blind against main at the G4 distance (600–800 m) before anything else.
2. Quick test 1 should be a blind A/B on held-out cameras, not "fans read as lines".
3. **C2:** fade cars by box distance as specified, but keep the people's fade over the current 2.0–4.5 m band, or hide people whose head is below the frame. Check the u12 burst for half-dithered cars.
4. **C3:** a separate mesh drawn only for the laser emitters.
5. **C4:** move it to its own idea, or rewrite it:
   - put the wall at the podium face (extend the podium down to kerb level);
   - add a top slab where the strip is wider than about 1 m;
   - lift walkers onto the new surface (or keep them off those faces);
   - give a part count from a dry run of the generator.
6. **C5:** a second `buildInfillRuns` limited to the new cells, with every segment already used by an existing run removed. Prove that the existing cars and lamps are identical, then run C5 alone. G3 is its natural target.
7. **Split.** The best version of this idea is smaller: I-032a = C2 (cars) + C5 + the deterministic thin-cable change, judged on B2, G3 and G1 (plus the no-loss rule on G4). Leave C3 and C4 out, or move them to I-027's walkway revision, where retaining walls and street stacking belong anyway.
