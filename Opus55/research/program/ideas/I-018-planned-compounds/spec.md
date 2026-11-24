---
id: I-018
title: Planned compounds - towers designed per block as Chinese residential compounds, not per lot as random boxes
status: accepted
score: 5.67 (review-1 only; prototype track, user priority 1; build with review-1 fixes 1-12; queued until I-014 and I-016 are decided)
direction: Break an assumption (user priority 1: buildings too boxy and pixelated, few great places)
family: building generation: block-level compound generator (urban-planning rules) replacing per-lot tower boxes
parent: none
proposed_by: idea generator
date: 2026-11-24
---

# I-018: Planned compounds

## Idea
**The assumption broken.** Today every non-landmark tower is drawn lot by lot from the same parametric box generator: a fat box (often the whole lot minus 2-4 m), random floors, random colour, random crown, large painted windows (2.8-4.4 m wide). Neighbouring towers have nothing in common, so from the air (A6, G1, G3) the core reads as random noise of boxes.

Real Chinese cities are not built lot by lot. Housing is built as **compounds** (xiaoqu): one developer builds a whole block as a set of identical, slender towers on one plan type, with one finish, one roof design and one lighting scheme. The next block is a different compound. Repetition inside a group and difference between groups is what makes a real Chinese skyline read as designed, and it is what Chongqing looks like from the air: rows of matching slender towers stepping up the hills.

**What to build.** A second tower generator, `buildings_compound.js`, that works per **block**, not per lot, in the two residential districts of the Chongqing core: Yuzhong Peninsula (hillside) and Nan'an Old Town (urban).
1. **One design per compound.** All tower lots of one street block form a compound. The compound draws once, from its own random stream: a plan type, a floor count, a finish, a window size, a crown type and a lighting scheme. Every tower in the block uses them.
2. **Real plan types instead of a box.** Each tower is a union of 2-3 boxes (existing part records) giving the plans that Chinese high-rise housing actually uses:

   | Plan | Built from | Used on |
   |---|---|---|
   | Cross point tower ("butterfly", one core, four flats) | two crossing boxes, W x 0.5W and 0.5W x W, W = 17-22 m; four re-entrant corners 0.25W deep | square lots |
   | Stepped point tower | cross plan, one wing stops 4-8 floors lower | square lots |
   | Y tower | three wings at 0, 120 and 240 degrees around a core box | square lots |
   | Slab with light wells | three boxes in a row, 12-14 m deep, joined by a recessed 7 m connector, so two 2-3 m slots run full height | long lots |
   | Twin point towers | two cross towers | long lots |

   Towers become slender (17-22 m wide instead of up to 50 x 22 m), and the notches cut full-height vertical shadows into every silhouette.
3. **Office blocks stay office.** If most of a block's original towers were office or glass (about a quarter of Nan'an tower lots), the compound is an office campus: matched rounded-rectangle slabs in one curtain-wall colour, same plan family for every tower.
4. **Rooflines follow the hill.** Every tower in a compound has the same floor count, and each stands on its own podium. So the roofs step parallel to the slope, the "stacked on hills" look the critics asked for (finding 3).
5. **Contour orientation.** On slopes (gradient over 0.12 at the block centre), the whole compound turns toward the contour line, clamped to plus or minus 30 degrees from the street grid and rounded to 5 degrees. On flat ground it stays on the grid. All towers in a compound turn together, so rows stay orderly. Footprints shrink until the turned plan fits inside the lot with 1.5 m to spare.
6. **Finer windows.** Window width 1.9-2.4 m (today 2.8-4.4 m), floor height 3.0 m, painted balconies (`BALC`) on the wing fronts. The facade shader is unchanged; only its inputs change. Smaller cells reach the shader's averaged far-field state sooner, so the "big pixel squares" look of A6 is reduced without any new shading code.
7. **One lighting identity per compound**, shared by all its towers: none (40%), vertical corner LED lines in one colour (`EDGE`, 30%), crown wash (`CROWNLIT`, 20%) or a roof-edge neon line (10%).
8. **One crown per compound**, drawn from `machine`, `setback`, `garden`, `antennas` and `pagoda` only (not the lit pyramid the critics named as repeated everywhere), built with the existing `crown()` and the compound's stream.
9. **Variety between compounds.** Neighbour rule: two compounds that share a street edge never share both plan type and finish.

Landmarks, the stacked low hillside blocks (about 20% of hillside lots, the old fabric) and all podiums, shopfronts, signs and street props stay exactly as they are.

## Why it might work
- **It attacks what fills the target frames.** Measured (method below): the towers this idea replaces are 48.9% of A6, 15.1% of G1 and 14.8% of G3, after occlusion by everything in front of them.
- **The complaint is about sameness and noise, and this changes both at once.** Critics: "towers are box extrusions with the same tan window texture", "window textures look like pixel noise" (A6), "the city looks flat, not stacked on hills" (G2, G3, B3). Slender notched towers break the box outline; grouping turns random noise into readable groups (the Gestalt grouping rule: similar objects close together are read as one unit); constant floor counts per compound give rooflines that step with the hill; smaller windows remove the oversized pixel grid.
- **It matches the brief.** "Chongqing ... hillside density" and "one city": real Chongqing aerials are rows of matching residential towers on hills. A compound generator is how that pattern is produced in real life, so it is the most direct way to reproduce it.
- **The earlier massing ideas failed on coverage, not on direction.** I-013 and I-017 changed crowns and refuge floors: a few percent of each frame. This idea replaces whole towers, about half of A6.

## What's new about it
- **Closest earlier ideas:** I-005's massing grammar listed cruciform and butterfly plans, and I-013/I-017 changed crowns and cut refuge floors. All three kept the per-lot random generator and decorated its towers. This idea replaces the per-lot decision with a per-block plan: one design for a group of towers, chosen by planning rules (compound, contour orientation, constant floor count). The plan types are a means; the new thing is that buildings are designed in groups.
- **Not a relief kit (I-005, I-012):** no facade elements are added; whole towers are regenerated.
- **Not a crown idea (I-013, I-017):** crowns come from the existing set, one per compound; there is no new crown type.
- **Closest existing code:** `genHillside` already has a 12% cross-plan wing and `tower()` setbacks. Both are random per lot.

## Measured coverage (counting occlusion)
**Method.** Scratch copy of the baseline source (`coverage-patch.diff` in this folder). The generators record where each lot's tower section starts (after the podium, signs and shop light). A debug rule flags the parts of the lots this idea would replace, and the fragment shader paints flagged parts flat emissive green. The 14 eval poses were rendered at 640x360 (`tools/capture.mjs --poses-file ../eval/poses-v1.json --w 640 --h 360 --query rain=0&dbg=<rule>`, bloom, sharpening and grain off in the scratch copy) next to an unflagged render. A pixel counts as changed if it is green in the flagged render and not green in the unflagged one (`coverage-count.py`). Every occluder (podiums, signs, other towers, the overlook railing, cars) is real. Reflections of flagged towers in the river count, since they would change too.

**Rule measured:** Yuzhong lots that took the residential-tower path, plus every Nan'an tower lot; minus I-014's front-row towers (computed with `selectTowerText` from branch `idea/I-014`), minus lots within landmark radius + 60 m of `raffles`, `ridge` and `beacon`. That is 1,033 lots (698 Yuzhong, 335 Nan'an) and 40,767 parts (35,698 of them AC-unit props).

| Pose | Share of frame changed | Role |
|---|---|---|
| A6 peninsula mid-air | **48.9%** | target |
| G1 Nanshan overlook | **15.1%** | target |
| G3 aerial city | **14.8%** | target |
| A5 Liziba monorail | 13.2% (the tower left of the station) | watched |
| G4 cableway | 11.3% (Yuzhong skyline behind the front row, plus its river reflection) | watched |
| A4 hillside street | 8.0% (towers above the shop street) | watched |
| A3 peninsula tip | 4.3% | watched |
| A1 Hongyadong from river | 3.9% | watched |
| G2 city-water transition | 2.6% | watched |
| A2 Hongyadong close | 0.5% | watched |
| B1, B2, B3, B4 | 0.0% | unchanged |

For reference: all Yuzhong tower sections are 66.4% of A6 and 16.1% of G4; I-014's front row and the landmark exclusions remove the rest.

**Held-out cameras** (fixed now, never eval poses; `heldout-cameras.json`). Chosen from district geometry, away from every eval camera:
- **H1 Yuzhong from the north:** pos (-1100, 300, -1350), target (-800, 60, -300), t 100. 18.3% of the frame changes.
- **H2 Nan'an from the east:** pos (1600, 240, 2150), target (900, 40, 1300), t 100. 14.9% changes.

## Expected effect on the metric
- **A6:** half the frame goes from random fat boxes to rows of matched slender towers with notched silhouettes and finer windows. Most likely win; character and coherence +0.5 to +1.
- **G1, G3:** the Nan'an and Yuzhong fields read as groups that step with the terrain. Likely slight wins.
- **Adoption:** wins on 2 of A6, G1 and G3, and no clear loss on A5, G4, A4, A3, A1 or G2. Zone A rises about +0.2 to +0.3 (mostly A6); zone G about +0.1 to +0.2.
- **If it fails,** the program learns whether tower form and grouping move the blind judge when coverage is large, which the crown ideas could not test.

## Quick test (go/no-go on held-out cameras only)
1. Build the post-pass (plan steps 1-4) with the cross point tower and the slab only, in Yuzhong only.
2. Run the dev checks in step 5 (rest of the city bit-identical).
3. Capture H1 at 2560x1440, baseline and candidate. A fresh judge following `pairwise-judge-v1.md` compares full frames in both X/Y orders. Go only if the candidate wins at least one order and does not lose the other.
4. Run `bench.mjs` 3 times each, baseline and candidate, interleaved on a quiet GPU. Stop if the mean difference is over +0.15 ms.
5. Then add the other plan types and Nan'an, check H2 the same way, and capture the eval poses once, at the end.

Weights, sizes and rules may be changed only on H1 and H2, never after seeing an eval pose.

## Implementation plan
New file `src/buildings_compound.js`; small additive edits in `buildings_gen.js`, `buildings.js` and `signPlace.js`.

### 1. Record each lot's tower section (no random draws)
- In `genHillside` (after `shopLight`), `genUrban` (tower path, after `shopLight`) and in the stacked-block path, set `B.mark = B.P.count`, `B.slotMark = B.slots.length`, `B.hillMark = B.hillTowers.length`. These lines read counters only.
- In `generate()`, store per lot `{p0, mark, p1, s0, s1, h0, h1}` and whether it took the residential-tower path (`genHillside`) or the tower path (`genUrban`), and the tower material.
- In `skybridges()`, record for each bridge its two `hillTowers` indices (side array, no draw).

### 2. Choose compounds by world rules only
- **Districts:** Yuzhong Peninsula (index 1) and Nan'an Old Town (index 5).
- **Block id:** the lot's grid cell in its district frame, `floor(local / block)`, computed exactly as `_buildLots` does.
- **Lots taken:** Yuzhong lots on the residential-tower path; Nan'an lots on the tower path.
- **Excluded:**
  - lots with a tower that passes I-014's front-row test (`RULE` in `buildings_text.js`: at least 100 m, water in front within 700 m, not blocked), whether or not it is among I-014's 40. Run the test on the original parts before any replacement;
  - lots within landmark radius + 60 m of `raffles`, `ridge` and `beacon`;
  - lots within 60 m of the I-015 stack footprint (`B.sites.stilts` and the stack's published extent);
  - nothing is ever chosen by eval camera position.
- **Stream:** `rng(hash32(district, blockI, blockJ) ^ 0x18018)`. No existing stream is read.

### 3. Mark the original towers as replaced
- Set a new flag `REPLACED` (bit 20; I-012's reserved bits 22-23 and I-011/I-015's material ids are not used) on parts `[mark, p1)` of each compound lot, and on skybridges and their EMIT strips whose tower index lies in `[h0, h1)` of a compound lot.
- Sign slots `[s0, s1)` (in practice only roof-billboard slots) get `dead: true`.
- `B.props -= number of replaced props`, so the prop budget is returned before new props are added.
- Replaced parts get no collider.

### 4. Build the compounds (appended at the end of the part list)
- Order: after `walkways()`, in block order. Every new part gets an explicit `seed` from the compound stream.
- **Per compound draw:** plan type (cross 35%, stepped 15%, Y 15% on square lots; slab 60% / twin 40% on long lots), floors N, finish, window width 1.9-2.4 m, lit fraction 0.35-0.6, crown type, lighting scheme.
- **Floors:** Yuzhong N = 24 + floor(pow(r, 1.2) x 30). "Anchor" compounds with 60-75 floors only on blocks whose centre ground is in the district's top 15% of terrain height (the crest). Nan'an N = 18-40 for housing, 12-34 for offices. Always clamped by `L.maxTop`. A dev print must show the mean tower height per district within 10% of the baseline's.
- **Finish palette** (night albedo at the same scale as `PAL.res`): white tile, cream, light grey, terracotta with white bands, blue-grey glass bands.
- **Per tower:** podium top from the original lot (`podTop` is stored in step 1). Wings are `kind 0` boxes with `mat RES` (or `OFFICE`/`GLASS` for campuses), `floorH 3.0`, the compound window width, `BALC` on wing fronts, `baseY = podTop`. Wing widths are whole multiples of the window width, so each junction falls on a pier and no window is cut.
- **AC units:** `acUnits()` on the wing faces, compound stream, same density as today.
- **Crown:** `crown()` with the compound stream and the compound type.
- **Bridges:** in 30% of compounds with at least two towers, one skybridge between neighbours at the same floor for the whole compound, same parts as `skybridges()`.
- **Aviation lights** on towers over 140 m, as today.
- **Cap:** a compound may not add more parts than it replaced. If it would, AC density is reduced first.

### 5. Keep the rest of the city bit-identical, then compact
- **Dev checks** (print and assert):
  - hash of all parts that are neither replaced nor new equals the baseline hash of the same parts, in order;
  - sign slot count, `B.lights` list, `hillTowers` and the skybridge count before flagging equal the baseline;
  - `signPlace`: for a dead slot, all `R()` draws happen as today and its light candidate stays in `selectLights`. Only the emitted sign and its selected light are dropped afterwards, so no other sign or light is re-picked.
- **Compaction:** before upload, copy non-replaced parts in order into the final buffer. Any side table keyed by part index (for example I-014's `textMap` after a merge) is built after compaction.
- **Colliders** come from the compacted list.

### 6. Checks
Both builds, `functional.mjs` 18/18, no WebGPU errors, no pose coordinates in the code.

## Cost
- **Parts:** 40,767 removed (35,698 are AC props); new parts are capped at that count per compound. Expected net change -5% to 0%, so `bld-cull` (0.17 ms average) stays the same or drops slightly.
- **gbuffer:** 2-3 box wings per tower instead of 1-2 boxes: a few hundred more triangles per tower, under 0.3M triangles city-wide at the measured 0.2-0.48 ms per million (I-012's measurement), so at most about +0.03 ms where many compounds are close. Facade pixels: slender towers cover less of the sky; notches add a little wall. The fragment path is the existing residential `windowGrid`, unchanged.
- **Estimate on the bench fly-through average:** -0.02 to +0.05 ms. Stop rule: +0.15 ms (interleaved 3x3 benches). Report gbuffer at A6, G1, G3, H1 and H2 with `--stats`.
- **Lights:** none added.
- **Memory:** the part buffer is unchanged in size after compaction.
- **Effort:** one implementer, 2-3 days.

## Conflicts with work in flight
- **I-014 (front-row characters):** every lot that passes I-014's front-row test is untouched, so its towers, faces and blockers stay identical. After a merge, I-014's selection runs on the compacted list and must select the same 40 towers (dev assertion).
- **I-015 (Hongyadong stack):** no lot within 60 m of the stack or within the Raffles radius + 60 m changes. I-015 does not edit lots.
- **I-016 (confluence infill and parks):** I-016 adds lots east of the Jade and south of the Great River with its own streams and does not edit Nan'an lots. Its appended infill lots are not compound candidates (they come after the existing lots and are skipped by rule).
- **I-009 (airships, launch):** no overlap.

## Risks
- **Matched towers could read as more repetitive.** The critics already complain about repetition. A compound is only one block (2-6 towers), and neighbouring compounds must differ, but a judge may still see "copies". The H1 judge test is the first check.
- **Contour turns may look messy** where neighbouring compounds turn by different angles. If H1 shows this, quantise to grid / grid + 30 degrees only.
- **G1 and G3 are distant** (1-2 km), and fog flattens detail there; the change may read as a tie. Then adoption rests on A6 plus one of them.
- **Junction details:** painted windows meeting at re-entrant corners, the podium deck showing around slimmer towers, rotated plans near the podium edge. All visible at A5 and A4, which are watched.
- **The rest of the city must stay bit-identical**; the dead-slot and prop-budget handling are the fiddly parts.
