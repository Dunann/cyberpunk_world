---
id: I-005
title: Tower kits: massing grammar plus real geometric facade relief (array and stack parts with morphing LOD)
status: rejected
score: 5.0 (review-1 only; second review skipped because even a 9 could not reach 7 - split requested instead)
direction: Attack the weakness (user priority 1)
family: geometry representation: instanced facade-element arrays + typology massing grammar
parent: none
proposed_by: idea generator
date: 2026-11-24
---

# I-005: Tower kits: massing grammar plus real geometric facade relief

## Idea
Today every tower is one or more vertical extrusions with perfectly flat faces. All facade detail (windows, balcony rails, slab lines) is painted on in the fragment shader, and most roofs get one of a few small crowns, often the same lit pyramid. This idea gives towers real geometry at two scales.

1. **Facade relief through two new part forms.** Both are rendered by the existing GPU cull and indirect draws.
   - **ARRAY part.** One part record describes a grid of up to thousands of small boxes: balcony slabs, balustrades, bay windows, vertical fins, mullion caps, piers, pilasters or AC ledges. The cull shader splits it into chunks of 16 boxes, and a new 16-box mesh draws each chunk.
   - **STACK part.** One ring-mesh part is repeated N times vertically. It gives floor-slab edge bands, refuge-floor rings or LED edge lines that follow any plan shape: round, lobed, tapered or twisted.
   - **Morphing LOD.** Each element's depth out of the facade scales smoothly with its projected size. Elements grow out of the wall as the camera approaches and flatten into it with distance, so nothing pops. Below about 1 px they are culled, and the painted shading takes over as now.
2. **A massing grammar for each building type.** It replaces "box plus random crown" for the residential, office and glass towers:
   - plans built from 2–3 overlapping parts (cruciform, butterfly, L, notched corner);
   - refuge floors that cut a dark horizontal band every ~15 floors;
   - setbacks with sky terraces;
   - a sloped-top profile;
   - a larger crown library with a rule that neighbouring towers never share a crown type;
   - facade kits for each type that use the new arrays.

## Why it might work
- **Critics' finding §4:**
  - Towers are "box extrusions", with "the same small cyan/white pyramid crowns everywhere" (A6, G1).
  - "Podiums are stacks of boxes."
  - "Crowns, setbacks, materials and rooftop equipment need variety."
  - The rubric's detail axis names boxiness and repetition first.
- **What breaks the box at each distance:**
  - Up close (B2, A4, A5, A2, B4), it is relief: fins and slab edges catch specular highlights and street light, cast contact shadows (AO), and break the outline at corners.
  - From mid-air (A6, G1), it is massing and crowns: notches, refuge cuts, setbacks and sloped or framed tops.
- **Why this is cheap.** A whole facade's balconies (40 floors × 8 bays) is one part record, not 320. Part count and cull cost barely move, and triangles appear only near the camera because of the size-based cull and morph.
- **Morphing LOD is an established technique.** It is the geomorphing used in terrain and progressive-mesh LOD. Applied to protrusion depth, it avoids the popping that makes geometric facade LOD look cheap.

## What's new about it
- **Closest existing code:**
  - `acUnits()` places hundreds of small box props one by one.
  - `crown()` has 9 types.
  - `tower()` adds 1–3 setback segments.
  - Balconies exist only as paint (the `BALC` flag in `windowGrid`).
- **What is new:**
  - Instanced element arrays inside the part system.
  - Size-driven depth morphing.
  - Stacked ring bands that follow any plan shape.
  - A neighbour-aware massing and crown grammar.
- **Other ideas this round:**
  - I-004 rebuilds one landmark.
  - I-006 changes facade shading only: reflections, window lighting and filtering.
  - This idea changes tower geometry only, so the three are complementary and mostly touch different functions.

## Expected effect on the metric
- **B2, A4, A5, A2 and B4:** gains on detail and character.
  - Real fins, slab edges, balconies and bay windows on the towers framing the street or monorail.
  - Ring bands on the B4 cylinder replace the flat painted stripes.
- **A6 and G1:** gains from massing and crown variety.
  - Fewer identical pyramids.
  - Readable cuts and notches.
- **Estimated gain:** +0.5 to +1.0 on the detail axis for the targeted poses. Zone A and zone B means should each rise about +0.3 to +0.5.
- **Target poses for adoption:** A2, A4, A5, A6, B2, B4, G1.

## Quick test
Build the ARRAY form only (no STACK and no massing yet). Use it for two kits:
- balcony slabs with balustrades on residential towers;
- mullion fins on glass towers.

Then:
1. Capture A4, A5 and B2, with `--stats`.
2. Count the array triangles drawn: read back the args buffer once in dev.

Pass if all of these hold:
- the facades visibly gain depth;
- there is no pop when moving the camera (`--cam` sweep at 3 distances);
- gbuffer rises by no more than 0.4 ms at those poses.

If gbuffer rises more than 0.6 ms, raise the minimum pixel size before going further. About 1 day.

## Implementation plan
Files:
- `buildings_wgsl.js`: part record, cull, `vs`, and a small `fs` branch.
- `buildings.js`: new mesh and list, visibility capacity.
- `buildings_gen.js`: kits, massing, crowns.

### A. Part record and engine
1. **Extend the part record** from 6 to 7 `vec4f` (`PART_FLOATS` 24 → 28).
   - Use the new `g` vector for array, stack and shear parameters, so existing fields keep their meaning:
     - ARRAY: `g = (countX, pitchX, countY, pitchY)`
     - STACK: `g = (count, pitch, 0, 0)`
   - Put protrusion depth and skip probability in currently unused fields of arrays (for example `c.z`, `c.w`).
   - Update `Parts.add` and the collider and light code that reads fields.
2. **New flags:** `ARRAY`, `STACK`, `GEOBALC`. `GEOBALC` tells `windowGrid` to drop the painted balcony rails near the camera on a facade that has real ones.
3. **Box-array mesh** (mesh index 5):
   - 16 unit boxes;
   - 24 vertices per box, with flat normals;
   - vertex attribute `(cornerX, cornerY, cornerZ, boxIndex * 8 + faceId)`;
   - 384 vertices and 576 indices in total;
   - add it as list 6.
4. **Cull shader.**
   - **ARRAY parts:**
     - compute the projected size of the element's smallest dimension (thickness) at the part's nearest point;
     - cull below `cullU.w`, which is 1.0 px at high quality and 1.5 at medium;
     - otherwise `atomicAdd` `ceil(countX * countY / 16)` entries to list 6, capped at 256 chunks per part;
     - write `pid | chunk << 18`;
     - optionally frustum-test each chunk's bounding box.
   - **STACK parts:**
     - emit `count` entries in the list the part's ring mesh selects, using the same packing;
     - cull copies whose band height is below 0.5 px.
   - Every list decodes `pid = v & 0x3FFFF`.
5. **Visibility capacity.**
   - Give each list its own capacity instead of one shared stride: lists 0–5 use the part count, list 6 gets 262144 entries.
   - Clamp writes so an overflow drops instances instead of corrupting memory.
6. **Vertex shader.**
   - **ARRAY:**
     - element `e = chunk * 16 + boxIndex`;
     - if `e >= countX * countY`, or a hash of `(seed, e)` is below the skip probability, collapse the vertex (degenerate);
     - local position = origin + `(e % countX) * pitchX` along local x + `(e / countX) * pitchY` up;
     - scale the box's depth (local z) by `morph = smoothstep(1.0, 3.5, depthPx)`, where `depthPx` is the projected protrusion depth at this element;
     - the base stays on the facade plane, so the element flattens into the wall rather than vanishing.
   - **Polar mode** (flag bit): elements are placed around an ellipse at angles `2π·i/countX`, for round towers.
   - **STACK:** add `copy * pitch` to `y0`.
   - **Sloped top, `prof: 8`:** the top ring is raised by `slope · dot(localXZ, dir)`, giving sloped crowns and wedge tops. Use the two `g` fields when the part is not an array.
7. **Fragment shader.**
   - Array and stack elements take a cheap material path, with no `windowGrid`:
     - concrete slab edge (albedo, slight grime);
     - glass balustrade (`mid` 2, dark, with Fresnel);
     - metal fin (`metal` 0.8, roughness 0.35);
     - an optional LED edge line on the outer face (`EMIT` colour × `param`).
   - Pick the material with the existing `mat` field.
   - Under `GEOBALC`, `windowGrid` fades out its painted balcony and rail paint as `morph` rises. Recompute morph from distance in `fs`.

### B. Facade kits (`buildings_gen.js`)
Each kit must use the facade's own window grid: `cw = faceLen / round(faceLen / winW)`, the same `floorH`, and `baseY`. Elements then line up with the painted windows.
`acUnits()` already computes the cell width this way with `rectFaces`; reuse its face loop.
- **Residential** (hillside and urban `MAT.RES`):
  - balcony slab (0.15 m thick, 1.2 m deep) and a glass or bar balustrade array on 1–2 faces;
  - 25–40% skip probability, applied per vertical stack (use the element's column in the skip hash so whole stacks are enclosed or open);
  - a bay-window array (0.6 m deep, 2 cells wide) on another face;
  - move the AC units into ARRAY parts (one part per face) instead of individual props;
  - refuge floor: see C.
- **Office:**
  - vertical piers (0.5 m deep, full height, one ARRAY row along x per face);
  - a STACK of spandrel ledges, one every floor.
- **Glass:**
  - mullion caps (0.12 × 0.35 m, every `winW`) on about 50% of glass towers;
  - in polar mode on round plans;
  - STACK floor-edge bands every 1–3 floors, 20% of them with an LED edge;
  - on twisted, lobed and tapered parts the bands use the parent's profile at their height, computed in JS from the same taper and twist formula.
- **Bund stone:** pilasters (an ARRAY row) and cornices (a STACK of 2).
- **Shop podiums:** canopy slabs over the bays (an ARRAY row, 1.5 m deep) on street faces that have no sign slot at that height.

### C. Massing grammar
- **Plans** (residential and office):
  - 55% simple;
  - 15% cruciform: a main slab plus a perpendicular wing (65–80% of its height);
  - 10% butterfly: two slabs angled ±20°;
  - 10% L;
  - 10% notched corners: 4 corner parts inset 2–3 m.
  - All pieces share `seed`, `floorH`, `winW` and `baseY`, so the window grids align.
- **Refuge floors** (residential over 30 floors):
  - every 15 floors, one floor is a recessed core part (70% of the plan) with an emissive strip;
  - the shaft restarts above it, as separate parts;
  - this gives a dark horizontal cut that reads from far away.
- **Setbacks:** 30% of towers have one or two setbacks at random fractions (0.55–0.85), with sky terraces (reuse the garden props).
- **Crowns:**
  - cut the `lit` pyramid to at most 5% of each list;
  - new types:
    - sloped glass crown (`prof: 8`) with an LED edge;
    - open frame crown (a polar or perimeter ARRAY of fins rising 8–20 m, topped by a lit halo ring);
    - blade crown (one thin tall fin);
    - Chinese pavilion hat on about 8% of Yuzhong residential towers (reuse `pagoda`, scaled to the roof);
    - stepped deco with vertical fins.
- **Neighbour rule:**
  - keep a spatial hash of crown types on a 150 m grid;
  - if the chosen type matches any type in the 3×3 neighbourhood, re-roll up to 3 times.

### D. Checks
- **Build and functional:** both builds succeed, `functional.mjs` passes 18/18, and there are no WebGPU errors.
- **Pop test:** capture a 3-camera `--cam` sweep at 40, 120 and 300 m from one residential tower and one glass tower.
- **Triangle count:** record the array triangle count at B2, A4 and A5.
- **Not tuned to the eval cameras:** no change depends on pose coordinates. Kits and massing are chosen per lot from its RNG.

## Cost
- **Effort:** one implementer, 3–4 days. Engine work about 1.5 days; kits, massing and crowns about 2 days.
- **GPU:**
  - **Vertex work:** array triangles drawn twice (depth prepass and shading pass). The target is at most 1.5M array triangles at street-level poses, for an estimated gbuffer increase of +0.2–0.35 ms there.
  - **Fly-through average:** +0.1–0.2 ms.
  - **Cull:** more entries written, +0.03–0.05 ms.
  - **Pixel work:** elements cover facade pixels with a cheaper material, and the prepass removes overdraw. This partly offsets the vertex cost.
  - **Expected net:** +0.15–0.3 ms average, within the 1.3 ms headroom.
  - **Throttle if needed:** if over, raise the minimum element pixel size (1 → 2 px) and the morph range.
- **Parts:** massing adds about +5–10% parts. Moving AC units into arrays removes several thousand props, so the total parts should stay about level.
- **Memory:** the part buffer grows 17% (28 instead of 24 floats). The visibility buffer gets +1 MB for list 6.

## Risks
- **Vertex cost.** The depth prepass doubles it. If arrays exceed budget at A4 or A5, skip arrays in the prepass, since they are thin and occlude little: draw them only in the shading pass, with depth write on.
- **Alignment.** Elements that do not line up with painted windows look wrong at once. Kits must compute the cell width exactly as `windowGrid` does (face length, `fid` order, rounding). Corners of rounded plans need care: put arrays only on straight faces.
- **Z-fighting** where element backs meet the facade. Inset the back faces 2 cm into the wall.
- **Signs.** Sign slots are placed on facades and may intersect fins or balconies. Keep a 1 m clear zone around existing slots when placing arrays on that face, or skip arrays on faces that have slots.
- **Character risk.** Variety must be meaningful, not random. Tie kits to district and type, so Yuzhong reads as dense Chongqing residential (balconies, cages, bay windows, refuge cuts) and the CBD reads as sleek fins and bands.
- **Merge overlap.** I-004 and I-006 also edit `buildings_wgsl.js`, in different functions. Conflicts would be textual, not in design. Numbering is reserved so the ideas can merge: I-004 takes `prof: 7` (gable ridge) and `MAT.MASONRY = 21`; this idea takes `prof: 8` and list 6.
