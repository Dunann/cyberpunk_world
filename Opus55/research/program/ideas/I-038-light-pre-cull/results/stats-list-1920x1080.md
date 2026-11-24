# Light-culling counters (1920x1080, mode list)

Adapter: nvidia lovelace NVIDIA GeForce RTX 4050 Laptop GPU; lights 5385; 14 poses + 120 path points; fuzz 2800 lights x 2 seeds per point

Tests = light tests run by the tile path; thread slots = per 32-thread warp, the busiest thread's tests x 32 (the SIMT cost).

| Where | Disagreeing tiles | Tiles > 256 | Most passing in a tile | Tiles with geometry | Tests | Most tests in a tile | Passing (sum) | Thread slots |
|---|---|---|---|---|---|---|---|---|
| A1 | 0 | 0 | 12 | 6561 | 418053 | 797 | 9936 | 484640 |
| A2 | 0 | 0 | 6 | 7640 | 246169 | 173 | 11196 | 412896 |
| A3 | 0 | 0 | 16 | 4601 | 177898 | 324 | 4217 | 228384 |
| A4 | 0 | 0 | 12 | 8132 | 208096 | 134 | 21793 | 381824 |
| A5 | 0 | 0 | 14 | 7263 | 120484 | 132 | 14655 | 283616 |
| A6 | 0 | 0 | 20 | 7634 | 174640 | 100 | 5583 | 286720 |
| B1 | 0 | 0 | 9 | 5031 | 42260 | 34 | 5612 | 164192 |
| B2 | 0 | 0 | 22 | 8063 | 155888 | 97 | 20538 | 331616 |
| B3 | 0 | 0 | 26 | 6507 | 114360 | 74 | 4878 | 194560 |
| B4 | 0 | 0 | 5 | 6689 | 32640 | 20 | 468 | 123520 |
| G1 | 0 | 0 | 36 | 6070 | 284600 | 270 | 15156 | 389440 |
| G2 | 0 | 0 | 19 | 6487 | 190800 | 234 | 3162 | 312960 |
| G3 | 0 | 0 | 30 | 7229 | 197900 | 172 | 5233 | 305920 |
| G4 | 0 | 0 | 39 | 5962 | 206363 | 258 | 5050 | 346272 |

Path points with tiles > 256: 0 of 120; with disagreeing tiles: 0 (only those path rows are listed).
Totals over all 134 frames: disagreeing tiles 0, tiles > 256 0, most passing 50, tests 17819313, thread slots 31322496.

Fuzz: 268 frames, disagreeing tiles 0, tiles > 256 279242, passing lights summed 189839010, tests 1692604986.
