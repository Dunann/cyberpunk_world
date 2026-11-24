## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 6 | Redesigning the landmarks is the obvious answer to critic 2's point. The program has tried silhouettes three times, though only on generic towers. Three things are new here: building the Confluence Steps on the empty reserve disk, the palace-lantern mast, and reusing the `placeComplex` slot method for landmarks. The tower designs themselves (twisted pair, tripod, linked pair, faceted cluster) are familiar supertall moves. |
| Feasibility and credibility | 4 | The isolation analysis holds up against the code (details below). But the design has real gaps. The spec says "no landmark shaft keeps `FLAG.EDGE`" and also expects A1/A2 to change "only above the stack's skyline"; both can't be true. The terrace rule `floor(h/8)×8` puts every terrace top below the ground. The Braid's two shafts are only 2 m apart at the base. "16-sided" (`kind 2, prm 16`) renders as a cylinder. The searchlight order is not protected. The spec says nothing about `FLAG.LED`. And the Steps' domain leaves part of the wedge bare. This is a large build of seven bespoke designs, and the quick test never asks whether the new design looks better than main. |
| Expected impact | 5 | It has many big targets, and it can remove the A3 critical defect. But it replaces the hero elements that make today's images (the cyan vault in A1/A3/G2, the twist's LED show and fin crown in B1/B4) with untested designs. Under the spec's own rules, A2 changes only by losing the Raffles edge strips, and A2 is an I-015 win. Several redesigns still risk reading as other real towers. Realistic critic gain is about +0.2 to +0.4 on zones A and B, not +0.3 to +0.6. |
| **Overall (average)** | **5.0** | |

### Strongest reason it will fail
**At the poses where the Raffles group fills the frame, what a judge will actually see change is mostly a loss. A "less like a real tower" result is not a win for a judge who compares only images.**

- **A2 (and much of A1) shows only the lower Raffles shafts.** Their pink and lavender `FLAG.EDGE` strips are the brightest thing above the stack (A2: x 430–1790, y 0–310; A1: x 790–1580, y 0–500).
- **Height check (focal length 1241 px):**
  - In A2, 200 m absolute projects to y = 49 and 230 m to y = −82. The galleries (plateau + 150–220 m, about 230–300 m absolute) and the crowns are therefore off-frame.
  - In A1, the galleries reach only the top 160 px, and the crowns are off-frame.
- **So, under the spec's own rules, A2's change is "the towers lost their edge lights".** Tower 4 is a Hongyadong obstacle and must keep its geometry (x, y0, z, angle, hw, hd, h, lean, kind, prm, taper). It cannot gain the setbacks and lit ledges that are meant to replace the edges. It becomes a plain dark glass prism directly behind the I-015 stack.
- **The mask rule makes A1 and A2 targets** (the Raffles group covers far more than 1% of each frame), so likely losses there count against the 2/3 rule. Six wins out of about nine targets are needed.
- **The other hero changes give up proven assets.**
  - The cyan vault is the strongest shape in A3 and G2.
  - The twist's green and pink LED bands and fin crown dominate B1 and B4.
  - The spec is silent on whether the new shafts keep `FLAG.LED`.
  - The replacements will be judged image against image. The brief's "never replicas" line helps only if the new tower is at least as striking as the old one.

### Other concerns

**Code claims I checked and found correct**
- None of the seven functions calls `R`.
- The old prop total is 56: 45 garden trees plus 11 calls to `av()`.
- Light counts and priorities: twist 2, twin 2, truss 1, raffles 4, ridge 1, crystal 2, beacon 2.
- Unseeded parts take their seed from their index (`buildings_gen.js:32`).
- The landmark order before `stilts` is twist, twin, truss, tvtower, crown, raffles, ridge.
- `hongyadong()` scans every non-prop part with index below p0 (`buildings_stilts.js:409`), not only solid ones. The rule "new parts in old slots must not enter the complex's volume" is therefore needed for all parts, and the spec states it.
- `B.led` (`world.shared.ledFacades`) has no consumer, so keeping its count is harmless.

**Terrace rule buries the terraces**
- With a top at `floor(h/8)×8`, the cell's ground lies 0–8 m above the terrace top, so the terrain covers the blocks.
- The tops must be filled up instead: at least the highest ground in the run, plus a margin.
- The spec also doesn't say where each block's base goes. It must reach below the lowest ground in the run, or the downhill faces float.
- Name a check: no terrace corner more than 0.3 m above the ground or buried more than 0.3 m below its top.

**The Steps' domain leaves part of the wedge bare**
- "Inside the reserved disk" is r ≤ 190 m.
- In A3, that boundary projects to about x 720–850 at y about 1100. The near-left third of the wedge (x 600–720) lies outside it.
- Vegetation is cleared to r + 25 m and to a 424 m square (`vegetation.js:374`), so the bare band extends beyond 190 m.
- Define the domain as bare land at the tip that has no lot and no part. Measure the wedge's dark pixel area in A3 and G2 before and after.

**Braid readability**
- With a helix radius of 15 m and a radial depth of 28 m, the shaft centres are 30 m apart and the inner faces only 2 m apart at the base (13 m at the top after the 0.6 taper).
- At B1 (47 px per 40 m) that is a 2–15 px slit. The pair will read as one twisted slab with a slot, not two shafts winding around each other.
- The helix radius needs to be at least 22–25 m, or the radius should grow with height.
- The fixed 37 m collars stand about 9.5 m proud of the shafts at segment 12. Scale them with the taper.

**"16-sided" Tower B is a cylinder**
- `ringEval` treats `kind 2` with `prm ≥ 12` as an ellipse.
- So Tower B becomes a smooth cylinder: exactly the facade critic 1 flagged for moire at B4, and one that tower text skips.
- Use `prm` ≤ 10, or a chamfered `kind 1`.

**Searchlights**
- `lightshow.js` takes the first 10 entries of `towerTops`, keeping only those at least 160 m apart, and gives each beam its personality from `rng(808)` in that order.
- The CBD entries are sorted by y. New crown heights (Offset Pair 440/360, a Tripod top of about 355–400 against truss 345) can reorder them, which changes which beams exist and how they move in B4, B1 and G3. B4 is dominated by beams.
- Either keep each landmark's old top y in `B.tops` for sorting, or require the source list to be identical.

**Prow Terraces may break the complex rule or stay Raffles-like**
- I-015 lists 2 landmark obstacles. Tower 4 is one; the other is probably the north flank tower at (150, −170) beside the Jade bank.
- If so, that tower's height cannot be lowered into a "stepped gate".
- Even when the rule holds, a row of four towers with two flank towers and links between neighbours is still the Raffles City layout. The spec gives a "Not X" statement for the six other towers but none for this one.

**Other originality risks**
- **Lantern Mast:** three spheres of decreasing size stacked on a shaft is the Oriental Pearl Tower's signature. At G3 and A6 (24–29 px per 40 m) it reads as three beads on a stick, 18/14/11 px. The city's `tvtower` already uses orbs.
- **Shard Cluster:** a faceted glass spike tapering to a point invites "The Shard", and the name points straight at it.
- **Offset Pair:** at G3 and B3 (15–25 px per 40 m) it still reads as "two towers with a skybridge".

**Tower text and blockers**
- `groupTowers` groups parts by (x, z) rounded to 2 m. Each leaning Braid segment and each Tripod leg therefore becomes its own "tower".
- Braid segments are 38 m tall, below `blockH` = 40, so the Braid stops blocking.
- The Tripod's TRUSS legs are text-eligible and can become blockers or phrase hosts.
- The spec's acceptance rule covers this, but expect the CBD phrases to move.

**Small factual errors**
- Critic 2 names replicas in 8 distinct poses (A3, A6, B1, B2, B3, B4, G2, G3), not 9.
- B2's truss covers about 0.8% (about 60 × 500 px), so B2 is probably not a target. Its replica stays judged only as "no clear loss".

**Missing details that risk visible defects**
- Tripod: the three legs' tops overlap at the axis at 300 m, and the lantern's base size is not given (risk of z-fighting).
- Tripod: the sizes of the 110 m and 210 m rings are not given (leg centres are 26.6 m and 12.6 m from the axis there).
- Offset Pair: how deep the observation prow sits in tower A is not given.

**GPU:** the +0.1 ms estimate is plausible (about 2,100 parts against 150,000, with the lighting pass unchanged). No concern.

### What would make it stronger
- **Keep `FLAG.EDGE`** (or an equal edge light) on any shaft visible below the stack skyline in A1/A2, at minimum Raffles tower 4 and the flank towers. Keep `FLAG.LED` on the Braid's shafts. Say both explicitly.
- **Add a quick pairwise check to the quick test.** Have one blind judge compare the Prow Terraces and Braid against main on the held-out cameras, plus a held-out view framed like A2 (low, close, the shafts only). Continue only on at least 2/3 wins. "Grounded and readable" is necessary but not enough.
- **Fix the terrace rule:** fill the tops up as described, put each base below the lowest ground in the run, and define the domain as bare land with no lot and no part. Measure the A3 wedge area.
- **Braid:** helix radius of at least 22 m (gap of at least 16 m at the base), collars scaled with the taper.
- **Tower B:** use `prm` ≤ 10 for a real polygon.
- **Searchlights:** freeze the order of `towerTops`, or prove it is unchanged.
- **Prow Terraces:** list the obstacles from step 1 before finalising the design, and give the flank and row redesign a concrete "Not Raffles City" feature, for example breaking the straight row read with the sky stair.
- **Lantern Mast:** change it so it does not read as beads on a stick, for example one tall lantern with eaves, or lanterns hung off brackets beside the shaft.
- **Stage the work:** build Raffles, Steps and Braid first and adopt them alone (targets A1–A3, G2, B1, B4). Do the other five in a second idea, so one weak design can't sink the whole set.
