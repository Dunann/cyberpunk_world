---
id: I-028
title: CBD deck loop - a two-level pedestrian deck network around the tallest tower, with escalators, lifts and an optional sky-corridor ring
status: in-review
direction: User priority 7 (elevated walkways, crazy 3D feeling), Zone B
family: urban circulation: multi-level pedestrian network (new family; sibling of I-027)
parent: none
proposed_by: idea generator
date: 2026-11-24
---

# I-028: CBD deck loop

## Idea
Give the Lujiazui-style CBD a designed second level. Real Lujiazui, Hong Kong Central and La Défense move people on decks one storey above the traffic, joined into the towers' podiums. Ours is one network in one place: a square loop of decks around the CBD's tallest tower, with a cross through it, all at one level 10 m above the streets. Nothing that exists is removed or moved.

1. **Level 1, the deck (+10 m, one constant level; the CBD is flat).**
   - Forecourt decks run along every street face on the network roads. CBD podiums stand 4-8 m back from the lot edge, so the deck fits in the forecourt: from the podium face (embedded 0.3 m) out to 3.3 m from the curb, so 3.7-7.7 m wide. That leaves the sidewalk and its walkers (0.7-2.3 m from the curb) uncovered by columns.
   - Round columns every 15 m stand at the outer edge on footing plates.
   - Glass balustrades, an LED handrail, a lit soffit, small lamp posts.
   - Entrance bays (lit door frames) where the deck meets each podium.
2. **Junctions.** Where the network crosses a road, steel box-girder spans (girder bottom at +8.45 m, which clears the 7.2 m street lamps by 1.25 m) join the corner decks:
   - a square loop of four spans with chamfered corner plazas where two network roads cross;
   - three spans where a side street cuts the deck.

   The intersection below stays open to the sky. This is deliberately not a circle (real Lujiazui has a famous circular footbridge; inspired, not replica). Each main span carries a bilingual lightbox name sign in Chinese and Mongolian Cyrillic (invented names such as 云廊 / Үүлэн гүүр).
3. **Vertical links.** At every junction:
   - one escalator (inclined truss with lit side strips) from the corner plaza ground up through a void in the deck;
   - one stair flight.

   At the four loop corners and the two ends at the landmark, a glass lift tower with a lit cab. Where the deck reaches the tallest tower's plaza, it ends in a grand stair down to the plaza.
4. **Level 2, podium-roof bridges at the four loop corners.**
   - The corner lots' podium roofs (12-24 m) become roof terraces: planters, bollard lights and a lit parapet.
   - Bridges join the roofs across the loop roads: flat if the roof tops differ by 3 m or less, stepped if they differ by 3-8 m, skipped if more.
   - Stairs run from the deck to the roofs.
   - So a street view sees three levels: street, deck, roof bridges.
5. **Lit and populated.**
   - Its own pool of at most 64 warm point lights: one under each main junction span and one at each escalator foot, so the street below gets real light pools.
   - About 400-550 people pacing on the decks and spans or standing at the railings.
6. **Stage 2 (optional, gated separately): sky-corridor ring.** Up to 8 enclosed two-storey glass corridors at one level (112-120 m) join towers that face each other across the loop roads. Together they read as one ring around the tallest tower. Built only if its own held-out test passes (below).

**Site rule (world rule, fixed now).** The tallest CBD landmark, `twist` (620 m), at (3250, -1350), with H its centre.
- **Loop:** the four grid lines nearest to H ± 250 m on each axis, which are x = 3050, x = 3550, z = -1125 and z = -1625.
- **Cross:** the grid lines nearest to H, which are x = 3300 and z = -1375. The cross arms stop at the landmark site circle (r + 10 m).
- **Length:** about 2.7 km of network road, so about 4.5 km of deck faces after subtracting intersections, and about 20 junctions.

## Why it might work
- **B2 is the weakest pose in the program (4.88, critic mean),** and its frame is a plain avenue canyon. A deck along both sides of the avenue, spans crossing it at 125-m intervals and roof bridges above give it near-camera detail, layering, lights and people. Those are the critics' complaints: "empty", "flat panels", "pixel-noise curtain wall", detail 4.
- **A layered view down an avenue is a classic image** in cyberpunk games and films (decks and footbridges framing a street). It reads at a glance and needs no fine detail to work.
- **Lessons from the program.**
  - I-018: the judges like crossing layers and punish their removal.
  - I-019: links high on tower shafts are invisible to the judges. This idea puts the main change at 10-24 m, where street cameras see it.
  - I-019's reviewer also suggested exactly this ("a pedestrian bridge network between CBD podium roofs, across the roads, visible from street level reads as a layered city").
- **The CBD is the cleanest site for it:**
  - flat ground (flatten 0.96), so one constant deck level reads as designed;
  - wide forecourts (podiums are inset 4-8 m), so columns need no space on the sidewalk;
  - no skybridges (those are Yuzhong only);
  - 20 m roads, so spans are 26.6 m, an honest length for a 1.2 m box girder.

## What's new about it
- Like I-027, it is the first idea in the program about pedestrian circulation.
- **The difference from I-027:** I-027 makes stepped galleries on a steep hillside quarter around a station. This is a flat, constant-level deck district with spans, escalators and a roof tier, designed as one legible shape: a loop and a cross around the tallest tower. From the air (B3, G3) it reads as a designed plan.
- **The difference from I-019 (rejected):** no towers are regenerated or paired; the main structure is at 10-24 m, not at 0.3-0.85H; spans run on both axes; nothing is within 250 m of `twin`, and no link is a single lit bar at mid-height.
- **Closest real references:** the Lujiazui elevated walkway network, the Hong Kong Central walkways, the La Défense deck. Ours copies none of their shapes.

## Target poses (rule fixed now, before any capture)
- **Rule.** As in I-027:
  - render the 14 eval poses at 640x360 with every new triangle painted flat green, with all occluders;
  - a pose is a **target** if the green share is **at least 2.0%** of the frame; every other pose is **watched**;
  - Stage 1 and Stage 2 are measured separately, and Stage 2's targets count only if Stage 2 is kept;
  - the list is frozen before the eval capture.
- **Expected, not measured:**
  - **B2 is the likely Stage-1 target.** It looks north along x = 3050, which is the loop's west side, from z = -1000. So the loop's south-west junction (125 m ahead), the decks on both sides and spans at about 250, 375, 500 and 625 m fill the middle of its frame.
  - **B4 may become a target only with Stage 2** (corridors at 112-120 m, seen 9-23 degrees below its horizon).
  - **B1, B3 and G3 are watched.**
- **For the record:** the site comes from the landmark and the grid (H ± 250 m, about 2 blocks). That the loop's west side is B2's avenue follows from twist standing 200 m east of it, not from fitting the camera. Code review should reject any pose coordinate in the code.
- **If no pose reaches 2.0%,** judge on H10-H12 (two judges, at least 2 of 3 wins each) plus no clear loss on the eval poses.

## Expected effect on the metric
- **B2:** large change (estimated 8-15% green). It is likely a clear win if the decks read as attached and lit. The main danger is a judge seeing clutter or a lid over the street; the open intersections and the 10 m clearance are there to prevent that.
- **Zone B:** if B2 wins, the critic zone mean may rise by about +0.2 to +0.3, with B2 itself +0.8 to +1.5 from a 4.88 start. Add about +0.1 if Stage 2 wins B4.
- **If it loses,** the program learns whether street-level layering moves the judges in a flat district as it does on the hillside (compare I-027).

## Quick test (implementers run this first)
1. **Stage 1 base.** Build the site, the decks, columns and junction spans, with no escalators, lifts, roof tier, people or signs.
   - Write a top-down map and the counts (deck length, spans, columns).
   - Run the green coverage for the 14 eval poses and H10-H12, and write the target list.
2. **Identity.** Everything existing is bit-identical, with the same list as I-027 step 2, plus street trees (rng 99) and street lamps.
3. **Light and people, then judge.** Add the light pool, the emissive strips and the people.
   - Capture H10 and H11 at 2560x1440 on both builds.
   - A fresh judge follows `pairwise-judge-v1.md` in both orders.
   - **Go** only if the candidate wins at least one order at each camera and loses neither.
   - Also run an A/B at H10 with the spans unlit against lit spans, to learn whether the form or only the light moves the judge.
4. **Bench.** Interleaved pairs under the lock until the standard error is under 0.05 ms. **Stop** if the mean difference is over +0.30 ms.
5. **Then the rest.** Escalators, lifts, roof tier, signs. Freeze the Stage 1 rules (hash).
6. **Stage 2 only after Stage 1 passes.**
   - Build the corridors.
   - Judge H12 and H10 (Stage 1 against Stage 1 + 2).
   - Keep Stage 2 only if it wins H12 and does not lose H10.
   - Then check B1 from the green mask. If the corridors cover 1% or more of B1, run one judge pair at B1 before the eval capture; a loss there drops Stage 2.

**Held-out cameras** (rule, fixed now; all more than 300 m from every eval camera):
- **H10:** street level on the sidewalk at the loop's north-east corner (3550, -1625), 1.7 m above ground, looking west along z = -1625 at a point 400 m ahead and 40 m up.
- **H11:** 30 m above ground, 40 m east of the loop's east side at z = -1375, looking at the hub's ground-level plaza edge.
- **H12 (Stage 2):** 260 m above ground, 700 m east of H, looking at H at 120 m height.

## Implementation plan
New file `src/deckLoop.js`. It reuses `src/deckKit.js` from I-027; whichever idea is built first writes the kit:
- deck slab with a void option, balustrade, column, box-girder span, stair flight, escalator truss, lift tower, lamp post and canopy;
- all built with `MeshBuilder` and the transit-static materials.

Data-only additions, with no new random draws:
- `genCBD` pushes `{ L, ins, podTop, podKind }` per lot and `{ x, z, a, hw, hd, kind, segs, y0, top }` per tower into `B.cbdPods` and `B.cbdTowers`;
- `buildings.js` publishes them, and the I-014 text-tower list, in `world.shared.deckData`.

Built in `transit.js` after `buildTransitStatic` (after I-027's site if both exist), with its own geometry and streams.

1. **Network.**
   - Compute H, the loop and the cross from `LANDMARKS`, `DISTRICTS[CBD]` (angle 0, block 125, road 20) and the rule above.
   - A face is decked if its lot fronts a network road and lies outside every landmark site circle (r + 10 m).
2. **Decks.**
   - Deck top = max ground over the site + 10.0 m.
   - Width from the podium face (embedded 0.3 m) to 3.3 m from the curb. Decks attach to the straight part of each face; corner plazas stay outside rounded podium corners (kind 1) by 0.3 m or more.
   - Across the 4 m gap of split blocks, the deck continues.
   - On tree-lined avenues (replay the rng(99) avenue choice of `vegetation._streetTrees` in a separate instance), the outer edge moves to 5.5 m from the curb. If the width left is under 3.0 m, that face gets no deck.
   - Columns:
     - radius 0.35 m, every 15 m at the outer edge;
     - none within 1.5 m of a street-lamp pole (positions from `lampPos` replicated in JS: block/4 spacing, `side * (road/2 + 0.7)`);
     - none within 1.0 m of the existing CBD podium shop light.
3. **Junctions.**
   - Spans 26.6 m, deck top at the deck level, a 1.2 m girder, glass balustrades and an LED fascia line.
   - A square loop of four spans with chamfered corner plazas where two network roads cross; three spans where a side street crosses.
   - One point light under each main span.
   - Two lightbox signs per junction, appended to `world.shared.signRequests` with no sign light. New strings go at the end of the atlas list.
4. **Vertical links.**
   - One escalator per junction (17.3 m run for 10 m rise at 30 degrees), along the face inside the forecourt, under a deck void with a balustrade around it.
   - One stair flight per junction.
   - Lift towers at the 4 loop corners and the 2 landmark ends; a grand stair at each landmark end.
5. **Roof tier.** At the four loop-corner intersections:
   - planters, bollards and a lit parapet on the podium roofs (podium top from `cbdPods`);
   - bridges across the loop roads under the height rule above;
   - one stair from the deck to each roof.

   Report how many bridges were built and how many skipped.
6. **People.**
   - A section in `crowd.js` appended after I-027's section (or after section 4), with streams rng(2802) for placement and rng(2803) for style.
   - Mode 1 pacers on deck and span centre lines, about 3 per 100 m of deck plus 6-8 per junction. Mode 2 people at the railings, about 1 per 30 m. Scaled by the quality density.
   - Near-list occupancy at B2 and H10 stays under 90% of the caps.
7. **Lights.** At most 64 lights in their own pool, after all existing pools (warm, radius 12-14 m). Total static lights stay at least 200 below `MAX_LIGHTS`.
8. **Colliders.**
   - Deck slabs, spans and roof bridges only, with bottoms 4.5 m or more above the ground below. Nothing for columns, escalator feet or stair feet, so `buildRuns` and the crowd tests are unchanged.
   - All tops are 120 m or less, so the CBD air corridors (rng 555) ignore them: the corridor test skips colliders whose top is more than 25 m below the corridor, and the lowest corridor is at 150 m.
   - Assert that the runs and the corridor list are bit-identical.
9. **Stage 2 corridors.**
   - Candidates: tower pairs on lots facing each other across a loop road, both shafts kind 0 or 1 at 112-120 m, both tops at 140 m or more, face gap 60 m or less.
   - Excluded:
     - I-014 text towers;
     - towers within 250 m of `twin`;
     - pairs whose corridor would pass within 30 m of a searchlight top (`towerTops`).
   - At most 8 corridors, at least 120 m apart. The corridors on the loop's four sides together form the ring.
   - Corridor body:
     - 8 m tall (two storeys) and 6 m wide, glass with lit floor bands no brighter than lit windows, and a steel bottom chord;
     - ends run to each shaft's centre line, with depth at most 0.8 of the inscribed width (I-019 review fix 10).
10. **Draw and checks.**
    - One static geometry, frustum-skipped on the CPU. No pose coordinates.
    - Both builds pass, `functional.mjs` 18/18, no WebGPU errors.
    - The identity list holds, and the overlap audit finds 0 new pieces intersecting existing boxes except their hosts.

## Random streams
| Stream | How it stays identical |
|---|---|
| 1234 lots, each lot's `L.seed`, 9137 | No generator changes; data pushes only; new signs are appended requests with no lights |
| 5150 and 5151 skybridges and walkways | Not touched (none in the CBD) |
| 4242, 4343 light pools | New lights in a separate pool after all selections |
| 99 street trees | Read by a separate replay instance; the vegetation draws are unchanged |
| 8080 and 9191 crowd | New agents appended with own streams 2802/2803 |
| 31337/31338 cars | No collider below ground + 4 m; assert runs identical |
| 555 air corridors | All new colliders top out at 120 m or less; assert corridors identical |
| New | 2801 (layout choices such as escalator corners and sign names), 2802/2803 (people) |

## GPU cost
- **Gate:** average 11 ms or less, p99 16.7 ms or less, worst frame 25 ms or less. Current best about 9.8 ms, so the headroom is about 1.2 ms.
- **Estimate:** +0.05 to +0.15 ms on the fly-through average (Stage 1), Stage 2 about +0.01 more; +0.10 to +0.30 ms at B2 and H10 with `--stats`.
- **Cap:** +0.30 ms average including Stage 2 (stop rule), p99 within +0.5 ms.
- **Where the time comes from:** the program's remaining headroom. No savings are claimed. The extra time is in these passes:
  - **gbuffer:** a static mesh of about 45-65k triangles (decks about 25k, spans about 14k, escalators about 8k, lifts and roof tier about 4k; Stage 2 about 2k). It is frustum-skipped, and mostly in front of facades that already fill those pixels. About +0.03 to +0.08 ms when in view.
  - **lighting:** 64 small lights clustered in the core, so tiles over the CBD streets carry 1-3 extra lights. About +0.02 to +0.07 ms when in view.
  - **crowd compute:** about +0.01 ms.
- **Report:** per-pass ms at B2, B4, H10 and H11.
- **If both I-027 and I-028 are adopted,** their worst case together is +0.6 ms, which leaves about 0.6 ms for other ideas.

## Cost
- One implementer: 1.5 days for Stage 1 if `deckKit.js` exists (2.5 days if not), 1 day for vertical links, roof tier, people, lights and signs, and 1 day for Stage 2 with its own test.
- Compute: one quick-test capture set, 2-3 bench pairs, a Stage 2 judge pair, one eval run.

## Risks
- **A lid over the street.** If the decks and spans dominate B2's sky, a judge may prefer the open canyon. Mitigations:
  - intersections stay open;
  - spans only at junctions;
  - glass balustrades, not solid walls;
  - the H10 judge test comes before the full build.
- **Floating reads.** A 26.6 m span with no visible structure, or decks that look glued to glass. Mitigations:
  - a visible box girder with an LED fascia;
  - columns with footings;
  - entrance bays where the deck meets the podiums;
  - real light pools under the spans.
- **Grid regularity from the air.** The loop and cross could read as a rule-made pattern at B3 and G3. That is intended to read as one designed plan, but it is watched. If a judge names it "grid-like", vary the deck widths and add canopies on the cross arms only.
- **Mannequin people near the camera at B2.** Keep deck people more than 15 m from any app viewpoint camera. Most are at 60-600 m.
- **Stage 2 risks I-019's failure:**
  - clutter on the B1 skyline;
  - dilution of `twin`.

  It is gated separately and dropped on any loss.
- **Merge conflicts.**
  - A placeholder-removal idea may change the large dark block in B2's foreground; that is independent.
  - The landmark-originality idea may reshape `twist`. The site uses only twist's centre and circle, so it adapts.
  - The shared `deckKit.js` and the crowd section order with I-027 are fixed above: I-027's section first.
