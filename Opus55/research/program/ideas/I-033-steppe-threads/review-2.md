## Reviewer 2 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 7 | One influence field driving signs, roofs and tower text at three scales is new in this program. So is using the vertical shape of traditional Mongolian script as building-scale typography. Ger-shaped domes on towers are a real Inner Mongolian vernacular (Hohhot, Ordos), so the crowns have a basis in real cities and are not just a theme-park idea. The parts themselves (sign word swap, crown swap, I-014 overlay) are known tools. |
| Feasibility and credibility | 6 | Most code claims hold. I checked: the atlas already has Mongolian, bilingual and Cyrillic entries; `addM` rotates the script correctly; the "Mongolian Baiti" path is live; the felt shader, `prof: 5` and `FLAG.RIBS` exist; `crown()` writes one contiguous part range and adds no lights or slots; `rad = 0` is culled; `towerTops` and `B.led` read `tw.top`. But five claims are wrong or missing. The A4 swap rate from the spec's own formula is about 12% for the near signs, not 15–25%. Refitted sign boxes reorder the sign buffer, so signs that are not swapped also change. Dome lanterns "at the roof corners" float on round and chamfered towers. The turquoise dome is dark at night, and nothing in the spec makes it meet the brightness target. The ribbon's 600 m rule conflicts with the B1 claim that the ribbon sits "next to 江上月". |
| Expected impact | 5 | The brief must reach 9 eventually, and nothing else in the program works on it, so the direction is needed. But the change covers about 0.5–1% of most frames. The pairwise judge ranks brief fidelity 4th of 4 criteria. The field's 5% floor makes many poses targets, and each target then needs a win. Brief is already the highest axis (6.07; detail is 4.86). The spec expects zone means to rise only +0.15 to +0.3. If it fails, the staged gates still show whether cultural content alone moves the judge, and that is worth knowing. |
| **Overall (average)** | **6.00** | |

### Strongest reason it will fail
**A light change spread across the whole city meets an adoption rule that needs a win at 2/3 of every pose it touches.** The target rule counts a pose when 0.5% of its frame changes (18,432 px). The field has a 5% floor everywhere and a 0.2 term reaching 1.5 km out from the Steppe Quarter. So beyond A4, A6, B1, G1 and G3, the sign or crown masks will probably also pass the rule at:
- B3: the aerial view over the Bund, near the Metro Line 6 stations at (1350, −650) and (1600, −1350), and about 1.4 km from the Steppe ellipse, so infl reaches about 0.13–0.4;
- B4: CBD `setback`, `machine` and `antennas` roofs at 300–700 m, which are 3/9 of `CROWNS_CBD`;
- possibly G2 and A3.

That gives 6–9 targets and needs 4–6 wins. In each of these frames the change is about 10–25 white or turquoise discs of 20–45 px, or a few signs. The program's history at this scale is ties:
- I-017: review expected ties at 15–20 crowns per frame;
- I-018 round 2: nearly neutral;
- I-014 round 2: gain only at B1, where the text is the subject of the frame.

The spec relies on A4 and B1, but neither is safe:
- **A4.** Near signs at about (−1150, −280) are 500 m from Liziba, which gives infl = 0.05 + 0.040 (dS ≈ 2.4 km) + 0.026 = **0.12**. Only the small far signs, about 275 m from the station, reach 0.24. Of the roughly 8 large near signs in the A4 still (理发, 大排档, 发廊, 烤鸭, 歌厅, 甜品, 麻将, 江湖菜), about one will be swapped, and there is a 0.88^8 ≈ 36% chance that none is. In that case A4 may not even reach the 0.5% coverage threshold.
- **B1.** A ribbon needs a CBD front-row tower with a flat face at least 22 m wide that no phrase uses, at least 600 m from every phrase character in the district. Many CBD towers are round or chamfered (`kind 2 prm 48`, `kind 1`). Even if such a tower exists, it is 600 m from 江上月 along the bank, which is about 30° off the axis of B1 (half the horizontal field of view is 46°), at the edge of the frame or hidden behind the LED towers. The spec has not checked that any candidate exists.

### Other concerns
- **The refit changes signs that are not swapped.**
  - The sign buffer is not in `placeSigns` order. `Cells` sorts rows within each 160 m cell by area, `sizeOf = w*h` (signs.js:320–323).
  - A refitted box (new w, h) moves its row inside its cell, so every later row in the cell gets a new `i.id`.
  - The fragment shader keys three things on `i.id`:
    - the lightbox white-or-coloured panel choice (`hash11u(i.id*7u+3u)`);
    - the mode-3 blink phase;
    - which character is broken in mode 4.
  - With about 10–25% of signs swapped, almost every cell contains one, so lightbox colours flip across the city in every pose. The spec's identity check compares `placeSigns` rows and would miss this; `hyd-identity.mjs` dumps `cells.rows` and would fail on it.
  - **Fix:** sort by the original area (keep the original `w*h` beside each row and pass it to `sizeOf`), or keep the original w and h and choose the replacement word by aspect (next point).
  - A shrunken box can also fall below the 6 m² far-draw threshold and disappear beyond `midDist`.
- **Long Cyrillic words become thin strips.**
  - Horizontal shop words have aspect 1.5–2.7 (`addH`, S = 72, 2–4 characters).
  - ЗОЧИД БУУДАЛ, ТАВТАЙ МОРИЛ and ШӨНИЙН ЗАХ at 70 px Segoe UI bold have aspect about 4–5.
  - Refitted at the original width, the box keeps 30–50% of its height. The judge then sees smaller, plainer signs, which hurts detail, the judge's first criterion.
  - Choose the replacement deterministically from the words whose aspect is within about ±20% of the original.
- **Anim word.** `emit()` packs `16*n + 256*vertical` from the entry. Keeping the original `n` (as the column list implies) is safe. Using the new entry's `n` is not: pair entries have `n = 0`, and in mode 4 (`animMode()` gives it 5% of the time on non-Mongolian blades) `ci == floor(hash*0)` is always true, so the text stays at 0.03. State that the anim column keeps the original `n` and vertical bit, or force mode 0/1 for swapped rows (but drawing that would change the stream, so do it at emit).
- **Atlas packing.** Adding about 40 entries, some of them tall `addM` columns 400–600 px high, changes the uv of every existing entry, because the shelves are sorted tallest first. The identity check must compare signs by entry key, not uv. "Except the uv of swapped rows" is wrong as written.
- **Floating lanterns (user priority 2).** The dome's "four small gold lantern props at the roof corners" float outside the wall on:
  - round CBD towers (`kind 2 prm 48`, about 10% of CBD towers);
  - chamfered towers (`kind 1`, 20% of hillside towers, `kind 0 prm 0.25–0.55`).

  I-017 review 1 named this exact defect. Place them on the real ring (`ringEval`) inset 1 m, or on the drum.
- **The dome is dark at night.**
  - `MAT.TILE` emits `c*0.18`. With `PAL.tile` that is about (0.01, 0.1, 0.11).
  - Beyond 450 m, `farK` darkens it further.
  - A 15 m dome at 800 m is about 23 px of near-black teal with a thin cyan ring. The brightness check (±30% of the lit-crown mean) will fail for 40% of conversions, and the spec has no fallback.
  - Specify the dome's emission up front: an up-lit tile wash from the drum ring that fades with height, like the felt eave, with a stated HDR value.
- **Antennas and setback crowns are not plain.**
  - `antennas` carries 3–5 masts with two red aviation lights each.
  - `setback` carries 1–2 office storeys with lit windows (7–12 m each).
  - Converting them removes red skyline points and up to 24 m of lit tower top, and puts a 12 m crown at `top`. This is the I-018 lesson in a milder form.
  - Either convert only `machine` roofs plus `setback` roofs with one storey, or put the crown on the setback top and keep the storeys.
- **Phrase towers.** Nothing stops a tower that carries an I-014 character from having its roof converted. Those towers are the watched element in B1. Exclude every tower in `text.glyphs`.
- **The prop budget.** Appended crown pieces must bypass `B.prop()`. If the 130k budget is already used up, `prop()` returns −1 and the ger is left with missing pieces, such as a toono with no drum. Use `P.add` directly, and set `FLAG.PROP` only where the smaller pixel cutoff is wanted.
- **Sign words.** The new vertical words (city, moon, light, river, star, mountain, rain, new) and the pairs 雨 and 星 are odd as shop names. The atlas already has the right shop vocabulary in Mongolian script: ᠬᠣᠭᠣᠯᠠ (food), ᠴᠠᠢ (tea), ᠳᠡᠯᠭᠡᠭᠦᠷ (shop), ᠪᠠᠭᠤᠳᠠᠯ (hotel), ᠵᠠᠬᠠ (market). Use those for signs and keep the poetic words for ribbons. Your Cyrillic shop list (ЭМИЙН САН, ҮСЧИН, ГУАНЗ…) is good.
- **Bilingual first.** In Hohhot, shop signs are bilingual by rule. One pure-Cyrillic sign among nine pure-Chinese signs reads as sprinkled. A Mongolian + Chinese pair reads as a designed city and keeps the Chinese street character the judges like at A4. Weight pairs at about 60% on both vertical and horizontal boxes.
- **Small errors:**
  - Metro Line 6 has up to 5 stations, not 6 (`want = 5` in `transitLayout.js`).
  - The near LOD of the ger roof part (rad ≈ 26 m) starts within about 230 m, not 130 m. It is still cheap.
  - A glyph layer is about 341 KiB with mips, not 256 KB.
  - The 360-crown cap and the per-district quotas need a deterministic drop rule (for example, the lowest hash first). "Tuned through the three global constants" after the masks are seen is pose tuning in disguise. Fix the constants before step 0, as written, and do not revisit them.
  - Ribbons of "1–3 parts each" would break into steps at tower setbacks. Keep each ribbon within one shaft part.
- **GPU: no objection.** I count about 2,300 appended parts, not 1,800: ger 5, twin 10, dome 8 incl. ring and lanterns. That is still under 2% of cull work. Gers and domes mostly fall into the far lists. The signs keep the same count. The overlay redraws at most 6 shafts. An average cost of +0.03–0.08 ms and the +0.15 ms cap are credible. The atlas grows by about 11 MB.
- **Random streams: mostly sound.** Hidden parts keep their index, so the default seeds `(count*7.31)%997` hold. New crowns are appended with explicit seeds, the hashes for signs and roofs draw no `R()`, `rng(4242)` and `rng(4343)` see the same lights, and `selectTowerText` runs on unmodified parts. The only stream-like leak is the `Cells` reorder above.

### What would make it stronger
- **Concentrate instead of spreading.** Drop the 5% floor and the `dS` tail, which only add targets that will tie. Use two or three station neighbourhoods at high intensity: 40–60% of signs as bilingual pairs, most plain roofs converted within about 250 m, and one ribbon per neighbourhood. Choose stations near the A4 street and Liziba, and near the Line 6 stations in the CBD and Bund, by a rule fixed before any masks are made. Each such pose then gets a change a judge can see, and fewer marginal poses enter the target list. This also matches the spec's own "Little Ulaanbaatar" story better than a 5% sprinkle.
- **Report the expected targets before building.** Step 0 already makes masks. Also print, per pose, the number of large changed elements (signs over 2,000 px, crowns over 30 px). Write down the adoption math (for example, "7 targets, needs 5") before any visual code. If the math needs more wins than A4 and B1 can plausibly give, narrow the field first.
- **Keep the box sizes and the buffer order.** Choose words by aspect, and sort `Cells` by the original area. The only visible difference is then the script.
- **Make the domes glow:** an up-lit tile wash plus a lit drum lantern band. Test both crown types on 3 held-out aerial views before judging, with the ±30% target as a gate for each type.
- **Prove B1 before counting on it.** List the ribbon candidates in step 0 with their angle off the B1 axis and their screen size. If none falls within ±30° of the B1 view axis at 30 px or wider, say B1 is a sign-only target and expect a tie there.
