---
id: I-033
title: Steppe threads - one cultural field puts Mongolian signs, ger and dome rooflines and vertical-script tower ribbons across the whole city
status: in-review
direction: Combine / build on the best - the brief axis (critic 2 change 7, critic 1 change 10)
family: culture layer: rule-placed Mongolian / Central Asian signs, crowns and tower text driven by one influence field
parent: I-014 (tower phrase show), reuses the Steppe Quarter vocabulary (genSteppe, gerHut, ribbed domes, felt shader)
proposed_by: idea generator
date: 2026-11-24
---

# I-033: Steppe threads

## Idea
The brief says the culture is a blend of China and Central Asia / Mongolia, but every Mongolian element in the city is in the Steppe Quarter (centre 900, -2750). That district is 1.5-4 km from every eval camera, and in the eval stills it is only a few blue domes on the horizon (A6 upper right, B3 upper left, G3 centre, u12 right). Both critics cap the brief axis for this reason (critic 2 change 7, critic 1 change 10; brief axis 5-7 on every pose). The city reads as a Chinese city with a separate Mongolian town, which is also what GOAL.md priority 3 warns against ("one city with many cultural influences, not separate cities").

This idea adds one **cultural influence field** `infl(x, z)` and lets it drive three things at three scales, so the Mongolian presence appears as neighbourhoods inside the continuous city:
- **A. Street signs.** A share of the existing shop signs show traditional vertical Mongolian script, Mongolian + Chinese bilingual pairs, or Cyrillic Mongolian, the way shop signs in Hohhot carry Mongolian script beside Chinese. The sign boxes, their lights and every random draw stay as they are; only the text in the box changes.
- **B. Rooflines.** A share of the plain tower roofs (`machine`, `setback`, `antennas` crowns) get a tower-scale ger crown (lit lattice drum, white membrane roof with ornament band and ribs, glowing toono ring), a twin-ger crown on long roofs, or a ribbed turquoise dome on a lit drum. Lit crowns, pagodas, spires, helipads and billboards are never touched (I-018 lost because it removed crowned towers).
- **C. Tower ribbons.** Traditional Mongolian is a vertical script, so one whole word fits on one tower face as a single column. Chinese needs one tower per character (I-014). Up to one front-row tower per district that I-014 did not use gets a vertical Mongolian word 70-180 m tall, drawn by the existing tower-character overlay and animated with the phrase show (Mongolian reads top to bottom).

The field is built only from existing world data, with no camera positions:

`infl(x, z) = clamp(0.05 + 0.20 * exp(-dS / 1500) + 0.30 * max_k exp(-(dK / 320)^2), 0, 0.55)`

- `dS`: distance from (x, z) to the Steppe Quarter ellipse (0 inside it; Steppe lots are already steppe and are excluded from all three layers).
- `dK`: distance to station k of Monorail Line 2 and Metro Line 6, from `buildTracks(world)` (`transitLayout.js`, pure CPU, no random draws). That is the 4 monorail stations including Liziba and the 6 metro stations.
- Urban logic: a diaspora clusters around transit stops (restaurants, hotels, shops) and thins with distance from its home quarter. A 5% floor means there is a little everywhere, as in a city where the script is official.

## Why it might work
- **It is the brief axis, which both critics name.** Brief scores in the current best are 5-7 on every pose (two-critic mean 6.07). Critic 2 ranks "visible Central Asian / Mongolian culture" 7th of 10 changes, and critic 1 lists the missing "Central Asian/Mongolian architecture and script" as change 10. The pairwise judge prompt also lists "blending Chinese and Central Asian / Mongolian culture" under fidelity to the brief (`pairwise-judge-v1.md`, point 4).
- **It reaches the poses where the brief is lowest, through the elements already in those frames.** Sizes use the real focal length of about 1241 px at 1440p (the I-026 lesson):
  - **A4** (brief 7/6) is mostly shop signs, with about 60 visible. At about 15-25% (the street is 520 m from Liziba station), 9-15 signs show Mongolian or Cyrillic text. A 1.5 m blade at 20 m is about 90 px wide.
  - **A6** (brief 5/5, the lowest with G3) shows about 300 roofs at 400-1500 m. A ger crown of radius 14 m at 800 m is about 43 px across and is lit, so it reads among the boxes. About 15-25 should be in view.
  - **G1** (6/6): the Nan'an roofs at 1-2 km give crowns of 17-35 px, plus any ribbon on a river-front tower.
  - **G3** (6/5): the aerial city, with crowns and the Jiangbei and CBD ribbons.
  - **B1** (7/7): CBD river-front towers at 500-700 m. A ribbon 18 m wide and 72 m tall is about 37 x 150 px, next to I-014's 江上月, which the judges already like.
  - **B3, B4, A1, A3:** possible secondary changes. The mask rule below decides the targets.
- **It reuses vocabulary that already works.** The Steppe Quarter already has ger roofs (`prof: 5`), the felt shader with ornament bands and ribs, ribbed tile domes (`FLAG.RIBS`), the Mongolian, bilingual and Cyrillic atlas entries, and a working Mongolian font path (`"Mongolian Baiti"`, shipped with Windows, already used by the night market). Nothing here needs a new rendering technique except the ribbon slot type.
- **It adds without removing.** No lit crown, sign, light or tower is removed. Every sign keeps its box, colour, light and animation. The roofs that change were the plainest in the frame (concrete plant box, water tanks, AC rows).

## What's new about it
- **Closest earlier idea: I-017 (lit crown swap, rejected 5.0).** Reviewer 1 gave it creativity 4 ("a crown library with a spacing rule is a standard procedural-city tool") and doubted that shape variety alone would move a blind judge. I-033 differs in three ways:
  - it changes the cultural content of the frame, which the judge is told to score;
  - it replaces only plain roofs, while I-017 replaced lit ones;
  - signs and tower text carry most of the change, not crowns.
- **I-014 (adopted)** put Chinese characters on towers, one per tower. The ribbon uses a property of traditional Mongolian script: it runs vertically, so a word is naturally the shape of a tower face. As far as I know, no game city uses vertical Mongolian script as building-scale typography.
- **One field for all three layers** places signs, roofs and ribbons in the same neighbourhoods, so the culture reads as designed (a "Little Ulaanbaatar" around a station) instead of scattered. No earlier idea in this program placed culture by a city-wide rule. The Steppe Quarter is a separate district.
- **The stream rule "decide with the original, swap at emit".** Every random draw and every geometric decision is made with the original sign entry. Only the drawn text changes (details below). That keeps the placement, the lights and the streams exact, which earlier ideas needed dry runs for.

## Target poses (declared by rule, before any implementation)
- **Rule (step 0):**
  - On main (runs/I-016m source), implement only the selection code (field, sign choice, crown choice, ribbon choice) behind a dev flag `?steppemask`.
  - The flag draws the selected sign quads in flat red, the selected crowns' replacement volumes in flat green (a cylinder of the planned crown's radius and height, depth-tested) and the ribbon slots in flat blue on their faces. Everything else is drawn black.
  - Capture the 14 eval poses at their `t`.
  - A pose is a **target** if red + green + blue cover at least 0.5% of the frame (18,432 px at 2560x1440).
- **Per-layer lists.** `targets.json` stores the coverage per layer and per pose. If a layer is dropped after the quick test, its share is removed and the target test is re-applied with the same 0.5% threshold. That rule is fixed now, and no other change to the list is allowed.
- **Expected targets:** A4, A6, B1, G1, G3. B3, A1, A3, B4, G4 and A5 could also pass. Bursts are reported, not scored.
- **Adoption (EVAL v1):** wins on at least 2/3 of the targets and no clear loss on any other pose.

**Held-out cameras (quick-test go/no-go only, never for adoption).** Seed 20261126, all written to `heldout-cameras.json` before any code:
- **4 street cameras.** Sidewalk points on road runs within 350 m of a station, 2 in HILLSIDE and 2 in URBAN. Height 1.7 m, yaw along the run, pitch +8 degrees, t = 100. Reject a point if a wall is within 6 m of the view centre.
- **3 aerial cameras.** For 3 stations drawn without repeats, the camera is 1200 m from the station toward the city centre and 300 m above the ground, looking at the station from 15 degrees down, at t = 100.
- **2 river cameras.** On the river centreline at y = 10, at the point closest to each of the first two ribbon towers in `ribbons.json` (written in step 0), looking at the tower, at t = 45 (show on).

## Expected effect on the metric
- **Pairwise:**
  - likely wins at A4 (script mix in the frame's main subject) and B1 (a new tower text next to the phrase show);
  - probable slight wins at A6 and G1 (lit ger skyline);
  - G3 uncertain;
  - ties elsewhere.
- **Critic means:**
  - brief +0.5 to +1.0 on the target poses (from 5-7 toward 7-8);
  - character +0.25 on A6 and G1;
  - zone means about +0.15 to +0.3 (one of four axes).
- This does not reach 9 alone. It removes the cap that the brief axis places on every pose, which the facade and terrain ideas cannot remove.

## Quick test
The layers are staged, and each layer has a feature flag (`?nosigns2`, `?noroof2`, `?noribbon`) so a loss can be traced to one cause.
1. **Signs only (no new geometry; about half a day).**
   - Capture A4, B2 and the 4 street held-outs on main and on the candidate.
   - One blind judge (`pairwise-judge-v1.md`, both orders).
   - **Go:** A4 wins or ties, and the held-outs show at least 2 wins and no clear loss.
   - **Stop the layer:** A4 is a clear loss.
   - **Text check:** before judging, crop 10 swapped signs at full resolution. If any shows tofu boxes, broken joins or mirrored script, fix the font or the layout before going on.
2. **Rooflines.** Capture A6, G1 and the 3 aerial held-outs. Go if A6 or G1 wins and there is no clear loss.
3. **Ribbons.** Capture B1 and the 2 river held-outs. Go if B1 wins or ties and the held-outs show at least 1 win and no clear loss.
4. Layers that fail are switched off. The idea goes to evaluation with the layers that passed.

## Implementation plan

### 0. Field, selection and masks (no visual change)
- **New `src/steppeField.js`**, a pure function module:
  - `makeField(world)` computes the station list once from `buildTracks(world)` and caches it on `world.shared.steppeField`;
  - `infl(x, z)` is the formula above;
  - `hash01(seed, x, z)` is the integer PCG hash already in `buildings_gen.js` (`pcg`), applied to x and z rounded to 0.1 m.
- **Print per-district statistics:**
  - number of plain crowns, and number selected;
  - number of signs, and number swapped;
  - ribbon towers.
- **District quotas (fixed now, tuned only through the three global constants of the formula, never per pose):**
  - converted towers 3-15% of each non-steppe district's towers taller than 45 m;
  - swapped signs 5-30% per district;
  - converted crowns 360 at most city-wide.
- `?steppemask`, then capture and write `targets.json` and `ribbons.json` (towers, words, face, slot sizes).
- Commit this before any visual code.

### 1. Layer A: signs (`signPlace.js`, `signAtlas.js`)
**Atlas.** Add words (each reviewed against a dictionary such as Wiktionary or the Bolor dictionary, and rendered in "Mongolian Baiti" before use):
- **Vertical Mongolian:** ᠬᠣᠲᠠ (qota, city), ᠰᠠᠷ᠎ᠠ (sar-a, moon), ᠭᠡᠷᠡᠯ (gerel, light), ᠮᠥᠷᠡᠨ (mören, river), ᠣᠳᠤ (odu, star), ᠠᠭᠤᠯᠠ (aγula, mountain), ᠪᠣᠷᠣᠭ᠎ᠠ (boroγ-a, rain), ᠰᠢᠨ᠎ᠡ (sin-e, new).
- **Pairs:** the same 8 with 城, 月, 光, 江, 星, 山, 雨, 新.
- **Cyrillic:** ХОТ, САР, ГЭРЭЛ, МӨРӨН, ОД, УУЛ, БОРОО, ШИНЭ, ЭМИЙН САН, ЗОЧИД БУУДАЛ, ҮСЧИН, ГУАНЗ, ШӨНИЙН ЗАХ, ХӨГЖИМ, ТОГЛООМ, 24 ЦАГ. These include the letters Ө and Ү, which mark the text as Mongolian, not Russian.
- **Atlas size.** Check `dropped == 0`. If the atlas is full, raise H from 3072 to 4096 (about +10.7 MB of GPU memory with mips). Packing positions of existing entries may change. Their pixels do not.

**Swap rule.** For every sign row `emit()`:
- `u = hash01(0x6d6e, cx, cz, y)` on the sign centre;
- swap if `u < infl(cx, cz)` (Bund heritage words: `< 0.5 * infl`; station and requested signage: never; Steppe lots: never).
- The replacement word comes from a second hash:
  - vertical boxes: 50% bilingual pair (vertical), 50% Mongolian word;
  - horizontal boxes: 45% Cyrillic, 35% horizontal bilingual pair, 20% Mongolian word laid horizontally (only if the box aspect allows, otherwise Cyrillic);
  - giant screens and billboards: Cyrillic or pair at half the probability.

**Stream exactness ("decide with the original, swap at emit").**
- `blade()`, `fascia()`, the slot loops and the billboard and screen code run exactly as today with the original word and entry. That covers every `R()` call, every early return (`h < 1.6`, `h < 0.5`, `y0 + h > g + 21`), every colour and every `addLight()` argument, including the `w * h` areas.
- Only at `emit()` is the entry replaced:
  - the visible box is refitted inside the original box with the new aspect, keeping the original centre;
  - the blade's wall offset `gap + w / 2` is recomputed from the new width, so it still touches its bracket;
  - margins use the original formula.
- Sign row count, order, light candidates, flicker seeds and animation modes are identical.
- `placeInfillSigns` (`rng(9138)`) gets the same treatment.

### 2. Layer B: rooflines (`buildings_gen.js`, new `buildings_steppe.js`)
**Bookkeeping only during generation:**
- `crown()` is wrapped. The wrapper stores `{ i0, i1, type, x, z, a, hw, hd, top, kind, prm, maxTop, style }` in `B.crownLog`, where `[i0, i1)` is the part range the call wrote. It makes no `R()` call and does not change what `crown()` does.
- The lot loop in `generate()` stores `[lotStart, lotEnd)` per lot.

**Selection** (after `genInfill`, and after the tower phrase selection, see step 4). A crown is converted if all of these hold:
- the type is `machine`, `setback` or `antennas`;
- the tower top is at least 45 m above the ground;
- the district is HILLSIDE, URBAN, BUND or CBD;
- the roof is not in `world.shared.towerTops` (searchlight sources: computed with the same rule as buildings.js:126-129);
- the lot is not a landmark lot;
- the roof radius `r = 0.86 * min(hw, hd)` is between 6 and 22 m;
- `hash01(0x6765, x, z) < infl(x, z)`;
- the new crown height fits under `maxTop`.

**Hiding the original:**
- For each converted crown, set `hw`, `hd`, `h`, `lx`, `lz` to 0 for parts `[i0, i1)` and for the aviation props in `[i1, lotEnd)` that stand inside the crown footprint at or above `top`. These are the callers' aviation lights at the crown top, genBund:798-800.
- The cull shader then rejects them: `rad = 0` gives `pix = 0`, below `minPix` (buildings_wgsl.js:63-66). The test in step 5 confirms that.
- Part indices, default seeds, the prop budget count, sign slots, lights and colliders are untouched.

**New crowns.** They are appended after every existing part, with explicit `seed` values from a private `rng(hash32(x, z) ^ 0x57e9)`. Type by hash: ger 45%, twin ger 15% (only if `max(hw, hd) / min(hw, hd) >= 1.5`; otherwise a ger), ribbed dome 40%.
- **Ger crown** (round 24-gon pieces):
  - **Khana drum:** `MAT.FELT`, radius r, height 0.42 r. New felt variant (`param >= 1`): a diamond lattice of warm light (two diagonal line families, 1.2 m pitch, box-filtered with `fwidth`), emissive (1.0, 0.62, 0.3) x 2.0 between 20% and 85% of the drum height.
  - **Roof:** `prof: 5`, 1.04 r, height 0.38 r, `FLAG.RIBS`, white felt with the existing red-gold band near the eave. Emission is raised to about 0.8 at the eave, fading upward (uplit membrane).
  - **Toono ring:** `MAT.EMIT`, radius 0.18 r, height 0.6 m, gold or cyan by hash, param 6.
  - **Finial and aviation:** an emissive finial, plus a red aviation light if the top is more than 50 m above the ground. This replaces the hidden one.
- **Twin ger:** two ger crowns of radius `0.62 * min(hw, hd)` along the long axis.
- **Ribbed dome:**
  - **Drum:** `MAT.TILE`, 16-gon, radius 0.55 r, height 0.35 r, with an emissive cyan-white ring at its base (param 4), so the drum reads at night.
  - **Dome:** `prof: 3` or `1` by hash, height 1.15 x the drum radius, `FLAG.RIBS`, turquoise from `PAL.tile`.
  - **Lights:** a gold emissive finial and four small gold lantern props at the roof corners.
- **Brightness target:** the mean emissive radiance of a new crown's visible pixels is within ±30% of the mean `lit` crown in the same capture, measured on 3 held-out aerial views. The roofs must read at night as well as the lit crowns, which the judges noticed.
- **No new point lights.** The light budget shuffle (`rng(4242)`) stays identical.

### 3. Layer C: tower ribbons (`buildings_text.js`, `buildings_wgsl.js` TEXT_WGSL)
- `selectTowerText` runs unchanged, so phrases, glyphs and `rng`-free rules are identical.
- **Ribbon candidates:** front-row towers from the same internal list (exported) that no phrase uses, with:
  - a flat face at least 22 m wide;
  - a clear vertical run of at least 3 slot sizes above `minBase`;
  - a centre at least 600 m from every phrase character in the district;
  - districts HILLSIDE, URBAN, BUND or CBD.
- **Selection:** at most one ribbon per district, the one with the largest area; ties go to the lower part index.
- **Word:** a fixed list per district index (ᠮᠥᠷᠡᠨ, ᠰᠠᠷ᠎ᠠ, ᠭᠡᠷᠡᠯ, ᠬᠣᠲᠠ, ᠣᠳᠤ, ᠠᠭᠤᠯᠠ), all verified as in step 1.
- **Slot size:** width `g = clamp(0.55 * faceWidth, 12, 30)` m; height `k * g`, where k (3-6) is the number of square segments of the word image.
- **Glyph array:** the word is rendered horizontally, rotated 90 degrees clockwise (as in signAtlas.js `addM`), cut into k square SDF layers and added to `buildGlyphArray` after the phrase characters.
- **Slot record:** uses the unused `b.w` field for k; segment j samples layer `base + j`.
- **Animation:** the overlay shader treats a ribbon as a phrase of k segments revealed top to bottom. The colour is drawn from `PALETTE` by hash.
- **Capacity:** the overlay list `TEXT_MAX` (64) still holds the extra shaft parts. At most 6 ribbons of 1-3 parts each.

### 4. Order inside `buildings.init`
1. `generate()` (with the logs).
2. `selectTowerText` on the unmodified parts: hidden crowns must not change the front-row test.
3. Ribbon selection.
4. Roofline pass: hide and append.
5. GPU upload.

`world.shared.towerTops` is computed from `B.tops`, which the pass does not touch.

### 5. Checks
- **`tools/steppe-identity.mjs`** (from `hyd-identity.mjs`), flags on against flags off, must show all of these identical:
  - every part in `[0, N0)`, with the 5 size fields of hidden parts excluded;
  - `signSlots`, `B.lights`, colliders, `towerTops`, `ledFacades`;
  - the phrase list.
- **Sign stream:** wrap `R` in `placeSigns` with a counter. Draw count and final state are equal, `lightC` is deep-equal, and sign rows match in every column except uv, w, h, x and z of the swapped rows.
- **Cull test:** a dev count shows 0 hidden parts in any draw list.
- **Functional:** 18/18; no WebGPU errors.

## Cost
**Effort:** one implementer, about 2-3 days (signs 0.5 day, rooflines 1 day, ribbons 1 day, checks 0.5 day).

**GPU, by source:**

| Item | Count (source) | Estimate |
|---|---|---|
| Signs | Same rows, boxes no larger than today (refit inside the original) | 0 |
| Converted crowns, far LOD (pix ≤ 140, almost all) | Per ger: drum K24 96 + roof K24x10 528 + toono 96 + finial and aviation 64 ≈ 784 triangles. Per dome: ≈ 944 (mesh sizes from buildings.js `MESHES`: box 32, K24 96, K48 192, K24x10 528, K48x32 3168) | Net +500 to +700 triangles per crown after the hidden machine crown (box 32 + 1-3 tanks of 64-128 + AC props) |
| Near LOD (pix > 140 means within about 130 m for r = 14 m) | At most about 2 per view, about 4,000 triangles each | under 10k triangles |
| Worst frame (G3, about half of at most 360 crowns in view) | about 180 x 0.7k ≈ 125k net triangles | ≈ 0.03 ms at about 4 Gtri/s setup (the figure I-021 review-2 used for this GPU), plus about 0.005 ms of vertex shading |
| Fill | Crowns replace roofs of about the same screen area; felt is cheap; the ribbed tile dome adds `girih()` on under 1% of the frame | < 0.01 ms |
| Cull | +about 1,800 parts on about 145k | +1% of `bld-cull` 0.17 ms ≈ 0.002 ms |
| Ribbons | At most 6 towers redrawn in the text overlay; in B1 about 2% of the frame | < 0.02 ms |
| **Total** | | **+0.02 to +0.08 ms worst view; bench average about +0.03 ms** (current about 9.8 ms; gate 11 / 16.7 / 25) |

- **Cap:** +0.15 ms on the bench average. Measure 2 bench pairs, plus `--stats` gbuffer at A6, G3 and B1.
- **Memory:** atlas growth up to +10.7 MB if needed; ribbon glyph layers +k x 256 KB per ribbon.

**Shared random streams, and why they cannot move:**

| Stream | Why unchanged | Proof |
|---|---|---|
| `rng(L.seed)` per lot, `rng(9137)` landmarks and market, `rng(5150)` and `rng(5151)` bridges and walkways | `crown()` and all generators run as today; the wrapper only records indices | part hash `[0, N0)` |
| Default part seeds `(count * 7.31) % 997` | No part is inserted or removed before `N0`; hidden parts keep their index | same hash |
| `rng(4242)` light shuffle, `rng(4343)` infill lights | No lights added or removed | `B.lights` deep-equal |
| `rng(9137)` and `rng(9138)` sign placement | Every draw and decision uses the original entry; only `emit()` swaps the uv | draw counter, `lightC` |
| `RULE.seed 1408` tower text | Selection runs before the roofline pass, on unmodified parts; ribbons are chosen afterwards without random draws | phrase list equal |
| Traffic, crowds, vegetation, plan | Not touched (no lots, roads or colliders change) | `git diff` touches only buildings_*, sign*, steppeField.js, and the TEXT/felt shader |

## Risks
- **Text quality from far away.** Vertical Mongolian at 20-40 px may read as squiggles. Ribbons are sized to at least about 35 px wide at the eval distances. The quick test crops check shaping. If a judge calls ribbons noise, layer C is dropped by its own gate.
- **Yurt hats.** Big gers on towers could look kitsch or toy-like (the I-020 judges called flat fins "toy-like"). The design is architectural rather than literal (lit lattice drum, uplit membrane roof, glowing toono), and the brightness target keeps the crowns from reading as dark lumps. Layer B has its own gate.
- **A Chongqing-core judge may prefer pure Chinese signage at A4.** The share near A4 is about 15-25%, not a takeover. If A4 is a clear loss, the layer stops.
- **Font availability.** "Mongolian Baiti" is on the eval machine (Windows 11), and the night market already uses it. The idea fails silently on systems without the font. Out of scope for the metric.
- **Small coverage.** At A6, G1 and G3 the change may be about 0.5-1% of the frame, and judges may tie. That is the main reason this could miss 2/3, and the reason A4 and B1 carry the idea.
- **Word correctness.** Every Mongolian word is checked against a dictionary before use. A misspelt word would be a defect only a Mongolian reader notices, but it should not ship.
- **Overlap with other generators.**
  - I-023 (facades) changes facade shading, not crowns.
  - I-031 (landmarks) owns landmark lots, which are excluded here.
  - I-028 and I-027 add signage as requests, which are never swapped.
  - I-026 and I-015 (Hongyadong) slots are tagged `own`; the spec leaves them unchanged (swap rule skips `own` rows).
  - The edits are textual, in different functions.
- **Out of scope (follow-ups):** steppe monuments (ovoo cairns on park high points, sülde banner rows on plazas), ornament borders on Mongolian signs, and clothing changes in the crowd (the crowd's `S()` draws depend on the steppe flag, so that change needs its own stream work).
