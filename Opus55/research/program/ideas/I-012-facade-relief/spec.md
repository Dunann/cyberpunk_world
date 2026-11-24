---
id: I-012
title: Facade relief for street views: real balconies, bay windows, piers and glass fins that sink into the wall with distance
status: proposed
direction: from review of I-005 (Attack the weakness, user priority 1)
family: geometry representation: instanced facade-element arrays with a cull-tied sink LOD
parent: I-005
proposed_by: idea generator
date: 2026-11-24
---

# I-012: Facade relief for street views

## Idea
Give the towers that line the streets real 3D facade elements:
- balconies with balustrades on residential towers that today have painted balconies;
- bay windows on other residential towers;
- piers on office towers;
- vertical glass fins and street canopies on glass towers and podiums.

**One new part form: ARRAY.** One part record describes a whole grid of small boxes on one facade, for example every balcony on one face. The existing GPU cull splits it into chunks of 16 boxes, and a new 16-box mesh draws them through one new indirect list.

**How elements fade out with distance (the "sink").**
- **No pop:** an element does not pop out of existence. It sinks into the wall. Its front face moves back from full depth to 3 cm behind the wall surface, so the wall hides it.
- **Painted fallback:** as it sinks, the painted version that exists today (the `BALC` rail paint) fades in. It sits in exactly the same columns, so the handover cannot be seen.
- **One distance:** the sink and the cull use the same distance. A chunk is culled only beyond the distance where every element in it has fully sunk.

**What the idea changes:**
- Kits are added in a **post-pass over the finished part list**, seeded from each part's stored seed.
- No existing generator code or random call changes, so the rest of the city stays bit-identical.
- Kits change nothing beyond about 150 m from any camera, so only street-level and low views change.

**Scope:**
- **Targets:** A4 and B2.
- **Go/no-go decisions:** two held-out street cameras (defined below).
- **Not included:** crowns, massing and floor bands. Those are I-013.

## Why it might work
- **The critics' complaint.** Both critics say towers are "box extrusions". The rubric's detail axis names "boxiness" first. At A4 (hillside street) and B2 (CBD street), towers 10–120 m away fill most of the frame. Every facade there is a perfectly flat plane, because balconies, rails and frames are only painted on.
- **How relief reads in this renderer.** There is no shadow pass and no SSAO, so relief cannot show through cast shadows. It reads through:
  - **silhouettes:** balcony and fin outlines along tower corners and against the sky;
  - **occlusion:** at grazing street angles, elements hide parts of the windows behind them;
  - **flat-normal shading:** slab tops, fronts and undersides take different light from the street lamps and shop lights below, so undersides catch the warm spill;
  - **a painted occlusion band:** the facade shader already darkens painted balconies (`S.ao *= 1 - 0.3·bal`). The kit adds a 0.3 m soffit band on the wall under each real slab and down each pier edge, written into `ao` (which scales ambient and environment light) and into albedo.
- **The cost is small, and I measured it.** See Cost: about 1% more triangles on average along the bench path, and 10% more at A4.

## What's new about it
- **Compared with I-005** (rejected, 5.0), it keeps only the ARRAY relief and fixes each review point:

  | Review point | I-012 |
  |---|---|
  | 7 targets | Two targets: A4 and B2. Go/no-go is decided on held-out cameras. |
  | Morph and cull used different measures, so elements popped | One distance for both, from one stored detail size. Elements have fully sunk before they are culled. |
  | STACK bands cost and shimmer | No STACK and no floor bands. |
  | RNG changes everywhere | A post-pass with its own seed. The original generator is untouched. |
  | AC units would lose their grille | AC units are untouched (still `MAT.AC` props). The balcony kit avoids their bays. |
  | Claimed contact shadows | Removed. A painted soffit band only. |
  | Paint did not match geometry | Balcony columns use the exact column rule of the painted `bal` hash. |
  | Taper and ellipse drift | Kits apply only to straight faces of untapered, unleaned parts. |
  | GPU not measured | Workload counted along the bench path, cost rate measured. The quick test runs `bench.mjs`. |

- **Closest existing code:** the painted `BALC` balconies and the `acUnits()` props (one prop per unit). Arrays put a whole facade of elements into one record.

## Expected effect on the metric
- **A4:** balconies, bay windows and piers on the towers above the street. Detail +1, character +0.5.
- **B2:**
  - vertical fins on the glass towers and the glass podium on the right;
  - canopies over the podium's street faces at 4.6 m;
  - detail +0.5 to +1.
  - B2's other defects (the dark purple box in the foreground, reflection dots on the glass) stay. B2 is therefore the weaker target.
- **Other poses:**
  - At A5, kits add about 1% more triangles, a few far balconies. A5 is expected to tie.
  - Every other pose has no visible kit element (workload count below), so they are unchanged.
- **Adoption:** needs wins on both A4 and B2. Zone A rises about +0.1 (one pose of six); zone B about +0.1.
- **Main value:** this is a cheap test of whether geometric relief earns its cost for priority 1. If it wins, the same machinery can carry more kits later.

## Quick test (go/no-go on held-out cameras)
**Held-out street cameras.** These are fixed now, before any implementation. Each is at street level (1.7 m above ground), on the road point nearest the seed position, looking along the road:
- **H1, Yuzhong hillside:** seed (−450, −400), about 740 m from A4.
- **H2, CBD:** seed (3300, −2000), about 1 km from B2.

The implementer finds the road point with `tools/probe.mjs` and records the final camera in the spec folder before the first capture.

**Step 1.** Build ARRAY with the residential balcony kit only.
- Capture H1 and H2 with `--stats`, plus a 4-camera sweep toward one residential tower at 40, 80, 120 and 160 m.

**Step 2.** Go to the full kit set only if all of these hold:
- the sweep shows no pop: elements sink smoothly, and the painted rails take over in the same columns;
- gbuffer rises by no more than 0.15 ms at H1;
- the full `bench.mjs` fly-through average rises by no more than 0.08 ms against a baseline run on the same machine in the same session;
- a fresh subagent with no context, comparing H1 crops blind against the baseline, prefers the new version.

**Final.** Repeat step 2 at H1 and H2 with all kits. Capture A4 and B2 only once, at the end.

## Implementation plan
Files:
- `buildings_wgsl.js`: part record, cull, `vs`, a small `fs` branch, and the painted-rail fade.
- `buildings.js`: new mesh, list 7 with a fixed capacity.
- New `buildings_kits.js`: the post-pass.

### A. Engine
1. **Part record.**
   - Add a 7th `vec4f` `g` (`PART_FLOATS` 24 → 28) for arrays: `g = (countX, pitchX, countY, pitchY)`.
   - Store array-only values in fields the box path does not use: protrusion depth in `c.z`, stack skip probability in `c.w`, and the detail size `s` in `d.z`.
   - Update `Parts.add`, the collider loop and every `* 24` stride.
2. **Flags.** I-011 reserves bits 18–21, so use:
   - `ARRAY = 1 << 22`
   - `GEOBALC = 1 << 23`
   - Flags are stored in a float, which holds integers exactly only below 2^24. Bit 23 is therefore the last usable bit, and no idea may use bit 24 or higher.
3. **Mesh and list.**
   - Mesh: 16 unit boxes, 24 vertices each with flat normals; attribute `(cornerX, cornerY, cornerZ, box·8 + face)`.
   - Draw it as **list 7**. Keep the existing list numbering.
   - Give list 7 its own fixed capacity of **16,384 chunk entries** (64 KB), at its own offset in `visBuf`, passed to the cull in a second uniform.
   - The measured maximum along the bench path is 499 chunks, and 346 at A4 (workload count below). So the capacity has about 30× headroom.
   - The cull counts overflow into a debug counter. Dev builds log any overflow, and it must stay 0. Overflow is never resolved by dropping instances at random.
4. **Cull** (`ARRAY` parts).
   - Cull distance `D = s · K / 1.25`, where `K = F.res.y · 0.5 / tanY` (px per radian). With `s` = 0.15 m at 1440p, D ≈ 149 m.
   - For each chunk (16 consecutive elements, row-major), compute its bounding box from the part record. Emit the chunk only if the box's nearest point is within D and passes the frustum planes.
   - Write `pid | chunk << 18` to list 7.
   - Chunk count is capped at 1024 per part, so a facade can have up to 16k elements.
5. **Vertex shader.**
   - Element index `e = chunk·16 + box`.
   - Collapse the vertex if `e ≥ countX·countY`, or if the stack hash `hash(seed, e % countX)` is below the skip probability. Skipping whole vertical stacks matches how real buildings vary.
   - Place the element at the part origin + `(e % countX)·pitchX` along the face + `(e / countX)·pitchY` up.
   - **Sink:** `m = 1 − smoothstep(0.5·D, D, dist(camera, element))`. The front of the box is at `−0.03 + depth·m` from the wall, and the back at −0.05.
     - At m = 0 the whole box is behind the wall and fails the depth test against it.
     - At the cull distance every element has m = 0, so a culled chunk was already invisible.
6. **Fragment shader** (`ARRAY` parts). A cheap material path with no `windowGrid`, chosen by `mat`:

   | Material | Look |
   |---|---|
   | Concrete slab | Albedo with grime noise; underside darker (ao 0.5) |
   | Glass balustrade | `mid` 2, dark, Fresnel through the existing lighting |
   | Metal bars | `metal` 0.6 |
   | Metal fin | `metal` 0.8, roughness 0.35 |
   | Glass fin | `mid` 2 |

   - An optional warm emissive strip under 20% of balcony slabs (balcony lights) gives a glow that reads at night.
   - `MAT.AC` is never used by arrays. AC units stay as props with their grille.
7. **Handover in `windowGrid`** (parts with `GEOBALC`):
   - recompute `m` per pixel from the camera distance with the same formula;
   - multiply the painted balcony rail, the balcony darkening and the laundry by `(1 − m)`;
   - add the soffit band (wall under each real slab, 0.3 m) by `m`.

### B. Kits (`buildings_kits.js`, a post-pass at the end of `generate()`)
1. **Separate seed.**
   - Iterate the finished part list.
   - Each candidate's decisions come from `rng(hashPart(seed, partIndex) ^ 0x5eed)`, using its stored seed.
   - No existing `R()` call is added, removed or reordered.
2. **Candidates:**
   - non-prop parts of `MAT.RES` (1), `MAT.OFFICE` (2) or `MAT.GLASS` (3);
   - kind 0 or 1, profile 0, no twist, taper 1, no lean;
   - height at least 15 m, without `NOWIN` or `LED`.
3. **Faces.** Only straight faces.
   - Face length is `2·(hw − r)` or `2·(hd − r)`, where `r = prm·min(hw, hd)`, exactly as `ringEval` computes it.
   - Cell width is `cw = len / round(len / winW)`, and floors are `baseY + j·floorH`, exactly as in `windowGrid`.
   - Faces with a sign slot within 2 m of the kit's area are skipped. Sign slots are known after generation.
4. **Kits.**

   | Kit | Applies to | Elements |
   |---|---|---|
   | Balconies | `MAT.RES` with `BALC` | Slab 0.15 m thick × 1.1 m deep × 0.9·cw, plus balustrade 1.0 m × 0.05 m. Glass, bars or a solid parapet, per building. On every face, only in the columns where the painted rule gives a balcony: `fract((c + 41·fid)·0.5 + 0.25·hash11u(seed)) ≥ 0.5`, the JS twin of the WGSL. Floors from 1 above the podium to 1 below the top. Bays that hold an AC prop are skipped. `GEOBALC` is set on the parent part. |
   | Bay windows | `MAT.RES` without `BALC`, 60% of towers | Boxes 0.6 m deep × (2·cw − 0.4) wide × 0.7·floorH, every 2 cells on the two longer faces. 25% stack skip. Never on bays with AC props. |
   | Piers | `MAT.OFFICE` | One box 0.45 m deep × 0.5 m wide, full height, at every cell boundary on every face (countY = 1). |
   | Glass fins | `MAT.GLASS` | 0.12 × 0.35 m fins, full height. Every cell on podium parts (height under 40 m), every second cell on towers. |
   | Canopies | `MAT.GLASS` podiums | A 1.5 m deep canopy box at 4.6 m, one per 6 m bay. Only on faces that face a street; reuse `streetFacesBox` from `buildings_gen.js`, exported, with the district from `world.districtAt`. |

   - The detail size `s` is 0.15 m for every kit, so D ≈ 149 m for all.
   - Colliders: none.
   - Kit records come to about 10k array parts (from the workload count).

### C. Checks
- **Build and functional:** both builds succeed, `functional.mjs` passes 18/18, and there are no WebGPU errors.
- **Unchanged parts:** a dev check that all parts and props generated before the post-pass match the baseline exactly, apart from the added `GEOBALC` bit. Hash `P.data` up to the old count with that bit masked out.
- **Overflow:** the list-7 overflow counter stays 0 on the bench run.
- **Not tuned to the eval cameras:** the code has no pose coordinates, and decisions use only part data and the separate seed.

## Cost
**Measured basis.** The workload count was run on 2026-11-24 in a scratch copy, through the real cull logic replicated in JS on the real part buffer (133,904 parts):
- Along the **bench fly-through path** (600 samples, same camera rule as `__flyTo`):

  | | Average | p50 | p99 | Max |
  |---|---|---|---|---|
  | Baseline building triangles (both passes) | 1.08M | | | 2.96M |
  | Kit triangles added (both passes) | 0.011M | 0 | 0.164M | 0.19M |
  | Chunks added | 29 | | | 499 |

  The path flies at 25–330 m altitude, so kits are rarely within 150 m.
- **Per pose** (base → added):
  - A4: 1.35M → +0.133M, 346 chunks.
  - A5: 0.85M → +0.013M.
  - B2: 0.34M → +0.011M (glass fins and canopies; residential kits did not reach B2).
  - Every other eval pose: +0.
  - The count modelled balconies on the two long faces. Painting matches all faces, so the real figures may be up to about 2× these.
- **Measured cost rate** (`capture.mjs --stats`, with and without `disable=buildings`):
  - At A6, buildings cost 0.53 ms of gbuffer for 2.74M triangles.
  - At A4, they cost 0.645 ms for 1.35M triangles, including all building pixels.
  - So the rate is at most 0.2–0.48 ms per million triangles (both passes, pixels included).

**Estimates:**
- **Bench fly-through average:**
  - kit vertex work ≤ 0.01 ms;
  - cull for about 10k more part records (+7.5% of 134k; `bld-cull` is 0.17 ms) ≈ +0.013 ms;
  - shader branch and register-pressure risk: unknown, so measured in the quick test;
  - **expected +0.02 to +0.06 ms**, against 1.36 ms of headroom.
- **A4:** about +0.07 to +0.2 ms gbuffer (A4 is already at 11.02 ms, but single poses are not gated).
- **B2:** about +0.02 ms.
- **p99 and worst frame:** unaffected. The bench path's maximum adds under 0.2M triangles, which is under 0.1 ms.
- **Memory:** the part buffer grows by about 17% (28 instead of 24 floats, about +2 MB). The list-7 capacity is 64 KB.
- **Effort:** one implementer, about 2–3 days.

## Risks
- **Uber-shader register pressure.** Adding an ARRAY branch to `vs` and `fs` could slow every building pixel. The bench stop rule catches it. If it triggers, use a separate pipeline with its own small shader for list 7, which also avoids depth-prepass overhead for thin elements.
- **Alignment mistakes** are visible at once. The column rule and cell width must match `windowGrid` exactly, including the `fid·41` offset and the rounded-corner face length. The 4-distance sweep checks this.
- **Fins at 1–2 px could alias** between 75 and 150 m. TAA and the sink reduce it. If the `burst-u12` motion burst shows shimmer, raise `s` for fins (sink earlier).
- **B2 may tie,** because its worst defects (the foreground box, the reflection dots) are untouched. A4 is the stronger target.
- **Merge overlap.** I-011 also edits `buildings_wgsl.js`, in other functions. Reserved numbers:
  - I-011: `MAT 21` and flag bits 18–21.
  - I-012: flag bits 22–23, list 7, record vector `g`.
  - I-013: `prof: 8`, which is independent of these.
