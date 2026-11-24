# I-023 status (paused 2026-11-24 at the user's request)

Worktree: `C:\Users\pdunc\cyberpunk_world\.claude\worktrees\agent-aa732c021dfa0106c`, branch `idea/I-023`.

| Commit | What |
|---|---|
| 246683a | Judged candidate (held-out pairs round 1). Its `index.html` matches this source. |
| f74a74c | **Work in progress: not built, not run, not tested.** Fix-round shader edits and the cost switch. `index.html` is still the 246683a build. |

## Done
- Recess systems built, with both reviews' fixes and the coordinator's required changes (see `DEVIATIONS.md`).
- Identity check: byte-identical dumps. Functional checks 18/18. Tower phrases render as on main.
- Held-out round 1:
  - Judge A: 3 wins, 2 slight losses (H3, H6), 1 tie.
  - Judge B: 3 wins, 1 clear loss (H6), 2 ties.
  - Inspector's defects are in `defect-inspection-1.md`.
- Old round-1 pairs and key: `heldout-pairs/`, `heldout-key.json`. These must be rebuilt after the fix round.

## Bench so far (ms; main = `out/main.html` from 10a592f, candidate = 246683a dev build)
| Run | Avg | p99 | Max | TAA p99/avg |
|---|---|---|---|---|
| main 1-5 | 9.75 / 9.89 / 9.82 / 9.97 / 9.75 | 11.79 / 12.05 / 11.91 / 12.41 / 11.74 | 13.9 / 15.7 / 14.9 / 16.1 / 13.9 | 1.55 / 1.63 / **1.05** / 1.90 / **1.05** |
| cand 1-5 | 10.03 / 10.09 / 10.05 / 10.13 / 10.06 | **17.51** / 13.26 / 14.54 / 14.13 / 15.38 | 24.2 / 15.7 / 22.1 / 18.5 / 20.5 | 2.04 / 2.23 / 1.91 / 2.02 / 2.08 |

- **Average:** +0.24 ms.
- **p99 and max:** worse in 5 of 5 candidate runs. cand-1 is over the 16.7 ms p99 gate.
- The spikes also show in the maxima of passes the change does not touch (lighting, fog, TAA, SSR).
- **Cause not yet confirmed.** The experiment was set up but not run, because it was waiting for the lock when the pause came.

## Frame-time fix: remaining steps
1. Build the dev version from f74a74c (`node build.mjs --dev`) and fix any WGSL errors from the untested edits.
2. Run the cost experiment under the lock: `scratchpad/i023-exp-bench.sh e1 "main:out/main.html:" "cand:out/dev.html:" "flat:out/dev.html:recess=0"`. `flat` is the same shader with `recessGrid` swapped for the old `windowGrid` (constant switch `RECESS_ON`, set by the dev query `recess=0`).
   - Print the table with `scratchpad/benchtab.ps1 <source dir> e1`.
   - Before each run, check that no other opus55 Chrome (for example `opus55-lightcheck`) is running.
3. Read the result:
   - **If `flat` is clean:** the cost is in the recess path. Reduce its live state, or move residential and office parts into their own pipeline or entry point.
     - One edit of this kind is already in f74a74c: `farRuns` only runs where the far runs show.
   - **If `flat` also spikes:** the cause is the shader's size or compile, not the recess arithmetic.
4. Keep the fix that removes the spikes, after a pixel compare of H1-H6 against the judged candidate. Capture PNGs, and use `out/cand-v1.html`, the saved build of the judged candidate.
5. Re-bench at least 3 alternating pairs in one session, with main clean (TAA p99/avg ≤ 1.15).

## Visual fix round (coordinator's 7 items)
Status in f74a74c: written, **untested**.

| # | Item | Status | Change or next step |
|---|---|---|---|
| 1 | Reveals lit by the room, AO falloff, sides differ | Edited | Own light `0.02 + 0.55*sz^3`. Per-side factor: soffit 1.0, reveals 0.8, sill 0.55. Back wall 0.15. Offices ×0.6. Recess albedo 0.5→0.3 of the wall toward the glass. Reveals already add nothing when the room is unlit. |
| 2 | One bay grid per facade, no tiny-window speckle | Partly | Likely cause: aliasing when the shift footprint is large. `detS` now fades to the exact mean once the shift changes by 0.3-0.7 of a cell per pixel. Check on T5 (CBD office) whether the speckle is gone. If not, look at the office interior panels and the far runs. |
| 3 | Unlit floors keep floor lines; dark reflective glass | Partly | `S.mid = 2` when glass coverage > 0.22 (was 0.5) on unlit windows. Still to do: a spandrel/slab line on the back wall for FINS (open-y) and on unlit RIBBON floors, if T5 still shows merged storeys. |
| 4 | Lit units on the bay grid, no slivers | Edited | Lit state and room now always come from the own bay (open axes no longer take the neighbour's light). |
| 5 | Grazing-angle filtering | Edited | The shift-footprint fade (as in 2). Periodic open-axis glass fades to its mean with the filter width. |
| 6 | Glowing sill props in dark rooms | Edited | The "props" are the laundry layer, which is not I-023's own light. Its 0.02 self-glow now applies only when the room is lit (affects all residential facades). |
| 7 | Overexposed lit ribbon bands | Edited | Lit office glass ×0.85 (near and far). |

- **Tuning cameras:** `tools/i023-cams.mjs --set tune` now also makes T5 (CBD office 60-100 m) and T6 (Jiangbei grazing street view). Regenerate them into a new file, for example `out/i023-tune2.json`; the existing `out/i023-tune.json` has only T1-T4. Tune only on T1-T6.
- **After tuning:**
  1. Re-capture H1-H6 for the candidate only; the main images stay.
  2. Rebuild both pair orders with fresh random X/Y and a new key, using `scratchpad/pairs.py` with a new output folder and key name, and reset the file times.
  3. Rebuild `index.html` (`node build.mjs`), run functional and identity checks, and commit.

## State at pause
- No GPU job of mine is running or queued. The queued e1 bench was stopped before it got the lock.
- No browser of mine is open. The lock is held by another agent (I-042).
- Scratch scripts are in `C:\Users\pdunc\AppData\Local\Temp\claude\71d1a506b11c03e8\7dd9aef4-6179-4c30-820b-ff3b0f510313\scratchpad\`: `gpu-run.sh`, `i023-exp-bench.sh`, `benchtab.ps1`, `pairs.py`, `cmp.py`, `montage.py`, `cover.py`.
- The scratchpad may be cleared, so the next steps above do not depend on it beyond convenience.
