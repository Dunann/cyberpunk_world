---
id: I-035
title: Station streets and the CBD deck core - multi-level pedestrian levels placed by district rules, measured before proposing
status: in-review
direction: User priority 7 (elevated walkways, crazy 3D feeling); revision of two rejected specs
family: urban circulation: multi-level pedestrian network
parent: I-027 + I-028
proposed_by: idea generator
date: 2026-11-24
---

# I-035: Station streets and the CBD deck core

## Idea
Two places get a second pedestrian level. Each is chosen by a district-wide rule, and nothing that exists is removed or moved.

1. **Station streets (Yuzhong).**
   - **Which streets.** Every monorail station inside the Yuzhong district gets the four grid streets that frame its block, over their whole length in the district. Today that is Liziba and Daping. One of those streets (local line lz = -432) passes both stations, so the two quarters are joined by one "station street". In total that is 7 streets.
   - **Galleries.** Along those streets, every podium face carries a gallery: a deck sitting on the podium roof that cantilevers 1.8 m over the sidewalk. The existing blade signs hang below it.
   - **Joins.** The galleries continue over the 4 m alleys between lots and over the cross streets. Stair flights in the alleys take people down to the sidewalk.
   - **Bridges across the street.** A street gets new cross bridges only where no existing skybridge crosses it within 150 m. The 320 existing skybridges stay the signature crossings of their streets (the I-018 lesson).
   - **Station exits.** Each station gets a covered exit footbridge at platform level on its downhill long face. It ends in a lit stair and lift tower that goes down into the dark slope below the station.
2. **The CBD deck core (Lujiazui).**
   - **Which lots.** Every CBD lot with `distFromCenter` < 0.45 (the district core) gets a deck 10 m up along each street face. The deck runs in the podium forecourt, from the podium face out to 3.3 m from the curb, so the sidewalk walkers stay clear. Columns stand every 15 m at the outer edge.
   - **Crossings.** One span crosses each road at the middle of each facing pair of lots. Intersections stay open to the sky.
   - **Metro spine.** Where Metro Line 6 runs through the core, the deck continues as a freestanding walkway under the viaduct (deck at +10 m, viaduct girder bottom at about +21 m). That joins the gaps the metro reserve leaves in the lot map. Lifts and stairs climb from it to the 大剧院 platform (+24 m).
   - **Levels.** That gives four levels: street, deck, metro and towers.

**Fewer pieces than I-027 and I-028.** There is no upper gallery tier, no roof tier, no sky-corridor ring, no new Liziba pier and no new hanging signs in Yuzhong.

## Measured coverage (CPU, before proposing; no GPU jobs)
**Method.** Scripts are in `measure/` (copies). The working set, including the inputs they need (`../hcpu.mjs`, `../grid_h.bin`), is in the scratchpad at `...\scratchpad\i035\`.
- **World and buildings.** `gen.mjs` replays the world and the full buildings generation in node, with the CPU port of the height function (`hcpu.mjs`). The result matches the GPU build: 2,876 lots, 147,221 parts, 320 skybridges, 51 walkways.
- **Signs, lamps and tracks.** It also runs `placeSigns` with a stub atlas (the draws do not depend on atlas content) and gives 73,957 signs, of which 33 are giant screens. It replicates the `lampPos`/`lampValid` lamp candidates (6,030 lamps) and runs `buildTracks`.
- **Geometry.** `geom.mjs` builds this spec's geometry by the rules below, as boxes, cut into pieces of 6 m or less.
- **Rasterising.** `cover.mjs` z-buffers everything at 640x360 with f = 310.5 px (the real 1242 px at 1440 rows). The occluders are every building part, every sign, the monorail and metro beams, the Liziba tower, and the terrain (ray-marched on the 6 m CPU height grid). It counts the pixels where new geometry is in front.
- **Clearance.** The camera clearance rule (below) is applied.
- **Validation.**
  - In A5, the Liziba tower edges land at x = 800-1680 of 2560 (the I-016m image shows 800-1700).
  - In A4, the two existing skybridges land at rows 65 and 88 of 360 (the image shows about 65 and 88).
  - In B2, the metro beam lands at the vanishing point, as in the image.
- **Limits.**
  - Cylinders and tapers are drawn as their bounding boxes.
  - Trees, cars, people, lamp meshes and fog are not drawn as occluders, so true coverage is a little lower, especially at A5's forested right side.
  - The GPU green-mask run in the quick test decides the targets.

| Pose | New geometry on screen (signs as occluders) | Without sign occluders | Within 120 m of the camera | Main pieces | Role by the 2.0% rule |
|---|---|---|---|---|---|
| A1 | 0.00% | 0.00% | 0.00% | - | watched |
| A2 | 0.00% | 0.00% | 0.00% | - | watched |
| A3 | 0.00% | 0.00% | 0.00% | - | watched |
| **A4** | **1.72%** | 2.55% | 1.70% | gallery bridge over the cross street at right 0.91, galleries 0.54, alley stairs 0.26 | **watched (borderline)** |
| **A5** | **3.10%** | 3.13% | 2.98% | stair and lift tower in the void below the platform 2.04, exit bridge 0.59, galleries 0.30 | **target** |
| A6 | 0.09% | 0.10% | 0.00% | distant galleries | watched |
| B1 | 0.00% | 0.00% | 0.00% | - | watched |
| **B2** | **13.92%** | 13.92% | 13.47% | decks both sides from 13 m 10.88, columns 2.04, mid-block spans 0.99 | **target** |
| B3 | 0.00% | 0.00% | 0.00% | - | watched |
| B4 | 0.12% | 0.12% | 0.00% | deck glimpses | watched |
| G1 | 0.00% | 0.00% | 0.00% | - | watched |
| G2 | 0.01% | 0.02% | 0.00% | - | watched |
| G3 | 0.01% | 0.01% | 0.00% | - | watched |
| G4 | 0.00% | 0.01% | 0.00% | - | watched |
| H7 (held-out) | 0.75% | 1.04% | 0.71% | galleries | held-out |
| H8 (held-out) | 16.79% | 16.79% | 16.60% | decks, columns, spans | held-out |
| H9 (held-out) | 1.01% | 1.02% | 0.00% | Liziba quarter from the air | held-out |

**Sensitivity of B2 to the core radius.** `distFromCenter` < 0.30 gives 7.15%, < 0.35 to < 0.55 gives 13.9%. So B2 does not sit on a knife-edge of the parameter. The value 0.45 is the one the I-028 reviewer proposed.

**What the table says, honestly:**
- **Street-level views can carry this idea; aerial views cannot.** B2 and A5 qualify. A4 does not: its podium-level bridge would line up in the frame with the existing pink and cyan skybridges that the judges defended, and the 150 m rule removes it. A4 would reach about 2.1-2.5% if bridges were allowed there.
- **A3, A6, B4 and the G poses do not see it** (0.12% or less). Walkways at podium or deck height are hidden by towers from 300 m up. Reaching those views would take links high on the towers, which is what failed in I-019. Those poses need other ideas (terrain, facades, landmarks). That cannot be proven from 0% coverage, but it is the program's record.
- **The A3 "dark wedge"** is the bare terrain slope of the `raffles` landmark site at the peninsula tip (picked at about (240-320, 14-80, 90-160)). It is not a walkway site, and stepped banks there were already tried and rejected (I-002).

## Target poses (rule fixed now, before any capture)
- **Rule.**
  - Every new triangle is painted green in the real renderer (the I-018/I-019 coverage patch) after the full build. The full build is the measured one, not a reduced base.
  - A pose is a target if its green share is at least 2.0%. All other poses are watched (no clear loss allowed).
  - The list is frozen before the eval capture.
- **Expected:** B2 and A5 are targets. A4 is watched; if the GPU run puts it at 2.0% or more, it becomes a target by the rule.
- **Adoption** follows EVAL: wins on at least 2/3 of the targets (with 2 targets, both must win) and no clear loss elsewhere.
- **The critic zone effect is limited to Zone B (via B2) and to A5.** I state this plainly.

## Every reviewer defect, and its fix
| Defect (I-027 / I-028 reviews) | Fix in this spec |
|---|---|
| Structures where the eval cameras do not see them; estimated numbers | District rules; coverage measured with occluders (table above) |
| No run possible on A4's axis; 60% rule over the chord | Runs are replaced by station-frame streets over their whole length in the district. A4's line is one of them (measured galleries 0.54%) |
| Blade-sign clash; gallery cut every 3-5 m | Deck on the roof: slab bottom = strip top. Blades end 0.4 m or more below it (`top = topAt - 0.4`) and hang under the gallery. The gallery is split only where a real sign mesh box enters the deck or railing volume |
| A5 pier 3 m from the existing column at HX + 3 = 27 m | No new pier. The stair and lift tower stands 33 m off the track axis at X = -10 m, more than 30 m from the existing column (assert 6 m or more from any existing column or pier) |
| Pacers on stairs and stepped bridges float | Mode-1 pacers only on flat pieces (gallery pieces, deck bays, flat spans), with segment length at most the flat length minus 1 m. Standing people only on landings. Assert that every agent is within 0.3 m above a deck surface |
| The 60 m camera sphere deleted A5's exits | Clearance = 15 m around each app viewpoint camera, plus a 6 m radius around its 3D view ray out to 85% of the way to its target (the elevated analogue of the vegetation sightline stamp). Measured: it removes 9 of 8,461 pieces |
| Lamps and trees missing from the audit | Lamps: JS replica of `lampPos`/`lampValid`. The gallery outer edge is at road/2 + 3.5 - 1.8 = 7.2 m, 1.0 m from the poles at 6.2 m; any gallery within 1.5 m of a pole with its soffit below lamp top + 1 m is pulled back to 1.0 m over 3 m. Bridges are skipped within 5 m of a lamp along the line unless the soffit is 1 m or more above the head. CBD columns are 2.9 m from the poles. Trees: see vegetation (step 8) |
| Metro Line 6 ignored; reserve gaps | It becomes the spine: a freestanding deck under the viaduct (about 940 m in the core), joined to the faces it meets, with lifts and stairs to the 大剧院 platform |
| Giant CBD LED screens at +9 to +19 m | The deck is dropped over the screen width + 2 m where the screen bottom is below deck top + 2.6 m (measured: 2 of 146 faces); otherwise it passes under the screen |
| Requested signs over 3 m² add lights at priority 1e5 | A new `noLight` field on requests skips `addLight`. Deck signs are kept under 3 m² as well, and get their own sign cell group (as I-016). Assert the sign-light list is identical |
| Atlas packing changes | No new strings: deck signs reuse existing atlas entries (SHOP_WORDS, MONGOL_PAIRS, CYRILLIC_MN). Assert the atlas has 0 drops and is byte-identical |
| No darkening under decks (no shadows) | A 2 m R8 "deck cover" mask per site (blurred footprints), sampled in `terrainShade.js`. It multiplies the ground's sky ambient and wet sky reflection by 1 - 0.45 × mask; one texture fetch |
| Deck lands mid-floor on the glass | CBD deck top snapped to the first podium floor line at or above gMax + 9.5 (podium floors are 5 m from gMin). Neighbouring decks meet on spans that ramp at 1:12 or less (up to a 2.2 m difference), are stepped (up to 6 m), or are skipped |
| Plain slabs read as untextured | A new DECK material in the transit-static shader: coffered soffit by uv, panel joints, wet paving on top, a bolted fascia band. Handrails 0.15 m or wider; LED rails no brighter than the walkway rails (param 3) |
| Ring impossible under the 60 m cap; roof bridges clash | Stage 2 and the roof tier are dropped |
| Thin, sub-pixel lit lines in motion | Balustrades are solid glass panels; nothing thinner than 0.15 m carries emission |
| Module order unclear; lights after every pool | Order given in the implementation plan (layout in buildings, lights in a module after `lightshow`) |
| TILE_MAX = 256 | Assert the maximum tile light count at B2, H8 and A5 stays under 200 |
| "No landmark nearby" / twin distance claims | No such claims. `twin` lies inside the CBD core; its reserve has no lots, so no deck goes there |

## Implementation plan
**Module order and data flow** (no random draws added to any existing stream):
1. **End of `buildings.init`: layout, data only.**
   - New `src/decksLayout.js` computes the whole layout from:
     - `world.lots` and the buildings `Parts`: podium strips, CBD podium inset and top, the skybridge and walkway ranges recorded around their calls;
     - `buildTracks(world)`, called again here (pure and deterministic, the same call the traffic module makes);
     - the lamp replica.
   - **Output:** `world.shared.decks` holds pieces, footprints, people lines, lights and sign requests.
   - **Colliders** are added here for deck slabs, galleries and spans only, with bottoms 4.5 m or more above the ground below. They cannot change car runs (blocking needs a bottom below ground + 4) or crowd placement (below ground + 2). All CBD tops are under 40 m, far below the 130 m line that `cbdCorridors` (rng 555) tests. Assert runs and corridors identical.
2. **Vegetation.** Applies `world.shared.decks.footprints` (+2 m) as a second mask after its existing selection (the I-016 pattern), so only trees that would intersect a deck, stair or lift are dropped. These are mainly at the Liziba lift tower and at any kept CBD street trees. Assert the rng(4242) and rng(99) draws are unchanged.
3. **Signs.** Requests from `world.shared.decks` are appended after the transit requests, with `noLight`, in their own cell group.
4. **Traffic, crowd.** A new section after section 4 reads `world.shared.decks.people`. It uses its own streams rng(3502) for placement and rng(3503) for style, with copies of `push`/`style` that draw only from them. Keep near-list occupancy and glints (cap 12,000) under 90% at B2, A5 and H8.
5. **New module `decks`, placed after `lightshow` in `main.js`.**
   - Builds the mesh with `MeshBuilder` and the transit-static materials plus DECK, cut into 100 m cells, each skipped on the CPU when outside the frustum (no per-frame allocation).
   - Draws in the G-buffer pass.
   - Adds its lights last, so every existing light keeps its index. The sign-light budget `min(2150, 8192 - count - 64)` stays at 2,150 (total about 5.3k).

**Rules (as measured):**
- **Station streets (Yuzhong).**
  - **Stations:** monorail stations inside the Yuzhong ellipse. Lines: for each, the two grid lines bounding its block on each axis, over their whole length in the district. Measured: 7 lines.
  - **Galleries:** on every hillside podium strip whose face is within road/2 + 3 + (-1 to 6) m of the line (trimmed lots included). They run 1.0 m on the roof and cantilever 1.8 m, with a 1.1 m glass balustrade. Measured: 7,856 m.
  - **Alleys:** links over 4 m alleys where the two sides differ by 4 m or less (129); stair flights where they differ by more (81). If the alley already has a `terracedPodium` stair street, connect to it with a landing instead.
  - **Cross streets:** gallery bridges where the two sides differ by 4 m or less (57).
  - **Bridges across the street:** at the facing lot-pair centres, at least 30 m apart. They are flat if the two sides differ by 1 m or less and stepped (4 steps) if they differ by up to 7 m. Each keeps its soffit 5 m or more above the road, keeps lamp clearance, and is placed only if no existing skybridge or walkway crosses the street within 150 m. Measured: 20 built, 21 skipped for existing crossings, 29 for the height difference, 6 for being too low.
  - **Station exits:** a covered bridge 16 m long at platform level, centred at X = -10 m on the downhill long face, then a 6.4 m stair and lift tower to the ground. The drop is 16.4 m at Liziba and 25.8 m at Daping.
- **CBD deck core.**
  - **Lots and decks:** 41 lots and 146 street faces, 12,512 m of deck, 764 columns.
  - **Spans and links:** 37 mid-lot spans; one escalator per span on the forecourt under a deck void; stairs at every dead end.
  - **Metro spine:** about 940 m. Lift and stair towers stand at the 大剧院 station ends.
- **People.** About 3 pacers per 100 m on flat deck or gallery pieces and 4-6 on each span or exit, plus railing standers on landings. Scaled by quality density (about 600-800 at high).
- **Lights** (own pool, 112):
  - CBD: one under each span (37) and one at each escalator foot (27);
  - Yuzhong: 48 at bridge landings and exits, nearest to the stations first;
  - all warm, radius 12-14 m.

**Checks.**
- Both builds pass, `functional.mjs` 18/18, no WebGPU errors.
- Identity is bit-identical for: parts, props, signs and the sign-light list, the atlas, lights by index, crowd arrays (rng 8080/9191), car runs and spawns (rng 31337/31338), air corridors (rng 555), the street-tree list and the rng(99)/rng(4242) draws, `towerTops`, `ledFacades`, tower-text selection, skybridges and walkways.
- The overlap audit, with parts, props, sign boxes, lamp poles and heads, track beams and columns, finds 0 intersections except embedded hosts.
- No pose coordinates in the code; the clearance list is `POSES`, as in vegetation.

## Random streams
| Stream | How it stays identical |
|---|---|
| 1234 lots, `L.seed`, 9137 generation and signs, 9138 infill signs | Data reads only; sign requests appended with `noLight` in their own group |
| 5150 skybridges, 5151 walkways | Functions not edited; parts ranges recorded around the calls |
| 15015, 4242, 4343, 99 | No draws added; the vegetation deck mask is applied after the existing selection |
| 8080, 9191 crowd | New section appended with own streams 3502/3503 |
| 31337/31338 cars, 555 air | No collider bottom below ground + 4.5 m; CBD tops under 40 m |
| New | 3501 (escalator side, sign string pick), 3502/3503 (people) |

## GPU cost
- **Gate:** average 11 ms or less, p99 16.7 ms or less, worst frame 25 ms or less. Main is at about 9.77 ms (the I-016 bench), so the headroom is about 1.2 ms.
- **Estimate** from the measured counts: about 265k triangles in total.

  | Piece | Triangles |
  |---|---|
  | Galleries | about 94k |
  | CBD decks | about 88k |
  | Columns | about 24k |
  | Alley stairs | about 19k |
  | Escalators | about 11k |
  | Spine | about 9k |
  | Spans, bridges, links, lifts | about 20k |

  Typically 20-40% of the cells are in view.
- **gbuffer:** about +0.04 to +0.08 ms on the fly-through, and up to about +0.12 ms at B2, where 14% of the pixels are new. Most of those pixels are drawn in front of facades that already fill them.
- **lighting:** 112 lights clustered in two places. About +0.03 to +0.08 ms when in view (tile count assert above).
- **terrain:** the deck-cover mask costs about +0.01 ms.
- **crowd:** about +0.01 ms.
- **Estimate on the fly-through average:** +0.08 to +0.18 ms. Cap +0.30 ms (stop rule), p99 within +0.5 ms.
- **Where the time comes from:** the remaining headroom. No savings are claimed.
- **Bench rule:** interleaved pairs under the lock until the standard error of the difference is under 0.05 ms. Report per-pass ms at B2, A5, A4 and H8.

## Quick test
1. **Coverage on the GPU.** Build the full layout, unlit, with the dev green paint.
   - Run the GPU green mask for the 14 eval poses and H7-H9.
   - Confirm or correct the CPU table above. If B2 or A5 falls under 2.0%, report that and stop for a coordinator decision.
   - Freeze the targets.
2. **Identity and audit** (lists above).
3. **Lighting and people, then judge.** Light, darken and populate. At 2560x1440 on both builds, capture B2 and H8, plus a close cantilever and stepped-bridge view (H10, below).
   - Two fresh judges, both X/Y orders.
   - **Go** if B2 wins for both judges and nothing loses at H8.
   - Also run a lit-against-unlit A/B at H8, to learn whether the form or the light moves the judge.
4. **Bench** (rule above).
5. **Freeze and eval.** Hash the rules and constants, then capture the eval set.

**Held-out cameras** (by rule; `measure/held.json`):
- **H7:** on the station street (lz = -432) midway between the two stations, south sidewalk, 1.7 m up, looking toward Liziba 300 m ahead and +10 m.
- **H8:** B2 reflected through the CBD centre: (3550, g + 1.7, -1500), looking south 600 m ahead and +50 m.
- **H9:** 300 m from Liziba along its downhill normal, 110 m above the platform, looking at the station.
- **H10:** the gallery-level view, 40 m along a station street from the Liziba exit tower, 1.7 m above the gallery deck.

Measured coverage: H7 0.75%, H8 16.79%, H9 1.01%. H10 is computed by the implementer. All are 200 m or more from every eval camera.

## Cost
- One implementer, about 4 days:
  - 1 day for the layout and audit (much of it is in `measure/`);
  - 1.5 days for the mesh, DECK material, deck-cover mask and lifts;
  - 1 day for people, lights, signs and identity;
  - half a day for the bench.
- Compute: one GPU coverage run, one judged capture set, 2-3 bench pairs, then one eval run.

## Risks
- **B2 could read as a covered colonnade that closes the avenue.** The decks are in the forecourts and the intersections stay open, but the near-left deck soffit enters the top of the frame from 13 m away. The B2 judge pair in quick-test step 3 decides before the eval.
- **A5 rests on one tall element.** That is the lit stair and lift tower in the dark lower-left, about 2% of the frame. If a judge reads it as a block in the void, A5 can tie, and adoption then needs B2 alone, which is not enough under the 2/3 rule with 2 targets. Mitigation: a glazed shaft with a moving lit cab, visible stair flights and landings, and a lit path at its foot.
- **The Yuzhong half is mostly invisible to the metric** (A4 1.7%, H7 0.75%). It serves user priority 7 and the fly-through, not the score. If the coordinator wants only measured value, build the CBD core and the two station exits first and add the station-street galleries as a second step.
- **Yuzhong bridges are rare** (20). The 150 m rule protects the existing skybridges and the height-difference rule is strict. The street-crossing layers come mainly from the existing skybridges, which is intended.
- **The CPU measurement has limits.** It uses box approximations, no tree or car occluders, and the CPU height port, so the GPU numbers may differ by tens of percent relative. B2's margin is large (13.9% against the 2.0% rule), A5's is not (3.1%).
- **Merge conflicts:**
  - a terrain idea changes podium heights, but the layout is derived at build time;
  - a landmark idea reshaping `twist` or `raffles` does not touch the core rule;
  - the placeholder idea's B2 foreground fix is independent.
