# Light-culling counters (1707x960, mode list)

Adapter: nvidia lovelace NVIDIA GeForce RTX 4050 Laptop GPU; lights 5385; 14 poses + 120 path points; fuzz 2800 lights x 2 seeds per point

Tests = light tests run by the tile path; thread slots = per 32-thread warp, the busiest thread's tests x 32 (the SIMT cost).

| Where | Disagreeing tiles | Tiles > 256 | Most passing in a tile | Tiles with geometry | Tests | Most tests in a tile | Passing (sum) | Thread slots |
|---|---|---|---|---|---|---|---|---|
| A1 | 0 | 0 | 14 | 5167 | 468748 | 803 | 8296 | 518560 |
| A2 | 0 | 0 | 6 | 6007 | 218512 | 305 | 9054 | 344160 |
| A3 | 0 | 0 | 17 | 3620 | 173810 | 326 | 3521 | 212160 |
| A4 | 0 | 0 | 12 | 6393 | 178787 | 156 | 17377 | 298976 |
| A5 | 0 | 0 | 14 | 5706 | 108158 | 140 | 11749 | 227392 |
| A6 | 0 | 0 | 20 | 6014 | 184630 | 81 | 4598 | 265280 |
| B1 | 0 | 0 | 9 | 3951 | 51628 | 40 | 4425 | 136032 |
| B2 | 0 | 0 | 23 | 6335 | 126082 | 106 | 16141 | 246560 |
| B3 | 0 | 0 | 26 | 5123 | 86300 | 55 | 4052 | 144000 |
| B4 | 0 | 0 | 6 | 5268 | 31020 | 23 | 372 | 97280 |
| G1 | 0 | 0 | 38 | 4765 | 251020 | 270 | 11815 | 338080 |
| G2 | 0 | 0 | 18 | 5107 | 166383 | 250 | 2681 | 260512 |
| G3 | 0 | 0 | 28 | 5690 | 176670 | 199 | 4530 | 265920 |
| G4 | 0 | 0 | 52 | 4696 | 213434 | 275 | 4194 | 313408 |

Path points with tiles > 256: 0 of 120; with disagreeing tiles: 0 (only those path rows are listed).
Totals over all 134 frames: disagreeing tiles 0, tiles > 256 0, most passing 54, tests 16326869, thread slots 26714496.

Fuzz: 268 frames, disagreeing tiles 0, tiles > 256 218717, passing lights summed 149728703, tests 1354966150.
