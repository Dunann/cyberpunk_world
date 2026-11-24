---
id: I-019
title: Linked tower pairs - CBD towers designed as two-tower buildings joined by gates, ladders, decks and atriums
status: rejected
score: 5.0 (review-1 only; below 5.5)
direction: Break an assumption (user priority 1: buildings too boxy, need character; few great places)
family: building generation: composite two-tower buildings replacing standalone per-lot towers
parent: none
proposed_by: idea generator
date: 2026-11-24
---

# I-019: Linked tower pairs

## Idea
**The assumption broken.** Every non-landmark tower in the CBD is a standalone vertical extrusion: a box, rounded box or cylinder on a glass podium, with a random crown. Even the 42 CBD lots that already hold two towers on one podium draw each tower independently, so the "pair" is two unrelated objects. Only the landmarks (`twin`, `raffles`) are composed as one building made of several towers. From B4 the CBD reads as a field of separate boxes.

**What to build.** In Lujiazui CBD only, turn tower pairs into **one building each**: two towers designed together and joined by structure that reads at any distance. A new generator, `buildings_pairs.js`, replaces the tower sections of paired lots (podiums untouched) and appends:
1. **Matched shafts.** Both towers share one material, colour, window width and lit fraction (taken from the taller original), and keep their original centre, approximate footprint and **exact original top height**. Shafts are straight (no taper, twist or setback below the highest link), so every link meets a flat wall.
2. **One link per pair, from four types** (none of them copies a landmark):

   | Link | What it is | Reads as |
   |---|---|---|
   | Gate | the top 15-20% of both towers continues as one block spanning the gap, with a lit soffit underneath | a giant portal on the skyline |
   | Ladder | 3-5 glazed bridges, 1-2 storeys each, staggered between 0.3H and 0.85H of the lower tower, each with a lit underside | Chongqing's layered "8D" city at CBD scale |
   | Shoulder deck | a 2-3 storey block on the lower tower's roof that cantilevers across and plugs into the taller tower's side, with a roof garden and string lights on top | a stepped, asymmetric pair |
   | Sky atrium | a glass atrium between the towers from the podium roof to 0.3-0.4H, lit floor bands inside (same-lot pairs only, never over a road) | a glowing glass canyon at the base |

   - Not the `twin` landmark's single rhombus truss bridge at mid-height, and not Raffles' long horizontal conservatory over four towers. Neither is in the library.
   - Neighbour rule: two pairs within 250 m never share a link type. Gates are at most 25% of pairs.
3. **Which towers pair (world rules only).**
   - **Same-lot pairs:** every CBD lot that already holds two towers (42 lots).
   - **Across-road pairs:** single-tower lots in grid columns 2k and 2k+1 of the same block row, across the north-south road between them, when both are single-tower. Gap about 30-50 m. Link bottoms over a road are at least 40 m above the street.
   - Excluded: any lot with a tower that passes I-014's front-row test (4 CBD lots today), and landmark sites (already kept clear by lot generation).
   - Measured: 67 lots, about 54 pair-buildings. Unpaired towers are untouched.
4. **One lighting identity per pair**: both shafts get the same edge-line colour or crown wash, and the link's soffit and floor bands use the same hue. Towers with an `LED` facade keep the flag (the facade shader draws the LED show from it), and their entry in `world.shared.ledFacades` is updated in place with the new shaft, so the published data stays consistent.

## Why it might work
- **It changes what fills B4.** Measured with occlusion: the towers this idea replaces are 46.5% of B4 and 14.0% of B2. B4 is a camera at 280 m among the towers, exactly the height band where gates, ladders and decks sit.
- **Composite form is what separates designed skylines from generic ones.** The most recognisable towers in Asian CBDs are composites: the Petronas Towers, Gate to the East in Suzhou, Marina Bay Sands, the CCTV headquarters, Raffles City Chongqing. Our own landmarks use this (twin, raffles), and they are what reads in the baseline images. Extending it to the generic towers gives the CBD its own identity instead of random boxes: "a few great places", where the place is the whole CBD.
- **Links read at every distance.** A 40 m gate block at 1 km is about 50 px; ladder bridges add horizontal lit lines across vertical shafts; soffits glow. All of it is large, simple geometry, so it cannot shimmer like small facade detail.
- **The brief asks for it.** "Technological", "sleek", "exciting to explore": linked megastructures are a core cyberpunk image (Blade Runner, Ghost in the Shell), and they give the B-zone a skyline nobody would mistake for a generic box field.
- **Heights stay exactly the same,** so the skyline mass and the searchlights on the tallest tops (`world.shared.towerTops`) do not move. The judge compares form, not size.

## What's new about it
- **Closest existing:**
  - the `twin` and `raffles` landmarks, which are hand-built single compositions;
  - Yuzhong `skybridges()` (320 thin corridors, 3.4 m tall, random between neighbours);
  - I-013/I-017 crowns.
- **The difference:** the generic CBD towers become composed two-tower buildings, by rule, with matched shafts and four link types sized to read from the air. The hillside skybridges are small connectors; these are the main architectural feature of the building.
- **Not a relief kit (I-005/I-012), not a crown change (I-013/I-017):** whole towers are regenerated and the change is in the silhouette at 100-300 m height.
- **Shared plumbing with I-018:** both use the same "record, replace, append, compact" post-pass. Whichever is built first writes it; the second reuses it.

## Measured coverage (counting occlusion)
**Method** (same as I-018; `coverage-patch.diff`, `coverage-count.py` in this folder). In a scratch copy of the baseline, the parts of the lots this idea replaces (tower section only, after the podium) are painted flat emissive green. The 14 eval poses are rendered at 640x360 with the real renderer and every occluder, and green pixels are counted against an unflagged render. River reflections of the changed towers count.

**Rule measured:** `L.district === CBD && tower section && !front-row && (two-tower lot || single-tower lot with a single-tower partner in column 2k/2k+1 of the same row)`. That gives 67 lots and 1,691 parts (1,256 props).

| Pose | Share of frame changed | Role |
|---|---|---|
| B4 among supertalls | **46.5%** | target |
| B2 CBD street | **14.0%** (the towers above both street walls; the podiums do not change) | target |
| B1 Bund light show | 4.9% | watched |
| B3 Bund aerial | 2.3% | watched |
| G3 aerial city | 1.1% | watched |
| G1 | 0.3% | watched |
| all A poses, G2, G4 | 0.0% | unchanged |

- For reference: all CBD tower sections are 61.3% of B4, 18.1% of B2 and 12.9% of B1.
- New link geometry also adds pixels in the sky between towers, which this count does not include.

**Held-out cameras** (fixed now; `heldout-cameras.json`):
- **H3 CBD from the east:** pos (4350, 260, -1150), target (3300, 140, -1350), t 100. 18.3% of the frame changes.
- **H4 CBD avenue at street level:** pos (3550, 1.7 above ground, -450), target (3550, 60, -1100), t 100, on the north-south road at x = 3550 (a grid line of the CBD frame). 26.7% changes.

## Expected effect on the metric
- **B4:** half the frame changes from separate boxes to composed pairs, with gates and lit bridges at camera height. Likely win on character and detail.
- **B2:** the towers above both street walls become matched pairs; links appear high above the side streets. Likely slight win, since B2's worst defects (the dark box in the foreground) stay.
- **Adoption:** wins on both B4 and B2, and no clear loss on B1 or B3. Zone B rises about +0.2 to +0.4.
- **If it fails,** the program learns whether composed tower form moves the judge in the CBD, independent of I-018's residential result.

## Quick test (held-out cameras only)
1. Build the post-pass with same-lot pairs and two link types: ladder and gate.
2. Run the dev checks: everything outside the replaced sections is bit-identical; `towerTops`, `ledFacades` positions and the sign slot, light and skybridge lists are unchanged.
3. Capture H3 and H4 at 2560x1440, baseline and candidate, and have a fresh judge follow `pairwise-judge-v1.md` in both X/Y orders. Go only if the candidate wins at least one order at each camera and loses neither.
4. Bench: 3 interleaved runs per side; stop if the mean difference is over +0.15 ms.
5. Add across-road pairs and the other two link types, recheck H3 and H4, then capture the eval poses once.

## Implementation plan
New file `src/buildings_pairs.js`. Additive edits in `buildings_gen.js` (counters only), `buildings.js` (post-pass call, compaction) and `signPlace.js` (dead slots). If I-018 is built first, reuse its post-pass.

1. **Record tower sections.**
   - In `genCBD`, set `B.mark`, `B.slotMark`, `B.ledMark` and `B.topsMark` before the tower loop (counters, no draws).
   - Also record per tower, as it is built: centre, `hw`, `hd`, kind, `prm`, original top `tw.top`, material, flags, and the crown type picked.
2. **Pair by rule.**
   - Same-lot pairs come from `towers === 2`.
   - Across-road pairs: column index `floor((x - cx)/block)` in the district frame (CBD angle is 0), partner column `i ^ 1`, same row (`|dz| < 5 m`), both single-tower.
   - Skip lots whose tower passes I-014's front-row `RULE` test, run on the original parts.
   - Stream: `rng(hash32(lotA.seed, lotB.seed) ^ 0x19019)`.
3. **Replace.**
   - Flag the tower-section parts `REPLACED` (JS-only marker, removed by compaction).
   - Mark slots in the section `dead` (crown billboards). `signPlace` keeps their `R()` draws and their light candidates and drops only the emitted sign and its selected light, as in I-018.
   - Return replaced props to the prop budget.
4. **Build each pair** (appended after `walkways()`, explicit seeds):
   - **Shafts.** Original centre and top. Footprint as the original, except kind 3 (lobed, twisted) becomes kind 2 with 8 sides, and taper becomes 1. Setbacks only above the highest link. Same `mat`, `col`, `floorH`, `winW` and `param` for both towers.
   - **Links:**
     - built from `kind 0` boxes rotated to the axis between the towers;
     - ends embedded 1.5 m into each shaft, measured from the shaft's real ring at that height (for kind 2, from the circle radius);
     - glass sides use `MAT.GLASS` with the shafts' colour; soffits use `MAT.EMIT` strips at 2.5-4 (between lit windows and neon);
     - ladder bridges at least 6 m apart vertically;
     - gate block thickness 2-4 floors;
     - shoulder deck cantilever at most 0.4 times the gap.
   - **Supports.** No link is longer than 60 m. A gate over a road longer than 45 m gets two inclined struts down to the shafts.
   - **Crowns:** the taller tower's original crown type, re-run with the pair stream on both tops (a gate's top block gets one crown). Aviation lights are re-added at the same tops.
   - **Shared data:** `B.tops` entries keep their values (tops are unchanged). `B.led` entries are rewritten in place with the new shaft centre and radius.
   - **Colliders** for shafts and links.
5. **Compact and check.** Same as I-018 step 5: hash of untouched parts equals the baseline; slots, lights, skybridges, `towerTops` and `ledFacades` order unchanged. No pose coordinates in the code. Both builds pass, `functional.mjs` 18/18, no WebGPU errors.

## Cost
- **Parts:** about 1,690 removed; about 54 pairs x 30-40 parts (two shafts, crowns, aviation lights, 3-8 link parts) ≈ 1,600-2,100 added. Net within ±0.3% of 133,904, so `bld-cull` is unchanged.
- **gbuffer:** links add wall area between towers. At B4 roughly 2-4% of the frame becomes new facade, so about +0.01 to +0.03 ms there. On the fly-through average, under +0.01 ms. Shafts lose their taper and twist curves (CURVED lists), so the K48x32 row meshes are drawn less often, a small saving.
- **Lights:** no point lights; soffits are emissive.
- **Estimate:** -0.01 to +0.03 ms on the bench average; stop rule +0.15 ms (interleaved 3x3 benches); report gbuffer at B4, B2, H3 and H4 with `--stats`.
- **Effort:** one implementer, 2 days (1 day less if I-018's post-pass exists).

## Conflicts with work in flight
- **I-014:** the 4 CBD front-row lots are untouched; its 40 towers stay identical. A merge must select the same towers (dev assertion).
- **I-009:** its scope was reduced to airships and the launch site, so there is no overlap. If vertiports on `helipad` crowns come back later, a pair whose original tower had a `helipad` crown keeps it on the same tower at the same height.
- **I-015, I-016:** no overlap; I-016's plan area ends west of the CBD.

## Risks
- **Copying the landmarks.** The `twin` landmark is a pair with a skybridge. If generic pairs look like it, the landmark loses its uniqueness and a judge may call it repetition. The library deliberately excludes a mid-height single truss bridge, but this needs checking on H3.
- **Clutter on B1.** From the Bund the CBD skyline is a "what works" view, and 4.9% of it changes. Gates and ladders could read as busy. A clear loss on B1 blocks adoption. Mitigation: gates at most 25%, and the H3 judge test first.
- **B2 may tie.** Only 14% changes, and the links are high and partly out of frame.
- **Junction quality.** Link ends meet round, chamfered and rounded-rectangle shafts. Gaps or poke-through at the joints would be a "detached" defect (user priority 2). Every end must be embedded and checked in a close held-out capture.
- **Removing taper, twist and lobes** from paired towers loses some of the existing variety. Only 67 lots are affected, and the link adds more variety than it removes, but it is a trade.
