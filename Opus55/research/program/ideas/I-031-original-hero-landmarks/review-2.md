## Reviewer 2 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 6 | No earlier idea redesigned the heroes one by one or built on the reserve disks, so it is new to the program. The designs themselves are uneven. Shard Cluster and Tripod Lantern are distinctive. Offset Pair and Terrace Ridge are generic setback towers. Braid, as sized, is still a single twisting, tapering body with sky-garden rings, which is what makes Shanghai Tower recognisable. Lantern Mast (three red spheres of decreasing size on a concrete shaft) points toward Oriental Pearl, a real tower in the city the brief names. |
| Feasibility and credibility | 5 | The isolation plan is unusually careful and mostly matches the code. Index-seeded parts (`buildings_gen.js:32`), landmarks generated first, none of the seven calling `R`, the 56 props, `placeComplex` as the model: all correct. But the two designs the quick test depends on have concrete geometry errors (Braid gap, Steps level rule, Steps limited to the disk). The Raffles obstacle facts are already known from I-015 but are not used. Two designs leave their plan sizes unstated. The effort is large. |
| Expected impact | 6 | Covering the A3 wedge removes a critical defect in the zone with the most weight, and fixes the G2 tray. Removing the replicas fixes a named brief violation. But about 9 targets need about 6 wins. Only A3, G2, B4 and B1 change a lot. A6, G3 and B3 show the landmarks 20-90 px wide, so ties are likely. A1/A2 change in the whole upper half of the frame (see below) in a direction nobody can predict, so adoption is close to the line even if every design is built well. |
| **Overall (average)** | **5.67** | |

### Strongest reason it will fail
The two showcase pieces don't produce what the spec claims, and the adoption rule then needs wins on poses where the change is barely visible.

- **Braid.** The shafts are 40 x 28 m with the long side tangent, so each reaches 14 m radially. Their centres sit on a 15 m helix, offset by 180 degrees. The inner faces are therefore 1 m from the axis, a 2 m gap at the base. With the 0.6 taper the gap is still only about 13 m at the top. With focal length 1242 px, that gap is about 4 px at the base and 26 px at the top in B4 (624 m away). In B1 (1064 m) it is 2-15 px. Whenever one shaft passes in front of the other over the half turn, there is no gap at all. Four 74 m collars wrap both shafts. The result reads as one twisting, tapering glass body with sky-garden bands and a spire: Shanghai Tower again, minus the edge strips. This is also the tower that dominates B4 (about 1360 px tall) and the B1 light show.
- **Confluence Steps.** "Terrace level floor(h/8) x 8" puts every platform 0-8 m below the terrain it stands on. The opaque height field then covers the platforms, and the retaining faces show only as slivers. The rule needs to round up, with each block reaching below the lowest ground in its run.
- **The Steps stop at the disk edge.** Projecting A3 (650, 20, 150) toward (220, 150, -60) at f = 1242 px, the r = 190 disk edge crosses the wedge at about x = 720-850. The upper-left part of the wedge is terrain at about (250, 150) and (150-200, 130-200), 210-260 m from the site centre. That is outside the disk, so a curved bare remnant would stay next to a ring of lit terraces that ends sharply.
- **A dark seam beside the complex.** The 12 m clearance from the complex is about 45 px of dark gap at A3, right where the wedge meets the stack.

Together, these make it likely that the A3, B4 and B1 wins the spec counts on do not happen as described. The spec cannot reach about 6/9 from A6, G3, B3 and A1/A2 alone.

### Other concerns
- **Raffles obstacle facts are known but not used.** I-015 DEVIATIONS records two landmark obstacles, one of which is row tower 4 (215, -68). Tower 4 has `lx = 9`, so in `hongyadong()` both its obstacle box and its lean depend on `h` (`fr0 = (yTopMax - y0)/h`, `buildings_stilts.js:414-417`). Its height is frozen by the spec's own rule.
  - The spec should name the second obstacle now: tower 3, or the tip tower at (150, -170).
  - "Heights rise landward" and "the two flank towers become lower stepped gate towers" both conflict with the rule if a flank tower or tower 3 is that obstacle.
  - The spec also says the complex treats "solid" parts as obstacles. It actually takes every non-prop part placed before it with min(hw, hd) >= 2, h >= 4 and y0 <= yTopMax, whether or not it is `solid`. So new crowns, galleries or gate terraces in the old Raffles slots can become obstacles too. The rule "must not enter the complex's volume" covers this, but the wording will mislead an implementer.
  - A way out the spec misses: the complex only reads the parts while it is being built. An obstacle part could keep its fields during `hongyadong()` and be shortened afterwards, as long as the change is above yTopMax.
- **A1/A2 are underestimated.** At A1 (388 m) and A2 (235 m), the Raffles row shafts fill roughly the top 30-45% of the frame, and their dominant feature there is the neon edge strips. "Changes only above the stack's skyline, ties possible" is too hopeful. Taking `FLAG.EDGE` off these shafts changes a third or more of each frame, at the two poses that hold I-015's wins. The crowns and galleries that are meant to replace the light are mostly above the top edge in A1. Either keep some edge accent on the row towers, or show held-out views from the A1/A2 directions.
- **Losing the vault may cost character.** The cyan vault is the single most readable feature of the cluster in A3, G2 and G3 (about 240 x 40 px in G2). The three staggered galleries are each about 60 x 8 m, roughly 65 x 9 px in G2, so they will read much weaker. "Less like Raffles City" is not a win for a judge who only sees the images. One of the galleries should stay bold: lit, and at least as large on screen as the vault.
- **Lantern Mast.** Three warm-red spheres stacked on one concrete shaft will make some judges think of the Oriental Pearl Tower, and the brief explicitly cites Shanghai. The city already has orbs on a mast (`tvtower`). Choose a form that is not a stack of spheres (for example, a lantern with a tiered roof and eaves, or open frames), or drop the red.
- **The light-show tower loses its show by omission.** The twist carries `FLAG.LED`: it is the green LED tower in B1, the light-show pose. The spec says to keep the `B.led` entries, but it never says which new parts carry `FLAG.LED`. If the Braid has no LED parts, B1 loses part of its show. Say so explicitly.
- **Plan sizes are missing.** The Offset Pair has no plan sizes for towers A and B, so the Sky Hall and bridge spans are undefined. The Shard Cluster gives none for the companion shards. The Shard companions lean 6-9 degrees: check that their tops (about 40 m of lean, inside a 75 m reserve) stay clear of neighbouring towers.
- **Tripod.** The diagrid (`MAT.TRUSS`) is the Bank of China facade, and it is kept. Three 18 x 26 m triangular prisms sheared to one point at 300 m will overlap one another, with coplanar glass that may flicker (z-fighting) under the lantern. State how the legs end.
- **Tower text.** The Braid's 38 m segments each form their own `groupTowers` group (keyed by rounded x, z). They stop being blockers (top - y0 < 40) and are skipped as text candidates (they are twisted parts). The phrase selection may then change on CBD towers east of the site. The spec's acceptance rule catches this, but a fix should be planned, for example a non-drawn blocker record, rather than leaving it as a possible failure.
- **Light order.** Pushing two Raffles lights in `finishLandmarks` changes their order inside `hi`. This is harmless for the budget, but positions can be computed from terrain at the time Raffles is built, which keeps the order too.
- **GPU estimate.** About +0.1 ms is credible (about 2,100 parts against about 150,000, no new lights, a shader change only in the mat 18 branch). No concern.

### What would make it stronger
- **Braid.** Separate the shafts: helix radius at least hd + 10 m (for example 24-26 m for 14 m half-depth), or narrower shafts. Make the collars clasps between the shafts instead of full discs. Use one or more full turns, so it reads as two bodies from every bearing. Keep `FLAG.LED` on the shafts for B1.
- **Steps.**
  - Level = ceil(h_max_in_run / 8) x 8, with each block from (min ground - 1 m) up to its level.
  - Cover every cell not taken by a lot, an infill lot, the plan's features or the complex, out to the lot reserve margin, not just r = 190.
  - Abut the complex's tip with a designed joint (stair or landing) instead of a 12 m gap.
  - Check by projection that the wedge pixels in A3 (600-970 x 840-1150) fall inside the covered area.
- **Obstacles first.** Before the design is final, log the two obstacle part indices from main, then write the Raffles heights and gate towers around them.
- **Quick test.** Add a blind pairwise judgement (main vs candidate) on the rule-placed held-out cameras, as I-020 did. The question is whether each redesign is better-looking, not only grounded and readable. Include held-out views from the A1/A2 bearings for the Raffles shafts without edge strips.
- **Split the evaluation**, to make adoption reachable and keep each result clear:
  - (a) Raffles + Steps: targets A1, A2, A3, G2.
  - (b) the CBD trio of Braid, Tripod and Offset Pair: targets B1, B3, B4, G3.
  - (c) Shard, Lantern Mast and Terrace Ridge.

  Then one weak design cannot sink the A3 fix.
- **Redesign Lantern Mast** away from stacked spheres, and state the plan sizes for the Offset Pair and the Shard companions.
