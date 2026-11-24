# Leaderboard (eval v1)

**Current best:** baseline + I-014 + I-015 (merges on main, 2026-11-24). Critic zone scores not yet re-run (baseline: A 5.33, B 5.34, G 5.12). GPU 9.51-9.57 ms average.

| Idea | Targets | Pairwise (target wins / clear losses elsewhere) | Gates (GPU average ms) | Decision | Zone A / B / G after |
|---|---|---|---|---|---|
| baseline | — | — | pass (9.64) | — | 5.33 / 5.34 / 5.12 |
| I-014 round 1 (020b679) | B1, A3, A6, G4, G1, G3, A1, G2 | judge 1: 8/8, 0; judge 2: 3/8, 0 | pass (bench deferred) | not adopted; judges disagree, fix round | — |
| I-014 round 2 (7c8592b) | B1 (by declared rule) | judge C: 1/1, 0 (G3, G4 slight losses); judge D: 1/1, 0 | pass (9.57 / 9.51 vs base 9.51 / 9.57) | **adopted**; result review: holds with caveats (gain at B1 only, roughly neutral elsewhere) | pending |
| I-009 round 1 (7dc6eb0) | B1, B3, B4, G1, G3, G4 | judge A: 2/6, 0; judge B: 0/6, 0 | pass | not adopted; fix round | — |
| I-015 round 2 (6cdfcf7) | A1, A2, A3, G2 | judge A: 4/4 (all clear), 0; judge B: 4/4 (3 clear), 0 | pass (9.55 / 9.62 vs main 9.55 / 9.56) | **adopted**; result review: holds with caveats (traffic and crowds reshuffled by a freed street; judge B ran a command) | pending |
| I-009 round 3 (b3d59af) | B1, B3, B4, G1, G3, G4 | judge C: 0/6 (B3 clear loss) | pass | **blocked**: the launch trail loses at every distance; close airships win (u62) | — |
