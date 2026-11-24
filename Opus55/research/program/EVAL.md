# Evaluation metric: version 1 (frozen, git tag `eval-v1`)

The user approved this metric as part of the plan on 2026-11-24. The harness lives in `Opus55/eval/`. Changing it needs the user's approval and a new version.

## How a candidate is evaluated
1. **Gates.** Run `node Opus55/eval/run-eval.mjs --source <candidate>/Opus55/source --out Opus55/eval/runs/<id>`, one candidate at a time on a quiet GPU. Every gate must pass:
   - both builds succeed
   - no WebGPU or WGSL errors in the captures
   - `functional.mjs` 18/18
   - `bench.mjs` at 2560x1440: average ≤ 11 ms, p99 ≤ 16.7 ms, worst frame ≤ 25 ms
2. **Primary decision: blind pairwise judging.**
   - `make-pairs.mjs` builds randomized X/Y pairs of the current best run and the candidate run. The key file is kept outside the judge's folder.
   - An Opus judge follows `pairwise-judge-v1.md`.
   - `make-pairs.mjs --score` maps its verdicts onto candidate wins and losses.
   - **Adopt** when the candidate wins at least 2/3 of the poses the idea's spec targets and has no clear loss on any other pose. A possible new best also passes the result-reviewer agent before it is adopted.
3. **Tracking: absolute critic scores.**
   - Two independent Opus critics follow `critic-rubric-v1.md`. They are strict and anchored to AAA games: 8 means a store-page shot.
   - A pose's score is the mean of the 4 axes (detail, character, coherence, brief), averaged over both critics. A zone's score is the mean of its poses.
   - Run them on each adopted best, not on every candidate.

## Poses (`poses-v1.json`)
| Zone | Poses |
|---|---|
| A: Chongqing core | A1 Hongyadong from the river, A2 Hongyadong close, A3 peninsula tip at the confluence, A4 hillside street, A5 Liziba monorail, A6 peninsula from mid-air |
| B: Bund and CBD | B1 Bund light show, B2 CBD street, B3 Bund aerial, B4 among the supertalls |
| G: Global | G1 Nanshan overlook, G2 city-to-water transition, G3 aerial city, G4 cableway over the river |

There are also two motion bursts of 4 frames each: `burst-u12` (street) and `burst-u62` (aerial). They are judged in text for temporal artifacts only, and are excluded from the score JSON.

## Calibration (baseline at commit 84bfb94)
- **Gates:** pass. GPU 9.64 ms average, 11.55 ms p99, 13.34 ms worst; functional 18/18.
- **Pairwise judge on the baseline against itself:** 22/22 ties, so the judge shows no false preference.
- **Two independent critics on the baseline:** mean absolute per-pose difference 0.27, maximum 1.0. Their zone means differ by up to 0.42.
- **Smallest real improvement:** 0.5 points of zone mean, above the noise.

| Zone | Critic 1 | Critic 2 | Baseline (mean) |
|---|---|---|---|
| A | 5.54 | 5.12 | **5.33** |
| B | 5.25 | 5.44 | **5.34** |
| G | 5.06 | 5.19 | **5.12** |

**Goal:** every zone at 8 or more, with no defect above minor.

## How the metric could be gamed, and how that is prevented
- **Fixed cameras could be tuned for.** Ideas that only change things near the fixed cameras would game the pose set. Specs must describe system-level changes, and code review rejects anything keyed to pose coordinates (the only exception is keeping hero sightlines clear, which already exists).
- **Performance gate.** It runs the scripted fly-through across the whole city, not just the poses.
- **Judges.** They never see code, specs or which image is newer.
