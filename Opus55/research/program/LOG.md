# Program log (append-only)

- 2026-11-24 06:14 UTC: Program started. Usage budget set: stop at 25% of the 7-day limit (now 1%).
- 2026-11-24: Eval v1 harness written in `Opus55/eval/`: 14 fixed cameras plus motion bursts, a strict critic rubric, a blind pairwise judge, and the run-eval and make-pairs scripts.
- 2026-11-24: Baseline evaluation run: all gates pass. GPU 9.64 ms average, 11.55 ms p99, 13.34 ms worst; functional 18/18.
- 2026-11-24: Noise calibration started: two strict critics on the baseline, plus a pairwise judge comparing the baseline with itself.
- 2026-11-24: Pairwise judge bias check: baseline against itself gave 22/22 ties (no false preferences).
- 2026-11-24: Critic calibration: per-pose mean abs diff 0.27, zone means within 0.42. Smallest real change set to 0.5. Baseline zones A 5.33, B 5.34, G 5.12. Eval v1 frozen (tag eval-v1).
- 2026-11-24: Loop started. Generators: I-001..003 (Fable xhigh, break an assumption: city continuity/waterfront), I-004..006 (Opus, attack the weakness: buildings/Hongyadong), I-007..009 (Opus, wild card: signage/technology).
- 2026-11-24: I-007, I-008, I-009 proposed (signage/technology generator). Reviews starting.
- 2026-11-24: I-007 rejected (5.5): cross-tower text would fragment; most target poses outside show window. Revision requested as I-010.
- 2026-11-24: I-004 rejected (5.83): terrace plan doesn't fit the 86 m, 66 deg cliff; solver ignores clearance above; plaza vs Raffles radius. Revision requested as I-011.
