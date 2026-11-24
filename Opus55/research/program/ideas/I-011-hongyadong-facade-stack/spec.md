---
id: I-011
title: Hongyadong as a façade stack on the real cliff (each roof is the next gallery; a 3D clearance and support solver)
status: proposed
direction: from reviews of I-004 (Attack the weakness, user priority 2)
family: procedural landmark rebuild: section-first façade stack with a 3D support and clearance solver
parent: I-004
proposed_by: idea generator
date: 2026-11-24
---

# I-011: Hongyadong as a façade stack on the real cliff

## Idea
Rebuild the stilt complex the way the real Hongyadong is built: as a **façade stack**, one continuous multi-storey building leaning against the cliff. Each level of two floors sits on the level below, and is set back by one gallery depth.

- **Each level's roof is the next level's gallery.** No gallery is cantilevered.
- **Pitched roofs appear only as pent eaves.** These are short sloped eaves on the front face at every floor, with glowing gold edges. Together they produce Hongyadong's stacked lines of warm light.
- **Breaking the rhythm.** Pavilion tower bays project forward through 3–6 levels, stair bays cut vertical lit seams, and the lowest levels push out over the toe of the slope on braced stilt frames.
- **The top level's roof is a plaza** that meets the crest and the towers above it.

The gallery depth is not a free parameter. It is set from the measured cliff section, so the top level lands on the crest. The cliff's own gradient therefore sets how deep each gallery is.

**The solver.** A **3D clearance and support solver** places every piece. It checks four things:
- **Below (support):** rock, the level below, a stilt frame, or bracket struts.
- **Above (clearance):** the next level's deck, and any existing part such as a Raffles tower.
- **Beside:** neighbouring pieces and obstacle footprints.
- **Obstacles that are not grounded:** the same rule handles an existing landmark that floats over the site. Raffles tower 4 stands at about (215, −68) with its base at about 79 m, over a cliff face about 20 m lower. It gets a podium built under it, and the galleries end against that podium on stairs.

## The measured site
I probed the terrain myself (`tools/probe.mjs --grid`, 20 m step). The figures agree with both reviews.
- **Plan:** the cliff runs NNE–SSW from about (180, −300) to (260, +120), which is about 430 m.
- **Section** (z = −140, inland normal about (−0.95, 0.3)):

  | Inland distance | Ground height |
  |---|---|
  | 0 m | 6 m |
  | 20 m | 27 m |
  | 40 m | 71 m |
  | 60 m | 96 m |

  The toe has a gradient of about 1.0, the middle about 2.2 (66°), the top about 1.25. The crest plateau is at 90–96 m.
- **Height and levels:** about 86–90 m from the promenade (5.8 m) to the crest, so **12 levels** of 7.2 m.
- **Raffles:** tower 4 is at (215, −68) with half-width 15 and half-depth 12, base y0 = ground − 6 ≈ 79 m. It leans 9 m out toward the river as it rises. The tip towers at (150, −170) and (150, +45) stand on the plateau, clear of the face.
- **Promenade (`terrainBank.js`):** the deck is at y = 5.8, from water distance 1 to 6.2 m.

## Why it might work
- **It fixes what both reviews found:**
  - It starts from the real section (12 levels, upper bands 3–4 m).
  - It removes roof and gallery collisions by construction: everything in level k must fit below level k+1's deck, and the only things outside the face are eaves within a set envelope.
  - The galleries come free with the stack.
- **The real Hongyadong works this way.** Its facade is a stack of floors stepping back up the rock, read through horizontal lines of eaves and lit galleries, with a few projecting towers. It is not a field of separate houses on terraces. That is the image the brief asks for ("stilted riverside buildings").
- **Critics' findings §1–2:** "stuck onto a black wall" and floating window strips. With the stack, every level is visibly carried by the one below. Stilt frames appear where the building really overhangs the slope, and masonry is limited to under 25% of the visible face, so the "dark wall" cannot come back.
- **Both critics praised the warm glow.** It is protected by a measured rule: the complex's average luminance from the held-out river camera must be at least the baseline's.

## What's new about it
- **Compared with I-004** (rejected, 5.83), it replaces terraces packed with separate houses by a stack whose geometry follows the cliff. It adds clearance and obstacle checks to the solver, grounds landmarks that overhang the site, builds stairs and a lift, has a real budget for parts and props, measures glow and masonry share, and uses held-out cameras for art direction.
- **Closest existing code:** `stilts()` (a grid of tiers) and `terracedPodium()` (strips, a rail and an optional stair).
- **Grounding other modules' work:** the solver also grounds parts placed by other code (Raffles tower 4). I know of no earlier work in this program that does this.

## Expected effect on the metric
- **A1 and A2:** clear wins in pairwise judging. Critic scores about +1.5 on detail and coherence, and +0.5 to +1 on character.
- **A3 and G2:** small gains.
  - The rule that sets the complex's length follows the cliff, so it extends the complex south to about z = +120. That covers the bare face to the left of today's complex in A3, and the peninsula face seen in G2.
  - A3's bare mound at the tip, south of z = +120, is outside the complex and stays as it is.
  - G2 is listed so that a loss there would show. It must not lose.
- **Zone A:** about +0.3 to +0.5.
- **Target poses:** A1, A2, A3. **Watched pose:** G2.

## Quick test: one fully dressed slice, judged on held-out cameras
Build a **60 m slice** with full dressing. It must include all 12 levels, pent eaves, galleries, railings, lanterns, one stair bay, stilt frames at the toe, and the top plaza.
- **Choosing the slice:** centre it on the station closest to an obstacle crossing (here Raffles tower 4), so the hardest case is tested. If no obstacle crosses, use the steepest station.
- **Held-out cameras.** Compute 3 cameras from the slice's station frame, not from eval poses:
  1. river level: 120 m out along the outward normal, 10 m high, looking at the slice's middle height;
  2. oblique: 200 m away at 45° along the bank, 40 m high;
  3. plaza edge: 3 m above the plaza, looking down and along the bank.

The slice passes if all of these hold:
1. **Overlaps:** the dev overlap audit reports 0 overlaps between pieces, or between pieces and obstacles. Burial into rock and designed contacts are excluded. Unsupported pieces: 0.
2. **Masonry share:** at most 25% of the slice's projected area in the river camera.
3. **Glow:** the mean luminance of the slice's screen region in the river camera is at least the baseline's luminance over the same region of the old complex at the same camera.
4. **GPU:** at the river camera, measured with `--stats` against the baseline at the same camera:
   - gbuffer plus lighting rise by no more than 0.12 ms for the slice;
   - scaled to 430 m, no more than 0.6 ms at the closest views.
   - Also run a full `bench.mjs` fly-through, to catch shader register pressure from the new material branches. Allowed rise: +0.1 ms.
5. **Blind A/B:** a fresh subagent with no context compares the slice against the baseline, crops at the river and oblique cameras, and prefers the slice.

All art direction happens on these held-out cameras, plus two more along the full bank once the whole complex is built. A1, A2, A3 and G2 are captured only once, as a final check before handing over. Fixed seed. Landmark pieces are placed by rule, never by picking seeds.

## Implementation plan
Files:
- new `src/buildings_stilts.js`, called from `genLandmarks` in place of `stilts()`, which is deleted;
- `buildings_wgsl.js`: one new material and a few variants;
- `buildings.js`: the complex's lights and its own prop counter.

### 1. Site, stations and reserved region
1. **Site and length.**
   - Keep the steepest-bank search for the seed point.
   - Walk the bank in 4 m stations both ways, holding water distance at 10 m, as now.
   - Keep going while the *cliff criterion* holds: the rise within 60 m inland is at least 35 m. Stop after 2 consecutive failures. Clamp the length to 480 m.
   - Here that gives about z −300 to +120, about 430 m.
2. **Station frame and section.**
   - For each station: the bank point, a smoothed tangent (5-station window), and the inland normal.
   - Sample `heightAt` every 1 m inland to 90 m. Crest distance `u_c` = the first point after the main rise where the slope falls below 0.15.
   - Smooth sections along the bank (5-station window) so the stack has no kinks.
3. **Reserved region.**
   - The region runs from water distance 6.5 m (behind the promenade; read `world.shared.embankments` if present) to `u_c` + plaza depth (up to 25 m), over the station range.
   - Remove `world.lots` that intersect it, the same way `prepareLots` removes lots. This runs before district generation, so no city building is generated inside the complex.
   - Collect **obstacles**: solid parts already in `B.P` (landmarks) whose bounding boxes intersect the region, as oriented boxes. Here that is Raffles tower 4, and possibly the vault-deck legs.

### 2. The stack section
1. **Levels.**
   - `y_k = 7.0 + 7.2·k` for k = 0…N−1, where N = round((crest height − 7)/7.2). Here N = 12.
   - Each level is two floors of 3.6 m.
2. **Front faces.**
   - Level 0 front `f_0` is at water distance 7 m.
   - Gallery depth `g = clamp((u_c − D_top − f_0)/N, 2.4, 3.8)`, with a top plaza depth `D_top` of 12–25 m. Here g ≈ 3.0.
   - `f_k = f_0 + g·k`, varied ±0.4 m per family (see 3), and kept monotonic.
3. **Unit depth rule.**
   - The rock behind level k at its top height is at `u(y_{k+1})`. The unit spans from `f_k` back to `u(y_{k+1})` + 1 m (its rear is buried in rock).
   - If `u(y_{k+1}) − f_k` < 4 m (rock very close), set that level's front forward by up to 1.4 m, which reduces g for that level, down to a minimum of 1.6 m.
   - If it is still under 2.5 m, the unit becomes a *face unit*: 2.5 m deep, carried by bracket struts.
4. **Clearance envelope** for level k.
   - All bodies stay within y in [y_k, y_{k+1} − 0.35] and behind f_k. The 0.35 m is level k+1's deck.
   - Pent eaves may project forward of f_k into gallery k's airspace, up to 1.3 m, but only between y_k + 2.4 (headroom) and y_{k+1} − 0.35.
   - Railings for gallery k+1 stand on level k's roof at its front edge.
   - Nothing in level k rises above y_{k+1}, except tower bays (see 4) and the top level.

### 3. Units along each level
1. **Families and units.**
   - Draw a *family* every 30–60 m:
     - wall variant: dark timber lattice 45%, white plaster with timber frame 25%, red lacquer 10%, open shopfront 20%;
     - eave colour: dark grey 70%, teal glaze 15%, red-brown 15%;
     - a gallery depth offset of ±0.4 m.
   - Units are 4–12 m wide within a family.
2. **Unit front variants.** Each must pass the envelope.

   | Front variant | Share | Notes |
   |---|---|---|
   | Flush | 50% | |
   | Oriel | 20% | Upper floor projects 0.8–1.2 m over the gallery on 2–3 bracket props; bottom at y_k + 3.6 |
   | Recessed loggia | 15% | Upper floor face set back 1.2 m, with a railing |
   | Open shop | 15% | Lower floor fully open to the gallery |

3. **Pent eaves.**
   - Two per unit: a lower-floor eave at y_k + 3.0…3.4, and a skirt eave just under the railing of gallery k+1, at y_{k+1} − 0.4…−1.0.
   - Each is a **leaned thin box**: shear via `lx`/`lz`, `MAT.ROOFTILE`, glowing eave edge. It uses the cheap box mesh, not the curved roof mesh.
   - A small upturned corner flick prop sits at each family boundary.
4. **Gallery deck.**
   - The flat roof cap of each unit gets a new `DECK` flag. The `fs` roof branch then draws wet timber planks (box-filtered 0.15 m boards), which reflect the lanterns.
   - Railing: one thin box per unit front, with a new WOOD railing variant (balusters painted with `pulse`, a lit top rail on 30% of families).
5. **Lanterns.**
   - One emissive prop every 3 m, hung under each skirt eave, alternating red and gold.
   - Window glow uses the existing `MAT.WOOD` lit lattice at `param` 1.2–1.6.
6. **Signs and dressing.**
   - `B.slot(...)` vertical sign slots on 1 in 4 shop units.
   - Laundry: 8% of oriels.
   - Potted plants: 10% of gallery fronts.
   - AC units only on tower bay sides and stair bay walls.

### 4. Features placed by rule (fixed seed, never tuned to cameras)
- **Tower bays.**
  - One every 55–70 m. Positions are evenly spaced from the ends with a seeded ±10 m jitter, skipping obstacle zones.
  - Each is 8–10 m wide, projects 2–4 m forward of the stack, and rises through 3–6 levels from a base level.
  - Each floor has its own eave. The top is a double hip roof (`prof: 4`, the only curved roofs), rising up to 10 m above the stack or the plaza.
  - Galleries end at the tower's sides and pass through it in an open arched lower floor.
  - Support: the tower stands on the level below it. Where it projects past that level's front, a column frame runs down to support.
- **Stair bays.**
  - One every 60 m, offset from tower bays. Each is a 6.5 m wide, 3.2 m deep recess through all levels.
  - Every floor has two switchback flights (1.8 m rise, 10 risers, 2.8 m run) and landings.
  - Each flight is one leaned slab **part**, which carries a painted tread pattern (a stair mode of `MAT.MASONRY`), plus 10 step **props** with the `DETAIL` flag, so they are drawn only up close.
  - The bay's back wall gets a lit slatted panel, so each stair bay reads from the river as a vertical warm seam.
  - The first flight starts from the river walk. The last one reaches the plaza.
- **Lift.**
  - At the station nearest the middle of the complex that is clear of tower bays and obstacles.
  - A 3×3 m glass shaft with lit edges, standing 4 m in front of the stack on its own footing behind the promenade, rising to plaza level + 6 m.
  - A machine room on top carries a large vertical sign slot. A static lit cabin sits at about one third of the height.
  - Short bridges connect the shaft to the galleries at every third level and at the plaza.
- **Stilt frames at the toe.**
  - Where the toe slope is shallow (gradient < 1.3) and the solver finds the floor of levels 1–2 more than 3 m above the ground, push those units forward 3–6 m over the toe.
  - Carry them on **braced frames**: round timber columns (`kind: 2`, radius 0.35) every 3.2 m, in 2–3 rows; tie beams every 3 m in height; diagonal braces (lean) in alternate bays; stone footings.
  - This leaves a lit open undercroft (headroom at least 2.5 m) facing the river walk.
  - Where those units overhang the promenade (by up to 2 m), they stand on struts and form a covered walk. No columns stand on the promenade deck.
- **Top plaza.**
  - The top level's roof continues as a deck to the crest (depth D_top), along the whole bank.
  - It stops 2 m short of obstacle footprints and of any surviving lot footprints, tested as actual oriented boxes, not landmark radii.
  - Dressing: paving with joints, lamp posts every 12 m, planters with small trees, 2–3 kiosks, a pailou gate at each stair-bay head, and a lantern railing along the front edge.

### 5. The 3D clearance and support solver
- **Data.** Every placed piece goes into a uniform 3D grid hash (2 m cells) of oriented boxes, in station-local coordinates. Obstacles go in first.
- **Checks before each placement.**
  - **Below:** sample the support under the piece's footprint (corners, centre, and every 2 m along long pieces). Support is rock (`heightAt`), the top of a piece below, a stilt frame, or bracket struts.
  - **Above:** no piece or obstacle intersects the space between the piece's top and its level's envelope ceiling.
  - **Beside:** no intersection with neighbours or obstacles beyond 5 cm. Burial into rock is allowed. Designed contacts (eave to face, railing to deck) are allowed.
- **Cantilever rule** (one rule, used everywhere):

  | Overhang beyond support | Allowed? |
  |---|---|
  | Up to 1.0 m | Yes, unsupported |
  | Up to 2.5 m | Only with bracket or strut props every ≤ 2.5 m; these count as support |
  | More than 2.5 m | No: needs columns |

  Galleries are never cantilevered. They are the roof of the level below.
- **Resolving a failed check,** in order:
  1. narrow the piece (down to 3 m wide);
  2. set it back;
  3. drop to one floor with a roof terrace (only if the envelope allows);
  4. replace it with a stair landing or a planted gap.

  Log each action.
- **Obstacles that float.** For any obstacle whose base is more than 0.5 m above the rock anywhere in its footprint (here Raffles tower 4, whose front edge is about 20 m above the face):
  - build a **podium** beneath its whole footprint, plus 2 m: a masonry base that changes to a timber stack face on the river side, carrying the eave lines across as lit bands so the horizontal rhythm continues;
  - the podium's top is the obstacle's base, joined to the plaza;
  - the galleries on each side end at a stair bay placed against the podium.
- **Overlap audit (dev only).** After generation, run a full pairwise audit of all complex pieces plus obstacles through the hash. Print counts of overlaps (must be 0), unsupported pieces (must be 0), masonry area and pieces placed. The quick test relies on this.

### 6. Materials (`buildings_wgsl.js`)
Reserved numbers: `MAT.MASONRY = 21`. No new profile (I-004's `prof: 7` is dropped).
- **`MAT.MASONRY`:**
  - sandstone ashlar, 0.6 × 0.3 m blocks;
  - mortar lines box-filtered, fading to their average below 2 px;
  - water streaks and moss from the top edge;
  - weep holes;
  - a warm wash from the gallery lights near the top;
  - no windows;
  - stair mode: tread stripes along the slope.
- **`MAT.WOOD` variants,** selected by two spare flag bits (bits 18–19), so `param` stays the glow level:
  - 0 lattice (current);
  - 1 plaster with timber frame;
  - 2 red lacquer;
  - 3 open shopfront: the lower floor uses `windowGrid` with wide openings and `interior()` mode 2.
  - The railing is a further variant using flag bit 20.
- **`DECK` flag** (bit 21): the timber plank roof cap, glossy when wet.
- **Register pressure:** keep the new branches small. Check with the full fly-through bench (quick test 4).

### 7. Lights
- 60 point lights at priority 3, so they are kept:
  - undercroft lights every 30 m;
  - stair bay lights at every 3rd level;
  - tower bay uplights;
  - plaza lamps every 24 m.
- They replace about 34 lights today and come from the buildings module's 1450 budget. Lights wanted are 1934, so shop spill lights elsewhere absorb the change. The total count is unchanged.
- Light tiles at A1 and A2 get about +26 lights.

## Cost
- **Effort:** one implementer, 3–4 days. The slice and solver about 1.5 days, the full bank and features about 1.5 days, materials and checks about 1 day.
- **Part and prop counts** for 430 m and 12 levels:

  | Item | Parts | Props |
  |---|---|---|
  | Unit bodies (about 54 per level) | 650 | |
  | Pent eaves | 1,300 | |
  | Railings | 650 | |
  | Oriel and loggia extras | 300 | |
  | Brackets | | 300 |
  | Tower bays (7) | 250 | |
  | Stilt frames (columns, ties, braces, footings) | 700 | |
  | Masonry (podium, ends, plinths) | 150 | |
  | Stair slabs and landings (7 bays × 24 floors × 3) | 500 | |
  | Stair steps (`DETAIL`) | | 3,360 |
  | Plaza | 120 | 200 |
  | Lift | 25 | |
  | Lanterns | | 1,650 |
  | Dressing | | 600 |
  | **Total** | **about 4.6k** | **about 6.1k** |

  Total about 10.7k, which matches both reviewers' 8–12k.
- **Prop budget.**
  - Props are at 117,412 of 130,000, and `genLandmarks` runs first. So the complex counts its props on **its own counter with a hard cap of 6,500**: it adds props directly through `B.P.add` with `FLAG.PROP`, and does not touch `B.props`.
  - District dressing keeps exactly the budget it has today and can never be starved.
  - If the cap is reached, drop step props first. The stairs then show as the slab with painted treads.
- **GPU per frame:**
  - **Parts:** +10.7k on about 134k, so `bld-cull` rises about +0.015 ms.
  - **Triangles:** almost all pieces use the 32-triangle box mesh, including the leaned-box eaves. Only about 30 tower-bay hip roofs use curved meshes. At A2 that is about 6k visible pieces × 32 triangles plus about 0.1M from curved roofs, drawn in 2 passes: about 0.5M triangles in total.
  - **Pixels:** the complex covers about 35% of A1 and A2, as the old complex plus bare terrain did. The shading cost is similar to today's WOOD path.
  - **Estimates:** +0.2–0.4 ms gbuffer plus lighting at A1 and A2. The fly-through sees the face only for about 5–8 s, so its average rises about +0.04–0.08 ms. Shader register pressure is checked separately.
- **Memory:** about +1 MB of part data.

## Risks
- **A 430 m, 12-level stack could read as a new regular grid.** Families, the ±0.4 m gallery jitter, oriels and loggias, 7 tower bays, 7 stair seams and the lift break it up. Art direction on the held-out cameras must check this explicitly. Hongyadong itself is fairly regular, so the bar is "a believable building", not randomness.
- **Glow loss.** More structure (railings, eaves, masonry) per square metre can dim the read. The glow rule in quick test 3 is a hard gate. Raise lantern density or lattice glow until it passes.
- **Raffles podium look.** A 30 m masonry and timber podium under a glass supertall could look odd. Carrying the eave lines and galleries across its river face makes it part of the complex. If it still reads badly on the held-out cameras, change the podium's upper part to a timber stack, keeping masonry only below level 3.
- **Bank changes from I-001..003.** Everything is derived from `heightAt`, `waterDist` and `world.shared.embankments` at load time, so the generator adapts. Only the lots-removal step interacts with layout work, and it only removes lots inside the reserved region.
- **Walking and colliders.** Colliders go only on unit bodies, the podium and the plaza deck, not on steps or eaves. `functional.mjs` "cannot fly through buildings" and "gravity lands the player" must still pass.
- **Merge overlap.** I-005 and I-006 also edit `buildings_wgsl.js`, in other functions. Reserved numbers: `MAT.MASONRY = 21`, flag bits 18–21 (I-005 uses `prof: 8`, list 6 and its own new flags; the implementers must agree on bit numbers at merge).
