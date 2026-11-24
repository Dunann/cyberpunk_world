# I-014 deviations and implementation notes

Branch `idea/I-014`. Code: `Opus55/source/src/buildings_text.js` (new), small additions to `buildings.js` and `buildings_wgsl.js` (cull append + flag bit), unit checks in `Opus55/source/tools/test-text.mjs`.

## Deviations from the spec (I-014 on top of I-010)

1. **Front row is defined per face, not per tower.** A tower qualifies when one of its faces has water in front of it (marched water hit within 30 degrees of the face normal, within 700 m) and no ground-standing building at least 40 m tall stands between that face and the water (lateral band = half the face width + 0.8 x the blocker's half size). The face nearest the water carries the character. Reason: with I-010's single mean water direction, towers whose nearest water was blocked never qualified even when another face looked straight at open water. Elevated parts (skybridges, the Raffles vault) are not blockers.
2. **The 40-tower cap keeps phrases nearest the water first; the fixed seed breaks ties and picks each phrase's text and colour.** The spec lists "a fixed seed" among the selection rules. A purely seeded drop of whole phrases (tried first, judged from participant lists only, before any capture) left out most of the riverfront in favour of towers 400-600 m back on the hills, which is the opposite of "front row". Nearest-water-first is still a fixed rule with no camera input. Result: 40 towers, 11 phrases (Yuzhong 25, Bund 11, CBD 4); 116 towers pass the front-row rule, 113 of them in runs of 2 or more.
3. **No back-row characters.** The spec allows "at most one large character each, or none". I chose none (restraint).
4. **Atlas: one texture-array layer per character instead of a padded shared atlas.** A `rg8unorm` 256 x 256 x N array (N = unique characters in use), full mip chain per layer. Separate layers cannot bleed into each other at any mip level, which is the purpose of the spec's padding requirement. The sign atlas is not touched.
5. **One character per tower, on one face.** I-010 allowed 1-2 lit faces and up to 4 stacked slots; I-014 asks for one character per front-row tower. Each character sits near the top of the chosen part (slot top 0.1 x slot below the part top).
6. **Raffles row towers.** Shape handling does not drop them: rounded rectangles are handled as four flat faces of full projected width (Raffles: 28.2 m slot on the 30 m faces, 22.6 m on the 24 m faces). But the front-row rule excludes three of the four, because along every face direction another tower stands between them and the water (east: the next row tower; north and south: the tip towers and hillside towers). The fourth row tower (215, -68) and both tip towers (150, -170) and (150, 45) take part. No exception was added, since that would be a hand-picked landmark.
7. **Phrases.** Every character has at most 9 strokes. 渝 (12 strokes, flagged by I-010 review 1) is not used, so the spec's example 渝州夜 is not in the list. Lists: 2 characters 山城 江城 两江 天光 大江 月光; 3 characters 不夜城 山水城 江上月 光之城 云中城; 4 characters 山城不夜 江城不夜 千里江山 天下山城. A run longer than 4 towers is split into balanced phrases of 2-4, so two phrases can stand next to each other (in different colours when the seed gives different colours).

## How each required change was handled

1. **Coordinated content:** one phrase per run of front-row towers, one character per tower, ordered left to right for a viewer on the water facing the bank (sorted along right = (D.z, -D.x) of the mean lit direction). Per-phrase colour from warm white, gold, red, cyan. No cross-tower bank canvas.
2. **Readability:** overlay colour blend `one` / `one-minus-src-alpha`, alpha blend `zero` / `one` (AO kept). The shader outputs a dim factor = panel x (0.35 + 0.6 x blurred glyph): windows under the slot are dimmed by about 35%, and almost blacked out around the strokes; then the character is added. No extra passes.
3. **Shapes:** faces come from the generator's shape kind (`kind`, `prm`), not `FLAG.ROUND`.
   - Rectangles, rounded and chamfered rectangles, square polygons: 4 flat faces, width = full projected width.
   - Triangles: 3 faces, edge length, slot centred on the face midpoint. Odd polygons: one face per side.
   - Even polygons (N 6-10), cylinders and ellipses: slot centred on a face or on a marched water direction, slot = 0.75 x diameter (ink about 1.3 x radius). Lobed plans use the inner radius.
   - Twisted and profiled (dome, flare) parts are skipped. Taper: the slot is sized at its top edge, and the shader projects onto the face tangent in world space. Lean: the shader moves the axis with height.
4. **Restraint:** at most 40 towers, at least 100 m tall, hillside/urban/Bund/CBD districts, rule-based, fixed seed.
5. **Timing:** text is always on. During the river show the brightness rises from 1.0 to 1.5-2.0 x with a beat pulse that ripples along the phrase (`F.show`). No other timing.
6. **Distance:** texture-array layers (no bleed); far samples use an explicit LOD from metres per pixel; the facade's `farK` aerial perspective is applied to the overlay. LED quantisation (28 cells per slot) only while a cell is wider than about 5 px (gone by 2.2 px); round LED dots only while a cell is wider than about 10 px (gone by 4 px). So nothing binary is drawn at 1-4 px cells.
7. **Cost:** no new lights. A separate overlay pipeline over the participating parts only (equal-depth test, `discard` outside the panel and on faces that do not face the lit direction). Bench below.

## Measurements

**Participants** (logged in `world.shared.towerText.stats`): 5182 tower groups, 845 at least 100 m tall in the allowed districts, 469 with water within 700 m, 116 front row, 113 in runs of 2 or more, 40 chosen. Phrases: 山水城, 山城不夜 (x3), 云中城, 天下山城, 千里江山 (x2), 江城不夜, 江上月. By district: Yuzhong 25, Bund 11, Lujiazui CBD 4 (the CBD front row facing the Bund: 千里江山). Nan'an, Jiangbei and West Hills lose all their phrases to the cap.

**GPU, full `bench.mjs` fly-through, 2560x1440, alternating candidate and baseline (main) builds on the same machine:**

| Run | Build | Avg | p50 | p99 | Max | gbuffer avg |
|---|---|---|---|---|---|---|
| 1 | cand | 9.25 | 9.10 | 12.89 | 55.98 | 2.46 |
| 2 | base | 9.49 | 9.22 | 19.82 | 38.23 | 2.52 |
| 3 | cand | 10.54 | 9.36 | 24.21 | 40.33 | 2.68 |
| 4 | base | 9.51 | 9.36 | 11.54 | 14.72 | 2.51 |
| 5 | cand | 11.62 | 9.81 | 23.52 | 61.60 | 2.95 |
| 6 | base | 9.56 | 9.42 | 11.77 | 22.40 | 2.52 |
| 7 | base | 9.48 | 9.37 | 11.36 | 13.37 | 2.51 |
| 8 | cand | 9.48 | 9.35 | 11.48 | 13.90 | 2.51 |
| 9 | base | 9.50 | 9.36 | 11.51 | 13.45 | 2.51 |
| 10 | cand | 9.54 | 9.38 | 11.56 | 49.12 | 2.51 |

- In the clean runs (1, 8, 10 against 4, 7, 9) the candidate matches the baseline: average 9.25-9.54 against 9.48-9.51, gbuffer 2.46-2.51 against 2.51. The overlay cost is below the noise (under about 0.05 ms).
- Runs 3 and 5 are slower in every pass (lighting, TAA, SSR, fog all up, not only gbuffer), which points to other load on the GPU at the time; an earlier baseline run on this machine measured 11.70 ms average for the same reason.
- The single-frame maxima (40-62 ms) fall in passes the idea does not touch (run 10: vegetation 40.4 ms, SSR 25.9 ms; gbuffer max 7.35 ms). Baseline run 2 had a 38 ms spike too. The evaluator's quiet-GPU run should settle the max gate.

**Functional:** 18/18 (two earlier candidate runs failed the real-time movement checks while the machine was busy; the baseline passed at that time and the candidate passed 18/18 on two later runs).

**Unit checks:** `node tools/test-text.mjs` (face directions and widths per shape kind, rotation convention, triangle face midpoints, taper sizing, phrase chunking, front-row blocking, water cone).

**Quick test (held-out cameras, not eval poses; times 33 and 113 are not eval capture times).** Images in `Opus55/source/out/held-v1/` of the worktree (candidate `cand-*`, baseline in the scratch copy):
- riverside, on the Great River at (-250, 8, 620) looking north at the peninsula's south front, t = 113 and t = 33: the characters read as deliberate tower signage (山城不夜 in cyan, 山水城 in gold), each sharp, with darkened windows around the strokes.
- Great River at (2200, 10, -1550) looking at the CBD front, t = 33 (show) and t = 113: only 2-3 characters in view; restrained.
- aerial over the Jiangbei bank (1200, 380, -300), t = 113: a few small red characters on the peninsula tip; no clutter.
- far, (-2400, 230, 2300) about 3 km out, t = 113: characters are a few pixels, small coloured marks; no clutter.
- moving burst at about 800 m, (2150, 15, -600) sliding 3 m per frame: 千里江山 across four CBD front-row towers, read left to right; stable across the 4 frames, no crawl or shimmer.
- moving burst at about 1.7-2 km, (-900, 250, 1900): about 15 small characters across the peninsula's south front at different heights. Legible and stable, but this is the view type (G1/G3/G4) where a judge could call it scattered; this is the main risk.

## Round 2 (fix round 1, after the judge findings)

Branch `idea/I-014`, worktree `.claude/worktrees/agent-a31869e89589cb386`. Round 1 was not adopted (judges 8/8 and 3/8). Every change below is a system-level rule; no rule reads a camera position, an eval pose or an eval time.

### Fixes for the six judge defects

1. **Confetti -> one composed sign per phrase.** Selection is rewritten (`choosePhrases`, `bankPhrases`, `fitPhrase` in `buildings_text.js`):
   - a phrase is 2-4 front-row towers of one bank, taken in order along the bank, with **no other front-row tower standing between two characters in the same row** (a tower more than 25 m behind the row is allowed: the "hole" rule);
   - **one size, one height band and one colour** for every character of a phrase;
   - neighbouring characters are 1.3-6 slot sizes apart along the tangent, and evenly spaced (largest gap at most 1.8 x the smallest);
   - towers that cannot join a complete phrase get nothing (no lone characters, as before);
   - candidates are ranked by character area (count x size squared), so fewer, larger, complete phrases win; at most 2 phrases per district and 8 city-wide; phrases on one bank are at least 500 m apart along the bank;
   - **no character is repeated within a district**, and a text already used elsewhere is avoided when another fits (`pickText`).
2. **Reading order.** All faces of a phrase have normals within 25 degrees of each other. Characters are ordered along the tangent T = (D.z, -D.x) of the mean normal D, which is the viewer's right for a camera on the water looking along -D (checked against `math.js fromYawPitch`). Neighbouring face centres may differ in depth by at most 0.45 x their spacing, so the order cannot flip for any view less than ~65 degrees off the normal; beyond that the grazing fade (5) has already removed the characters. Unit tests project the characters through the engine's camera convention from the water, from 250 m up and from 40 degrees either side, and check the order.
3. **Pixelation.** LED cell quantisation is gone. Each character is now a **signed distance field** (256 x 256 per layer, from an exact Euclidean distance transform of a 512 px rendering, range +-12 texels), drawn with a one-pixel anti-aliased edge from the per-axis screen derivatives. Once a pixel covers 1.5-3 texels it blends to a filtered coverage mip (separate channel), so far characters don't alias either. The LED dots remain only as a mild brightness pattern (0.72-1.17) that appears when a cell is wider than 8 px and is gone by 4 px. Texture format is now `rgba8unorm` (R distance, G halo, B coverage); mips are box-filtered in JS.
4. **Cramped or clipped characters.** Only real flat faces carry characters: rectangles (usable width = straight part + half of each rounded or chamfered corner), triangles, and polygons with fewer than 12 sides (exact edge widths, matching `ringEval`). Cylinders, ellipses, lobed plans, twisted and profiled parts are skipped (round 1 wrapped characters round cylinders). The face width at the top and the bottom of the slot (taper included) must be at least 1.2 x the slot (the ink is ~0.87 of the slot, so at least ~0.17 slot of clear face beside the ink on each side), with 0.1 slot of clear part height above and below. Landmark and crown faces take the same test; narrow crowns fail it.
5. **Edge-on smears.** The whole panel (character and window dimming) fades with the per-pixel view angle, `smoothstep(sin 20 deg, sin 30 deg, dot(view, face normal))`: nothing is drawn below ~20 degrees from the face plane, full strength above 30 degrees.
6. **Even sizes.** One slot size per phrase, set by the smallest participating face (`fitBand`); one centre height per phrase, as high as the lowest participating part top allows.

### Other changes
- **Front-row blockers now include towers on podiums.** Round 1 only counted towers standing on the ground, so a tower whose shaft starts on a separate podium did not hide the face behind it (seen in a held-out view: a character hidden behind such a tower). A blocker now reaches 40 m above the ground and either stands on the ground or has at least 40 m of its own height (skybridges and the 30 m vault garden still don't count).
- **Slot base** at least 40 m above the ground (was 25 m), so trees and low buildings in front cover less of the band.
- `TEXT_MAX` moved to `buildings_wgsl.js`, and the WGSL `TEXT_STRIDE` is generated from it (code-review minor 1). For triangle and polygon faces the slot offset `uC` is scaled by the taper at the slot height (code-review minor 3).
- Rejection counts per rule are reported in `world.shared.towerText.stats.reject`; the chosen phrases (centre, normal, size) in `world.shared.towerText.phrases`.
- No random stream touched (selection uses only `hash01` with the fixed seed, as before). No per-frame allocations added; the per-frame work is unchanged (same overlay pass and draw lists; the fragment shader still takes two glyph samples).

### Result
`world.shared.towerText.stats`: 5182 tower groups, 845 tall in the allowed districts, 469 with water in reach, 101 front row, 33 valid candidate phrases, **6 phrases on 15 towers** (round 1: 11 phrases on 40 towers).

| Phrase | District | Faces | Size (m) | Band centre y (m) |
|---|---|---|---|---|
| 不夜城 | Lujiazui CBD, south front | facing -z | 23.5 | 75 |
| 江上月 | Lujiazui CBD, west front (facing the Bund) | facing -x | 22.4 | 188 |
| 两江 | The Bund | facing +x | 21.4 | 72 |
| 山水城 | Yuzhong, north bank | facing (0.31, -0.95) | 16.2 | 135 |
| 大江 | Yuzhong, south bank | facing (-0.31, 0.95) | 17.9 | 102 |
| 山城 | Nan'an | facing (-0.20, -0.98) | 17.3 | 127 |

Main rejection reasons: hillside towers stand at different ground heights and tops, so a common band often doesn't exist (201 pruned pairs), and neighbouring faces point different ways (112). Yuzhong faces are ~20 m wide, so its characters are 16-18 m.

### GPU cost
Full fly-through (`bench.mjs` logic, 60 s at 2560x1440 High; run through a copy that only changes the Chrome profile to `opus55-I014b`), alternating the candidate with a main build (`7907932`, whose source equals the merge base). Each run started only after the GPU had been under 15% for a minute with no other agent's browser open; the last column says whether another agent's browser was open when the run ended.

| Run | Build | Avg | p50 | p99 | Max | gbuffer avg | Others at end |
|---|---|---|---|---|---|---|---|
| 1 | cand | 9.62 | 9.41 | 13.44 | 33.20 | 2.54 | none |
| 1 | base | 9.61 | 9.42 | 13.73 | 33.58 | 2.54 | yes |
| 2 | cand | 9.54 | 9.40 | 11.47 | 13.40 | 2.53 | none |
| 2 | base | 9.51 | 9.39 | 11.37 | 15.35 | 2.52 | none |
| 3 | cand | 9.49 | 9.35 | 11.49 | 13.39 | 2.50 | none |
| 3 | base | 9.47 | 9.36 | 11.34 | 13.15 | 2.50 | none |
| 4 | cand | 13.40 | 10.36 | 23.02 | 25.02 | 3.28 | yes (discard) |
| 4 | base | 10.85 | 9.33 | 25.26 | 34.67 | 2.68 | yes (discard) |
| 5 (shared GPU lock) | cand | 9.56 | 9.44 | 11.50 | 12.86 | 2.52 | lock held |
| 5 (shared GPU lock) | base | 9.61 | 9.49 | 11.62 | 13.85 | 2.55 | lock held |

TAA p99/average: 1.05-1.06 in pairs 2, 3 and 5; 1.77-1.79 in pair 1 and above 3 in pair 4, so pairs 1 and 4 are rejected as shared-GPU runs. Pair 5 was run under the coordinator's shared GPU lock (`gpu-run.sh`). Clean pairs 2, 3 and 5: candidate 9.54 / 9.49 / 9.56 ms against baseline 9.51 / 9.47 / 9.61 ms average; p99 11.47 / 11.49 / 11.50 against 11.37 / 11.34 / 11.62; max 13.40 / 13.39 / 12.86 against 15.35 / 13.15 / 13.85; gbuffer 2.53 / 2.50 / 2.52 against 2.52 / 2.50 / 2.55. The differences (under 0.05 ms either way) are within noise. All runs are within the gates (11 / 16.7 / 25 ms).

**Functional:** `node tools/functional.mjs` under the GPU lock: 18/18. **Unit checks:** `node tools/test-text.mjs` passes (rewritten for the round-2 rules: faces per shape, margins, one band, reading order through the engine's camera convention, normal/depth/spacing/hole rejections, per-district character rules, distance field).

### Held-out views (all tuning used only these; no eval pose or eval time was captured)
Tool: `node tools/text-views.mjs` (new). Images in `Opus55/source/out/held-v2/` of the worktree: `r1-*` = round-1 build (020b679), `cand-*` = round 2, same cameras, t = 113 unless named (`stale/` holds an outdated set; ignore it).
- **Per-phrase views chosen by rule**, from each phrase's centre C and mean normal D: `water` C + D x (water distance + 250 m), 15 m up; `near` C + D x 200 m at band height; `aerial` C + D x 600 m, 250 m up (the water-side aerial requested for this round); `oblL`/`oblR` the aerial turned 40 degrees about C; `graze` turned 72 degrees (~18 degrees from the face plane). The cameras are saved in `cand-phrase-views.json` and replayed on the round-1 build. p0 不夜城, p1 江上月, p2 两江, p3 山水城, p4 大江, p5 山城.
- **Round-1 fixed held-out cameras** (positions from round 1; yaw and pitch re-derived in the tool, so they are close to but not identical with the round-1 images): river, bund, aerial, far at t = 113 and 33, and the two moving bursts (3 m per frame).

What they show:
- Reading order: every phrase reads left to right in its water, aerial and both oblique views (for example `cand-p1-aerial`, `cand-p1-oblL`, `cand-p1-oblR`: 江上月).
- Composition: each phrase is one row of equal characters in one colour at one height. The round-1 views of the same places (`r1-p4-aerial`, `r1-p4-oblL`, `r1-burst1700-0`) show 10-15 characters of mixed size, height and colour scattered over the peninsula's south front; round 2 shows only 大江 there.
- Smoothness: `cand-p1-near` (江上月 at 200 m, ~90 px characters) has smooth, straight strokes; the same camera on round 1 (`r1-p1-near`) shows stair-stepped LED cells, and a large 江 next to a smaller 山 squeezed onto a narrow tower edge.
- Grazing: `cand-p*-graze` show no characters and no bright strips; `r1-p1-graze` has a bright smeared strip.
- Restraint: the far and aerial fixed views now show almost no text (round 1 had small coloured marks). This is the intended trade (fewer, larger, complete phrases), but wide views such as the G poses gain less than in round 1.

### Risks for the reviewer and the judges
- Far fewer characters; wide aerial and far views gain little from the idea now. CBD characters are 22-24 m on 38-46 m faces, because the smallest face in each phrase sets the size.
- The two CBD phrases face different rivers (south and west), so they rarely appear together; the Bund phrase and the CBD west phrase face each other across the river.
- From a camera at water level close to the bank, tall trees on the bank can still cover the lower part of a low band (seen on 不夜城 in an earlier water-level view).
