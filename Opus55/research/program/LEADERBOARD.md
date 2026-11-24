# Leaderboard (eval v1)

**Current best:** baseline + I-014 (merge on main, 2026-11-24). Critic zone scores not yet re-run (baseline: A 5.33, B 5.34, G 5.12). GPU 9.51-9.57 ms average.

| Idea | Targets | Pairwise (target wins / clear losses elsewhere) | Gates (GPU average ms) | Decision | Zone A / B / G after |
|---|---|---|---|---|---|
| baseline | — | — | pass (9.64) | — | 5.33 / 5.34 / 5.12 |
| I-014 round 1 (020b679) | B1, A3, A6, G4, G1, G3, A1, G2 | judge 1: 8/8, 0; judge 2: 3/8, 0 | pass (bench deferred) | not adopted; judges disagree, fix round | — |
| I-014 round 2 (7c8592b) | B1 (by declared rule) | judge C: 1/1, 0 (G3, G4 slight losses); judge D: 1/1, 0 | pass (9.57 / 9.51 vs base 9.51 / 9.57) | **adopted**; result review: holds with caveats (gain at B1 only, roughly neutral elsewhere) | pending |
| I-009 round 1 (7dc6eb0) | B1, B3, B4, G1, G3, G4 | judge A: 2/6, 0; judge B: 0/6, 0 | pass | not adopted; fix round | — |
