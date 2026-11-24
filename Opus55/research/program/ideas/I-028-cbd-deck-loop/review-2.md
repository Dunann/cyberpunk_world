## Reviewer 2 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 5 | A networked deck district around the tallest tower is a sensible transfer of real Lujiazui, Hong Kong Central and La Défense practice. But it is the standard answer to "add elevated walkways", I-019's reviewer proposed it, and the code already has podium-to-podium walkways across roads (`walkways`, `buildings_gen.js:573`) and 320 skybridges. So it is not "the first idea about pedestrian circulation". New here: the loop-and-cross plan, the escalator and lift links, and the roof tier. |
| Feasibility and credibility | 4 | Cheap to build. The GPU estimate is plausible, and the collider rules (bottoms 4.5 m or more up, tops 120 m or less) hold against `trafficCars.js:320` and `air.js:421`. But the claims the idea rests on do not survive the code. B2 coverage is about 1-3%, not 8-15%. About a third of the network faces have no lot, because the elevated Metro Line 6 corridor and the landmark margins removed those lots. Giant LED screens stand where the deck goes. Sign requests are always lit. "Nothing within 250 m of `twin`" is false. The Stage 2 ring is not buildable under its own 60 m gap cap. |
| Expected impact | 4 | It answers user priority 7 directly, and H10/H11 will probably look better. But no eval pose changes much. B2's new geometry starts 108 m ahead, and everything the critics marked down in B2 lies in the first 100 m. If B2 falls under 2.0%, the idea is adopted (or not) on held-out cameras placed on the network, and the critic score that defines the goal barely moves. The program has already learned that a change of about 2% of the frame does not win (I-002). Some is learned if it fails: whether street-level layering in a flat district moves the judges. |
| **Overall (average)** | **4.33** | |

### Strongest reason it will fail
**The target pose barely sees it.** The spec's B2 case ("8-15% green", "fills the middle of its frame", B2 +0.8 to +1.5) is an estimate, not a measurement, and the geometry contradicts it.

**Where B2 sits.** B2 stands at the centre of the x = 3050 / z = −1000 intersection, 1.7 m up, pitched 5.5° up (`poses-v1.json`; f = 720 / tan(0.525) = 1242 px). The loop's west side starts at z = −1125, so the nearest new geometry is the SW junction's south span, about 108 m ahead.

**On-screen sizes at 2560x1440, from the real focal length:**
- **Spans across the avenue.** The 26.6 m span at 108 m is about 306 x 31 px (rows 731-762). At 141 m it is 245 x 24 px. At 250 m it is about 130 x 13 px, and the spans beyond are under 1,000 px each. All spans together: about 18k px.
- **Side decks.** They run nearly edge-on to the camera. Fascia plus soffit for 125-500 m on both sides: about 7k px.
- **Columns.** Every 15 m, both sides: about 9k px.
- **Corner plazas:** about 8k px.
- **Total.** The Stage 1 base is about 42k px, or **1.1% of the frame**. The full Stage 1 is about 2-3%. Escalators, lifts and signs add about 10-15k px. The one large near-camera item is the roof tier's lit parapet along the near-left corner podium (20-108 m away, about 35k px), and that is a podium trim line, not a walkway.

**Consequences.**
- B2 is probably below the 2.0% rule when the target list is written at quick-test step 1 (the base build). The spec is ambiguous about whether the list is recomputed after the full build.
- If B2 misses, the idea is judged only on H10-H12, which are placed on the network by construction. It could then be "adopted" without moving any critic score.
- Even if B2 qualifies, the change is a thin footbridge near the vanishing point behind the oncoming traffic. That is the I-002 and I-014 profile (about 2% changed; one slight judge win at best).
- The B2 critic defects (the purple car about 1 m from the lens, the "pixel-noise curtain wall", the flat storefronts) are all within 100 m and untouched.

### Other concerns
- **The network the spec describes does not exist on the lot map.** The spec counts road length (2.7 km, "about 4.5 km of deck faces") but decks only faces whose lot exists. I replayed `_isReserved` (landmark r + half-lot margin, routes 12 m + margin) for the CBD grid with `catmullRom` of `ROUTES` (script: `C:\Users\pdunc\AppData\Local\Temp\claude\71d1a506b11c03e8\7dd9aef4-6179-4c30-820b-ff3b0f510313\scratchpad\lots.mjs`).
  - **Metro Line 6 runs through the loop**, elevated at ground + 24 m. It crosses x = 3050 at z ≈ −1565, x = 3300 at −1477, z = −1375 at x ≈ 3458, and x = 3550 at −1298. The spec never mentions it.
  - **Faces with a lot.** Of the 48 network block faces, about 30 have one. By section: loop west 6/8, south 8/8, east 4/8, north 6/8, cross x = 3300 3/8, cross z = −1375 3/8.
  - **Gaps.** On B2's own avenue, the block from z = −1500 to −1625 has no lots on either side. The NW corner has 1 of 4 corner lots (metro and `truss`), the NE corner 2 of 4 (`crown`), and the SE corner 3 of 4.
  - **Result.** The "legible loop and cross" is a broken loop with dead-end stubs and an almost empty cross. The cross arms mostly run beside the twist plaza and the metro strip. The roof tier cannot be built at the NW and NE corners as described.
  - **Possible station.** By the station-spacing rule in `transitLayout._stations`, a metro station may fall near (3465, −1345), on the cross arm H11 looks at. Not verified (that needs a GPU run). Check it before freezing the site.
- **Giant LED screens collide with the deck.** `signPlace.js:120-129` puts CBD screens on long lot edges with probability 0.12, 0.6 m outside the lot edge, up to 40 m wide, with bottoms at ground + 9 to + 19 m. The deck's outer edge is 0.3 m inside the lot edge at + 10 m. Any screen on a network face sits in front of the balustrade or cuts through it. The overlap audit covers "existing boxes" (building parts), not signs. Add a rule: skip the deck on those spans, or mount the screen on the deck.
- **The "no sign light" claim contradicts the code.** `signPlace.js:313` adds a light, at priority 1e5, for every request with w·h > 3. A 6 x 1.2 m span sign is 7.2. Those candidates sort first in `selectLights` (budget 2150, 3 per cell) and push out existing sign lights, which breaks the identity claim. A `noLight` flag on requests is needed and is not in the plan.
- **The atlas is shelf-packed tallest-first** (`signAtlas.js:123`). "Strings appended at the end" changes the packing, and overflow drops entries with only a warning. Assert `dropped == 0` and that the sign UV set is identical apart from the moved rects.
- **The twin claim is false.** The SE loop corner (3550, −1125) is 245 m from `twin`, and its south span and plazas are about 228 m away. This is harmless at deck height, but the spec should not assert it.
- **H10 is defined at (3550, −1625).** That is the centre of the intersection, not a sidewalk. Give the offset rule.
- **Stage 2 ring.**
  - I-019's measured across-road gaps were 44-148 m, with only about 3 pairs at 60 m or less in the whole CBD. Single-tower lots face each other 65-85 m apart. Only two-tower 99 m lots facing across an x-road come under 60 m, and their second shafts are 0.55-0.75 of the first, so many miss the 140 m top rule.
  - Expect 0-2 corridors, not a ring. That is I-019's "invisible single bars at mid-height" again.
  - If it is kept, the corridor at 112-120 m gives only a 10 m margin to the air-corridor skip line. The lowest band can be 155 m, which puts the line at 130 m. The spec's "lowest corridor 150 m" is slightly off.
- **Detached or pasted look (user priority 2).**
  - **No darkening under the decks.** The renderer has no shadows. AO is a per-material gbuffer value, and the terrain does not know it is under a deck. The ground under the decks keeps full sky ambient and the wet sky reflection, so a deck can read as a sticker over a fully lit forecourt.
  - **Floor lines.** The deck is set at max ground + 10, while podium floor lines are at gMin + 5k (floorH 5). Where the ground varies, the slab lands mid-floor on a glass curtain wall.
  - **Fix.** A cheap terrain darkening term under the deck footprints (analytic boxes in `terrainShade.js`), plus snapping the deck height to each host podium's floor line or adding a spandrel band, would address both.
- **Materials.** Kilometres of plain concrete slab and box girder at street level invite the critics' existing complaint about untextured slabs and beams (A2 "blank slab", A5 "guideway beam untextured"). The spec says nothing about soffit coffers, panel joints, grime or paving on the deck.
- **The roof bridges clash with the spans.**
  - **Height clash.** With 12 m podiums, the roof bridges at the loop corners sit 1-2 m above the deck spans' balustrades (+11.1 m). The spec needs an along-road offset rule.
  - **Undefined structure.** Their spans are 34-42 m (podium face to podium face), and the spec gives no depth or structure for them. Stepped bridges over a road are an odd form.
- **Site choice and B2.** H ± 250 m is a free parameter, and ±250 is the value that turns B2's avenue into the loop (±125 or ±375 would not). It is defensible as "about two blocks", but it should be called a choice, not a consequence.
- **Crowd.** Say explicitly that the new section uses copies of `push`/`style` drawing only from 2802/2803, as I-027 does. Include the glint cap (12,000) in the 90% occupancy check.

### What would make it stronger
1. **Measure before claiming.** Run the green-mask coverage at B2 (and B4, B1) for the base and the full Stage 1 now, and state whether the target list uses the full build. If B2 is under 2%, say plainly that the idea cannot move the eval metric and is a priority-7 investment judged on held-out cameras.
2. **Bring the network to the camera.** Use a site rule that is not keyed to B2, for example "every CBD avenue face from the river front to the landmark ring", so decks also run along the near 100 m of B2's avenue. The deck, its columns, soffit lights and people at 20-100 m would then fill the left and right thirds of B2, where the critics' complaints are. This must be argued as a district rule and checked against the identity list.
3. **Make the metro an asset.** Route the loop under the Line 6 viaduct deliberately, which gives a third level for free. Fill the reserved metro and landmark gaps with freestanding deck spans on two column rows, and add stair or lift ends at every stub so nothing dead-ends.
4. **Handle the existing signs.** Skip, or integrate, the giant CBD screens on network faces. Add a `noLight` flag to sign requests. Assert the atlas has no drops.
5. **Ground it.** Add terrain darkening under the deck footprints, snap the deck to the host podiums' floor lines, and give the deck faces some surface detail (coffered soffit, panel joints, paving).
6. **Drop or rescope Stage 2.** Measure the real candidate pairs first, and drop the "ring" language unless at least 4 pairs exist.
