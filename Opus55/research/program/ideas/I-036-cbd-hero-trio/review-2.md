## Reviewer 2 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 6 | The Braid (two shafts winding one full turn, joined by clasps) is a real original form, and the Tripod is distinctive. The Offset Pair is a generic setback tower next to a decagon with a halo. Building the old records and swapping parts at the end of generation is a clean isolation method, but it comes from `placeComplex`. |
| Feasibility and credibility | 6 | Most of the isolation holds against the code: text is chosen before the swap, colliders come from a frozen copy, searchlights sort by `sortY`, and no shared random stream is used. Every I-031 geometry point on the trio was fixed. But the spec gets wrong how the two key poses render: B1 (t = 45) and B4 (t = 50) are both captured in LED mode 3, where the pattern depends on each part's height and seed. Its "gap from every bearing" claim does not hold. And it adds new defects: a floating lower bridge, a searchlight beside the leaning crown, B2 coverage measured without the tower in front of it, and unstated seeds. |
| Expected impact | 5 | The targets are B1, B3 and B4, with B2 borderline. B3 is about 1% of the frame and swaps the gold pinnacle pair for a generic pair, so expect a tie. Adoption then needs wins at both B1 and B4. At both, the Braid shows as a thin single shaft over part of its height, where the old twist shows a broad lit body. Each of those two wins is a coin flip at best. If it fails, the program learns that removing the replicas is not worth a visible loss. That is useful, but limited. |
| **Overall (average)** | **5.67** | |

### Strongest reason it will fail
**From any one bearing, the Braid's gap is open over only about half its height. In the other half the two shafts overlap and the tower narrows to a single shaft 20–30 m wide, exactly where B1 and B4 show it.**
- The gap only opens where the shafts stand side by side. Each shaft is 30 m (tangential) × 24 m (radial), with centres 52 m apart. Let φ be the angle between the line joining the shaft centres and the line across the screen (φ = 0 when the shafts stand side by side). The projected gap is then 28·cos φ − 30·sin φ (before taper). It is open only for φ < 43°: two bands per turn, about 48% of the height. In between, one shaft hides behind the other, and at φ = 90° the silhouette is a single shaft 30·s m wide.
- I projected it at f = 1241.7 px with the real poses:
  - **B4**: open at 249–384 m (y 683–402, up to 65 px) and at 519–564 m. The shafts overlap at 406–474 m (y 355–210). There the hero in the centre of the frame is one shaft about 45 px wide, where the old twist is about 115 px.
  - **B1**: open at 317–429 m (y 589–471). The top 451–541 m (y 448–357) is overlapped. So directly under a 68 m crown bridge the tower narrows to a neck about 23 px wide. The lower open band (69–137 m) is hidden behind the embankment and the front towers.
- The spec's line "a 28–36 m gap from every bearing" hides this. It is also why the "wins likely at B4 and B1" estimate is optimistic: the judge compares the broad, LED-lit twist against a ribbon that pinches in the middle of the frame (B4) and just under the crown (B1).
- Add the likely tie at B3 and a B2 that is at best neutral (one leaning glass leg and half a lantern, replacing the white diagrid, the most distinctive surface in that street). The 2/3 rule then rests on two coin flips.

### Other concerns
**Checks against the I-031 reviews (trio items)**
- **Fixed:** helix radius (26 m, 28 m gap side-on); collars replaced by clasps; a full turn; `FLAG.LED` and `FLAG.EDGE` kept on the shafts; decagon at prm 10, a real polygon; diagrid dropped; Tripod legs end on a crown deck, with sizes for the deck, the floor plates and the lantern; Offset Pair plan sizes and the prow depth given; searchlight order frozen; tower-text phrases protected; scope reduced to the trio; a blind pairwise check in the quick test.
- **Not fixed:** I-031 reviewer 1 measured the B2 truss at about 0.8% of the frame. The spec again says 1.29% / 1.33%, because its B2 occluder (a flat skyline at y 770) leaves out the pink-edged tower at x 1075–1220. That tower hides the truss's left half (projected bbox 1154–1302; only about x 1220–1285 is visible in the render, roughly 65 × 515 px ≈ 0.9%). So whether B2 becomes a target is a coin toss decided by the `?lmmask` capture, not "added by the table". Re-estimate it, and plan for B2 as a no-clear-loss pose.
- **Not fixed:** at G3 and B3 (15–25 px per 40 m), the Offset Pair still reads as "two towers with a bridge". That is inherent to the design.

**LED show in the actual captures (new, important)**
- The poses run at t = 45 (B1) and t = 50 (B4), that is 25 s and 30 s into the show. That is beats 50 and 60, and `mode = (beat/16) % 4` gives **mode 3** for both.
- In mode 3, `ledColor` fills each part like a level meter: it uses `hf`, the height fraction within the part, and a level and hue hashed from the part's seed. That per-part fill is what draws the pink bands in B4 and the green fill in B1.
- The Braid has 12 parts of 45 m per shaft, where the twist had 6 of about 90 m. So it shows 24 bars at twice the vertical frequency. Their hue and level follow whatever "explicit seeds" the implementer picks.
- The edge-strip colour is also set by the seed (`hsv(fract(seed·0.0137))`). The twist used seed 38 (cyan) and the twin 8.8 (orange).
- So "the LED show and the corner strips continue" is not "kept exactly". Fix the Braid parts at seed 38 and the Pair at 8.8. Check that 45 m bars look good in mode 3, or use 6 LED bands per shaft. Capture the quick-test views at t = 45–50.

**Floating and detached parts (user priority 2)**
- **The lower bridge at 95 m does not reach tower B.** It is 52 m long, centred on the midpoint, and offset 12 m sideways. Tower B's decagon has an apothem of about 15.9 m at 95 m, so 12 m off its axis its surface is only about 10.5–11.7 m from its centre along the link axis. That puts the face 28.3–29.5 m from the midpoint, and the bridge ends at 26 m: a gap of 2.3–3.5 m. Make it about 62 m long, or offset it less.
- **The tower A searchlight floats.** Tower A sorts above tower B and the two are 80 m apart, so A's top is the one that keeps a beam. Its crown leans 10 m west, but the top keeps the old x and z (the tower centre). If y moves to the crown tip (g + 463), the fixture and the upper half of its 40 m mast stand 7.5–12.5 m east of the tip, in the air. The fixture is a real mesh (`fixtureMesh`, a 2.2 m drum on a mast), and the beam is very visible in B1.
- The spec claims "all three crowns are on the old axes". That is false for tower A. Give the exact y for each of the three tops, or move the tower A top onto the crown tip, which keeps the order (sort by `sortY`) but changes x.
- **The Tripod's floor plates barely enclose the legs.** At 110 m the leg tips reach 31.1 m against a plate circumradius of 30, and at 210 m they reach 25.0 against 24. The legs' base vertices stick out about 0.5 m beyond the plate edges. This gives ragged sub-metre corners, not a clean junction. Use plates at least 3 m larger, or rotate them so the legs clearly pierce them.
- **The Braid lantern overhangs its bridge.** With `kind 2, prm 6, hw 9` (hw is the apothem), the hexagon's corners reach 10.4 m on a bridge 16 m deep. That is an overhang of about 2.4 m.
- **The Tripod and Braid bases are left bare.** The old truss quadrants covered the whole 76 m stone base, and the twist covered the middle of its podium. Both roofs are now open. I-031's ground atrium is gone, so they read as placeholders in aerial views.
- **The old ground lights are floods at g + 3** (twist ±70 m, twin and truss beside their bases). "Positions moved to the new crowns" would put three ground floods in the sky. Keep them where they are.

**Colliders: the stated limitation is avoidable**
- `buildRuns` blocks a street only for colliders whose bottom is below ground + 4 m. Crowd placement uses ground + 2 m.
- The old twist shaft colliders start at g + 24, and the truss quadrant collider at g + 18. Every new elevated part also starts there or higher.
- So the elevated old boxes can be replaced with colliders for the new shafts, legs and clasps without changing traffic runs, crowd placement or the CBD air corridors (those also block within `L.r` + 20 of each landmark).
- Only the ground boxes need to stay frozen: the podium, the stone base and the twin's lowest tiers.
- Otherwise a player flying into the Braid's gap below about 208 m hits an invisible 80 m box, and inside the Tripod an invisible 26 × 52 m wall stands between the legs. Those are exactly the places an explorer would fly.

**Smaller points**
- "Footprints inside the old colliders plus 1.5 m" is slightly false for tower B: the decagon's circumradius is 17.35 m against 16.5. Tower A's orientation is not stated; it must be a = 0.35, or its corners stick out by about 6 m. This has no effect on runs, which come from the frozen boxes, but crowd sidewalks use a 0.3 m margin.
- The quick test's step 4 (Tripod and Pair) has no pass rule. Use the same 4/5 rule with no clear loss. The held-out cameras are aimed at the Braid, so they show it more than the eval poses do. Add one view where the Braid sits behind front-row towers, as in B1.
- Text is chosen on the old geometry, so the phrases are identical by construction. But the new prow and Sky Hall are never checked for whether they cover glyphs from the river. Add a check that no phrase's sight line to the water crosses a tail part.
- GPU: the +0.03 ms estimate is credible. There are about 200 parts, no new lights, and fewer pixels. No concern.

### What would make it stronger
- **Braid.** Make the overlap problem small:
  - Narrow the tangential width (for example 22 × 24 m), so the gap stays open for φ up to about 55°.
  - Or add a half turn, so each band is shorter and the tower never shows a long single neck.
  - Show the B1 and B4 silhouettes by projection before building.
  - Keep seed 38. Keep the LED bars at about 90 m (6 per shaft), or show that 45 m bars look good in mode 3.
- **Offset Pair.** Lengthen the lower bridge to about 62 m. Pin tower A at a = 0.35. Put the tower A searchlight on the crown tip. Keep seed 8.8. Give the Pair one bold feature that replaces the gold pinnacles in B3, for example a warm lit crown at least as bright as the old lanterns.
- **Tripod.** Enlarge the plates by at least 3 m. Put a glass atrium or garden on the base roof. Accept that B2 shows one leg, and judge that view in the quick test.
- **Colliders.** Build the elevated colliders from the new parts (bottom above g + 4) and keep only the ground boxes frozen. Assert that traffic runs and crowd placements are identical.
- **Targets.** Recompute B1 and B2 coverage with the towers in front included (from the render or the mask), not a flat skyline. Expect B1, B3 and B4, and say which two wins the idea is counting on.
- **Quick test.** Capture at t = 45–50 (show mode 3), set a pass rule for step 4, and add one "partly hidden" view.
