# Light-culling counters (2560x1440, mode walk)

Adapter: nvidia lovelace NVIDIA GeForce RTX 4050 Laptop GPU; lights 5385; 14 poses + 120 path points; fuzz 2800 lights x 1 seeds per point

Tests = light tests run by the tile path; thread slots = per 32-thread warp, the busiest thread's tests x 32 (the SIMT cost).

| Where | Disagreeing tiles | Tiles > 256 | Most passing in a tile | Tiles with geometry | Tests | Most tests in a tile | Passing (sum) | Thread slots |
|---|---|---|---|---|---|---|---|---|
| A1 | 0 | 0 | 13 | 11512 | 580672 | 661 | 16559 | 2340512 |
| A2 | 0 | 0 | 6 | 13423 | 311986 | 219 | 19365 | 2012224 |
| A3 | 0 | 0 | 16 | 7989 | 210677 | 250 | 6269 | 979968 |
| A4 | 0 | 0 | 12 | 14339 | 295171 | 130 | 38130 | 2438656 |
| A5 | 0 | 0 | 14 | 12804 | 187809 | 99 | 25309 | 1805376 |
| A6 | 0 | 0 | 18 | 13435 | 228900 | 58 | 8344 | 2057600 |
| B1 | 0 | 0 | 9 | 8751 | 72937 | 31 | 9241 | 988032 |
| B2 | 0 | 0 | 16 | 14190 | 243075 | 81 | 35558 | 1564480 |
| B3 | 0 | 0 | 25 | 11434 | 127700 | 63 | 7229 | 1088000 |
| B4 | 0 | 0 | 5 | 11734 | 44000 | 18 | 638 | 598400 |
| G1 | 0 | 0 | 33 | 10646 | 328584 | 225 | 23336 | 2091072 |
| G2 | 0 | 0 | 14 | 11354 | 204590 | 187 | 4659 | 1074944 |
| G3 | 0 | 0 | 24 | 12733 | 225400 | 141 | 6984 | 1616000 |
| G4 | 0 | 0 | 58 | 10401 | 330280 | 221 | 7647 | 1762592 |

Path points with tiles > 256: 0 of 120; with disagreeing tiles: 0 (only those path rows are listed).
Totals over all 134 frames: disagreeing tiles 0, tiles > 256 0, most passing 58, tests 21920868, thread slots 155731712.

Fuzz: 134 frames, disagreeing tiles 0, tiles > 256 248358, passing lights summed 167813979, tests 1441132081.
