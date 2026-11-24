---
id: I-015
title: Hongyadong facade stack (prototype, judged on real images)
status: accepted
score: prototype track (coordinator decision; user-named priority 2; I-004 5.83 and I-011 6.0 failed review)
direction: user-requested fix (the Hongyadong-style complex must look attached and grounded)
family: landmark rebuild from the real cliff section
parent: I-011
proposed_by: coordinator (from the four reviews of I-004 and I-011)
date: 2026-11-24
---

# I-015: Hongyadong facade stack (prototype)

**Basis.** Build I-011 (`ideas/I-011-hongyadong-facade-stack/spec.md`): a stack in which each level's roof is the next level's gallery, a 3D clearance and support solver, stairs, a lift, a 25% cap on masonry, and a glow gate. Apply these required fixes, which both I-011 reviewers raised.

## Required fixes
1. **Per-station level count.** Set the number of levels at each station along the bank from the local crest height (crest about 96 m in the middle, 62–79 m at the ends; level pitch 7.2 m). Choose the extent by the cliff rule (at least 35 m of rise within 60 m inland), clamped to 480 m. Decide which end to cut from the data and document it. Step the top of the stack and the plaza down where the level count changes.
2. **Defined ends.** Each end must finish cleanly:
   - the stack steps down to the promenade with a stair tower or end pavilion;
   - galleries return around the corner;
   - the plaza ends at a balustrade.
   At the gentle ends (gradient 0.7–1.0), the rear depth rule must give units at most about 20 m deep; otherwise terrace the slope.
3. **Toe section.** The braced stilt frames replace level 0 at the toe, as an open stilt arcade with lantern-lit piers, instead of squeezing into the 0.8 m in front of it.
4. **Lift.** It stands against the stack, not on the promenade, with bridges of at most 6 m.
5. **Raffles tower 4.** Its base is at about 80 m. Levels 0–9 already fill the space under it, so no separate podium is needed. Close the 34 m gap in levels 10–11 with a short podium or arcade piece, so there is no hole in the middle of the main face.
6. **Vegetation.** Reserve the complex's footprint, plus 10 m, in the vegetation exclusion mask, so no trees grow through the stack.
7. **Eave glow.** Give the pent eaves a separate emissive strip at least 0.3 m tall, so the warm gold lines read at river distance. Count these parts in the budget.
8. **Numbering.** Use new material ids instead of flag bits 18–21. Bit 18 is reserved by I-010 and I-014.
9. **Plaza collider.** The thin plaza deck gets a collider, so the player can walk on it.
10. **Quality scaling.** Scale the 6,500 prop cap with the quality level.

## Targets
- **Targets:** A1, A2, A3 and G2. Adopt on at least 3 of 4 with no clear loss elsewhere.
- **Expected to change little:** G3 (small at that distance).

## Quick test
- **Slices:** two fully dressed slices, one in the middle at the Raffles crossing and one at the south end.
- **Cameras:** three held-out cameras that are not eval poses: one river camera at a different angle from A2, one at the north end and one at the south end.
- **Checks:**
  - zero overlaps and zero unsupported pieces in the dev audit;
  - masonry at most 25%;
  - glow at least the baseline's;
  - the full `bench.mjs` fly-through within the gate.
