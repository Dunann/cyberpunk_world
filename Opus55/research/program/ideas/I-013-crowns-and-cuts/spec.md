---
id: I-013
title: Skyline variety: a crown library with a neighbour rule, and refuge-floor cuts that fade with distance
status: proposed
direction: from review of I-005 (Attack the weakness, user priority 1)
family: massing and silhouette grammar (crowns, tower cuts), RNG-isolated
parent: I-005
proposed_by: idea generator
date: 2026-11-24
---

# I-013: Skyline variety

## Idea
From mid-air and from the overlook, the city's towers end in the same small glowing pyramid: the `lit` crown, a stepped tier ringed with leaning fins. I counted about 218 of them in the part buffer. They are visible in every aerial pose. This idea changes two things.

1. **A crown library with a neighbour rule.**
   - Cut the `lit` pyramid to 5% of the towers that currently draw it.
   - Add six cheap, distinct crown types:
     - sloped glass top;
     - open frame;
     - halo ring;
     - lantern box with a flying roof;
     - blade;
     - Chinese pavilion hat (Yuzhong residential).
   - **Neighbour rule:** a tower never takes the same distinctive crown type as any tower in its 3×3 neighbourhood of 150 m cells.
   - Billboard crowns are never replaced, because they create sign slots.
2. **Refuge-floor cuts.** Chinese high-rises have open "refuge floors" every 15 floors. On 50–60% of towers taller than 90 m, cut a one-floor recessed band at those heights: a core set back to 70% of the plan, with a dim lit strip.
   - It breaks the extruded box into stacked volumes and notches the silhouette.
   - **No shimmer:** the recess's shading fades to the facade's own far-field colour once the band is under 2 px tall, so it cannot shimmer at long range.

**Keeping the rest of the city unchanged.**
- **Crowns:** the original crown is first run in a **dry-run** on a builder that records nothing, so the lot's random stream advances exactly as before. The replacement crown then draws from a separate stream, `rng(hash(L.seed, towerIndex) ^ 0x5eed)`.
- **Refuge cuts:** made in a post-pass over the finished part list, seeded from each part's stored seed.
- **Result:** every part that is not a crown stays bit-identical: tower sizes, podiums, signs, lights, skybridges, AC units.

**Scope:** no STACK, no arrays, no floor bands. Relief is I-012's.

## Why it might work
- **The critics name it:**
  - "the same small cyan/white pyramid crowns everywhere (A6, G1)";
  - "box extrusions";
  - "crowns, setbacks, materials and rooftop equipment need variety".
- **Silhouette carries distance views.** At 300–2000 m, windows average out and the outline is what reads. The roof shape and breaks in the shaft are what make towers read as designed buildings.
- **Measured visibility** (part buffer, frustum test, no occlusion), as `lit`-crown tiers wider than 15 px / tall towers (height over 90 m) taller than 150 px:

  | Pose | Lit-crown tiers > 15 px | Tall towers > 150 px |
  |---|---|---|
  | A6 | 156 | 222 |
  | G1 | 63 (324 over 4 px) | |
  | A3 | 73 | 106 |
  | B3 | 46 | 42 |

  I chose A3 over B3 as the third target because it has more of both.
- **Character:** varied crowns give each tower an identity. The pavilion hat ties the Yuzhong skyline to the Chongqing brief.

## What's new about it
- **Compared with I-005** (rejected, 5.0), this is the split-off silhouette half:

  | Review point | I-013 |
  |---|---|
  | 7 targets | 3 targets: G1, A6, A3. Other poses are watched. |
  | RNG changes everywhere | Dry-run plus a separate stream. Only crown parts and the cut parts change. |
  | STACK cost, capacity and shimmer | No STACK. Cuts are ordinary parts in the existing lists, whose capacity is the part count. Their shading fades below 2 px. |
  | GPU not credible | Counted from the real part buffer. The net part count falls. `bench.mjs` gates the quick test. |
  | Cross plans and setbacks already exist | Not repeated. The cross-plan wing and the two-segment setback stay as they are. |

- **Closest existing code:** `crown()` (9 types, picked at random with no spatial rule) and the `lit` crown tiers.
- **Other ideas:** I-008 adds holograms above some roofs, as additive forward-pass volumes. This idea changes roof geometry. They can stack.

## Expected effect on the metric
- **A6:** many large crowns, and towers tall enough that the cuts read. Character +1, detail +0.5.
- **G1:** the field of identical pyramids becomes a varied skyline. Character +0.5 to +1.
- **A3:** the Yuzhong towers on the left change; the bare mound dominates. Smaller gain, +0.5 on character.
- **Zone means:** A about +0.2 to +0.3, G about +0.1 to +0.2.
- **Watched poses:** crowns also change visibly in A1, A2, G2, G3 and G4 (41–128 lit-crown tiers over 15 px each). They are not targets, but a clear loss there would block adoption. The held-out go/no-go below is designed to catch a worse look before the eval sees it.

## Quick test (go/no-go on held-out aerial cameras)
**Held-out cameras.** Fixed now, before implementation, and away from every eval pose:
- **H3, West Hills from mid-air:** position (−2400, 300, 600), target (−2900, 60, −250).
- **H4, Jiangbei from mid-air:** position (400, 260, −1700), target (1000, 60, −1200).

**Step 1.** Crown swap, dry-run and neighbour rule only (no cuts).
- Capture H3 and H4 against the baseline.
- Check that parts are unchanged: hash all parts created outside crown scopes; the hash, sign slot count and light count must equal the baseline.
- Run the full `bench.mjs` against a baseline run in the same session.

**Go if all of these hold:**
- a fresh subagent with no context prefers the new crops blind at both cameras;
- the part hash matches;
- the bench average rises by no more than 0.03 ms;
- p99 is unchanged within noise.

**Step 2.** Add refuge cuts, then repeat at H3, H4 and one far camera.
- The far camera is H3 pulled back to 2.5 km, to check that the cut fade has no shimmer.
- Also look at the `burst-u62` style motion: 4 consecutive frames while moving at H4.

Capture G1, A6 and A3, and look at A1, A2, G2, G3 and G4, only once, at the end.

## Implementation plan
Files:
- `buildings_gen.js`: crown library, dry-run, neighbour rule.
- New `buildings_cuts.js`: the refuge-cut post-pass.
- `buildings_wgsl.js`: `prof: 8` in `vs`; `MAT.REFUGE` in `fs`.

### A. Crown swap with stream isolation
1. **`Builder.dryRun(fn)`.** While it runs, `part`, `prop`, `light`, `slot` and `tops.push` record nothing, and `part`/`prop` return −1. Generators never use returned indices from crowns, so this is safe. Check this in review.
2. **At each `crown()` call site:**
   - The caller's `pick(R, list)` still runs, so the type draw is unchanged. Call the chosen type `T`.
   - If T is `billboard`: build it normally with R. **Unchanged.**
   - Otherwise:
     1. run `top0 = B.dryRun(() => crown(B, R, opts with T))`, which advances R exactly as before;
     2. choose T′ with `Rk = rng(hash(L.seed, towerIndex) ^ 0x5eed)`, using the table and the neighbour rule;
     3. build T′ with Rk, giving `top1`.
3. **Decisions after the crown that consume R and depend on its height** use `top0`, so the number of R draws is unchanged. Example: genCBD's `if (top > tw.top + 10) aviation(..., R()·999)`. Positions use `top1`.
4. **Which crowns are replaced:**
   - `lit`: replaced, except a seeded 5% that keep it.
   - Other non-billboard types (`machine`, `setback`, `garden`, `antennas`, `antenna`, `spire`, `helipad`, `pagoda`): kept, unless the neighbour rule rejects them.
   - When a type is kept, it is still rebuilt with Rk after a dry-run, so the code path is the same for every replaced or kept crown.
5. **Neighbour rule.**
   - Keep a map from 150 m cells to the *distinctive* types already placed: lit, pagoda/pavilion, spire, sloped, frame, halo, lantern, blade.
   - If T′ is distinctive and appears in the 3×3 neighbourhood, re-roll from the table up to 3 times, then fall back to `machine`.
   - Flat-roof types may repeat.
6. **Height caps.** Respect `maxTop` (viewpoint sight lines): if `top + 12 > maxTop`, only `machine`, `garden` or `setback` are allowed, as today.

### B. The crown library
All types use existing materials. Weights are for residential and urban towers; CBD and modern Bund towers are in brackets.

| Type | Weight | Parts | Build |
|---|---|---|---|
| Sloped glass top | 12% [20%] | 2 | `prof: 8` glass part over 100% of the plan, 8–20 m at the high edge falling to 0–3 m at the low edge, with `CROWNLIT` and `EDGE`; plus a metal coping |
| Open frame | 10% [15%] | 12 | 4 corner posts (0.8 m) rising 10–24 m; two rectangular frames of 4 thin beams each; the top frame is an `EMIT` lip |
| Halo | 7% [12%] | 6 | Plant room, 4 short posts, and one emissive ring band (`kind: 2`, `prm: 48`, radius 1.05 × the plan's half-size, 1 m tall, `NOTOP`) |
| Lantern box | 8% [12%] | 3 | Glass box at 85% of the plan, 2 floors, `CROWNLIT`; dark roof plate at 110% of the plan with an `EMIT` lip |
| Blade | 5% [10%] | 2 + aviation light | One thin wall (0.8 m × 0.8 of the plan width) rising 12–30 m from one edge, with `EDGE` |
| Pavilion hat | 10%, Yuzhong residential only; 3% elsewhere [0] | 3–5 | Existing pagoda code with the first tier at 100% of the plan, 1–2 tiers |
| `lit` (old pyramid) | 5% of former `lit` | as now | Unchanged code |
| Machine, setback, garden, antennas, spire, helipad | Remaining share | as now | Unchanged code |

**`prof: 8`, sloped top** (`vs`):
- For a side vertex at height fraction t: `y = y0 + t·(h − slope·(hw − x_local))`, where the slope is stored in `c.z` (the taper field, unused by this profile).
- Side faces stay vertical, so their normals do not change.
- The top cap normal is the plane's normal, rotated by the part angle.
- In `Parts.add`, `prof: 8` must **not** set `CURVED`. It stays on the 32-triangle box mesh.
- The cull radius is unchanged, because the high edge is at h.

### C. Refuge-floor cuts (post-pass, separate seed)
1. **Candidates:**
   - non-prop parts of `MAT.RES`, `OFFICE` or `GLASS`;
   - kind 0, 1 or 2 with no profile, twist, lean or `LED`, taper 1;
   - height over 90 m.
   - About 678 parts qualify. Each gets the cut with 55% probability, from `rng(hash(seed, i) ^ 0xc075)`.
2. **Cut heights.**
   - At `baseY + 15·n·floorH`, and only where the cut is at least 30 m above the part's bottom and below its top.
   - Skip any cut within 6 m of another part that touches the tower: skybridges, wings and walkways, found with a bounding-box test.
3. **For each cut:**
   - shorten the part below the cut;
   - add a **core part** for the cut floor, at 70% of the plan, `MAT.REFUGE = 22`;
   - add an **upper part**: a copy of the original from the floor above the cut to the old top, with the same seed, `floorH`, `winW`, `baseY` and flags, so window grids and edge strips line up;
   - mark the upper part solid, so colliders cover it;
   - crowns stay on the top, unchanged.
4. **`MAT.REFUGE` shading** (`fs`).
   - **Near:** dark concrete, with a dim warm emissive strip (0.3 m) at mid-height, and columns as box-filtered pulses every 6 m.
   - **The fade:** compute the band's projected height `hp = floorH / fwidth(wp.y)`. Blend to the parent facade's far-field colour by `1 − smoothstep(1.0, 2.0, hp)`.
     - The parent's far-field colour is its wall colour × lit fraction × the window colour average, the same expression as `farE`.
     - The core part's record carries the parent's colour, lit fraction and style in `f` and `e`.
   - **Why it cannot shimmer:** once the band is under 1–2 px it is the same colour as the facade around it, and only the silhouette notch remains.
5. **Expected count:** about 370 towers × 1.5 cuts × 2 new parts ≈ +1.1k parts.

### D. Checks
- **Build and functional:** both builds succeed, `functional.mjs` passes 18/18, and there are no WebGPU errors.
- **Unchanged parts:** the non-crown part hash, the sign slot count and the light count all equal the baseline.
- **Not tuned to the eval cameras:** the code has no pose coordinates, all weights are fixed in this spec, and seeds are never chosen by looking at captures.

## Cost
**Measured basis**, from the real part buffer of 133,904 parts:
- the current `lit` crowns are 218 crowns, made of 532 crown tiers, 532 emissive ledges, 218 spikes and 4,726 leaning fin props, about **6.0k parts** in total;
- `bld-cull` is 0.17 ms on the baseline bench, about 1.3 ns per part;
- buildings cost at most 0.2 ms of gbuffer per million triangles at A6 (0.53 ms for 2.74M triangles, both passes; measured with and without `disable=buildings`).

**Part counts:**

| Change | Parts |
|---|---|
| Removing 95% of `lit` crowns | −5.7k |
| New crowns (about 207 × 6 on average) | +1.25k |
| Refuge cuts | +1.1k |
| **Net** | **−3.4k (−2.5%)** |

**Estimates:**
- **Triangles:** almost every new piece uses the 32-triangle box mesh (`prof: 8` included). Halo rings use the round mesh (96–192 triangles), about 30 of them. The 4.7k fins removed were mostly far props. Expect the triangle count to fall slightly in aerial views.
- **Bench fly-through average:** −0.01 to +0.02 ms.
  - `bld-cull` falls about 0.004 ms.
  - The new `MAT.REFUGE` branch and the `prof: 8` vertex branch are small, but register pressure is checked with the step-1 and step-2 bench runs.
  - **Stop rules:** more than +0.03 ms on average, or any change in p99 beyond noise.
- **Memory:** slightly lower.
- **Effort:** one implementer, about 2 days.

## Risks
- **Visible change on non-target poses.** Crowns change in nearly every aerial pose, so a judge could prefer the old look somewhere (G4 has 128 large lit crowns). The held-out go/no-go is the guard, and the new types are mostly calmer than the bright pyramids. If a watched pose loses, lower the weight of the brightest new types (halo, frame lips).
- **Dry-run misses a side effect.** If any crown code path writes state other than through the builder methods, the stream check fails. The part-hash check catches this before any capture.
- **Refuge cuts beside sign slots or LED facades.** LED towers are excluded. Sign slots are on podiums, below 30 m, so they never meet a cut.
- **The pavilion hat could read as kitsch.** It is limited to 10% of Yuzhong residential towers, and the neighbour rule spreads them out.
- **Merge overlap.** Reserved numbers:
  - I-011: `MAT 21` and flag bits 18–21.
  - I-012: flag bits 22–23, list 7 and the record vector `g`.
  - I-013: `prof: 8` and `MAT.REFUGE = 22`. **No new flag bits.**
  - Flags are stored in a float, so bit 23 is the last usable one.
