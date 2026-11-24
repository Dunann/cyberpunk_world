# I-018 planned compounds: implementation notes and deviations

Branch `idea/I-018`. The generator is `Opus55/source/src/buildings_compound.js`. Small additive edits are in `buildings_gen.js` (records only, no random draws), `buildings.js`, `buildings_text.js` (two constant sets exported), `signPlace.js`, `signs.js`, plus dev-only identity hooks in `crowd.js`, `trafficCars.js` and `air.js`. The identity tool is `tools/compound-identity.mjs`.

## Frozen rules (fix 12)
- Frozen after the held-out A/B tests and before any eval-pose capture.
- `RULES` hash (`rulesHash()`, also printed as `world.shared.compoundStats.rulesHash`): **b4c11f80**.
- Git blob of `buildings_compound.js` at freeze: **423ae9d8834cefb2cf63d571f93e60bb57d4cc9d**.
- The eval capture must be built from this. Any change to `RULES` or to that file voids the run.

## Held-out cameras (all tuning was done on these only)
- H1 and H2 come from the spec (`heldout-cameras.json`).
- H5 and H6 were added by a rule: 450 m from the centroid of each district's compound lots, at the 8-way compass bearing farthest from every eval camera, 180 m above the ground, aimed 40 m above the centroid's ground.
  - **H5:** pos (-472, 180 rel, -199), target (-922, 159, -199). It is 692 m from the nearest eval camera.
  - **H6:** pos (1011, 180 rel, 1744), target (693, 63, 1426). It is 1040 m from the nearest eval camera.
- The cameras are recorded in `heldout-cameras-implementer.json`.
- No eval pose was captured or viewed before the freeze.

## Blind checks (fresh judge per check, `pairwise-judge-v1.md`, both X/Y orders, file times reset, keys kept outside the judge folders)
| Check | Pairs | Result | Decision |
|---|---|---|---|
| (a) Form and grouping (today's windows, no turns) vs main | H1, H2, H5, H6, each in both orders | Candidate won **8/8**: H1 slight in both orders, H2 slight in both, H6 slight in both, H5 clear in both. Judge's named minor defect: the far "pencil-tower" crest cluster repeats at similar heights | Quick test **GO** |
| (b) Finer windows (1.9-2.4 m) vs today's windows | H1 and H5, both orders | Finer windows **lost 4/4**: H1 clear in both orders, H5 slight in both. "Distant facades break into a coarse, blotchy mosaic" | **Off.** Today's window ranges are kept (2.8-4.4 m Yuzhong, 3-4.5 m Nan'an) |
| (c) Contour turns vs none | H1 and H5, both orders | **4/4 ties.** Turns were applied to 170 Yuzhong and 23 Nan'an compounds, but by small angles, since the fit reduces the angle rather than shrinking a wing | **Off** (no win) |

## Deviations from the spec, with reasons
1. **Heights (fix 2).**
   - The spec gives every tower of a compound one floor count drawn per compound, with fixed Nan'an ranges.
   - Instead, each district's replaced lots keep their heights as a set: the lot's tallest tower top above its lowest ground, with housing and office kept separately.
   - Compounds are sorted by a per-compound key, and each takes the next contiguous chunk of the sorted heights, one value per lot. Within a compound the lowest lot gets the lowest value of the chunk, so roofs step up the slope. Floor counts stay within ±3 floors of the compound median, as the reviewer suggested ("step floors by ±1-3 along the slope").
   - With one floor count per compound, the 10 m bands moved by up to 50%. With this rule they stay within 10% wherever a band holds 20 or more lots.
   - **Anchors:** in Yuzhong, the lots of today's tall share (at least 190 m above ground, about 7.8%) go only to crest compounds, meaning blocks in the top 15% of ground height. The tallest crest compounds take them first, so the anchors come out of the existing share.
2. **Nan'an low-rise** keeps its share automatically, through the same height dealing.
3. **I-014 exclusion (fix 3).**
   - The selection is made on the parts before the compounds are built. The glyph parts are flagged before compaction and remapped after it, so the selection cannot change.
   - Kept lots:
     - `textFront`: lots holding a tower, at any height, with an unblocked water-facing face within `RULE.reach`.
     - `textCorridor`: lots standing in the sight corridor between such a face and the water.
   - I read "a blocker for such a face" as the towers in front of an unblocked face, which is the corridor.
   - A first build also kept every blocker of every water-facing face of the towers of 100 m or more. That kept 396 more lots (46% of the candidates). It was not needed: the dev re-run of the full selection on the final part list gives the same 15 glyphs and 6 phrases without it.
4. **Accents (fix 5).**
   - The spec gives the lighting scheme by fixed shares (40/30/20/10%). Instead, the shares follow the baseline: per district, the compounds with the highest key for each accent take it until the count of today's replaced lots is reached. The accents are lit crown, billboard crown, roof neon line, EDGE and CROWNLIT.
   - Lit and billboard crowns go only to compounds whose crowns are not capped by the lot height cap.
   - The roof neon target is parapet lines plus `roofDress` neon edges. Compounds draw one parapet line around the whole plan outline, and `roofDress` neon is switched off for them through the new `o.neon` option. Other callers draw exactly as before.
   - The crown list keeps `lit` and `billboard` so that their counts are kept.
5. **Plan sizes.**
   - Every face length is a whole number of window cells (W = nC·c, wing depth = (nC − 2m)·c, with m = round(0.22·nC) ≥ 1), so the junctions fall on piers. This gives notches of 0.11-0.25 W, not exactly 0.25 W.
   - Y towers are three boxes from the centre, with no separate core.
   - Square Nan'an lots of 62 × 62 m hold a 2 × 2 grid of point towers, because that is what fits with the 0.6 W gap.
   - Office campuses use rounded slabs of W × 0.7 W, in a grid by the same rule.
6. **Gap (fix 7).** The gap between towers is at least 0.6 W, within a lot and across lots. Internal lot edges are inset by max(1.5, (0.6 W − 4)/2), and street edges by 1.5 m.
7. **Window classes (fix 4).**
   - `hash11u` is ported to JS with f32 rounding emulated. Seeds are multiples of 1/16 below 999, which are exact in f32.
   - A tower matches its compound's class when:
     - it has the same apartment width (res) and the same light-colour class;
     - |Δhs| ≤ 0.08, |Δwh| ≤ 0.03 and |Δhb1| ≤ 0.1;
     - it is at least 0.003 from every class boundary.
   - The dev check found 0 mismatches and 0 seed failures. The facade shader is unchanged.
8. **Liziba (fix 8):** lots whose centre is within 120 m of `MONORAIL_STATION` are kept (9 lots).
9. **Landmarks:** lots whose centre is within r + 60 m of `raffles`, `ridge` and `beacon` are kept (27 lots).
10. **Complex:** lots within 60 m (plus half the lot diagonal) of any Hongyadong complex part are kept. No lot was close enough.
11. **Merge order with I-016 (fix 10).**
    - Compounds are generated after `finishComplex` and `genInfill`, and compaction runs after both.
    - Every part a compound adds gets an explicit seed (`B.part` and `B.prop` are wrapped).
    - The prop budget is returned after I-016 has run.
    - I-016 infill lots are not candidates, since they are not in `world.lots`.
12. **REPLACED flag.** The spec's flag bit 20 is a side mask instead (`Uint8Array`). The replaced parts' data stays untouched in the full list, which is what lets the identity checks compare it index by index.
13. **Dead sign slots.**
    - Their draws run as before. Their rows stay in their cells and are zeroed in size, so every other row keeps its place.
    - Their selected lights are dropped after `selectLights`: 67 lights.
    - The compound billboard slots are tagged `comp` and placed after every other slot. Their rows get their own cells, and their lights come from their own pool, capped at the number dropped. The total light count is unchanged at 5,385.
14. **Part cap.** A compound adds no more parts than it replaced. AC density is reduced first: 291 of 442 compounds hit the cap. The part list goes from 147,000 to 135,052 parts.

## Measured (final build, frozen rules)
- **Lots:** 913 (631 Yuzhong, 282 Nan'an) in 442 compounds.
- **Kept by rule:** textFront 84, textCorridor 46, landmark 27, station 9.
- **Parts:** 37,461 replaced (32,363 of them props) and 25,513 added. Net −11,948.
- **Skybridges:** 295 removed, 156 added.

### Height mix (per lot: tallest top above the lot's lowest ground)
| District | Mean (main → I-018) | Lots over 100 m (main → I-018) |
|---|---|---|
| Yuzhong | 116.6 → 116.6 m | 358 → 358 |
| Nan'an | 73.6 → 73.6 m | 70 → 69 |

Yuzhong, lots per 10 m band:

| Band (m) | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100 | 110 | 120 | 130 | 140 | 150 | 160 | 170 | 180 | 190 | 200 | 210 | 220 | 230 | 240 | 250 | 260 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| main | 2 | 36 | 48 | 42 | 50 | 55 | 40 | 35 | 47 | 39 | 44 | 33 | 41 | 28 | 29 | 13 | 5 | 6 | 5 | 6 | 11 | 8 | 6 | 2 |
| I-018 | 1 | 34 | 52 | 42 | 48 | 56 | 40 | 36 | 46 | 40 | 44 | 33 | 39 | 28 | 29 | 14 | 6 | 5 | 5 | 8 | 9 | 8 | 6 | 2 |

Nan'an, lots per 10 m band:

| Band (m) | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100 | 110 | 120 | 130 | 140 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| main | 2 | 32 | 36 | 49 | 45 | 16 | 15 | 17 | 16 | 21 | 24 | 8 | 1 |
| I-018 | 3 | 31 | 36 | 50 | 45 | 16 | 14 | 18 | 15 | 19 | 25 | 9 | 1 |

Every band holding 20 or more lots is within 10%. Bands with fewer lots move by 1-2 lots; whole compounds cannot hold those to 10%.

### Accents (towers on the replaced lots, main → I-018)
| District | Lit crowns | Billboard crowns | Roof neon lines | EDGE | CROWNLIT |
|---|---|---|---|---|---|
| Yuzhong | 89 → 91 | 86 → 86 | 288 → 288 | 96 → 97 | 79 → 80 |
| Nan'an | 30 → 31 | 31 → 32 | 26 → 26 | 19 → 20 | 0 → 0 |

All accents are within ±4% (the limit is ±20%). The crowns sit on slimmer towers, though, so each accent is smaller in area than before.

### Towers and plan area (fix 7)
| District | Towers (main → I-018) | Plan area per tower (m²) | Plan area per lot (m²) |
|---|---|---|---|
| Yuzhong | 716 → 635 | 497 → 304 | 564 → 306 |
| Nan'an | 282 → 324 | 939 → 310 | 939 → 357 |

The "slender" claim holds with real numbers: plan area per tower is −39% in Yuzhong and −67% in Nan'an. The other side of this is more visible podium deck from above.

### Plans
- **Yuzhong:** cross 303, stepped 126, Y 98, slab 108.
- **Nan'an:** cross 105, stepped 43, Y 34, slab 29, office 113.

## Identity (fix 9 and fix 10)
`tools/compound-identity.mjs --compare base1.json c3.json`, where base1 is main plus the no-draw records and the dev hooks:

- **Parts:**
  - The full list before compaction is identical to the baseline at every index: 147,000 of 147,000.
  - The compacted list equals the baseline minus the replaced indices, in order, followed by the compound parts.
- **Sign slots:** the existing slots are identical, with 117 flagged dead. 118 compound slots come after them.
- **Sign rows:** only the 117 dead rows differ, and only by their zeroed size. Lanterns are identical.
- **Lights:** the shared lights keep their order. The 67 dropped dead lights are replaced by 67 compound billboard lights.
- **Colliders:** the 1,700 colliders of replaced parts are removed and 2,367 compound colliders added. Nothing else changes.
- **Crowd (rng 8080 and 9191), cars (rng 31337 and 31338), air paths and `cbdCorridors`:** identical.
- **Tower text:** the pinned selection is identical (15 glyphs; phrases 不夜城, 江上月, 两江, 山水城, 大江, 山城). The dev re-run on the final list gives the same result too (`textSame: true`).
- **I-016 infill stats and fixed prefix:** identical.

Further checks:
- **Same comparison with `?noplan` on both builds:** all checks pass. The compound parts are identical with and without the plan (25,513 of 25,513), and so are the lots kept by rule.
- **Instrumented baseline vs main (`base-dev.html`):** identical in parts, signs, lights, slots, colliders, text, infill and fixed prefix.
- **`tools/hyd-identity.mjs` main vs I-018:**
  - 145,694 parts outside the complex are the same, with 0 different.
  - The 1,306 complex parts lie inside the box.
  - 117 sign rows differ (the dead rows) and 118 rows are extra.
  - Lanterns are identical.
  - Lights: 67 differ on each side, and the shared order is the same.
  - Colliders: 1,700 and 2,367, as above.
  - `lateStartEqualsBaseCount` is false. That field is specific to I-015's comparison against the build before I-015.

## Performance
**The bench is incomplete.** One alternating pair finished, through the GPU lock, with dev builds and profile `opus55-I018`:

| Run | GPU avg | p99 | max | TAA p99/avg | gbuffer | bld-cull | lighting |
|---|---|---|---|---|---|---|---|
| main (`base-dev.html`) | 9.690 | 11.71 | 13.27 | 1.055 | 2.589 | 0.173 | 3.553 |
| I-018 | 9.732 | 11.80 | 13.68 | 1.053 | 2.598 | 0.167 | 3.577 |

- The difference is **+0.042 ms** on the average (the limit is +0.15 ms). Both TAA ratios are below 1.15, so the pair is valid. There were no WebGPU errors.
- The remaining pairs and the main-vs-main spread run (fix 11) were stopped by the system for low memory, and were not restarted. Fix 11's standard-error condition (under 0.05 ms) is therefore **not yet shown**: at least 2 more alternating pairs and a main-vs-main pair are still needed.
- The per-pose `--stats` (gbuffer and total at A6, G1, G3, H1 and H2) were not run either. They should be run after the freeze, at eval-capture time.

Other checks:
- `node tools/functional.mjs`: **18/18**.
- Both builds succeed.
- No per-frame allocations were added: all compound work runs at init.

## Notes for the code reviewer
- Generation time grows by about 0.7 s (`compoundStats.ms`). Most of it is the tower grouping and the front-row scan. It runs at init only, and nothing is allocated per frame.
- **Contour turns** remain in the code behind `RULES.contourTurns = false`, and can be switched on in dev with `?cmpturn=1`. Finer windows work the same way, with `?cmpwin=fine`. `?nocomp` switches the compounds off in dev builds.
- **Fix 1:** the reviewer's rule strings are recorded in `review-1.md`, as is the I-014 commit (2eddd37) that the coverage was measured against.
  - `TEXT_MAX` is now in main's `buildings_wgsl.js`, so no patch line is needed.
  - The coverage for the plan rule as written is A6 48.8% and G1 14.3% (review-1).
  - The final rule replaces 913 lots, not 1,002: the Liziba rule and the any-height front-row rule keep more lots. Coverage was not re-measured on eval poses, to keep them unseen before the freeze.

## Round 2 (judge-driven fix round)
Both judges preferred main at A4 and on all four frames of the street burst. The candidate had removed skybridges across the street end, and some crowned towers (Art Deco gold spire, gold crown, pink-striped crown). Two world rules were added. No art rule changed.

### The two new rules
1. **Skybridge anchors (`keepBridgeAnchors`).**
   - Every lot holding either tower of a skybridge, as recorded by `skybridges()` (rng 5150, `B.bridgeRecs` hill-tower indices), is kept as it is.
   - Walkways need no extra rule: they hang between podiums, which are never replaced, and their parts sit outside every replaced range.
   - New dev check `compoundStats.skybridges`: **320 of 320 skybridges intact**. That means both anchor lots are not replaced and neither of the bridge's two parts is masked. `bridgesRemoved` is now 0.
2. **Distinctive crowns (`keepCrowns: lit, pagoda, spire, helipad, antenna`).**
   - A lot is kept when any tower on it got one of these crown kinds, as recorded by `crown()` after the height cap.
   - These are the crowns with their own silhouette: the stepped up-lit crown with fins (the "Art Deco gold" and "pink-striped" crowns are this kind), the pagoda roof, the spire, the helipad and the single antenna mast.
   - The plant and roof kinds stay replaceable: machine, antennas, setback, garden, and billboard. Billboard counts are already held by the accent quota.

### Frozen rules
- `RULES` hash **0ca424cb** (was b4c11f80; only the two keys above were added).
- `buildings_compound.js` blob **fbde01954dd5147f8134c60468f1b49d17a190da**.

### Lots kept, by reason
Out of 1,079 candidate tower lots in Yuzhong and Nan'an:

| Reason | First reason per lot | Each rule's own count |
|---|---|---|
| Skybridge anchor | 409 | 431 |
| Distinctive crown | 181 | 294 |
| textFront | 47 | 88 |
| textCorridor | 28 | 48 |
| Landmark | 27 | 27 |
| Station | 9 | 9 |
| Complex | 0 | 0 |

- **Replaced:** 378 lots (Yuzhong 186, was 631; Nan'an 192, was 282) in 278 compounds.
- **Parts:** 12,883 replaced and 8,436 added. Final list 142,553 parts (main 147,000).
- **Crown kinds on the candidate lots**, for reference: machine 281, setback 158, garden 150, billboard 147, antennas 139, lit 138, pagoda 130, spire 14, antenna 11, helipad 8.

### Height mix (per lot, main → I-018)
| District | Mean | Lots over 100 m |
|---|---|---|
| Yuzhong | 109.8 → 109.7 m | 99 → 99 |
| Nan'an | 72.1 → 72.0 m | 46 → 46 |

Every 10 m band is within 2 lots of main.

### Accents on replaced lots (main → I-018)
| District | Lit crowns | Billboards | Roof neon lines | EDGE | CROWNLIT |
|---|---|---|---|---|---|
| Yuzhong | 0 → 0 | 33 → 34 | 91 → 91 | 29 → 30 | 31 → 31 |
| Nan'an | 0 → 0 | 31 → 31 | 26 → 26 | 9 → 9 | 0 → 0 |

- Every lit crown, pagoda and spire of main is now kept in place.
- Compounds still draw `pagoda` from their non-quota crown list (an art rule, left unchanged), so the city-wide pagoda count is a little higher than main's.

### Identity against main
All checks pass, as in round 1:
- **Parts:** the full prefix is identical at 147,000 of 147,000. The compacted list equals the kept parts followed by the compound parts.
- **Signs:** only the 64 dead rows differ (zeroed). 65 compound rows are added.
- **Lights:** 42 dropped and 42 added, with the order kept. The total is unchanged at 5,385.
- **Colliders:** 537 replaced and 957 added.
- **Crowd, cars, air paths, tower text, I-016 infill and fixed prefix:** identical.
- **Tower text:** the same 6 phrases, and the dev re-run matches.
- **hyd-identity:** 145,694 parts the same and 0 different outside the complex. The 1,306 complex parts lie inside its box.

### Checks
- **Functional:** 18/18.
- **Bench pair** (dev builds, through the lock, profile `opus55-I018`):

  | Run | GPU avg | p99 | max | TAA p99/avg | gbuffer | bld-cull |
  |---|---|---|---|---|---|---|
  | main | 9.722 | 11.85 | 13.00 | 1.054 | 2.592 | 0.184 |
  | round 2 | 9.776 | 11.88 | 13.34 | 1.052 | 2.622 | 0.166 |

  That is **+0.054 ms**, with no WebGPU errors.
- **Held-out views:** H1, H2, H5 and H6, plus two new street-level cameras placed by rule:
  - **H7 Yuzhong street:** pos (-750, 1.7 rel, -150), target (-1035, 217, -244).
  - **H8 Nan'an street:** pos (744, 1.7 rel, 1413), target (450, 95, 1472).
  - The rule: the street intersection nearest the compound-lot centroid among those at least 400 m from every eval camera, 1.7 m above the ground, looking 300 m along the street axis that points most toward the centroid, 80 m above the ground there.
  - Round-1 H5 was an aerial camera, not a street camera.
  - At H7 the street, its walkways and its skybridges match main.
- No eval pose was captured.

### Effect on the idea
Most of the round-1 change is gone. In Yuzhong only 186 of 631 lots are still replaced, so A6's changed area will be much smaller. At H5, the large plain box tower that round-1's judge marked as a major defect in main is now kept, because it anchors a skybridge. If the program wants more coverage back while keeping the bridges exact, the next option is a narrower anchor rule, such as keeping only skybridges that cross a street. That would be a new rule, decided on held-out views.
