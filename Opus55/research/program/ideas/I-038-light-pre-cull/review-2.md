## Reviewer 2 (2026-11-24)

Reviewed as amended by reviewer 1's bitmask change: per-block masks of 256 words, bit `m` of word `w` = light `w + 256·m`, filled with `atomicOr`, and each tile thread `li` walking the set bits of word `li` upward.

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 3 | Coarse-then-fine tiled light culling is standard, as the spec says. The thread-ordered bitmask is a neat layout but not a new idea. |
| Feasibility and credibility | 6 | The proof that the block step never drops a light a tile would keep is correct. I checked it against `renderer.js:86-112`. The bitmask is deterministic, cannot overflow and takes 147 KB. The quick test is cheap and the compiler cannot defeat it. Points off for two real gaps in the amended spec. (1) The bitmask does **not** make tiles with more than 256 lights match main, contrary to the claim behind the amendment, so the pass rule "zero disagreeing tiles" can still fail there, and there is still no rule for such tiles. (2) The bit walk runs at warp width, so it removes less of the test work than the spec's "95% or more" when a block's light indices are scattered. That lowers the saving in the dense views that matter most, and the go threshold does not allow for it. |
| Expected impact | 6 | I expect 0.3 to 0.6 ms off the bench average once the bitmask's leftover work is counted. That grows the headroom under the 11 ms gate (now about 1.4 ms at 9.5 ms) by 20 to 40%, and the change is image-identical in every tile with 256 lights or fewer. No critic score moves directly. If it fails, the A − B and B − C split still tells the program whether the lighting time is in the tests or in the shading, which aims the next performance idea. |
| **Overall (average)** | **5.00** | |

### Strongest reason it will fail
The bitmask keeps each thread's own order, but not the order across threads, and that cross-thread order decides which lights an overflowing tile keeps. On main, all 32 lanes of a warp step through `m = 0, 1, 2, …` together, so the `atomicAdd(&tCount)` calls come in bands of light index (`256m … 256m+255`). An overflowing tile therefore keeps roughly the lowest-indexed passing lights. In the bit walk, lane `li` handles its *n*-th block candidate on warp iteration *n*, whatever its `m`. A lane whose only candidates are lights `li + 256·18` and `li + 256·19` adds them on iterations 0 and 1. On main they come last and are the first to be cut. So in any tile that passes more than 256 lights, the amended path keeps a systematically different subset from main, not just a different race. Check 1 counts those tiles as disagreeing, and the rule "Pass: zero disagreeing tiles everywhere" fails. Reviewer 1's statement that the kept set "matches main as closely as main matches itself" is not true for this design. Walking all `m` in lockstep with a skip would restore main's banding, but it gives back most of the saving: in my simulation a random 200-light block still costs 115 of main's 160 warp iterations per tile. Nobody yet knows whether any tile overflows: horizon tiles in A4/B2 and the dense aerial views A6/G3 are the candidates. Main is itself race-dependent there, so exact equality in overflow tiles cannot be defined. The spec needs a rule for it, decided before check 1 runs (see below).

### Other concerns
- **The bitmask is correct where it matters.**
  - `MAX_LIGHTS` = 8,192 = 256 × 32 (`common.js:13`), so `i >> 8` fits in one 32-bit word exactly. Add a static assert: raising `MAX_LIGHTS` silently breaks the layout.
  - The `atomicOr` fill is order-independent, so the mask is identical every frame and on every run, unlike the list.
  - In every tile with 256 passing lights or fewer, the tested set equals main's, so the kept set is equal. The order in `tList`, and so the summation order, is set by a race on both builds, as the spec already says.
  - Memory: 144 × 256 × 4 B = 147 KB at 1440p (160 KB at 2560×1600), against 4.7 MB for the lists.
- **The cost of the bit walk depends on how the light indices are laid out.** Bit scanning itself is cheap: one coalesced 1 KB read per tile, then `countTrailingZeros` and `w & (w − 1)` per candidate. The real cost is SIMT: a warp runs as many full tests as its busiest lane has set bits. I simulated warp iterations per tile, out of main's 8 warps × 20 = 160:

  | Block candidates | Compact list | Bitmask, indices contiguous | Bitmask, indices scattered |
  |---|---|---|---|
  | 50 | 2 | 3 | 11.5 |
  | 200 | 7 | 7 | 24 |
  | 400 | 13 | 13 | 35 |
  | 800 | 25 | 26 | 54 |

  - Lights are registered by module and lot (`buildings.js:113,121`, `garden.js:371`, `bridges.js:646`, dynamic reserves in `boats.js`, `air.js`), so the real case is somewhere between the two columns.
  - The removed share of the tests is therefore about 66 to 98%, not "95% or more". The low end falls in dense blocks: the block step has no depth test, so a horizon block holds every light in its angular wedge out to the far plane, and aerial views spread all lights over all blocks.
  - With the go threshold at B − C = 0.25 ms, the bitmask could save as little as about 0.15 ms after the 0.02 ms dispatch, which is right at the success limit.
- **Are the tests a large share of the 3.5 ms? Probably, but this is not certain.** My own split of the pass:
  - G-buffer reads and the HDR write: about 150 MB per frame, about 0.8 ms at the 4050 Laptop's 192 GB/s.
  - Shading the lights per pixel: about 0.5 to 1 ms.
  - The tests: about 86 million warp instructions, about 0.55 ms if instruction issue is the limit. They can cost more because each iteration's load sits on a dependent chain. The kernel's register use is set by the shading code, which limits occupancy during the test loop. The 161 KB light buffer does not fit in L1, so some of the about 2 GB of per-frame light reads go to L2.
  - A range of 0.4 to 1.2 ms for the tests is credible. The quick test is the right way to settle it, and it should run first.
- **The extra dispatch is cheap and correctly placed.** It is about 79 workgroups of 64 threads, 25 column and row plane pairs per light, and about 15k `atomicOr` calls on 36,864 words with almost no contention. The wait at the dispatch boundary is a few microseconds, so 0.01 to 0.03 ms is right. Lights are written only by the CPU before the encoder (`renderer.js:572`), and nothing binds `lights` as read-write, so the order holds. Keep the comment reviewer 1 asked for, because `lights.js:7` invites compute writers.
- **The mask clear is not timed.** `enc.clearBuffer` cannot go inside a compute pass, so it lands between passes, outside the "sum of passes" GPU metric (`fog.js:539` does the same). At 147 KB it is about 1 µs, so this is harmless. Note it in the results so nobody reads the metric as missing work.
- **The proof holds, including the near-plane branch and rounding.** I agree with reviewer 1's details. Two notes:
  - The `aB ≤ aT` ordering survives f32, because every operation in the edge formulas is monotone.
  - The absolute margin of 0.01 m is about 20 times the f32 error at 3 km. The relative term `1e-5·length(vp)` is still free insurance.
- **The rest of the spec is sound.**
  - The arm design (runtime limits from a uniform, `lcount` affecting only the lighting pass) is correct.
  - The 1707×960 resolution check and the bursts along the path are good.
  - The 32-bit block-column mask limits the width to 5,120 px. Assert that.

### What would make it stronger
- **Count overflowing tiles on main in the quick test.** Add one `atomicAdd` per tile where `tCount > 256` into a small buffer, and read it at the six poses and along the bench path. It costs minutes.
  - If the count is zero everywhere, the overflow question goes away for any design, and the choice between list and bitmask is purely about speed.
  - If it is not zero, the spec needs the rule below.
- **Make check 1 compare the light sets before truncation.** Take the count, XOR and sum of `pcg(i)` over *every* light that passes the per-tile tests, not over the 256 that are kept. That is exactly what the proof claims, and it can pass in overflowing tiles as well.
  - Then apply a separate rule for overflowing tiles: report them, and require no added flicker on `burst-u12`/`u62` against main. Do not claim identity there.
- **Pick the tile loop deliberately.** Either:
  - keep the bitmask fill and add a small per-block compaction step that writes candidates in ascending index order into a short list (deterministic, about 0.6 MB at 1,024 entries per block with a fall-back to the mask beyond that), which gets the compact-list efficiency in dense blocks; or
  - keep the bit walk, and report check 1's total test count at A6 and G3 to show how much of the saving is lost.
- **Raise the go threshold for B − C to about 0.30 ms,** or scale it by the measured share the bit walk removes. Then a "go" is likely to clear the 0.15 ms success rule.
- **Keep reviewer 1's fuzzing of the proof** (random lights at the camera plane, beside the camera and on block edges) and the relative margin in `rp`.
