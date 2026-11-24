---
id: I-025
title: Picture cars and extras - a hero tier of vehicles and people near the camera, built from swappable components
status: rejected
score: 5.67 (review-1 5.67, review-2 5.67; mean; below 7)
direction: Borrow from another field (film picture cars and background casting; AAA open-world pedestrian and vehicle component systems)
family: near-camera population: component-swap vehicles and pedestrians with a hero level of detail
parent: none
proposed_by: idea generator
date: 2026-11-24
---

# I-025: Picture cars and extras

## Idea
Film productions do not use one generic car and one generic extra. A picture-car coordinator supplies a small fleet of distinct, period-correct vehicles, and the vehicles nearest the lens are "hero" cars that are clean, detailed and lit. Casting and the costume department dress background extras from a matrix (body, wardrobe, accessory, action), and the extras nearest the camera get the most attention. AAA open-world games do the same in code. For example, the GTA V pedestrian system swaps head, upper body, lower body, hands, feet, hair and accessory "components" on one shared skeleton, and its vehicles have a dedicated LOD0 with wheel arches, interiors and light bars that only the few cars near the camera use.

This idea applies that method to the two populations that are worst at close range today. Both have a single mesh: the car is a 7-point profile extrusion of about 160 triangles with its wheels hidden inside the body, and the person is an 8-sided loft of 1,154 triangles with no face, hands or accessories. A **hero tier** is added for both, used only close to the camera:
- **Cars:** a fleet of 9 body types with real wheels in wheel arches, light bars, plates, mirrors and a parallax interior. Hero tier under 35 m; a middle tier from 35 to 150 m; beyond 150 m the existing mesh is kept.
- **People:** component-built extras with faces, hands, shoes, collars, bags, backpacks, glasses, masks and LED-trim jackets, plus standing-pose variety for spectators. Hero tier under 12 m.

Every choice comes from a hash of the per-instance seed that already exists, so traffic and crowds are in exactly the same places, with the same types, colours, umbrellas and phones as today.

## Why it might work
- **It removes two named critical defects and one major one.**
  - B2: both critics call the "large purple-black untextured block, 0-1030 x 900-1440" critical. Its top is below eye height (1.7 m) and it is about 1.8 m wide at 2-3 m, so it is almost certainly the existing box car in the next lane (step 0 confirms this).
  - B1: critic 2 calls the "mannequin foreground characters" critical, and critic 1 calls them major.
  - A4, B2: "wheel-less box cars", a major defect for both critics.
  - Critic 1 ranks "better people and vehicles" 7th of 10 changes and critic 2 ranks it 4th. These poses currently score 4.9 (B2), 5.9 (B1) and 6.25 (A4) on the two-critic mean.
- **Large share of the frame, measured from the current-best images (before occlusion is counted exactly in step 0):**
  - B2: the near car covers about 15% of the frame and the other cars about 3%.
  - B1: the five foreground spectators cover about 7-9%.
  - A4: the cars on the left cover about 3%, and the walkers, including the umbrella figure in the foreground, about 3%.
  - These are the "detail" axis pixels (two-critic axis mean 4.86, the weakest axis). At these distances a strict judge compares objects, not textures.
- **It matches user priorities 5 and 6.** The car fleet is near-future: flush full-width light bars, flush door handles and EV underglow on some cars. That adds "technology" and "sleekness" in every street view without new placements.
- **It fits the engine.**
  - Cars already split into a near list (mesh, G-buffer) and a lamp list (forward sprites).
  - People already have three mesh LODs with separate capacities (`caps`, crowd.js:599) and a style bitfield, and the shader already collapses parts an agent does not wear (`hide`).
  - Both are extensions of systems that exist, not new modules.

## What's new about it
- No earlier idea in this program has touched vehicles or people. The closest work is I-015's gallery dressing and I-016's park lanterns, which are props on buildings.
- The new part is the production method:
  - a fixed fleet and wardrobe matrix;
  - selection by hashing existing seeds, so every placement and every existing style choice is unchanged;
  - a hero tier spent only where the camera is close, like the LOD0 "hero" vehicles of AAA open-world games.

## Target poses (declared by rule, before any implementation)
- **Rule:** in step 0, build the current best (main = runs/I-016m source) with a dev flag `?popmask`. The flag draws car meshes (all tiers) in flat red and person meshes in flat green, with depth testing against the whole scene, and everything else in black. Capture all 14 eval poses at t as in poses-v1.json.
- A pose is a **target** if cars within 150 m plus people within 22 m cover at least 2.0% of the frame. The mask shader writes distance bands to separate colours, so the band can be counted.
- **Expected targets:** B2, B1, A4. A5 and u12 could also pass: u12 is reported but not scored, since bursts are excluded from the score JSON.
- The target list from step 0 is written into this spec folder (`targets.json`, with pixel shares) before any code is written, and it is never changed afterwards.
- **Adoption (EVAL v1 rule):** wins on at least 2/3 of the targets and no clear loss on any other pose. Other poses should be ties, because far cars and far people keep the existing meshes.

**Held-out cameras (for the go/no-go of the quick test only, not for adoption):**
- 6 street cameras by rule, seed 20261125:
  - pick sidewalk points on road runs (`buildRuns`): 2 in HILLSIDE, 2 in URBAN, 2 in CBD/BUND;
  - height 1.7 m above ground, yaw along the run (the direction with the larger +x component), pitch +4 degrees;
  - t is the first t at or after 60 s at which at least one car is between 5 and 25 m in front of the camera, computed on the CPU from the car state formula;
  - reject a point if a wall is within 6 m of the view centre.
- 2 promenade cameras by rule: Bund spectator band, x = 2040, z drawn uniformly in [-1400, -400], height 1.7 m, yaw toward +x (the river).
- The camera list is written to `heldout-cameras.json` before any code, and never changed.

## Expected effect on the metric
- Pairwise: likely wins at B2 (the critical block becomes a detailed car), B1 and A4; ties elsewhere.
- Critic means: about +0.5 to +1.0 on B2, B1 and A4, mostly on the detail and coherence axes. That gives Zone B about +0.4 and Zone A about +0.1-0.15. This idea does not close the gap to 9 by itself. It removes defects that cap the close street poses at "indie" quality.

## Quick test
Build the car part first: 3 bodies (saloon, compact SUV, e-bus), hero and middle tiers, wheels, light bars and plates. Leave people unchanged.
- Capture B2, A4 and the 6 held-out street cameras on main and on the candidate.
- One blind pairwise judge (`pairwise-judge-v1.md`, both X/Y orders).
- **Go** if the candidate wins or ties at B2 and wins at least 4 of the 6 held-out cameras.
- **Stop** if B2 loses. Before stopping, check whether the mask shows that the B2 block is not a car at all. If it is not, report that and keep the idea for B1, A4 and the rest of the fleet.

## Implementation plan

### 0. Measure first
- Add the dev-only `?popmask` (`__DEV__` guarded, removed from index.html) and capture.
- Write `targets.json` and `heldout-cameras.json`.
- Print the triangle counts of the current meshes. Person LOD0, LOD1 and LOD2 are 1,154, 844 and 511 triangles (measured with `personMesh`). The car is about 160 triangles.

### 1. Car fleet (`trafficCars.js`, new `carFleet.js` for meshes)
**Selection.** No new random draws. The existing `type` (0 car, 1 taxi, 2 van, 3 bus) and `color` stay as drawn by `rng(31337)` and `rng(31338)`. The body within a type is `body = pcg(u32(seed * 4294967295)) % nBodies(type)`, where `seed` is the per-car `rnd()` already stored in `CarIn.b.z` and copied to `CarOut.p.w`.

| type | bodies |
|---|---|
| 0 car | 4-door saloon, hatchback, compact SUV, MPV, low coupe EV |
| 1 taxi | Chongqing-style saloon taxi (yellow / green paint already chosen), roof sign kept |
| 2 van | delivery van, small box truck |
| 3 bus | low-floor e-bus (12 m, full-length glazing, LED destination board, roof battery pods) |

**Meshes.** They are built on the CPU with `MeshBuilder` from cross-section lofts: a body side profile, 5-7 plan sections and a separate glass house.
- **Hero tier, under 35 m:** about 2,500-3,500 triangles.
  - Body with cut-out wheel arches: the side faces are split around a 0.36 m arch radius.
  - 4 wheels: a 16-sided tyre and a rim disc with 5 spokes in the shader. Wheel spin is a vertex rotation by distance travelled / radius. The previous-frame angle comes from the previous along-distance, so motion vectors stay correct.
  - Side mirrors, a front intake, full-width front and rear light-bar geometry, plate recesses.
  - On 20% of type-0 cars (seed hash), an underglow strip: emissive cyan or magenta under the sills, which reflects in the wet road via the existing SSR.
- **Middle tier, 35-150 m:** about 400-500 triangles, with the same silhouette and arches, 8-sided wheels and the light bars.
- **Far tier, over 150 m:** the existing `carMesh()`, unchanged.
- **Lists.** The compute pass (CAR_STATE_WGSL) appends to three lists by distance instead of one. Capacities:

| Tier | Capacity at q2 | q1 | q0 |
|---|---|---|---|
| hero | 48 | 32 | 16 |
| middle | 700 | — | — |
| far | the existing 2,600 | — | — |

- **Overflow.** A car that does not fit in its tier's list drops to the next tier, so no car disappears, the same rule the crowd uses (crowd.js:104-112). Total capacity and the lamp list are unchanged.

**Shading** (CAR_MESH_WGSL `fs`, still one G-buffer pipeline per tier):
- **Paint:** the existing palette, a clear-coat roughness of 0.12-0.2 by seed, door and bonnet seam lines and handles from the body uv (box-filtered by `fwidth`), and a darker lower sill.
- **Glass:** opaque dark glass, as today (the renderer is deferred). On the hero and middle tiers the glass shows a parallax cabin made with the same ray-box method as the building `interior()`: seat and headrest silhouettes, a dash screen glow (cyan or white, dim) and the roof liner. That reads as an occupied car instead of a black slab.
- **Plates:** Chinese-style blue (cars), yellow (vans and buses) or green (EV, the underglow cars). They show a printed character pattern only, with no text atlas.
- **Lights:** the light-bar geometry is emissive at the same positions as the existing lamp sprites. The sprite list and the sprite offsets are not changed, so the forward glow pass and the wet-road streaks stay as they are. The bars are sized so they sit under the sprites.

### 2. Extras (`crowdMesh.js`, `crowd.js`)
**Selection.** No new random draws. All existing style bits keep their meaning: umbrella, LED rim, phone, raised phone, coat colour, umbrella colour, clothes, headwear, long hair, sitting. New component choices come from `pcg(u32(seed * 4294967295) ^ k)` for component k, where `seed` is the agent seed already in `Agent.c.y`:

| Component | Choices |
|---|---|
| skin tone | 5 |
| build | girth 0.9-1.15 on x, shoulder width; height stays the existing `scale` |
| shoes | trainers, boots, dress shoes |
| bag | none 45%, backpack 25%, shoulder bag 18%, shopping bag in hand 12%; not with an umbrella in the same hand |
| eyewear | none, glasses, LED visor (5%) |
| face mask | 8% |
| headphones | 10% (only with hair or a beanie) |
| jacket trim | none, LED piping (12%, using the existing LED colour palette) |

**Hero tier, under 12 m; capacity 96 at q2, 64 at q1, 0 at q0.** A new mesh level of about 2,500-3,000 triangles:
- 12-sided body lofts;
- a shaped head (brow, nose, jaw, ears) and neck;
- mitten hands with a thumb;
- separate shoes;
- a collar or hood rim;
- the bag, backpack and eyewear parts, hidden by the existing collapse mechanism when they are not worn.

The existing LOD0 covers 12-22 m and gets the bag and backpack silhouettes. LOD1 and LOD2 are unchanged. The list split follows the existing pattern (`P.b`, crowd.js:62).

**Face and cloth shading in the person `fs`:**
- **Face:** eyes, brows and lips as darker value shapes on the head part, hair-line and strand bands, ears, and skin with subsurface-like warm shading (albedo only).
- **Cloth:** fabric value noise, seams, zips, pockets, cuffs, and a yoke or print panel on jackets.
- **Filtering:** everything is box-filtered with `fwidth`, so the hero tier does not shimmer in motion.

**Standing pose variety** (mode-2 agents: spectators, platform waiters, vendors). Chosen by seed hash among:
- weight on one leg (hip shift and knee bend);
- hands in pockets;
- arms crossed;
- holding a drink (cup part);
- filming with a raised phone (the existing raised-phone bit keeps priority);
- head tilted up toward the show;
- a slow breathing and weight-shift idle (period 4-7 s; previous-frame pose for motion vectors, as the walk cycle does).

### 3. Checks
- **Identity.** With `?nocars&nocrowd` (dev), the frame is pixel-identical to main at all 14 poses. With both shown, car positions, types and colours and agent positions and style bits are hash-identical to main: dump `CarIn`, `Agent` and the compute output at t = 100 and compare hashes.
- **Counts.** Hero and middle list fill counts at every eval pose and over the bench fly-through, printed by the dev stats. No tier may overflow at any eval pose. If one does, raise the capacity; do not silently drop cars to the far tier.
- **Motion.** Capture `burst-u12` and a 4-frame burst at one held-out street camera. Wheel spin, LED visors, idle sway and seams must not shimmer or smear. Shimmer is a stop condition until fixed.

## GPU cost and where it comes from
The current frame is about 9.8 ms. The gate is an average of at most 11 ms, a p99 of at most 16.7 ms and a worst frame of at most 25 ms.
- **G-buffer geometry (most of the cost):**
  - Car hero tier at full capacity: 48 × 3,500 = 168k triangles.
  - Middle tier at full capacity: 700 × 450 = 315k triangles, replacing 700 × 160 = 112k.
  - Person hero tier at full capacity: 96 × 3,000 = 288k triangles, replacing up to 96 × 1,154.
  - **Worst-case street frame:** about +0.55M triangles. On the RTX 4050 that is roughly +0.10-0.25 ms at B1 or B2, where the tiers are full.
  - The bench fly-through runs at 25-330 m and seldom fills the hero tiers, so the average should rise by about +0.03-0.10 ms.
- **G-buffer shading:** the car cabin parallax and the seam and face math run only on hero and middle tier pixels. They cover about 15% of the frame at B2 and under 2% in almost every other view: about +0.02-0.05 ms at B2.
- **Compute:** the three-way list append in the car and crowd passes is negligible (under 0.01 ms).
- **Lighting, fog, SSR, post:** unchanged. No new lights, and the forward lamp sprites are unchanged.
- **Expected bench result:** average +0.05-0.15 ms (about 9.9 ms), p99 +0.2 ms at most.
- **Stop rule:** a mean of 3 interleaved bench pairs over +0.25 ms means reduce the tier distances, 35 → 25 m for cars and 12 → 9 m for people, before evaluation.

## Shared random streams
- Unchanged: `rng(31337)` and `rng(31338)` for cars, the crowd's stream, and every building, sign and terrain stream.
- No new random draws anywhere. Every new choice is a hash of a seed value that already exists, so no instance's existing attributes can change.
- The checks in step 3 prove this.

## Cost
- About 1,200-1,800 lines:
  - car fleet meshes and LOD lists, about 700;
  - person hero mesh and components, about 500;
  - shader work, about 400;
  - dev tools, about 100.
- Compute: the usual eval run plus 3 bench pairs and the held-out captures.

## Risks
- **The B2 block may not be a car.** It could be a kerb barrier or another prop. The quick test checks the mask first. If it is not a car, B2 may only tie, and adoption then needs both B1 and A4.
- **Hero-tier quality.** A hero car built from lofts can still look like a toy if the proportions or the paint are off. A face on a stylised figure can fall into the uncanny valley at 3 m, and a strict judge may prefer a clean mannequin over a bad face. Mitigation: stylised faces (value shapes only, no eye whites at a distance), checked on the held-out promenade cameras before any eval capture.
- **Mesh pop at tier boundaries.** The hero, middle and far meshes change abruptly at 35 m and 150 m, and people at 12 m. TAA hides part of it. Use a 3 m dithered cross-fade band, as the vegetation LODs do, if pops show in the bursts.
- **Light-bar and sprite mismatch.** If the bars do not sit under the existing sprite offsets, headlights float off the body. Step 1 requires them to line up; check this in the u12 burst.
- **The poses gain little in absolute score.** Even with every near car and person improved, the close poses are still limited by the facades and the ground. The critics would rise by about 0.5-1.0 on these poses, not to 9.
