## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 5 | This is a narrowed revision of I-031. The Braid (two shafts making a full turn, joined by clasps) is a real new form, and building everything on the old records and swapping only the drawing at the end is a neat way to isolate the change. The Tripod is a sound but familiar supertall move. The Offset Pair is the I-031 design unchanged apart from its sizes, and I-031 reviewer 2 already called it "generic setback towers". |
| Feasibility and credibility | 7 | Most of the I-031 findings are actually fixed, and the numbers I re-ran hold (below). The isolation holds against the code: text selected on the old parts, `sortY` for searchlights, no calls to `R`, colliders from a frozen copy. Two parts of the plan are wrong, though. The invisible old colliders are not needed, and the stated reason for keeping them is false. The "lights moved to the new crowns" would move ground floodlights onto the crowns. Some details are missing that risk floating parts or random colours: Tower A's searchlight and fins, part seeds, Tower A's rotation, the plate orientation, and the pass rule for quick test step 4. All of these are cheap to fix. |
| Expected impact | 6 | It removes a violation of a hard GOAL constraint at three towers, and the blind quick test shows early whether originality can win image-only judging, which matters for I-037 and the later crystal, beacon and ridge redesigns. But what actually changes at the targets is smaller than the table says. Only B4 is clearly dominated by the change. Adoption needs 2 of B1, B3 and B4, and the replicas remain in G3 and in other poses through the other landmarks. Realistic critic gain is about +0.1 to +0.15 on zone B, not +0.2. |
| **Overall (average)** | **6.0** | |

### Strongest reason it will fail
**At B1 and B3 the visible change is small, and a judge sees a thinner tower in place of a striking one. Originality alone does not win image-only judging.**

**B1 coverage is overstated.** The spec's table uses one flat skyline per pose, but B1's real occluders are much higher:
- In `runs/I-016m/B1`, the towers in front hide the twist below y ≈ 668.
- The dark edge-lit tower with the purple beam covers x < 548 below y ≈ 425.
- Re-running `proj.mjs`/`models.mjs` with that skyline (f = 1241.7 px) gives the twist **0.64% old and 0.47% new**, not 1.44% and 1.06%. The B1 trio total is about 1.15%, not 1.99%.

**Geometry of the Braid at B1.**
- B1 looks along bearing −0.382 rad. With θ0 = 0.3, the shafts line up one behind the other at about 243 m and **513 m**, just below the crown, and are fully apart only around 378 m.
- In B1's visible band (about 250 m up to the crown), the Braid therefore shows one opening, roughly 35 px wide. The left shaft's open stretch is half behind the dark tower, and the top 50–100 m reads as a single 20–30 m body.
- Today's B1 shows a clean green LED tower about 80 px wide with a recognisable fin crown. The judge will compare that with a thinner, partly hidden pair carrying about 25% less LED area.

**B3.** B3 shows the twist and the Petronas pinnacles at 0.54 px/m. The Offset Pair replaces the one distinctive pinnacled silhouette in that view with two plain towers about 17 px wide, whose details (seven fins, halo) are below 15 px. That is a likely tie or slight loss.

**Adoption risk.** Adoption then rests on B4, which is the only pose where the Braid fills the frame and reads clearly: two crossings, at about 185 m and 455 m, with a gap of about 60 px between them. The quick test helps, but it uses clear views aimed at the Braid. The eval poses have occluders the held-out views won't reproduce.

### Other concerns

**I-031 findings: what was fixed**
- Fixed:
  - Braid gap: helix radius 26 m, inner faces 14 m from the axis.
  - Collars replaced by clasps; one full turn.
  - `FLAG.LED` and `FLAG.EDGE` kept.
  - Decagon (`prm` 10 is a real polygon in `ringEval`).
  - Searchlight order (`sortY`).
  - Tripod: legs end under a deck; ring and lantern sizes given.
  - Prow depth and the Pair's plan sizes given.
  - Diagrid dropped.
  - Text identical by construction.
  - Blind pairwise check added to the quick test.
  - Work staged; Raffles moved to I-037.
- Not fixed: the B2 coverage point (I-031 review 1 said about 0.8%). With the pink-edged tower in front of the truss (x < 1222 hidden in `B2`), I get **0.82% old, 0.58% new**. So "by the table, that adds B2" is very likely wrong. The mask rule will settle it, and B2 will probably drop out, leaving 3 targets and 2 wins needed.
- Reproduced exactly: `run2.mjs` gives the table's numbers. The Tripod geometry is right: 36.7 m outer vertex, gaps of 19.6 m at the base and 7.6 m at the top, legs inside the 22 m deck. The Sky Hall gap is about 48 m.

**Colliders from the old shapes: the limitation is real, and it can be avoided at no cost**
- What the old records leave as invisible solids:
  - twist: an 80 × 80 m box (segments 0–1, `solid: i < 2`) up to g + 208. That fills the Braid's 28 m gap, so a flying player hits an invisible wall in the gap, and `groundAt` gives an invisible floor at 208 m.
  - truss: quadrant 0 leaves a 26 × 52 m box on one side of the axis up to g + 330. It fills half of the Tripod's open core and stands 24 m above the crown deck, inside the lantern.
  - The new Pair's tier 1 (hw 16 up to 220 m) stands 2.8 m outside the old tier-1 box (hw 13.2), so the player passes into its wall.
- The spec's reason for keeping them ("making colliders match the new parts would change traffic runs and the car stream") is false for everything above ground level:
  - `buildRuns` only tests colliders with `cy − hy < g + 4` (trafficCars.js), and the crowd only those below `height + 2` (crowd.js:453).
  - `cbdCorridors` (air.js) tests `LANDMARKS` circles first, with `r + 20` and `h > y − 40`. Those circles already block every corridor point within 90 m (twist), 115 m (twin) and 90 m (truss). Every new part plus its 20 m margin stays inside them: Braid ≤ 65 m, Tripod ≤ 57 m, Pair ≤ about 90 m of the twin's 115.
  - Rain occluders and the player controls are runtime only.
  - So the colliders can come from the new parts for every part starting above g + 4, while the ground-reaching boxes stay as they are (podium, truss base, the Pair's tier 0). Runs, crowd and corridors stay identical.

**Crowds and traffic through the new geometry**
- At ground level this is not worse than today. The old twin's star tips reach 30 m from each centre, past their own 15 m collider boxes. The new footprints (≤ 17.35 m) sit inside the star.
- But they must be stated exactly:
  - Tower A's 32 m square must use the old tier-0 angle (a = 0.35). At any other angle its corners reach 6 m past the old box.
  - Tower B's decagon vertices (apothem 16.5 m, circumradius 17.35 m) poke up to 0.85 m beyond the old box plus 1.5 m on some faces, whatever the rotation. That is harmless because it is inside the old star, but the spec's claim "inside the old colliders plus 1.5 m" is not exactly true.

**Lights: an error**
- The old lights are ground floodlights, not crown lights:
  - twist at x ± 70, g + 3, r 40;
  - twin at 34 m from each tower, g + 3;
  - truss at x + 45, g + 3.
- "Positions moved to the new crowns" would take the light off the kept podiums and plazas (the truss light shows at the end of the canyon in B2) and put a 120-strength light inside the Braid's crown glass. Keep all of them exactly where they are.

**Floating parts and the searchlight fixtures**
- `lightshow.js` draws a drum on a 40 m mast at (x, y + 2.5, z), and the spec keeps x and z on the old axes.
- Tower A's crown leans 10 m west and tapers to 0.25, so the axis leaves the crown above about g + 444. Any top y above that leaves the drum and mast floating beside the crown. Give each new top y explicitly:
  - Braid: lantern top or spire base.
  - Tripod: lantern top (361 m), not the deck, which would put the drum inside the lantern.
  - Tower A: ≤ 440 m, or keep the crown tip over the axis.
- Tower A's seven 40 m vertical fins sit on a face that narrows from 20 m to 5 m (taper 0.25). The outer fins will hang in the air beside the face unless their heights follow the face width.
- The Tripod plate orientation is not given. With the plate vertices toward the legs, the leg faces stand about 0.55 m proud of the plate edges, which is fine. Rotated 60 degrees, the plate corners stick out 15 m between the legs.
- The halo masts on Tower B have no sizes.

**B1 light show (`FLAG.LED`)**
- `ledColor` modes 0–2 use world position, so the bands carry over onto the Braid unchanged.
- Mode 3 uses the height fraction within each part (`hf = (wp.y − P.a.y) / h`) and the part seed. The Braid's 24 segments of 45 m will therefore show 12 short level-meter bars per shaft instead of 6.
- The spec doesn't give seeds. Index-derived seeds would give each segment its own mode-3 hue, and each part its own edge-strip colour (`hsv(seed × 0.0137)`). Use seed 38 on all Braid shaft parts (today's cyan edges and LED hue), and give fixed seeds for the Tripod and the Pair.
- Kind 0 with `prm` 0.6 gives 8 faces, so `FLAG.EDGE` draws two strips at every rounded corner (about 11 m apart). Check that this reads as intended.

**Shape of the helix**
- Each 45 m segment leans 16.7 degrees along a chord, and its direction turns 30 degrees at every joint. The joints match exactly (same angle and scale), but the silhouette and the edge strips will show elbows every 45 m.
- 18 or 24 segments per turn would cost nothing (about +0.002 ms).

**Searchlight order, shared random streams, GPU: no concern**
- Searchlight order: the 160 m spacing check uses x and z only, which are unchanged. With `sortY` the source list and the `rng(808)` personalities stay identical.
- Random streams: none of the new functions call `R`. Props come from a separate counter, and the tail goes after `genInfill`.
- GPU: about 200 parts, twisted ones in the curved mesh lists, so +0.03 ms is plausible.

**Quick test**
- Step 4 has no pass rule and no fallback. Say what happens if the Tripod or the Pair loses its held-out views. For example, keep only the designs that win, so the Braid can ship alone.
- One judge on 5 views is noisy. The I-014 judges split 8/8 against 3/8. Use two judges, with the rule applied to each.

### What would make it stronger
- **Colliders:** build them from the new parts for everything starting above g + 4, and keep only the ground-reaching old boxes. Add a check that `buildRuns`, the crowd placements and `cbdCorridors` output are identical. This removes the known limitation at no cost.
- **Lights:** keep all landmark lights at their current positions.
- **Searchlight tops:** give every new top y explicitly, and check that no drum or mast floats (Tower A ≤ 440 m, or lean the crown so its tip stays over the axis). Shape Tower A's fins to follow the narrowing face.
- **Seeds:** seed 38 on the Braid shafts. Fixed seeds on the Tripod and the Pair, with their edge colours stated.
- **Rotations:** Tower A at the old tier-0 angle. Tripod plates with their vertices toward the legs.
- **Braid phase:** choose it by a design rule, not by pose. For example, the crown bridge faces the river, so that from the Bund the shafts are side by side over the part above the skyline and at the crown, rather than lined up at 513 m. Use 18–24 segments per turn.
- **Offset Pair:** give it a silhouette element that reads at 0.5 px/m (B3, G3) and is as strong as the pinnacles it replaces. At least make Tower A's crown and Tower B's halo large and bright enough to read there. Otherwise expect B3 to tie or lose.
- **Coverage table:** recompute it with real skylines (piecewise, read from the renders): B1 ≈ 1.1% and B2 ≈ 0.8% for the old towers. Say plainly that B2 will probably not be a target.
- **Quick test:**
  - Add one held-out view per B1-like bearing that keeps today's foreground towers in frame, so occlusion is tested.
  - Use two judges.
  - Give step 4 a pass rule and a keep-only-winners fallback.
