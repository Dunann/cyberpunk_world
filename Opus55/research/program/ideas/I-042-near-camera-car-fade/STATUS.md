# I-042 status (paused 2026-11-24)

- **Worktree:** `C:\Users\pdunc\cyberpunk_world\.claude\worktrees\agent-a18746eb4b9913ba5`, branch `idea/I-042` (from main `eda1c60`; main's later commits touch only program docs, not `source/`).
- **Code:** `Opus55/source/src/trafficCars.js` only. `carBoxDist()` in the car compute pass; `camFade = smoothstep(1.2, 2.5, boxDist)` for cars within 10 m; skipped below 0.001 (no mesh, lamps or streak); `camFade` scales lamp `vis` (and so the streak); packed into the colour fraction (`color + 0.98 * camFade`), and the mesh fragment shader discards with `ign(frag, frame) > camFade`. Steep-slope and run-end fades, car state and random streams are untouched. Deviations in `DEVIATIONS.md`.
- **Builds:** `node build.mjs` and `node build.mjs --dev` pass; `index.html` rebuilt and committed.

## Results so far
**Eval poses** (`capture.mjs --align`, PNG, main vs candidate, plus a second main capture for noise):

| Pose | Changed pixels (any channel > 8 levels) | pixdiff tiles over noise | Noise (main vs main) |
|---|---|---|---|
| A4 | 0.000% (bit-identical) | 0 of 920 | 0 |
| A5 | 0.000% (bit-identical) | 0 of 920 | 0 |
| B2 | **13.83%** (box x 0-1033, y 866-1439) | 153 of 920 | 0 |

B2: the purple near car is gone cleanly; the car behind it in the same lane is now fully visible. No leftover lamps or streak.

**Held-out lane cameras** (scratch tool `source/out/i042tools/lane.mjs`, not committed; cars found with a GPU read-back of the near list on main):
- CBD (3175, -1400) facing north, CBD (3450, -1500) facing east, Bund (1855, -1300) facing north; 3 stills each, main vs candidate.
- Cars under 1.2 m are removed cleanly (Bund t=72: a bus covering 46% of the frame disappears, no leftover lamps).
- **Cars inside the 1.2-2.5 m band look like translucent ghost cars in a converged still, with visible grain** (CBD east t=108: cars at camFade 0.54 and 0.72; CBD north t=92: a car at 0.24 is almost invisible with faint sparkle). TAA's neighbourhood clamp does not fully resolve the dither. A car alongside a lane-centre camera crosses the band in about 1.6 m of travel (a few frames), but a camera standing between lanes (lateral 1.5-2.5 m) would see passing ghost cars for longer. This is the risk the spec named; the evaluator's blind burst check should look at it.
- 4-frame bursts (3 m per step, time running) were captured for both builds; no stipple was visible at the downscaled view. Caveat: the steps are not frame-locked (the render loop keeps running between puppeteer calls), the same as `capture.mjs --burst`.

**Functional (candidate):** 18/18, no WebGPU errors.

**Bench, alternating pairs** (`source/out/i042/bench-*/perf-report.md`), GPU ms:

| Run | Avg | p99 | Max | gbuffer avg | TAA avg / p99 (ratio) |
|---|---|---|---|---|---|
| main1 | 10.04 | 13.08 | 17.01 | 2.69 | 0.94 / 1.93 (2.05) |
| cand1 | 9.81 | 12.88 | 16.96 | 2.62 | 0.91 / 1.75 (1.92) |
| main2 | 9.74 | 13.18 | 17.58 | 2.63 | 0.87 / 1.64 (1.89) |
| cand2 | 9.41 | 12.51 | 14.17 | 2.55 | 0.85 / 1.39 (1.64) |

All four pass the gate, and the candidate is no slower than main in either pair. **But every run has TAA p99/avg above 1.15, so under the program's rule all four runs are rejected** (the GPU was noisy during this session even under the lock). The bench must be redone.

## Next steps
1. Rerun the bench pair on a quiet GPU under the lock: `node tools/bench.mjs --file out/main-dev.html` and `--file out/cand-dev.html`, alternating, two pairs; keep only runs with TAA p99/avg ≤ 1.15. Expected cost about +0.01 ms (the `discard` disables early depth for car pixels).
2. Optional, if the reviewer wants less ghosting: narrow the band to 1.2-2.0 m (one constant in `CAR_CS`).
3. Hand to code review; the coordinator merges `idea/I-042` and runs the evaluation (target B2).

Build outputs for comparison: `source/out/main-dev.html` (main) and `source/out/cand-dev.html` (candidate). `source/node_modules` is a junction to the main checkout's.
