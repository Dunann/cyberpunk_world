## Code review round 1 (2026-11-24)

**Branch:** idea/I-018 at e06fc0f (22f0a5e records and dev hooks, 7f9073d compounds, e06fc0f DEVIATIONS and rebuilt index.html)
**Verdict:** pass

The code does what the spec, fixes 1–12 and DEVIATIONS.md say. I reproduced every identity check with my own build and dump: everything outside the replaced tower sections is unchanged. There are no serious problems. Two things are still open but do not change the result: fix 11's bench spread (the eval gate's bench covers it) and the AC density cut, which is larger than the cap needs. The art risk is real: Nan'an gets darker at night, and the anchor cluster on the crest repeats.

### Matches the spec
1. **Height mix per district (fix 2).** My dump of e06fc0f gives the DEVIATIONS numbers exactly:
   - **Yuzhong:** mean 116.6 → 116.6 m; lots over 100 m 358 → 358.
   - **Nan'an:** mean 73.6 → 73.6 m; lots over 100 m 70 → 69.
   - **10 m bands:** every band holding 20 or more lots is within 10%.

   The heights are dealt in sorted chunks per district, with housing and office separate, so the set of heights is kept by construction. Two things to note:
   - **Counted per lot, not per tower.** Fix 2 asked for towers over 100 m. Tower counts change (Yuzhong 716 → 635, Nan'an 282 → 324), so the per-tower figure is not shown. This is minor.
   - **Heights move in space.** They are re-dealt at random between compounds, except for the anchors. All 49 Yuzhong lots of 190 m or more now stand on 17 crest compounds, where before they were spread across the district. This is recorded (deviation 1) and follows the spec's crest rule, but it is a large change in the skyline (see Art).
2. **Accents within ±20% (fix 5).** The claim of ±4% is confirmed: Yuzhong lit crowns 89 → 91, billboard crowns 86 → 86, roof neon 288 → 288, EDGE 96 → 97, CROWNLIT 79 → 80. Nan'an 30 → 31, 31 → 32, 26 → 26, 19 → 20, 0 → 0. EMIT parts 4,877 replaced and 4,774 added.
   - Each accent is one choice per compound (`quota` by key). The `uncapped` test matches `crown()`'s capping rule.
   - `o.neon` changes `roofDress` only when it is defined. Every existing caller leaves it undefined and keeps the `R() < 0.22` draw.
3. **Matched look by seed selection (fix 4), shader unchanged.**
   - No WGSL file is in the diff.
   - The port matches `common.js` `pcg`/`hash11u` and `windowGrid`: `hs`, `hb1` and `hb2` from `u32(seed·13/17/23) + 7/31/57`. In the residential path, `uw = 2 + floor(hs·1.99)`, `wh = 0.46 + 0.16·fract(hs·7.3)` and the colour cuts are 0.32 and 0.64. In the office path, `wh = 0.5 + 0.12·hs` and the cuts are 0.35, 0.6 and 0.85.
   - Seeds are k/16 below 999, so `seed·23` is exact in f32.
   - `seed = P.b.w` is passed to `windowGrid` directly, so the class is what the shader sees.
   - Dev check: 0 class mismatches and 0 seed failures.
4. **Minimum gap (fix 7).** I measured it independently from the compound parts. Over 959 towers and 3,503 tower pairs within 80 m, the smallest clear gap is **0.601 W**. That includes pairs across lots and across streets, with W capped at 24 m so that slab cores do not count as W. No pair is under 0.6 W.
   - Plan area per tower: Yuzhong 497 → 304 m², Nan'an 939 → 310 m² (as reported).
5. **Liziba (fix 8):** lots within 120 m of `MONORAIL_STATION` are kept (9 lots). The nearest replaced tower part is 112 m from the station and 61 m from the A5 camera, behind it.
6. **I-014 exclusion (fix 3).**
   - The selection runs on the parts before the compounds are built. The glyph parts are flagged before compaction and remapped with `map`. A throw guards against a replaced glyph part.
   - So "same glyph towers" holds by construction. The dev re-run on the final list also gives the same 15 glyphs and 6 phrases (`textSame: true`).
   - `textExclusions` copies `blocked()` exactly: the same blocker filter, the `along` window and the perpendicular margin.
   - **Reading of "a blocker for such a face".** They read it as lots in the sight corridor of an unblocked face (a taller compound there would hide a glyph). The reviewer most likely meant the towers that block water-facing faces today (if they were thinned, new front-row towers would appear). Because the selection is pinned and the re-run is identical, the second case cannot change the show. I accept the deviation. It is recorded, along with the measured cost of the stricter reading (396 more lots).
7. **Rules frozen (fix 12).**
   - `rulesHash(RULES)` computed outside the build = **b4c11f80**.
   - The blob of `buildings_compound.js` is 423ae9d8… at both 7f9073d and e06fc0f.
   - No I-018 folder exists in `Opus55/eval/runs`.
   - The hash covers `RULES` only. The blob covers the rest of the logic in that file. Changes to other files are not covered by either, so the evaluator should build from e06fc0f exactly.
8. **Other fixes.**
   - **Fix 6:** the window and turn A/Bs were done on H1 and H5. `fineWindows: false` and `contourTurns: false` are set, and the dev switches work only under `__DEV__`.
   - **Fix 10:** compounds are built after `finishComplex` and `genInfill`. `B.part` and `B.prop` are wrapped to give every part an explicit seed, and `B.light` throws. The prop budget is returned after I-016. Compaction comes last.
   - **Fix 1:** the measurement record is in place (the rule strings in review-1, and `TEXT_MAX` is on main).

### Identity (checked independently)
I built e06fc0f myself; the prod build reproduces the committed `index.html` byte for byte. I dumped the dev build (`compound-identity.mjs --dump`, profile `opus55-I018cr`) twice: once normally and once with `?nocomp`. Results:

| Compare | Result |
|---|---|
| implementer's base1 vs my candidate | ALL 12 CHECKS PASS |
| my `?nocomp` vs my candidate | ALL 12 CHECKS PASS |
| implementer's main.json vs my `?nocomp` | ALL CHECKS PASS (crowd, cars and air paths not in main.json) |

Point by point:
- **Parts:** the full pre-compaction prefix is identical, 147,000 of 147,000. The compacted list is the kept parts plus the compound parts, in order: 135,052 = 147,000 − 37,461 + 25,513.
- **Signs, rng(9137):**
  - Dead slots run every draw, with `dead` set only while they emit.
  - `Cells` takes its sort key and size before the zeroing. `cells.rows` holds the same row arrays as `res.signs`, so the zeroing reaches the GPU rows, and each row keeps its place.
  - Zero-size rows draw nothing: in the face branch `lp` collapses, and in the side branch `gap = 0` for `fascia` rows, so they are culled.
  - 117 dead rows, the only differing rows. 118 compound rows sit in their own cells (group 3, key offset 3e7, after the infill's group 2).
  - Lanterns are identical.
- **Shop lights and light tags:**
  - No `B.light` runs after `towerMark`, so the rng(4242) shuffle is unchanged.
  - Sign lights:
    - `c[9]` is 1 for the complex and 2 for the compounds; `c[10]` marks lights of dead slots.
    - The city pool `!c[9]` is selected exactly as before; the dead-slot lights are then dropped (67).
    - The compound lights come from their own pool, capped at 67.
  - The shared order is the same. The total is 5,385 lights.
  - Side effect: the lights of the complex and the infill now sit 67 indices earlier in `ctx.lights`. This is harmless unless a cluster overflows, and nothing reads light indices.
- **Skybridges:** each `bridgeRecs` entry covers exactly the 2 parts that `skybridges()` adds. A bridge is removed when either of its towers is in a compound: 295 removed, 156 added.
- **Crowd (8080/9191), cars (31337/31338), air paths, `cbdCorridors`:** identical. Colliders: 1,700 removed and 2,367 added, nothing else changed.
- **I-015:** the lots near the complex are excluded, and `sites.stilts.ranges` is read only before compaction (no later reader in the code).
  - Note: `hyd-identity.mjs` on I-018 reads `devParts`, which is the pre-compaction list. Its "145,694 same, 0 different" is therefore true by construction. The compacted list is verified by `compound-identity` instead.
- **I-016:** infill stats and `fixedPrefix` are identical. Infill lots are not in `world.lots`, so they are never candidates.
- **Tower text:** identical (15 glyphs; 不夜城, 江上月, 两江, 山水城, 大江, 山城). `textMap` is built on the compacted indices.

### Other checks
- **Per-frame work:** all new work runs at init. `signs.js` changes only init code, and `Cells.cull` is untouched. No per-frame allocation was added.
- **WebGPU:**
  - `partBuf` and `textMap` are sized from the compacted `P.count`, and `compactParts` copies whole 24-float rows.
  - My run of `functional.mjs` on the dev build gives **18/18**, including "no WebGPU errors" and the collision check.
- **No eval-pose coordinates:** none in the diff. Nothing in `Opus55/eval/` changed. H5 and H6 use the eval cameras only to stay away from them (692 m and 1,040 m), and they are held-out cameras in tools, not in the code.
- **Merge:** `git merge-tree --write-tree main e06fc0f` → 666eabc, **no conflicts**. Main has not changed `Opus55/source` since the branch point. The merged tree differs from main only in source and `index.html`.
- **Init time:** `compoundStats.ms` = 864 ms in my dev run (claimed about 0.7 s). EVAL.md has no gate for this.

### Problems
- **moderate (open, does not block evaluation): fix 11 is not complete.** Only one alternating bench pair exists (+0.042 ms). There is no main-vs-main spread and no `--stats` per pose. The idea's own +0.15 ms stop rule therefore cannot be resolved yet. The EVAL gate is absolute (≤ 11 ms average against about 9.7 ms), so this cannot change the judged result. The evaluator should still run the remaining pairs, or report the gate bench next to main's, before adoption.
- **moderate: the AC cut is much larger than the cap needs.** AC props on the replaced lots go from **23,582 to 11,364 (−52%)**, while the shaft facade area grows by about 18%. That is about 41% of today's density per unit of facade.
  - Overall, compounds add 11,948 fewer parts than they replace, so most of the budget goes unused.
  - The per-compound factor `k = budget / want × 0.9` overestimates `want` in two ways:
    - it counts window cells hidden inside the other wings, which `acOnPlan` then skips;
    - it adds a 0.9 margin on top.

    So capped compounds place well under their own budget.
  - This follows the spec's rule ("AC density is reduced first") but goes beyond what the rule requires. Facades get plainer at close range: H5, and the watched pose A4, where a replaced tower stands 8 m from the camera's side. At A6, G1 and G3 an AC unit is 1–2 px. Recorded here; no change is needed for this evaluation.
- **minor: accent counts are per tower, but the accent amount grows with the plan.** EDGE, CROWNLIT and the neon line apply to every box of a tower. A cross tower gets 8 corner LED lines instead of 4, and a Y tower up to 12. So the Yuzhong views get brighter, not just regrouped:
  - pixels over 200: H1 +30%, H5 +42%;
  - mean luminance of the changed pixels: H1 63.7 → 69.2, H5 52.8 → 70.4.

  Part of any Yuzhong win is therefore "more neon", not form and grouping.
- **minor: all boxes of one tower share one seed.** The cells of the cross wing's front face and of the flanking faces of the main box have the same index, floor and `fid`, so the lit pattern of the first visible columns repeats between the wings. This is subtle at aerial distances.
- **minor:** the number of towers over 100 m (fix 2b) is reported per lot, not per tower.
- **note: the I-015 identity tool is true by construction on this branch** (see Identity).

### Art (base vs c3 at H1, H2, H5 and H6)
- **Yuzhong (H1, H5):**
  - The candidate is brighter and more ordered: matched groups of lit pyramids and pagodas, more corner LED lines, and denser and slimmer towers.
  - H5 is a clear improvement in "designed place" character. H1 is a slight one.
  - **The crest cluster is a real risk for A6.** In H1 and H5 it is about 14 pencil towers of 190–260 m, packed tight at similar heights with small spire crowns. They read paler and greyer than the warm field in front of them.
  - In a blind judge it can read as a dramatic ridge skyline (it looks like real Chongqing) or as a copy-paste group. The held-out judge named it as a minor defect and still preferred the candidate.
  - The base's few large lit crowns, which are the focal points, are smaller now, because the crowns sit on slimmer towers.
- **Nan'an (H2, H6): plainer and darker at night.**
  - Pixels over 200: H2 −16%, H6 −13%. Pixels over 120: −20% and −12%. Mean luminance of the changed pixels: 67.5 → 63.4 and 60.9 → 57.5.
  - The big lit crowns and the cyan pyramid of the base are gone or smaller. The candidate's mid-ground is a denser field of dim cross towers and dark glass office slabs, with more bare podium deck between them.
  - It reads as more of a real city, and the held-out judge gave H2 and H6 a slight win in both orders. But G1's Nan'an foreground is exactly where the base's "jewel" crowns were.
- **Likely eval outcome:**
  - **A6:** slight win or tie (more neon and order, against the crest-cluster repetition).
  - **G1:** tie, with a real chance of a slight loss (darker Nan'an foreground).
  - **G3:** most likely a tie (1–2 km, fog; from above, slimmer towers show more dark deck).
  - Winning 2 of the 3 is plausible but below even odds, about 35–45%.
  - **Watched poses:** A4 is the one at risk (close replaced tower, fewer AC units). The A5 station lots are kept.

### Checks run
- `node build.mjs` in the worktree: `index.html` unchanged (git clean). `node build.mjs --dev` → `out/cr-dev.html`.
- Through `gpu-run.sh I-018cr`:
  - `compound-identity.mjs --dump` twice (normal and `?nocomp`);
  - `functional.mjs --file out/cr-dev.html` → 18/18.
- `compound-identity.mjs --compare` for base1 vs cr, nocomp vs cr, and main vs nocomp: all pass.
- `rulesHash` recomputed from the source: b4c11f80. Blob check at both commits.
- `git merge-tree --write-tree main e06fc0f`: clean.
- My scripts on the dump: AC and EMIT counts (`ac.js`), gaps between towers (`gap.js`), nearest replaced parts to A4, A5 and the station (`near.js`), and luminance statistics of the held-out shots. Scripts and dumps are in `C:\Users\pdunc\AppData\Local\Temp\claude\71d1a506b11c03e8\7dd9aef4-6179-4c30-820b-ff3b0f510313\scratchpad\i018cr\`.
- Not run: `bench.mjs` (as instructed).
