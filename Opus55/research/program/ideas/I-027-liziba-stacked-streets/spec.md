---
id: I-027
title: Liziba stacked streets - a vertical station quarter with galleries, stair bridges, lifts and station exits
status: proposed
direction: User priority 7 (elevated walkways, crazy 3D feeling), Zone A
family: urban circulation: multi-level pedestrian network (new family)
parent: none
proposed_by: idea generator
date: 2026-11-24
---

# I-027: Liziba stacked streets

## Idea
Turn one place in the Chongqing core into a real multi-level street quarter: the hillside around the Liziba monorail station (the tower the train passes through). Inside the station's 400 m walking catchment, the three steepest street runs get a second and third pedestrian level, and the station gets exits at platform level. Everything is added; nothing that exists is removed or moved.

What a visitor sees on these streets:
1. **Galleries (a street above the street).** A continuous pedestrian gallery runs along both street faces at podium-roof level, 5-18 m above the sidewalk. It extends the podium roof ledge and cantilevers 2.5 m over the sidewalk on brackets. On terraced podiums it steps down with the terraces, with a stair flight inside the gallery at each step.
2. **Bridges across the street at two heights.** Lower bridges join facing galleries about every 30 m. Upper bridges join a second gallery tier (podium top + 12 m) and are staggered between the lower ones. Where the two sides differ by 1-7 m, the bridge is a stepped stair bridge. With the 320 existing skybridges above and the monorail, the street shows four or five levels at once.
3. **Stair towers and one public lift.**
   - Steel stair towers stand in the 4 m alleys between lots. They run from the sidewalk to both gallery tiers.
   - One glass lift tower stands where the terrain drops most sharply within the catchment (the Chongqing public lift, inspired by the Kuixing building and the Fotuguan lift). A bridge at its top leads to the upper street or gallery.
4. **Station exits.** The Liziba tower's long side faces get exits at platform level. They are covered footbridges that land on the hillside at grade, on a gallery, or on a stair and lift tower down to the street. One covered footbridge also crosses over the monorail guideway 70 m or more from each tower end, so people walk over the trains.
5. **Lit and populated.** Each element has:
   - a lit soffit strip, LED handrails and small lamp posts;
   - its own pool of at most 48 warm point lights, which put light pools on the sidewalk under the galleries (so the decks do not read as pasted-on glowing slabs);
   - about 300-450 people pacing on the galleries and bridges or standing at the railings;
   - bilingual hanging signs under the gallery fascias.
6. **Three street identities, one per run**, so the kit does not read as one copy-pasted module. These are inspired-by designs, not replicas:

   | Run | Railings and lights | Signs |
   |---|---|---|
   | 1 | Chongqing red-lacquered steel and lantern strings | Chinese |
   | 2 | Glass balustrades and cyan LEDs | Chinese |
   | 3 | Turquoise patterned screens | Mongolian and Uyghur script among the Chinese signs (the critics asked for visible Central Asian culture) |

## Why it might work
- **The user asked for exactly this:** "elevated walkways between buildings, anything to give that crazy 3D feeling" (GOAL priority 7). The Liziba quarter is the place in the world where that feeling already starts: a train through a tower, a hillside street, skybridges.
- **The judges reward the layering we already have.** In I-018 both judges preferred main at A4 and on every u12 burst frame because the candidate had removed the pink and cyan skybridges. Layers crossing the street are a feature the judges notice and like. This idea multiplies them where they read best, at street level looking up a steep street, and removes nothing.
- **It targets the critics' named defects in A4 and A5:**
  - A4 "flat storefront panels with no interiors": the galleries put a lit, populated level in front of the storefronts.
  - A5: "black voids below the guideway and under the hillside street", "floating guideway", "guideway with no piers". The station exits, the stair and lift towers, and two approach piers fill the void with grounded, lit structure (see step 6).
- **The critics' character and brief axes are the room to grow.** A4 and A5 already score 7 on character; detail is 5. Galleries, railings, stairs and people add near-camera detail, and the multi-level view is the brief ("a city stacked on hills").
- **Real reference:** Chongqing's Yuzhong streets (Jiefangbei, Shibati, Kuixing building, Liziba itself) and Hong Kong's Mid-Levels and Central walkways are exactly this: galleries, stair bridges and public lifts tying several street levels together.

## What's new about it
- **No idea in this program has worked on pedestrian circulation.** The families tried are tower generation (I-005, I-012, I-013, I-017, I-018, I-019), facades, signs and text, the Hongyadong complex (I-011, I-015), the park plan (I-016) and aircraft (I-009, I-020).
- **Closest existing code:**
  - `skybridges()`: 320 single-storey boxes at random heights between neighbouring hillside towers;
  - `walkways()`: podium-top bridges across roads, at a 22% chance per facing pair;
  - the Hongyadong galleries on the cliff (I-015).

  The difference: those are isolated connectors scattered over the whole district. This builds one connected network in one place: continuous galleries, two bridge tiers, vertical links and station exits, designed as a street quarter.
- **Closest earlier idea:** I-019 (linked tower pairs, rejected 5.0), and this avoids each of its failure reasons:
  - links at 0.3-0.85H in 12 m slots that the judges could not see: here the links are at street-view height, at 5-30 m;
  - parallel links all on one axis: here the runs are chosen on both axes;
  - repeating the `twin` landmark: there is no landmark nearby;
  - towers were regenerated: here no tower is touched.

## Target poses (rule fixed now, before any capture)
- **Rule.** After the quick-test build and before any judged capture:
  - render the 14 eval poses at 640x360 with every new triangle painted flat green, using the coverage method of I-018 and I-019, with all occluders;
  - a pose is a **target** if the green share is **at least 2.0%** of the frame;
  - every other pose is **watched**: it must have no clear loss;
  - the target list is written to the idea folder and frozen before the eval capture.
- **Expected, not measured** (the generator may not run GPU jobs):
  - **A4 and A5 are the likely targets.** The A4 road line passes about 56 m from the station centre (computed from the pose and `MONORAIL_STATION`), so A4's street lies inside the catchment from about 130 m ahead of the camera onwards. If that line is chosen, its 320 m window can fall anywhere from 130 m to about 900 m ahead; a near window gives a large change, a far one a small change. A5 looks at the station's end face from 37 m, and the side exits leave the tower to the left and right of the frame.
  - Whether A4's line is one of the three chosen runs depends on its rise, and that is unknown. If A4 is not a target, the idea is judged on A5 alone.
  - A6, G1, G3 and the u12 burst are likely watched.
- **For the record:** the 400 m catchment is the usual transit planning radius (a 5-minute walk), chosen for that reason, not to fit a camera. Code review should reject any pose coordinate in the code.
- **If no pose reaches 2.0%,** the idea cannot be judged on eval poses. It then uses rule-placed held-out cameras as its judged set (H7-H9 below, two judges, at least 2 of 3 wins each) plus no clear loss on the eval poses, as in I-020.

## Expected effect on the metric
- **A4:** the upper two-thirds of the street canyon gains galleries along both faces, bridges at two heights and people at several levels. Likely a win on character and brief. Detail improves if the railings and brackets read at 150-300 m.
- **A5:** the side exits, the lift tower, the piers and the lit hillside levels below the station replace dark void. Likely a win.
- **Zone A:** if both win, the critic zone mean may rise by about +0.2 to +0.4. A4 and A5 move about +0.5 to +1.0 each on character and coherence, and the four other A poses are unchanged.
- **If it loses,** the program learns whether the judges reward added layers in a place that already has them, or see them as clutter.

## Quick test (implementers run this first)
1. **Site and runs.**
   - Build only the site rule, the run selection and the galleries plus lower bridges, with no upper tier, lifts, people or signs.
   - Write the run list (each run's line, rise, length and axis) and a top-down map, using `tools/planmap.mjs` or an equivalent.
   - Run the green coverage for the 14 eval poses and for H7-H9, and write the target list (rule above).
2. **Identity.** Prove that everything outside the new geometry is bit-identical to main: parts, props, signs, sign lights, building and transit lights, crowd arrays (rng 8080/9191), car runs and spawns (rng 31337/31338), CBD air corridors (rng 555), `towerTops`, `ledFacades`, tower-text selection, and the skybridge and walkway lists. Extend `tools/hyd-identity.mjs` to do this.
3. **Lights and people.** Add the light pool, the emissive strips and the people.
   - Capture H7 and H8 at 2560x1440 on both builds.
   - A fresh judge follows `pairwise-judge-v1.md` in both X/Y orders.
   - **Go** only if the candidate wins at least one order at each camera and loses neither.
4. **Bench.** Run interleaved pairs against main under the GPU lock until the standard error of the difference is under 0.05 ms. **Stop** if the mean difference is over +0.30 ms.
5. **Then the rest.** Add the upper tier, stair towers, lift, station exits, the guideway crossing, piers and signs. Recheck H7-H9, then hash the rules and constants (freeze) before the eval capture.

**Held-out cameras** (fixed by rule now; the implementer computes them from the site and must not view eval poses while tuning):
- **H7, street level on the best run:**
  - Camera at the run's lower end inside the catchment, on the sidewalk line (lateral = road/2 + 1.5 m), 1.7 m above ground.
  - Looking uphill along the run at a point 250 m ahead and 45 m above the camera's ground.
  - If the camera is within 150 m of any eval camera, use the run's upper end looking downhill instead (target 250 m ahead, 30 m below).
- **H8, mid-air at the station:**
  - Camera 180 m from the station centre along the side normal on the downhill side, 35 m above platform level, looking at the station centre at platform level.
  - If terrain blocks the view (raycast), use the other side.
- **H9, street level on the best run of the other axis:** as H7.

## Implementation plan
New files:
- `src/deckKit.js`: reusable pieces built with `MeshBuilder` from `trafficGeom.js`, using the transit-static materials (`M` in `transitStatic.js`: CONCRETE, METAL, GLASS, LED, DOWNLIGHT, PAVING, SLAB). Using a mesh, not building parts, allows sloped stair stringers, handrails and escalator trusses (`beam`), and leaves the buildings module's parts list untouched.
- `src/layered.js`: the site, the run selection, the layout and the people and light lists.

Small data-only additions elsewhere, with no new random draws:
- `buildings_gen.js`:
  - `terracedPodium` stores its strips (mid, half, top, axis) in its `hillPods` entry;
  - `genHillside` records the lot and street faces of each tower in its `hillTowers` entry.
- `buildings.js`:
  - records the parts ranges created by `skybridges()` and `walkways()` and publishes their boxes, plus `hillPods`, `hillTowers` and the boxes of every part and prop inside the site circle, as `world.shared.layeredData`;
  - neither function is edited.

1. **Site.**
   - Centre: `MONORAIL_STATION`. Radius: 400 m.
   - Exclusions: hillside lots only; the Liziba tower keep-out (`world.shared.lizibaTower`, 34 m, as the car-run rule uses); anything within 12 m of the guideway centre line, except the one crossing in step 6.
   - **Clearance only:** nothing new within 60 m of any app viewpoint camera (`POSES`). This mirrors the existing sightline clearance and is never used for placement.
2. **Run selection** (world rule, both axes).
   - Candidate runs: every Yuzhong grid road line clipped to the catchment, at least 150 m long, with hillside podiums facing the road on both sides along at least 60% of its length.
   - Each run is cut to its 320 m window with the greatest ground rise (shorter if the clipped line is shorter).
   - Score: the ground rise along that window.
   - Choose:
     - the best run on each axis;
     - then the best remaining run overall, on a line at least 144 m (2 blocks) from a chosen parallel run.
   - That gives 3 runs. Report them.
3. **Galleries.** For every podium face along a chosen run:
   - Deck top = the strip top. Deck from the tower face (or 3 m in from the podium edge, whichever is nearer the street) to 2.5 m beyond the podium face.
   - 0.35 m slab with a lit soffit strip. Brackets every 6 m embedded 0.3 m into the podium face. A balustrade with an LED handrail (at least 0.08 m thick so it does not shimmer at a distance).
   - Steps between strips: a stair flight inside the gallery at 35 degrees or less. If there is no room, the gallery ends with a return rail.
   - **Splits.** The gallery is split around:
     - any sign slot whose box comes within 0.3 m;
     - any existing part or prop box (shopfront awning, AC unit) that it would intersect;
     - existing walkway ends, which are joined into the gallery instead of being duplicated.

     Report the share of length lost (target 10% or less).
4. **Bridges.**
   - **Lower tier.** One bridge every 30 m of run, at least one per block. It joins facing galleries:
     - if their levels differ by 1 m or less, the bridge is flat;
     - if they differ by 1-7 m, it is a stepped bridge;
     - if they differ by more, the bridge is skipped.
   - **Upper tier.** A gallery 2.2 m deep on the tower faces at podium top + 12 m, with exterior stair flights to the lower gallery. Its bridges are staggered halfway between the lower ones.
   - **Clearances.** Every bridge keeps at least 3 m vertically or 4 m along the road from every existing skybridge and walkway box.
5. **Vertical links.**
   - **Stair towers** in the 4 m alleys between lots at the run ends and every second block. A steel frame with zig-zag flights from the sidewalk to both gallery tiers, and a footing on the alley ground.
   - **One lift tower:** a glass shaft, a lit cab and a top bridge (25 m or shorter). It stands at the public ground point (alley or open slope, not a lot, road or sidewalk band) in the catchment with the largest height drop to a gallery or upper sidewalk within 50 m.
6. **Station.** Built in `transit.js` after `buildTransitStatic`, with its own mesh and its own stream rng(2701). `buildTransitStatic` and its rng(4242) draws are not changed.
   - **Exits.** On each long side face, an exit door bay at platform level (emissive frame on the station facade) and a covered footbridge perpendicular to the track. It ends:
     - on terrain at grade if the hill reaches platform level within 60 m;
     - else on the nearest gallery or tower face within 50 m;
     - else on a stair and lift tower 12-20 m from the facade.
   - **Guideway crossing.** One covered footbridge over the guideway at the first pier 70 m or more from each tower end, at least 6.5 m above rail top, landing on galleries or stair towers.
   - **Approach piers.** One pier on each side of the tower at the first sample more than 27 m (HX + 3 m) from the station centre. Today the `inStation` skip leaves about 14-30 m of beam unsupported beside the tower. Skip this step if another adopted idea has already fixed it.
7. **People.**
   - Section 5 of `buildAgents` in `crowd.js`, appended after section 4. It has its own streams rng(2702) for placement and rng(2703) for style, and a copy of `style()`/`push()` that draws only from them.
   - Mode 1 pacers (with y) along gallery and bridge centre lines, about 4 per 30 m. Mode 2 people standing at the railings and facing the street, about 1 per 15 m. Scaled by the quality density.
   - Check the near-list occupancy at A4, A5 and H7 and keep it under 90% of each LOD cap.
8. **Lights and signs.**
   - **Lights.** At most 48 point lights (radius 10-14 m, warm) at bridge landings under the lower galleries. They are added after every existing light, as their own pool (as I-016 did).
   - **Signs.** Hanging and lightbox signs under the gallery fascias are appended to `world.shared.signRequests` after the transit ones, with no sign lights. Assert that the sign-light selection is unchanged.
   - **Atlas.** New strings go at the end of the atlas list, or reuse the existing Chinese, Mongolian and Uyghur word lists.
9. **Colliders.**
   - Only deck slabs and bridge decks get colliders, with bottoms 4.5 m or more above the ground below. So `buildRuns` (which treats colliders below ground + 4 m as street blockers) and the crowd's `blocked` test are unchanged; assert this.
   - Nothing new within 3 m of a viewpoint camera.
   - Rain is now sheltered under the decks (rain.js reads the colliders). That is intended; note it for the judges' pixel differences.
10. **Draw.**
    - One static geometry per site, drawn with the transit-static pipeline in the G-buffer pass.
    - Skipped on the CPU when its bounding sphere is outside the frustum (no per-frame allocation).
    - No pose coordinates anywhere.
11. **Checks.**
    - Both builds pass and `functional.mjs` is 18/18 with no WebGPU errors.
    - The identity list of quick-test step 2 holds.
    - An overlap audit (spatial hash) finds no new piece intersecting an existing part box except the host it is embedded in.
    - Total static lights stay at least 200 below `MAX_LIGHTS`.

## Random streams
| Stream | Used by | How it stays identical |
|---|---|---|
| 1234 (lots), each lot's `L.seed`, 9137 (generation and signs) | buildings, signs | No lot or generator call changes; only data pushes; new signs are appended requests |
| 5150 skybridges, 5151 walkways | buildings | Functions not edited; their output is read afterwards |
| 15015 complex, 4242 (light shuffle, transit, vegetation, fog, boats), 4343 infill lights | various | No draws added; new lights go in a separate pool after all selections |
| 8080 and 9191 crowd | crowd | New agents appended after section 4 with own streams 2702/2703 |
| 31337/31338 cars, 555 air | traffic | No collider below ground + 4 m; all new colliders are below 125 m and outside the CBD; assert runs and corridors identical |
| New | this idea | 2701 (station), 2702/2703 (people), 2704 (layout choices) |

## GPU cost
- **Gate:** average 11 ms or less, p99 16.7 ms or less, worst frame 25 ms or less. Current best about 9.8 ms average, so the headroom is about 1.2 ms.
- **Estimate:** +0.04 to +0.12 ms on the fly-through average; +0.10 to +0.25 ms at A4, A5 and H7 with `--stats`.
- **Cap:** +0.30 ms average (stop rule above), p99 within +0.5 ms.
- **Where the time comes from:** the program's remaining headroom. No savings are claimed. The extra time is in these passes:
  - **gbuffer:** a static mesh of about 40-70k triangles (3 runs of at most 320 m with galleries on both faces, so at most about 1.9 km of gallery; about 60 bridges, about 20 stair towers, 1 lift, 2 exits, 1 crossing). It is mostly drawn in front of facades that already fill those pixels, so the extra shading is small. About +0.02 to +0.06 ms when the site is in view, near 0 otherwise (frustum skip).
  - **lighting:** 48 small-radius lights in the tiles over the site. About +0.02 to +0.05 ms when the site is in view.
  - **crowd compute:** about 400 extra agents. About +0.01 ms or less.
  - **ssr and taa:** unchanged pass cost.
- **Report:** per-pass ms at A4, A5, H7 and H8.

## Cost
- One implementer: about 2 days for the kit, site, galleries and bridges; 1 day for stairs, lift, station, people, lights and signs; half a day for identity and audit tools.
- Compute: one quick-test capture set, 2-3 bench pairs, then one eval run.

## Risks
- **Clutter at A4.** Galleries and bridges could hide the hanging neon signs the critics like in A4 (character 7). Mitigations:
  - galleries split around sign slots;
  - bridges every 30 m, not continuous;
  - the H7 judge test comes before the full build.
- **"Pasted on" or floating reads (user priority 2).** A cantilevered gallery seen from below without visible support is exactly what the critics punish. Mitigations:
  - brackets every 6 m;
  - lit soffits with real light pools on the sidewalk;
  - every stair and lift tower with a footing;
  - the overlap and embedding audit.
- **A4 may not be a target.** If its line is not among the three runs, the idea rests on A5 alone (1/1 needed, and any clear loss blocks).
- **Mannequin people.** The critics already flag them at B1. Here most deck people are seen at 20-200 m; keep none within 15 m of a viewpoint camera.
- **Thin-line shimmer in motion bursts.** Handrails and LED lines must be at least 0.08 m thick, balustrades are solid glass panels, not rods, and no pieces thinner than 0.05 m are used.
- **Repetition.** The three run identities plus stepped and flat bridge variants. If judges still name "repeated modules", vary bracket and canopy types per block.
- **Merge conflicts:**
  - a terrain idea (I-021 to I-026 in flight) changes podium heights, but everything here is derived at build time, so it adapts;
  - a placeholder idea may also add Liziba piers: skip step 6's piers if so;
  - I-028 shares `deckKit.js`.
