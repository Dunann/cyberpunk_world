---
id: I-017
title: Lit crown swap: replace only the repeated pyramid crowns with five lit, distinctive crowns
status: proposed
direction: from review of I-013 (Attack the weakness, user priority 1)
family: silhouette grammar: crown replacement with exact stream isolation
parent: I-013
proposed_by: idea generator
date: 2026-11-24
---

# I-017: Lit crown swap

## Idea
Replace **only** the `lit` crowns: the stepped, up-lit pyramid with leaning fins that the critics saw "everywhere" (A6, G1). There are 218 of them, built by `crown()` from the lot generators.

Each one becomes one of six **lit** types:
- the old `lit` pyramid itself (kept as one option);
- a sloped glass lantern;
- an open lit frame;
- a halo;
- a lantern box with a flying roof;
- a blade.

Every detail is at least 2 m thick, so it covers at least 2.5 px at 1000 m (0.8 m per pixel at 1440p with field of view 1.05). Each replacement is required to emit at least as much light as the crown it replaces, so the skyline keeps its sparkle and gains variety.

**What does not change.**
- Every other crown type is built exactly as today, with the original random stream.
- All non-crown parts, default seeds, prop counts, sign slots and lights stay bit-identical. A dev hash checks this.
- No refuge cuts. Landmarks are not touched: their crown parts are not made by `crown()`.

## Why it might work
- **The critics' finding §4:** "the same small cyan/white pyramid crowns everywhere (A6, G1)". Silhouette is what reads at 300–2000 m.
- **Measured visibility** (part buffer, frustum test, no occlusion): `lit`-crown tiers wider than 15 px:

  | Pose | Tiers > 15 px |
  |---|---|
  | A6 | 156 |
  | G4 | 128 |
  | G1 | 63 (324 over 4 px) |

  G4 is included as a target because it shows the second most large lit crowns of any pose. In the baseline image its skyline across the river is full of them.
- **No glow is lost,** by construction (see the glow match in A). I-013 risked fewer glowing tops; this cannot.

## What's new about it
This revises I-013 (rejected, 5.0) and keeps only its crown half. Each review point is fixed:

| Review point | I-017 |
|---|---|
| Kept crowns were rebuilt with a new stream | Unchanged types are built with R as today. Only `lit` crowns change. |
| Default seeds shift (`count·7.31 % 997`) | A separate default-seed counter. The dry-run advances it, and the prop counter, exactly as the original would. |
| The neighbour rule thinned Yuzhong and removed pagodas | It applies only among the 5 nearest towers that have a new type or `lit`. Pagodas, spires and the rest are never re-rolled. |
| Replacements could become flat roofs | Every replacement is a lit type, matched for glow. |
| `prof: 8` collided with the default branch; the glass top shaded as gravel | Own branch in `prof()` and `vs`. `CAPFACADE` on glass tops. |
| Landmarks were cut | No cuts. Landmarks are not touched. |
| Weak target A3 | Targets are A6, G1 and G4. All other poses are watched. |
| Held-out cameras used the wrong generators | One Yuzhong camera (`genHillside`) and one close CBD aerial. |
| Reweighting after eval results | Removed. Weights are fixed here. |
| Bench threshold below noise | 3 alternating A/B pairs, with a stop at +0.1 ms. |

## Expected effect on the metric
- **A6, G1, G4:** identical glowing pyramids become a varied, still glowing skyline. Character +0.5 to +1, detail +0.25.
- **Zone means:** about +0.1 to +0.2. This is a small, targeted step, not a zone-level jump.
- **Watched poses:** all others. Lit crowns are visible in A1, A2, A3, B3, G2 and G3, so those images change too.

## Quick test
**Held-out cameras.** Fixed now, before implementation:
- **H5, Yuzhong hillside, mid-air from the north:** position (−1300, 300, −1500), target (−1000, 60, −500). It looks south onto the `genHillside` towers from the side opposite A6.
- **H6, close CBD aerial:** position (3800, 250, −2300), target (3250, 130, −1500). It is about 1.6 km from B4 and looks the other way.

**Steps:**
1. **Stream check (dev).** Hash every part not made inside a replaced crown, including seeds. The hash, `B.props`, the sign slot count and the light count must equal the baseline's.
2. **Glow check.** The JS log shows emissive area × intensity for each replaced crown is at least that of the dry-run `lit` crown (see the glow match below).
3. **Captures.** Capture H5 and H6 against the baseline. A fresh subagent with no context judges the crops blind.
4. **Bench.** Run 3 alternating baseline/candidate `bench.mjs` pairs in one session. Stop if the candidate's average exceeds the baseline's by more than 0.1 ms, or p99 by more than 0.3 ms.

**Go** only if steps 1, 2 and 4 pass and the subagent prefers the candidate at both cameras.

A **no-go** ends this candidate. Any change in weights or types is a new spec, never a tweak after looking at eval results. Eval poses are captured only once, at the end.

## Implementation plan
Files: `buildings_gen.js` (Parts, Builder, crown) and `buildings_wgsl.js` (`prof: 8`).

### A. Stream isolation and glow match
1. **Default seeds.** `Parts.add` uses a separate `seedCount` for default seeds: `(seedCount·7.31) % 997`.
   - `seedCount` rises by one on every add, seeded or not, just as `count` does today. With no replacements it equals `count`, so the baseline is unchanged.
   - Replacement parts always pass explicit seeds and do not advance `seedCount`.
2. **`Builder.dryRun(fn)`.**
   - While it runs, `part` and `prop` do not write. Instead they:
     - advance `seedCount` by one for each part or prop the original would have added (a prop refused by the budget adds nothing, as today);
     - advance `B.props` (and respect `propBudget`) exactly as a real `prop` call would;
     - add up the **glow** of emissive pieces: side area × `param` for `MAT.CROWN` and `MAT.EMIT` parts.
   - `light`, `slot` and `tops` are no-ops. The original `lit` code calls none of them.
3. **In `crown()`, after the `capped` check:**
   - if `type === 'lit'`:
     1. `g0 = B.dryRun(() => litCrown(B, R, o))`. The existing code moves into a function unchanged, so R advances exactly as today.
     2. Choose and build the replacement with `Rk = rng(hashPos(x, z, top) ^ 0x5eed)`.
     3. Replacement props bypass `B.props` and use their own counter, capped at 2,000.
     4. Return the replacement's top.
   - Every other type: unchanged code path, built with R.
4. **Glow match.** After building, scale every emissive `param` of the replacement by `max(1, g0 / g1)`, capped at 2.5, so its glow is at least the original's.

### B. Type choice
- **Weights:** `lit` 10%; sloped, frame, halo, lantern and blade 18% each.
- **Neighbour rule:**
  - find the 5 nearest earlier-placed towers, within 150 m, whose crown is one of these six types;
  - if the chosen type is among them, re-roll with Rk, up to 4 times;
  - otherwise use the type least used among those 5.
  - No other crown type is ever rejected or re-rolled.
- **Caps:** `maxTop` caps already turn capped towers into `machine` before this point, so sight lines are unaffected.

### C. The five new types
Sizes are relative to the tower's top half-sizes hw and hd (m = min(hw, hd)). All details are at least 2 m.

| Type | Parts | Build |
|---|---|---|
| Sloped glass lantern | 3 | `prof: 8` glass part over 92% of the plan, rising 8 + 0.5·m m at the high edge down to 2 m at the low edge, `CROWNLIT \| CAPFACADE`, high `param`; an `EMIT` beam 2 m tall along the high edge; a 1 m metal coping |
| Open lit frame | 8 | 4 corner posts 2 × 2 m (metal) rising 12–24 m; top and mid frames, each a ring of 4 `EMIT` beams 1.5 m tall, with 0.9 m depth set back from the posts |
| Halo | 6 | Lit plant room (`MAT.CROWN` slats, 70% of the plan, 4 m); 4 posts 2 m; one `EMIT` ring band 2 m tall (`kind: 2`, `prm: 48`, radius 1.1·max(hw, hd), `NOTOP`), 8–12 m above the roof |
| Lantern box, flying roof | 3 | `MAT.CROWN` box at 85% of the plan, 2 floors (7–9 m); a 1.2 m dark roof plate at 112% of the plan; an `EMIT` lip 1.5 m under the plate's edge |
| Blade | 3 | A 3 m wall at 80% of the plan width, rising 15 + m m from one edge, `MAT.CROWN` (lit slats); a 1 m `EMIT` edge on top; an aviation light |

### D. `prof: 8`, its own branch
- **`prof()`:** a `k == 8u` branch returns `(1.0, t)`, so there is no ring scaling.
- **`vs`:**
  - if `prof == 8`: `wy = P.a.y + t·(h − slope·(hw − x_local))`, with the slope in `c.z`;
  - the top cap normal comes from the slope plane, rotated by the part angle;
  - side normals are unchanged, because the faces stay vertical planes.
- **`Parts.add`:** `prof: 8` does not set `CURVED`, so it stays on the 32-triangle box mesh.
- **Cap shading:** `CAPFACADE` makes the sloped top use the glass branch instead of the gravel roof shading.

## Cost
**Measured basis** (real part buffer, 133,904 parts):
- the 218 `lit` crowns are 532 tiers, 532 emissive ledges, 218 spikes and 4,726 fin props, about 6.0k parts;
- `bld-cull` is 0.17 ms on the baseline bench.

**Parts:**

| Change | Parts |
|---|---|
| 90% of `lit` crowns replaced (about 196) | about −5.4k |
| Replacements (about 196 × 4.6) | about +0.9k |
| **Net** | **about −4.5k (−3%)** |

**Estimates:**
- **Triangles:** box mesh for almost every new piece. The 32 halo rings use the round mesh (96–192 triangles).
- **Bench fly-through average:** −0.02 to +0.02 ms; `bld-cull` falls slightly.
- The only new shader code is the `prof: 8` vertex branch.
- **Memory:** slightly lower.
- **Effort:** one implementer, about 1 day.

## Risks
- **A6 or G1 may tie.** Variety in about 20 crowns per view may be too small a change for a blind judge. This idea is a cheap test of whether crown variety alone moves the judge.
- **Watched poses could lose** where the old pyramids were a highlight, such as G4's skyline or B3. The glow match keeps brightness, but the shapes are new. Held-out cameras are the only gate before the eval. There is no fix based on eval results.
- **The dry-run must mirror `prop` exactly,** including the budget check order. The stream hash in step 1 catches any mismatch before captures.
- **Merge overlap.** I-012 changes `Parts.add` (record size). Both edits are small and textual. `prof: 8` is reserved for this idea; no flag bits or material ids are used.
