# Program log (append-only)

- 2026-11-24 06:14 UTC: Program started. Usage budget set: stop at 25% of the 7-day limit (now 1%).
- 2026-11-24: Eval v1 harness written in `Opus55/eval/`: 14 fixed cameras plus motion bursts, a strict critic rubric, a blind pairwise judge, and the run-eval and make-pairs scripts.
- 2026-11-24: Baseline evaluation run: all gates pass. GPU 9.64 ms average, 11.55 ms p99, 13.34 ms worst; functional 18/18.
- 2026-11-24: Noise calibration started: two strict critics on the baseline, plus a pairwise judge comparing the baseline with itself.
