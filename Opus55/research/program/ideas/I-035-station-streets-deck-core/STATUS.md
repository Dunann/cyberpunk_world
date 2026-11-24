# I-035 status (paused 2026-11-24 at the user's request)

- **Worktree:** `C:\Users\pdunc\cyberpunk_world\.claude\worktrees\agent-a80fb7928c4dd136e`
- **Branch:** `idea/I-035`, WIP commit `e0a1e59` (not pushed)
- **No GPU job was run.** No browser was started. The GPU lock was not held by I-035 when work paused (I-042 held it).

## What is done (CPU only, no renderer yet)
- `buildings_gen.js` / `buildings.js`: record data only, with no draws. This covers podium strips with part indices, the stair-street side of terraced podiums, CBD podiums (`B.cbdPods`), and the skybridge and walkway part ranges.
- `src/decksLayout.js` (new) holds the full layout as oriented boxes with material ids, plus people lines and spots, lights, colliders, the ground-darkening raster, sign guard volumes and sign-request positions:
  - **Station streets:** 7 lines and 7.17 km of gallery. Galleries are sliced in 1 m steps: full width, cantilever only where something stands on the roof edge, or cut. The layout also has:
    - stairs between terrace levels (145);
    - links over alleys (64);
    - alley stairs (43; 18 alleys keep their existing stair street);
    - cross-street bridges (18), with the 150 m and lamp rules applied;
    - bridges across the street (23).
  - **CBD core:** 41 lots and 146 faces, 11.8 km of deck, 978 columns, 37 spans and 33 escalators. Gaps between split lots are linked with steps, and dead ends get stairs.
  - **Station exits:** a covered bridge plus a stair and lift tower with a glazed shaft, switchback flights and lit landings.
- `relocateSigns` / `liftScreens` (in `decksLayout.js`) are wired into `placeSigns`. The light candidates are not moved. The `noLight` flag and the `decks` request group are in `signPlace.js`, and `signs.js` has cell group 3 and uses the cached placement.
- **Not yet written:** `decks.js` (mesh, DECK shader, lights, sign brackets, `world.shared.decks.active = true`, sign requests, `placeSigns` cache), the `main.js` entry, the call to `buildDeckLayout` at the end of `buildings.init`, the crowd section (rng 3502/3503), the vegetation filter, the terrain cover binding (binding 13), the `lampSites` publish from `terrainLamps`, and the dev green mode. **The build does not show the decks yet.**

## Review-1 fixes
| Fix | State |
|---|---|
| Street blades/boxes at 7.5-15 m | **Done on the CPU.** Signs that enter any deck volume slide along their wall (38). Otherwise they hang off the gallery edge with brackets (324; their own arms are off). Otherwise both (8). The CPU audit finds **0 sign-to-deck intersections and 0 failures**. Remaining: 21 hung signs found no bracket face within 5 m, so they need a rule (for example a vertical hanger). |
| CBD deck height | **Done.** One rule: deck top = gMin + 10 (the second floor line) on every core lot, and at least 3 m below the podium roof. All 41 lots pass. CPU coverage at B2 is 19.9% (H8 19.5%). The metro walkway is **dropped**. |
| A5 tower in the void, Daping inside a tower | **Done.** Rule: the exit sits at the platform end where the ground is lower, on a free and open side (no lots within 30 m), choosing the shorter drop. Liziba goes east and north, and lands in the dark void right of the tower (CPU coverage at A5 is 4.0%, exit 3.55%). Daping goes west, is not blocked, and is not inside a tower. There is a building-face branch for a blocked site. |
| Cross-street bridges: 150 m and lamp rules | **Done** (38 skipped by the 150 m rule, 0 by the lamp rule). |
| More light, detailed deck material, darker ground | Layout side **done**: 100 Yuzhong lights nearest the stations, 74 CBD deck lights, plus spans, escalators and exits (247 lights in total, more than the spec's 112, so the bench must check them). Material ids are assigned to coffered soffit, lit fascia, paving, glass and 0.15 m LED rails. The R8 darkening raster is built. **The shader and terrain binding are not written.** |
| Everything attached, identical streams, noLight group | No new draws on existing streams. The CPU audit finds 0 intersections with non-host parts, lamps and tracks. The stream identity proof and the in-browser audit are still to do. |

## Results so far (CPU replay; scripts and outputs in `impl-tools/`)
- `audit_out.txt` holds the audit output: 0 intersections of every kind.
- `coverage.json` holds coverage: A4 0.94%, A5 4.0%, B2 19.9%, H7 0.93%, H8 19.5%, H9 0.83%.
- To rerun, put the scripts in the scratchpad `i035impl\` folder next to `..\hcpu.mjs`; `gen.mjs` takes the src path as its first argument.

## Exact next steps
1. Write `src/decks.js`. It builds the mesh from `world.shared.decks.boxes` with world-anchored uvs, 100 m cells, a far LOD, the DECK WGSL with the materials above, a moving cab and a `?decksGreen` dev mode. It adds the lights, pushes the span sign requests (`noLight`, `group: 'decks'`), sets `decks.active`, calls `placeSigns` once, caches the result in `world.shared.signPlacement`, and adds the `res.mounts` brackets to the mesh.
2. Call `buildDeckLayout` at the end of `buildings.init`. Publish `world.shared.lampSites` from `terrainLamps` (both pools). Add `decks` after `lightshow` in `main.js`.
3. Crowd section 5: deck people with rng(3502)/rng(3503). The vegetation filter drops deck footprints after the rng(4242) draws and stamps the mask. Terrain binding 13 uses `deckCoverRegions()` and darkens ao and wet by 0.45 times the mask.
4. Write an identity tool (main against candidate: parts, signs apart from moved rows, light list, crowd prefix, runs, trees) and freeze and hash the constants `K`.
5. GPU work, only through `gpu-run.sh I-035`: build and run functional 18/18; capture 4-6 rule-placed held-out cameras (CBD core street level, Liziba) for main and the candidate into a blind pairs folder with a key; run the bench pair (gate avg ≤ 11, p99 ≤ 16.7, max ≤ 25; reject runs with TAA p99/avg > 1.15).
