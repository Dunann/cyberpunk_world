# I-038 status (paused 2026-11-24 at the coordinator's request)

- **Worktree:** `C:\Users\pdunc\cyberpunk_world\.claude\worktrees\i038` (branch `idea/I-038`, last commit `c3c384e`; not pushed). The previous worktree `agent-afbfe068...` was removed; this one was created from `main` at `e5c6aa4`.
- **Decision: GO.** Measure-first step passed by a wide margin.
- Deviations: `DEVIATIONS.md`. Raw tables: `results/`.

## Measurement (2560x1440, RTX 4050 Laptop, 3 interleaved rounds, `results/arms-r3.md`)
| Pose | Lighting A | Tests B-C | Shading A-B |
|---|---|---|---|
| A4 | 4.59 | 2.57 | 0.36 |
| A6 | 3.83 | 2.44 | 0.13 |
| B1 | 3.15 | 1.54 | 0.10 |
| B2 | 4.68 | 2.59 | 0.25 |
| G1 | 3.39 | 1.95 | 0.10 |
| G3 | 3.84 | 2.36 | 0.09 |
| **Mean** | | **2.24 ms** | 0.17 ms |

Arm A of the candidate matches the main build within the spread (`results/modes-timing.md`: main 3.95 ms vs candidate full loop 3.90 ms, mean of the six poses).

**Tiles over 256 lights on main: 0** at all 14 eval poses and 120 bench-path points (most passing in one tile: 65). The overflow/flicker rule has nothing to act on.

## Built (committed)
- `renderer.js`: `LU` uniform (measurement arms); pre-cull dispatch (one thread per light, padded block planes, per-axis near-plane rule, 64-bit row mask) marks per-block bitmasks; compaction dispatch writes each block's list in ascending light index; the tile loop walks its block's list with the unchanged `tileKeeps` test. Dev-only `lcull=full` (main's loop in the same build) and `lverify` (also runs the full loop per tile and compares count/XOR/sum of `pcg(i)` before the 256 cut, plus counters).
- `dev.js`: `__lightLimits`, `__lightStats`, `__passFrames`, `__lightFuzz` (black random lights behind/at/beside the camera and on block edges, radii 1-300 m).
- `tools/lightcheck.mjs`: `--arms`, `--stats [--fuzz N]`, `--diff dirA dirB` (largest 8-bit difference and differing pixels per PNG).

## Results so far
- **Identity (list mode):** 0 disagreeing tiles at 2560x1440, 1920x1080 and 1707x960, each over 14 poses + 120 path points, plus 2 fuzz frames per point (2,800 extra lights, many tiles over 256): 0 disagreeing tiles. Bit-walk mode also 0.
- **Mutation test:** a pre-cull with `rp = 0.98 r` is caught (156 disagreeing tiles on real frames, 11,399 under fuzz).
- **Test counts:** A6 228,900 tests vs 72.4 M on main (316x fewer); G3 225,400 vs 68.6 M (304x). Thread slots A6 0.42 M (list) vs 2.06 M (walk); G3 0.42 M vs 1.62 M.
- **Lighting pass (six-pose mean, 3 interleaved rounds):** main 3.95 ms, list 1.87 ms (-2.07 ms), walk 1.89 ms. A6 list 1.535 / walk 1.542; G3 list 1.579 / walk 1.617. List chosen; walk removed. Leftover test cost on the list path (B-C) about 0.06-0.14 ms per pose.

## Not done yet (exact next steps)
All GPU jobs through `gpu-run.sh I-038 ...`, run from `Opus55/source` in the worktree. Before starting: `node build.mjs --dev && node build.mjs && cp out/dev.html out/cand-dev.html`. `out/main-dev.html` must be rebuilt if missing: `git archive main Opus55/source` to a scratch folder, `node build.mjs --dev` there (node_modules junction), copy its `out/dev.html` to `out/main-dev.html`.
1. Quick re-check of the final build (walk removal changed only setup code; list WGSL is the same apart from parentheses): `node tools/lightcheck.mjs --file out/cand-dev.html --stats --ids A4,A6,G3 --path 10 --fuzz 2800 --fuzz-seeds 1` (expect 0 disagreeing).
2. Pixel check: `node tools/capture.mjs --poses-file ../eval/poses-v1.json --align --profile opus55-i038-cap --file <build> --out out/png/<run>` for main1, cand1, main2, cand2 (one at a time), then `node tools/lightcheck.mjs --diff out/png/main1 out/png/main2` (baseline) and `--diff out/png/main1 out/png/cand1`, `main2 cand2`. Pass: candidate max diff <= 1, or <= main-vs-main's own max per pose.
3. Functional: `node tools/functional.mjs --file out/cand-dev.html` (expect 18/18).
4. Burst stability vs main: script `scratchpad/i038/burst.sh` + `burstdiff.mjs` (capture `--poses 1 --burst` for main/cand twice, compare frame-to-frame change).
5. Bench: `scratchpad/i038/bench.sh 1 3` (pair k: odd = main first, even = candidate first; outputs `out/bench/p<k>-{main,cand}/perf-report.json`). Success: average down >= 0.15 ms in every pair, p99 down on the pair mean; reject runs with TAA p99/avg > 1.15.
6. Write `results.md`, commit, report.
