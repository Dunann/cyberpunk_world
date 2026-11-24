# Light-culling counters (2560x1440, mode list)

Adapter: nvidia lovelace NVIDIA GeForce RTX 4050 Laptop GPU; lights 5385; 14 poses + 120 path points; fuzz 2800 lights x 2 seeds per point

Tests = light tests run by the tile path; thread slots = per 32-thread warp, the busiest thread's tests x 32 (the SIMT cost).

| Where | Disagreeing tiles | Tiles > 256 | Most passing in a tile | Tiles with geometry | Tests | Most tests in a tile | Passing (sum) | Thread slots |
|---|---|---|---|---|---|---|---|---|
| A1 | 0 | 0 | 13 | 11512 | 580672 | 661 | 16559 | 699296 |
| A2 | 0 | 0 | 6 | 13417 | 311970 | 219 | 19371 | 610720 |
| A3 | 0 | 0 | 16 | 7993 | 210651 | 250 | 6281 | 308192 |
| A4 | 0 | 0 | 12 | 14340 | 295179 | 130 | 38131 | 596480 |
| A5 | 0 | 0 | 14 | 12800 | 187790 | 99 | 25319 | 483200 |
| A6 | 0 | 0 | 19 | 13435 | 228900 | 58 | 8340 | 419200 |
| B1 | 0 | 0 | 9 | 8750 | 72930 | 31 | 9245 | 280000 |
| B2 | 0 | 0 | 17 | 14190 | 243075 | 81 | 35572 | 553280 |
| B3 | 0 | 0 | 25 | 11434 | 127700 | 63 | 7229 | 265600 |
| B4 | 0 | 0 | 5 | 11728 | 44000 | 18 | 636 | 208000 |
| G1 | 0 | 0 | 34 | 10654 | 328616 | 225 | 23259 | 542528 |
| G2 | 0 | 0 | 14 | 11357 | 204590 | 187 | 4650 | 399936 |
| G3 | 0 | 0 | 25 | 12726 | 225400 | 141 | 7027 | 422400 |
| G4 | 0 | 0 | 54 | 10404 | 330282 | 221 | 7656 | 572800 |

Path points with tiles > 256: 0 of 120; with disagreeing tiles: 0 (only those path rows are listed).
Totals over all 134 frames: disagreeing tiles 0, tiles > 256 0, most passing 54, tests 21920831, thread slots 45525920.

Fuzz: 268 frames, disagreeing tiles 0, tiles > 256 476198, passing lights summed 330903379, tests 2877303497.
