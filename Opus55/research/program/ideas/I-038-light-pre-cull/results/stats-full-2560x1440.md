# Light-culling counters (2560x1440, mode full)

Adapter: nvidia lovelace NVIDIA GeForce RTX 4050 Laptop GPU; lights 5385; 14 poses + 120 path points

Tests = light tests run by the tile path; thread slots = per 32-thread warp, the busiest thread's tests x 32 (the SIMT cost).

| Where | Disagreeing tiles | Tiles > 256 | Most passing in a tile | Tiles with geometry | Tests | Most tests in a tile | Passing (sum) | Thread slots |
|---|---|---|---|---|---|---|---|---|
| A1 | 0 | 0 | 13 | 11512 | 61992120 | 5385 | 16559 | 62256896 |
| A2 | 0 | 0 | 11 | 13418 | 72255930 | 5385 | 39711 | 72564544 |
| A3 | 0 | 0 | 16 | 7996 | 43058460 | 5385 | 9071 | 43242368 |
| A4 | 0 | 0 | 18 | 14340 | 77220900 | 5385 | 45023 | 77550720 |
| A5 | 0 | 0 | 22 | 12804 | 68949540 | 5385 | 45230 | 69244032 |
| A6 | 0 | 0 | 18 | 13438 | 72363630 | 5385 | 12559 | 72672704 |
| B1 | 0 | 0 | 9 | 8747 | 47102595 | 5385 | 9279 | 47303776 |
| B2 | 0 | 0 | 17 | 14190 | 76413150 | 5385 | 35582 | 76739520 |
| B3 | 0 | 0 | 25 | 11434 | 61572090 | 5385 | 8474 | 61835072 |
| B4 | 0 | 0 | 6 | 11728 | 63155280 | 5385 | 789 | 63425024 |
| G1 | 0 | 0 | 41 | 10653 | 57366405 | 5385 | 27439 | 57611424 |
| G2 | 0 | 0 | 40 | 11350 | 61119750 | 5385 | 7508 | 61380800 |
| G3 | 0 | 0 | 24 | 12733 | 68567205 | 5385 | 11560 | 68860064 |
| G4 | 0 | 0 | 62 | 10407 | 56041695 | 5385 | 9491 | 56281056 |

Path points with tiles > 256: 0 of 120; with disagreeing tiles: 0 (only those path rows are listed).
Totals over all 134 frames: disagreeing tiles 0, tiles > 256 0, most passing 65, tests 8766812310, thread slots 8804256448.
