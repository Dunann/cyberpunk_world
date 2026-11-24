## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 3 | Two-level (coarse block, then exact tile) light culling is textbook tiled and clustered rendering, as the spec says itself. The care for exact identity is good engineering but not a new idea. |
| Feasibility and credibility | 7 | I checked the conservativeness proof line by line against `renderer.js:86-112` and it holds, including the near-plane case and any radius. The measurement uses uniform-driven arms, so the compiler cannot remove the work, and it is cheap. Points deducted for three gaps. (1) "Same image" fails in tiles with more than 256 lights, and the pass rule says nothing about that case. (2) The block lists come out in a different order every frame, set by a race between GPU threads. (3) B − C is assumed to equal what the change will save, which is not shown. All three can be fixed. |
| Expected impact | 6 | My own instruction count puts the tests at about 0.45-0.8 ms, so a saving of 0.4-0.7 ms is likely. That is 30-55% more headroom under the 11 ms gate, on one of GOAL.md's two hard problems. No critic score moves directly. If it fails, the measurement still shows whether the lighting time is in the tests or in the shading, which points the next performance idea in the right direction. |
| **Overall (average)** | **5.33** | |

### Strongest reason it will fail
The image is the same only where no tile has more than 256 lights, and the spec has no rule for tiles that do. On main, each thread walks lights `li, li+256, …` in index order. A tile that passes more than `TILE_MAX` lights therefore keeps roughly the lowest-indexed lights that pass, and that set is mostly stable from frame to frame. In the new path, the order of each block list is set by `atomicAdd` calls racing across about 84 pre-cull workgroups, and the tile loop reads the list in that order. An overflowing tile then keeps a different subset from main's, and possibly a different subset each frame. That is a visible difference and could flicker, which main may not do. Check 1 would report these tiles as disagreeing. "Pass: zero disagreeing tiles everywhere" would then fail, and E3 only says to "list them". Nobody knows today whether such tiles exist. Horizon tiles in A4/B2 street views and G3/A6 aerial views are where they would be. The likely result is a correct, faster change that cannot pass its own rule, or a rule loosened after the fact. A light index order that does not depend on the race would remove the problem (first item below).

### Other concerns
- **Conservativeness proof: correct.** Details:
  - With `pl = (1, 0, aT)/k` and `vz = -vp.z`, the tile test is `(x − aT·vz)/√(1+aT²) ≥ −r`. The block edges sit outside the tile edges, so `aB ≤ aT` (and the mirror for right, top and bottom). That holds in f32 too, because the edge expressions only add, multiply by positive values and subtract constants, all of which keep order.
  - The nearest-point step (`Q.vz ≥ vz − r·|aT|/√(1+aT²) > 0` when `vz ≥ r`), plus the 1-Lipschitz signed distance, gives `d_B ≥ −r`. The argument holds in 3D because the side planes have no y term.
  - The case `|vz| < r` is bounded correctly: `|a| + √(1+a²)` grows with `|a|`, so `AX` covers every tile.
  - Lights behind the camera: `zmin = linearDepth > 0`, so `vz + rp < 0` implies that every tile rejects the light.
  - This branch is needed. For `vz < 0` the tile's half-space is larger than the block's, so the plain block test would drop lights there.
  - The proof places no limit on the radius.
- **The rounding margin is absolute and does not grow with distance.**
  - `rp = r·1.001 + 0.01` covers a few ULP of the `F.view` transform at about 3 km, roughly 0.002 m.
  - For the left-most tile column of each block, the block test and the tile test are the same expression (`aB = aT`), so only rounding separates them.
  - Add `+ 1e-5·length(vp)` to `rp`. It costs nothing and removes the question.
- **The "every block" branch is wider than it needs to be.** The in-front proof only needs `vz ≥ r·AX/√(1+AX²)`, about 0.72 r for the side planes and 0.51 r for top and bottom, not `vz ≥ r`. Lowering the threshold keeps fewer close lights in all 144 blocks. Close-up street poses will have tens to about 150 such lights, which is +3k to +21k list entries. This affects speed only, not correctness.
- **B − C is not shown to equal the saving.** In arm A, test warps and shading warps from different workgroups overlap on the SMs. In arm B the pass has no shading to hide latency behind. The saving can therefore be smaller or larger than B − C. The spec should say plainly that B − C is only the go/no-go estimate, and that the bench pairs are the result (they already are the success rule).
- **The idea fits the bottleneck. Estimate:**
  - Each test is about 45 instructions: about 9 FMA for the transform, the depth tests, slice-mask integer work at half rate, 4 plane tests with 2 terms each, and loop overhead.
  - With about 85% of tiles showing geometry: 72M × 0.85 × 45 / 32 lanes ≈ 86M warp instructions. 20 SMs × 4 schedulers at about 1.9 GHz issue about 150G warp instructions per second, so ≈ 0.55 ms with perfect issue, more with barriers and integer work.
  - The light records are 161 KB and stay in L1/L2, and the compiler probably loads only `posR`, so the real traffic is about 1.2 GB of cache hits, not 2.4 GB of reads. That is about 0.25 ms of L1 bandwidth, overlapped with ALU work. Memory bandwidth is not the limit.
  - A − B (shading) is probably still larger, which the spec allows for.
- **Memory and atomics are not a concern.**
  - 4.7 MB on a 6 GB card is fine.
  - About 15k `atomicAdd` calls on 144 counters: the busiest horizon block may serialise 1-2k of them, roughly 2-4 µs.
  - The 576-byte `bcnt` clear sits on the command encoder outside the timed pass. That is correct; just do not try to clear inside the compute pass.
  - The tile loop now reads `lights[blist[j]]` as scattered loads, but only for 1-2 iterations per tile.
  - The dispatch estimate of 0.01-0.03 ms, including the wait before the lighting dispatch starts, is reasonable.
- **Check 1 only tests poses that already exist.** The 14 poses and 120 path points rarely put a large light right at the camera's plane and far to the side, or exactly on a block edge, which is where the proof's two branches meet. Fuzz it (below).
- **The odd-resolution check is good.** Note that `cols` and `rows` as 32-bit masks limit width to 5120 px. Assert that limit.
- **Order dependency is sound today.** No shader binds `lights` as `read_write` (only `fog.js` and `renderer.js` bind it, both read-only). However, the comment in `lights.js` invites modules to write lights from compute shaders. Keep the pre-cull after all module `compute()` calls, as planned, and add a comment saying it must stay there.
- **The p99 claim is plausible but unsupported.** The p99 frames are gbuffer-heavy: gbuffer p99 is 4.36 ms against an average of 2.55 ms. Report the lighting pass p99 from the bench per-pass table, as planned.

### What would make it stronger
- **Replace the block lists with per-block bitmasks laid out to match main's thread order.**
  - Each block has 256 words, and bit `j` of word `w` means light `w + 256·j`. The pre-cull does `atomicOr(&bmask[b*256 + (i & 255)], 1u << (i >> 8))`.
  - In the tile loop, thread `li` reads word `li` and walks its set bits upward. Each thread then visits exactly the lights it visits on main, in the same order, minus the ones the block step rejected.
  - The light set kept in overflowing tiles then matches main as closely as main matches itself.
  - The structure cannot overflow, is filled in the same way every frame, and takes 147 KB instead of 4.7 MB.
  - One coalesced 1 KB read per tile replaces the indirect `blist` read.
- **Write a decision rule for overflowing tiles before running check 1.** Either compare only tiles with 256 lights or fewer, and require zero disagreements there, plus no added flicker in overflow tiles on `burst-u12`/`u62`. Or adopt the bitmask, and the rule is not needed.
- **Fuzz the proof directly.** In the `lverify` build, add a mode that fills the about 2,800 unused light slots with random lights around the camera: behind it, at its plane, beside it, at block edges, with radii from 1 to 300 m. Run check 1 over a few hundred camera poses at three resolutions. Do it in the same GPU shader so the rounding is real.
- **Add the `length(vp)` term to `rp`, and lower the near-plane threshold to `rp·AX/√(1+AX²)`** with per-axis bounds.
- **Report B − C as the go/no-go estimate only.** Also run the three arms once on the finished build, as section C already allows, and show that the leftover test cost is under 0.05 ms.
