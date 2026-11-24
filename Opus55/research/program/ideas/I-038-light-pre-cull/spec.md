---
id: I-038
title: Light pre-cull - each lighting tile tests only the lights of its 160 px block, with the same tests and the same image
status: in-review
direction: from the reviews of I-024 (freeing GPU budget in the lighting pass; both reviewers asked for this as its own spec)
family: performance: two-level tiled light culling (per-block candidate lists, exact per-tile tests kept)
parent: I-024 (split out of its Cost section)
proposed_by: idea generator
date: 2026-11-24
---

# I-038: Light pre-cull

## Idea
The lighting pass tests every light against every tile. In `renderer.js` each 16×16 px tile runs `for (var i = li; i < lightCount; i += 256u)` over the whole light list. At 2560×1440 that is 14,400 tiles times about 5,000 to 5,300 lights (5,033 in the baseline perf report; the I-024 reviewers counted about 5,300 on main): about 72 to 76 million tests per frame, each with a matrix transform, a depth test and four plane tests, and about 2.4 GB of light-buffer reads.

This idea adds one small compute dispatch before the lighting dispatch. It sorts the lights into the 160 px blocks of the screen (10 × 10 tiles each, 16 × 9 blocks at 1440p). Each tile then walks only its block's list and applies **exactly the tests it applies today, in the same shader, on the same light records**. The block step only removes lights that those tests would reject in every tile of the block, so each tile ends up with the same set of lights and the image does not change.

- **No pose is a target.** The images are meant to be identical, so this idea is not judged by image comparison. As the coordinator set for this spec, success is identical images plus a measured drop in the bench average and p99.
- **No random stream is touched.** Nothing in generation changes.
- **The first step is a one-hour measurement** that can stop the idea before anything is built.

## Why it might work
- **The work is there to remove.** Both I-024 reviewers checked the loop and judged 0.4 to 1.0 ms of the 3.5 ms lighting pass a credible cost for the tests alone. It is not measured yet; the quick test measures it.
- **Almost all of those tests are wasted.** A light of 10 to 40 m radius covers a few tiles unless it is close to the camera. After the block step a tile tests the lights that touch its block, typically tens to a few hundred, not 5,000.
- **Dense aerial views benefit as much as any other view.** The total work is about 100 × (the sum of all block list lengths). That sum is the number of lights in view times the number of blocks each one overlaps (about 1.5 to 3 for distant lights). Even with every light in view (G3), it is an estimated 10,000 to 15,000 entries, so about 1 to 1.5 million tests against 76 million. Many lights in one block make that block's list long, but a light is still only in the blocks it overlaps.
- **Identity can be proved, not only observed.** The per-tile tests are unchanged, so the only question is whether the block step can drop a light that a tile would have kept. The plan gives a short proof that it cannot, and an exact per-tile check that confirms it on the GPU.

## What's new about it
- **Closest existing code:** the per-tile loop itself, and `fog.js`, which already culls its near lights per 8×8 froxel tile from a compact list.
- **Closest earlier proposal:** the optional step in I-024's Cost section. This spec replaces it and answers the review points:

  | Review point | Answer here |
  |---|---|
  | Block lists will overflow in dense aerial views (A6, G3), the fallback removes the saving, and the capacity is not given | Each block list has room for every light (`MAX_LIGHTS` = 8,192 entries, 4.7 MB in total). A light is appended to a block at most once, so a list cannot overflow. There is no fallback path |
  | The measurement switch must come from a uniform | A new 16-byte uniform holds the limits; the shader cannot know their values, so it cannot drop the tests or the `tList` writes |
  | The screen bounding box must be conservative for lights that cross the near plane | No bounding box is projected. Blocks are chosen by the same plane tests as tiles. A light whose sphere reaches the camera's plane goes into every block, unless it is so far to the side that no tile could keep it (proof below) |
  | Split it out, with the measurement first | This spec; the measurement is the quick test |
- **Known technique:** two-level (coarse then fine) tiled light culling is standard in tiled and clustered renderers. Nothing here is new as graphics; the work is in making it provably identical in this engine.

## Expected effect on the metric
- **Images:** none. Pairwise judging would give ties on all poses.
- **GPU gate:** an estimated 0.35 to 0.95 ms off the bench average (the cost of the tests, less about 0.02 ms for the new dispatch), and about the same off p99, because the tests cost nearly the same in every frame that shows geometry. This is an estimate from operation counts.
- **For the program:** the headroom under the 11 ms gate grows from about 1.2 ms to an estimated 1.6 to 2.1 ms. Ideas that need GPU time (I-023 is capped at +0.30 ms) stop competing for the same 1.2 ms.

## Quick test
The one-hour measurement. It changes nothing visible. Run all GPU jobs under the shared lock.

1. **Add a uniform to the lighting pass** (`LU: vec4f`, binding 7 of `lightLayout`), with defaults that reproduce main:
   - `LU.x` = the most lights a tile may shade (default 256): `let cnt = min(min(atomicLoad(&tCount), TILE_MAX), u32(LU.x));`
   - `LU.y` = the most lights the tile loop may test (default 8,192): `let lightCount = min(u32(F.fog.w), u32(LU.y));`
   - In the dev build the two values come from URL parameters `lshade` and `lcount`.
2. **Three arms, one shader binary:**

   | Arm | Setting | What runs |
   |---|---|---|
   | A | defaults | Everything, as on main |
   | B | `lshade=0` | All tests and all `tList` writes; no light is shaded. The limit is a runtime value, so the compiler cannot remove the tests or the writes |
   | C | `lcount=0` | No tests and no light shading. Only the lighting pass reads this value, so the fog is not affected |
   - Cost of the tests = B − C. This is what the idea can remove.
   - Cost of shading the lights = A − B. This idea does not touch it.
3. **Measure** the `lighting` pass with `tools/capture.mjs --poses-file ../eval/poses-v1.json --ids A4,A6,B1,B2,G1,G3 --stats --query lshade=…&lcount=…`. Three rounds, arms interleaved (A B C, A B C, A B C). Report the mean and the spread per pose and arm. The six poses cover a neon street, the two dense aerial views, a view that is half sky, a glass street and a far skyline.
4. **Check** that arm A matches main: the `lighting` time at the six poses agrees with a main build within the spread.

**Go / no-go** (mean of B − C over the six poses):
- at least 0.25 ms: go;
- under 0.15 ms: stop and record the numbers. The cost is then in shading the lights, not in the tests (see "If the measurement points elsewhere");
- in between: report to the coordinator. A saving that small is close to the bench's pair-to-pair spread (about 0.06 ms).

## Implementation plan
Files: `renderer.js` only (shared file: the change is confined to the lighting pass), plus one new dev tool `tools/lightcheck.mjs`. No file in `eval/` changes, and the existing tools (`bench.mjs`, `capture.mjs`, `pixdiff.mjs`) are not touched.

### A. Block lists
- **Block:** 160 × 160 px, which is 10 × 10 tiles. `nb = ceil(width / 160) × ceil(height / 160)` blocks (144 at 2560×1440).
- **Buffers,** created in `resize()` and never per frame:
  - `bcnt`: one `atomic<u32>` per block;
  - `blist`: `nb × MAX_LIGHTS` light indices (`u32`). At 1440p this is 144 × 8,192 × 4 bytes = 4.7 MB.
- **Per frame:** `enc.clearBuffer(bcnt)`, then the new dispatch, then the lighting dispatch. Both run inside the existing `lighting` compute pass, so the pass's timing includes the new work and the numbers compare the same thing before and after.
- **Order in the frame:** lights are only written from the CPU (`Lights.set`, uploaded by `ctx.lights.flush()` at the start of `render()`); only `fog.js` and `renderer.js` bind the light buffer, both read-only. The new dispatch therefore always sees the frame's final lights.

### B. The pre-cull dispatch (one thread per light, workgroups of 64)
```wgsl
let L = lights[i];
let r = L.posR.w;
if (r <= 0.0) { return; }                      // same as the tile test
let vp = (F.view * vec4f(L.posR.xyz, 1.0)).xyz;
let vz = -vp.z;
let rp = r * 1.001 + 0.01;                     // padded radius: this shader may round differently from the tile shader
if (vz + rp < 0.0) { return; }                 // wholly behind the camera's plane
var cols = ALL; var rows = ALL;                // sphere reaches the camera's plane: every block ...
if (vz < rp) {
  // ... unless it is too far to the side to pass any tile's side planes (see D). AX, AY: the largest plane slopes on screen
  if (abs(vp.x) > (AX + sqrt(1.0 + AX * AX)) * rp || abs(vp.y) > (AY + sqrt(1.0 + AY * AY)) * rp) { return; }
} else {
  // one bit per block column and row: the tile's own plane tests, with the block's edges and the padded radius
  cols = columns bx where dot(pl(bx), vp) >= -rp && dot(pr(bx), vp) >= -rp;
  rows = rows by where dot(pb(by), vp) >= -rp && dot(pt(by), vp) >= -rp;
}
for each (bx, by) with both bits set {
  let b = by * nbx + bx;
  let k = atomicAdd(&bcnt[b], 1u);
  blist[b * MAX_LIGHTS + k] = i;
}
```
- The block planes use the tile formulas with the block's edges: `x0 = f32(bx * 160u) * F.res.z * 2.0 - 1.0 - 0.01`, `x1 = f32(bx * 160u + 160u) * F.res.z * 2.0 - 1.0 + 0.01`, the same for y, and the same `normalize(vec3f(1.0, 0.0, x0 * tanX))` forms. The left and right tests depend only on the column and the top and bottom tests only on the row, so a light needs one pair of tests per block column and per block row (16 + 9 at 1440p), not one per block.
- `AX` and `AY` are the largest values of `|x0 · tanX|`, `|x1 · tanX|` and `|y0 · tanY|`, `|y1 · tanY|` over all blocks (about 1.05 and 0.59 at 1440p).
- **No overflow:** a light is appended to a block at most once, and there are at most `MAX_LIGHTS` lights, so `k` is always below `MAX_LIGHTS`.

### C. The tile loop (the only change to the lighting shader)
```wgsl
let b = (wg.y / 10u) * nbx + wg.x / 10u;       // this tile's block
let n = min(bcnt[b], u32(LU.y));
for (var j = li; j < n; j += 256u) {
  let i = blist[b * MAX_LIGHTS + j];
  let L = lights[i];
  // ... every line from here to the tList write is unchanged
}
```
`LU.y` now limits the block list length, so the three arms of the quick test can be run again on the new path to show what is left of the test cost. The tile still reads the light record itself and recomputes `vp` with the same expression in the same shader as today. Its depth test, depth-slice test and four plane tests are therefore bit-for-bit the tests main runs. The shading loop is not touched.

### D. Why no tile loses a light
A tile keeps a light when it passes four things: radius above 0; the depth range test; the depth-slice test; and, for each of the tile's four side planes, a signed distance of at least −r. The block step must never drop a light that would pass all of these in some tile of the block.

- **Radius 0:** dropped by both.
- **Wholly behind the camera's plane** (`vz + r < 0`): the tile's depth test `vz + r < zmin` rejects it in every tile, because `zmin` is a linear depth of real geometry and so is positive.
- **Sphere reaches the camera's plane** (`|vz| < r`): put in every block, unless it is too far to the side. A tile's left plane test needs `x − a·vz ≥ −r·√(1+a²)`. With `|vz| < r` and `|a| ≤ AX` this gives `x ≥ −(AX + √(1+AX²))·r`; the right plane gives the same bound on the other side, and the top and bottom planes the same for y with `AY`. A light outside these bounds fails a side plane in every tile, so dropping it changes nothing. This keeps the "every block" set to lights within about 2.5 radii of the camera.
- **Sphere wholly in front** (`vz ≥ r`): the block's plane tests are passed whenever the tile's are. Take the left plane. The tile's plane is `x = aT·vz` and the block's is `x = aB·vz` with `aB ≤ aT`, because the tile lies inside the block and both use the same padding. Suppose the light passes the tile's test.
  - If the centre is on the inner side of the tile's plane, then `x ≥ aT·vz ≥ aB·vz` (as `vz > 0`), so it is on the inner side of the block's plane too.
  - Otherwise its distance to the tile's plane is at most r. Let Q be the nearest point on that plane. Q's depth is `vz` minus at most `r·|aT|/√(1+aT²)`, which is less than r, so Q's depth is positive. Q lies on the tile's plane at positive depth, so `Q.x = aT·Q.vz ≥ aB·Q.vz`: Q is on the inner side of the block's plane. The light's centre is within r of Q, so it passes the block's test.
  - The right, top and bottom planes follow in the same way.
- **Rounding:** the two shaders may round the same expression differently, so the block step uses the padded radius `rp` everywhere. Padding can only keep more lights.

The depth range and depth-slice tests are not used in the block step; they run per tile as today.

### E. Checks
1. **Exact light-set check (dev only).** A second variant of the lighting shader is compiled only when the URL has `lverify`, so the normal shader stays lean and is the same in both builds. In each tile it runs the old loop over all lights and the new loop over the block list, and compares the count, the XOR and the sum of `pcg(i)` over the lights each one keeps. It writes four counters to a small buffer: tiles that disagree; tiles with more than 256 lights; the longest block list; the total number of tests. `tools/lightcheck.mjs` reads them at all 14 eval poses, at 120 points along the bench path (`__flyTo(u)`), and at 1920×1080 and one odd size (1707×960). **Pass: zero disagreeing tiles everywhere.** It also prints the reduction in tests.
2. **Pixel check on all 14 eval poses.** PNG captures with `--align` (frozen time, same frame phase):
   - two captures of main give the noise of the capture itself;
   - candidate against main: **the largest absolute difference in any channel is at most 1 on the 8-bit image, on every pose.** Report the number of differing pixels per pose for both comparisons.
   - Exactly 0 cannot be promised. Each tile's lights are summed in an order set by a race between threads, on main and here alike, so two captures of main need not match bit for bit. Check 1 is the exact part of the proof; this check confirms nothing else changed.
   - If two captures of main already differ by more than 1 on some pose, the limit for that pose is main's own largest difference, and the verify variant gets an option that sorts each tile's list before shading. That removes the summation order as a source of difference, so the old and new paths of the same build can be compared directly.
   - `tools/pixdiff.mjs` reports tile means only, so `tools/lightcheck.mjs --diff <dirA> <dirB>` reports the largest difference and the number of differing pixels per image.
3. **Tiles with more than 256 lights.** When a tile passes more lights than `TILE_MAX`, which ones are shaded depends on the thread race, on main as well. Check 1 counts such tiles. Whether any exist today is not known. If there are any, list them: the image there is not well defined on main either, and this idea does not change the rule.
4. **Bursts.** `burst-u12` and `burst-u62` run with time moving, so two runs never match to the pixel. They are covered by check 1 along the path and are looked at for flicker.
5. **Gates:** both builds succeed; `functional.mjs` 18/18; no WebGPU errors.
6. **Bench.** At least three alternating pairs of main and candidate under the lock.
   - **Gate:** average ≤ 11 ms, p99 ≤ 16.7 ms, worst frame ≤ 25 ms, as always.
   - **Success:** the average falls by at least 0.15 ms in the mean of the pairs and falls in every pair, and p99 also falls in the mean of the pairs (p99 is noisier than the average, so a single pair may not show it). Report the `lighting` pass average and p99 from the per-pass table.
   - If the checks pass but the saving is under 0.15 ms, do not merge: a shared-file change is not worth a saving inside the noise.

## Cost
- **Effort:** one implementer, about 1.5 days: measurement 1 hour, block lists and tile loop half a day, verify variant and tool half a day, checks and bench half a day.
- **GPU, per frame:**
  - **Added:** one dispatch over about 5,300 lights (26 pairs of plane tests each at most, and about 10,000 to 15,000 list appends), and one small buffer clear. Estimate 0.01 to 0.03 ms, inside the `lighting` timing.
  - **Removed:** an estimated 95% or more of the per-tile tests and light-buffer reads (check 1 reports the real figure).
  - **Where the time comes from:** this idea needs none. It returns an estimated 0.35 to 0.95 ms.
- **Memory:** 4.7 MB at 1440p (5.2 MB at 2560×1600).
- **Load time:** none.

## Risks
- **The tests may be cheaper than estimated.** Then the saving is small and the quick test stops the idea after one hour.
- **Sky-heavy views save less.** Tiles with no geometry already skip the loop, so views that are half sky (B1) spend about half as much on tests today.
- **Close-up views have long lists.** A light near the camera covers most of the screen and lands in most blocks. With about 150 such lights the lists hold a few thousand more entries; the total stays far below today's.
- **Shared file.** `renderer.js` is edited by few ideas, but any that changes the lighting pass (as I-024 would have) must merge with this.
- **Tiles over 256 lights** (check 3) would make exact comparison impossible there, on main as well. This would be a finding about main, reported rather than fixed here.
- **A wrong block size would waste the saving, not the image.** The total test count from check 1 shows whether 160 px is a good size; 80 px blocks are a one-constant change (18.9 MB of lists).

## If the measurement points elsewhere
If arm A − B (shading the lights) is the larger cost, a different change applies, and it is not part of this spec: copy each tile's kept lights into workgroup memory once, with the neon flicker already applied, as `fog.js` does for its clusters. Today the shading loop reads the light buffer through `tList` and calls `neonFlicker()` for every pixel and light. That change alters the order of two multiplications, so it is identical only to rounding and needs its own measurement and pixel check.
