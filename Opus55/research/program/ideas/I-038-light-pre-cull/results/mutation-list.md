# Light-culling counters (2560x1440, mode list)

Adapter: nvidia lovelace NVIDIA GeForce RTX 4050 Laptop GPU; lights 5385; 2 poses + 4 path points; fuzz 2800 lights x 1 seeds per point

Tests = light tests run by the tile path; thread slots = per 32-thread warp, the busiest thread's tests x 32 (the SIMT cost).

| Where | Disagreeing tiles | Tiles > 256 | Most passing in a tile | Tiles with geometry | Tests | Most tests in a tile | Passing (sum) | Thread slots |
|---|---|---|---|---|---|---|---|---|
| A4 | 130 | 0 | 18 | 14339 | 379528 | 162 | 45010 | 676352 |
| G3 | 3 | 0 | 25 | 12726 | 223600 | 141 | 7027 | 422400 |
| u0.1250 | 15 | 0 | 20 | 13204 | 259875 | 120 | 19438 | 521728 |
| u0.3750 | 8 | 0 | 17 | 11409 | 138051 | 126 | 11064 | 419488 |

Path points with tiles > 256: 0 of 4; with disagreeing tiles: 2 (only those path rows are listed).
Totals over all 6 frames: disagreeing tiles 156, tiles > 256 0, most passing 35, tests 1298782, thread slots 2557216.

Fuzz: 6 frames, disagreeing tiles 11399, tiles > 256 17306, passing lights summed 9141962, tests 64747043.
- fuzz disagreement at A4/f0: 4904 tiles
- fuzz disagreement at G3/f0: 1 tiles
- fuzz disagreement at u0.1250/f0: 2356 tiles
- fuzz disagreement at u0.3750/f0: 2723 tiles
- fuzz disagreement at u0.6250/f0: 695 tiles
- fuzz disagreement at u0.8750/f0: 720 tiles
