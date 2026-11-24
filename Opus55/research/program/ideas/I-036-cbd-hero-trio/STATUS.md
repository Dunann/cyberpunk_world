# I-036 status (paused 2026-11-24 at the user's request)

Worktree: `C:\Users\pdunc\cyberpunk_world\.claude\worktrees\agent-a412d6f7614772b9b`, branch `idea/I-036` (from main eda1c60). Not pushed. `Opus55/source/node_modules` is a junction to the main checkout's node_modules (gitignored).

## Done
- Built the Braid, Tripod Lantern and Offset Pair with both reviews' fixes (`src/buildings_trio.js`; hooks in `buildings.js`, `buildings_landmarks.js`, `buildings_wgsl.js` LEDBAND flag, dev-only `crowd.js` hook). Every deviation is in `DEVIATIONS.md` (this folder).
- `node build.mjs` and `node build.mjs --dev` succeed.
- **Identity vs main (tools/trio-identity.mjs, dev builds):** parts outside the trio 146,878 / 146,878 identical (tail starts at main's count); lights 5385, signs, lanterns, sign slots, traffic runs (399), cars (25,789), crowd agents (22,707), air paths (32) and tower text all identical. Tower tops and searchlights: x, z, order and personalities identical; only y changes (Braid 581.8 -> 613.8, Tripod 353.2 -> 369.2, tower B top 365.4 -> 370.4, not a beam). Colliders: 13 old trio boxes dropped or cut, 358 new boxes, all within 57 m of a trio site, every new one starting >= g + 8 (twin lobbies keep the old footprint and bottom). `textBlocked` = 0.
- **Held-out quick test captured** (main and candidate, 2560x1440 png, 6 rule-placed cameras H1-H6, t = 45/50; poses in `heldout-poses.json`). **Blind pairs folder:** `C:\Users\pdunc\AppData\Local\Temp\claude\71d1a506b11c03e8\7dd9aef4-6179-4c30-820b-ff3b0f510313\scratchpad\i036\heldout-pairs\` ; **key:** `...\scratchpad\i036\heldout-key.json` (same format as eval/make-pairs.mjs, so `make-pairs.mjs --score <verdict> --key <key>` works). Not judged by me. Notes: H4 is mostly blocked by a near foreground tower (rule placement); H6 (B2-like) is aimed at the Tripod but the Braid stands in front of it, so it mostly tests the Braid at street level.
- `tools/trio-geometry.mjs` (Node, no GPU): 19/20 pass.

## Not done / found
- **Defect to fix:** the Offset Pair's lower bridge (95 m, offset 12 m) still stops just short of tower B at its outer edge (trio-geometry check fails). Fix: lengthen it from hw 32 to about hw 35 (or offset 10 m), then rebuild and rerun `node tools/trio-geometry.mjs`. This changes only that one part; the held-out pairs were captured before the fix (the bridge is a few px in those views).
- **Bench pair not run** (queued GPU job was cancelled before it got the lock). **Functional 18/18 not run.** **Close-up inspection captures (out/inspect-poses.json: Tripod, Pair, Braid crown/base, Pair crown) not run**; the Tripod and Offset Pair have not been looked at in a render yet (only the Braid: it reads as a smooth double helix with LED bands and edge strips, crown bridge, lantern and beam in H1, H3, H5).

## Next steps (exact)
1. Fix the lower bridge (above); `node tools/trio-geometry.mjs` must print "all passed".
2. `node build.mjs --dev && node build.mjs`; copy `out/dev.html` to `out/cand-dev.html` (main dev build: `scratchpad\i036\main-dev.html`, copy to `out/main-dev.html`; built from `git archive main` plus the same dev crowd hook).
3. Under the GPU lock, one job at a time: inspection captures `node tools/capture.mjs --file out/cand-dev.html --poses-file out/inspect-poses.json --jpg --out out/inspect` and check the Tripod and Pair for floating/detached parts; bench in alternating pairs `node tools/bench.mjs --file out/main-dev.html --out out/bench-main1`, then cand, main, cand (gate avg <= 11, p99 <= 16.7, max <= 25; reject runs with TAA p99/avg > 1.15); `node tools/functional.mjs --file out/cand-dev.html` (18/18).
4. Rerun `tools/trio-identity.mjs --dump` for the candidate and `--compare` against `scratchpad\i036\id-main.json`.
5. If the bridge fix is visible in any held-out view, recapture the candidate held-out set and rebuild the pairs (otherwise the coordinator can judge the existing pairs).
6. Commit on idea/I-036 and report.
