## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 6 | One influence field that drives signs, roofs and tower text in the same places is a real idea, and so is using vertical Mongolian as a tower-shaped word. But two of the three layers are known moves in this program: a text swap inside existing sign boxes, and a crown swap (I-013 and I-017). Ger-domed roofs are also a real practice in Hohhot and Ordos, so the roofs are a sensible transfer rather than a surprise. |
| Feasibility and credibility | 6 | It is cheap on the GPU, and the stream rules ("decide with the original, swap at emit", hide parts by index, append parts with explicit seeds) match the code. But the visibility reasoning is overstated. A4's share is about 11–13% where the large signs are, not 15–25%. The B1 ribbon cannot be "next to 江上月" under the spec's own 600 m rule, and at about 0.3% of the frame it fails the 0.5% target test. There are also several smaller spec errors (listed below), and the ribbed dome has no way to reach the brightness target. |
| Expected impact | 5 | It is the only open idea aimed at the brief axis, which both critics name. But the change is spread thinly: an 11–13% sprinkle at A4, and 15–25 crowns of 25–45 px among about 300 roofs at A6. I-017 and I-018 showed that this size of roof change ties. Adoption is about 25%. Even if it is adopted, I expect +0.3 to +0.5 on the brief axis at 2–3 poses, about +0.1 on zone means. Failure would teach something useful: whether cultural content that the judge can see moves the blind judge. |
| **Overall (average)** | **5.67** | |

### Strongest reason it will fail
**The changes will be too small where the judges look, so the targets tie.** I computed the field with the spec's own formula and the world data. The Steppe ellipse is about 2,470 m from A4, which adds 0.038. Liziba (-1050, -770) is 527 m from the A4 camera, which adds 0.020. With the 0.05 floor, that gives infl ≈ 0.11 at the camera and 0.12–0.14 within 100 m of it. That stretch holds the 8–10 signs that define the A4 frame (理发, 大排档, 发廊, 烤鸭, 歌厅, 甜品, 江湖菜). infl only reaches about 0.19 at 200 m, where signs are 5–15 px and the script cannot be read. So A4 most likely gets about one large swapped sign, with a 28% chance of none. A4 is a lottery decided by `hash01`, not the "9–15 swapped signs" the spec claims.

B1, the other pose the spec says "carries the idea", is probably not a target at all:
- The ribbon must be ≥ 600 m from every CBD phrase character, so it cannot stand next to 江上月. It is chosen by largest area from both CBD banks (不夜城 faces south), so it may not be in the B1 frame at all.
- If it is in frame, 18–22 m × 72–88 m at 600–700 m is about 37–39 × 150–156 px, about 6k px. That is 0.3% of the frame, below the 0.5% (18,432 px) target threshold. A few CBD crowns at 600–1000 m (about 800 px each) do not make up the difference.

That leaves A6 and G3, plus G1 at 0.2–0.4% coverage. There the change is 25–45 px crowns among hundreds of roofs. I-018 round 2 (0/3 and 1/3, "nearly neutral") and the I-017 review ("15–20 crowns change among hundreds of towers") both show that this ties. With 2/3 needed on targets admitted at a 0.5% threshold, the most likely result is "neutral, not adopted".

### Other concerns
**Visibility and how judges will read it**
- **Ribbed dome is too small and looks like what is already there.** Drum radius is 0.55 r, so for r = 14 m the dome is about 15 m wide: 23 px at 800 m and 9–19 px at G1's 1–2 km. G1 and A6 already have many cyan and teal lit pyramid crowns. A small turquoise blob next to them will not read as a Central Asian dome.
- **The dome cannot meet the brightness target.** The spec sets a target of ±30% of the mean `lit` crown, but `MAT.TILE` only adds emission from the base ring and finial. The visible dome pixels will be far darker than a `MAT.CROWN` pyramid. That makes dark lumps, which is the failure the spec warns about.
- **The ger lattice disappears at distance.** A 1.2 m pitch is about 1.9 px at 800 m, so the box filter turns it into a flat warm band. From A6 a ger becomes "white cap on a glowing cylinder". The ornament band (0.07 of the roof height, about 0.4 m) is under 1 px. Whether a judge reads "ger" at 30–45 × 15–20 px is uncertain. If it does not, the ger is just another round lit crown, which counts as variety, not brief.
- **`setback` is not a plain roof.** It is 1–2 office storeys, 7–12 m each, with lit windows (`crown()`, `buildings_gen.js` setback branch). Hiding it lowers the tower by up to about 20 m and removes lit volume. That is the I-018 failure mode, a lost crowned silhouette, on a small scale.
- **`antennas` carries red aviation lights.** Its mast clusters each have two aviation lights. Hiding them removes many red skyline points, and the replacement adds only one.
- **Mode 4 signs go dark.** `emit()` encodes `n = entry.n` into `anim`. Mongolian words have n = 1 and pairs have n = 0. In `signs.js`, mode 4 ("broken character") then matches `ci == floor(hash*nch) = 0` for the whole box, so about 5% of swapped signs render as dead signs at 0.03. Mode 2 with nch = 0 loses its chase effect.
- **Poetic words on shop signs.** The new Mongolian words and pairs mean moon, light, river, star, mountain, rain, new (月, 光, 江…). A judge can read the Chinese half: a shop sign that says "月" is odd. The atlas already has shop-meaning Mongolian words and pairs (food, tea, shop, hotel, market: `MONGOL_WORDS`, `MONGOL_PAIRS`). Use those for signs, and keep the poetic words for ribbons.
- **The 5% floor everywhere reads as random.** It puts a few random Cyrillic signs in every Chinese street, including B2 and the Bund. That is closer to "pasted on" than to the "Little Ulaanbaatar" the spec describes. Real blended cities, such as Erenhot, Manzhouli and Hohhot, show it as consistent multilingual signage in particular quarters.

**Code and spec errors**
- **The sign identity check is wrong as written.** Swapped rows also change the `anim` column (n and the vertical bit), not only uv, w, h, x and z. The check must exclude `anim` or it will fail.
- **Horizontal Mongolian has no atlas entry.** `addM` only creates `V:` keys, and `atlas.find(word, false)` falls back to the vertical entry. The "20% Mongolian word laid horizontally" needs a new `H:` entry, rotated 90° counter-clockwise, as horizontal Mongolian is written in Inner Mongolia.
- **Repacking the atlas changes every existing sign.** If H goes from 3072 to 4096 and everything is re-packed, every sign gets new uv values and new mip neighbours, which changes far signs everywhere. Pack existing entries first in their current order and add the new ones in the new rows, then check that existing rects are unchanged.
- **Refitting long Cyrillic words shrinks the text.** ЗОЧИД БУУДАЛ has an aspect of about 4.7, while a 2-character Chinese fascia is about 1.5. Fitted inside the original box, the text drops to about a third of the box height, a thin strip of small letters. Choose the replacement by nearest aspect (deterministic, no `R()`).
- **Cutting the ribbon word before the SDF makes seams.** Computing the SDF and the blurred halo for each square segment separately leaves seams at the cuts: the outside distance is overestimated, and the halo, which dims the windows, is clipped. Compute the SDF and halo on the whole word, then cut it into layers.
- **Words with U+180E.** ᠰᠠᠷ᠎ᠠ, ᠪᠣᠷᠣᠭ᠎ᠠ and ᠰᠢᠨ᠎ᠡ contain U+180E (the Mongolian vowel separator). Older Mongolian Baiti builds can render it as a space or as a box. The crop check covers this, but simpler words lower the risk. ᠰᠠᠷ᠎ᠠ is also a ribbon word.
- **Capped crowns rarely fit.** Capped crowns are forced to `machine` exactly when `top + 12 > maxTop`. A ger of r = 14 is about 12–13 m tall, so many `machine` roofs will fail "fits under maxTop". That is fine, but the selection statistics should report it so the quotas are not tuned against it.
- **Appended parts depend on the prop budget.** If they go through `B.prop`, they count against `propBudget` and are silently dropped once it is full. Add them with `P.add` and set FLAG.PROP by hand, or report the prop count first.
- **Parameters the spec leaves open:**
  - the ger roof's taper (the toono of 0.18 r only rests on the apex if taper ≈ 0.16, as in `gerHut`);
  - the twin-ger centre offsets;
  - what the 360 cap drops first;
  - `pcg` is not exported;
  - `textMap` must be sized after the append (it is `P.count` long today);
  - the felt `param` already sets the band position, so the lattice variant needs a separate switch.

**Process**
- **Held-out cameras sit at hot spots.** They are all within 350 m of stations or aimed at them. That is fine for "does it look good where applied", but it tells little about the eval poses, where infl is 0.1–0.2. Add at least 2 held-out cameras at an infl of about 0.1.
- **GPU: no objection.** +0.02 to +0.08 ms is credible: about 360 crowns, about 700 net triangles each, no new lights, signs at zero cost. One correction: the ribbon covers about 0.3% of B1, not 2%. The 2% figure is the redraw area of the tower part.

### What would make it stronger
1. **Concentrate instead of sprinkle.**
   - Drop the 5% floor.
   - Use a steeper station term, so a hot spot is 40–60% within about 250 m and under 5% beyond 600 m.
   - Within a hot spot, use consistent trilingual signs (Mongolian + Chinese + Cyrillic on the same frontage) plus ornament borders. Bring the ornament borders forward from "out of scope", because they are what makes a sign read as Mongolian at 30 px.
   - That makes one or two neighbourhoods that read as designed. Whether one lands in A4, A5 or G1 is decided by the field, not by the cameras.
2. **Raise the target threshold to about 1.5%** of the frame. Count only pixels inside the central 60% of the frame. Then only poses with a change the judge can see count, and the 2/3 rule is not diluted by sure ties.
3. **Restrict roof conversion to `machine` and `antennas`.** Keep setbacks, or put the ger on the top setback roof.
4. **Drop the ribbed dome or give it real presence.** It needs a radius of at least 0.8 r and an emissive tile glaze or uplight wash that meets the brightness target.
5. **Fix the ribbon placement claim.** Either allow a ribbon on the same bank as a phrase at a smaller gap (for example ≥ 250 m, beside the phrase in the same view, as a deliberate bilingual pair), or drop B1 from the expected effects.
6. **Fix the sign and ribbon implementation details:**
   - Use the existing shop-meaning Mongolian vocabulary for signs.
   - Choose replacement words by nearest aspect.
   - Encode a sensible `n` for Mongolian entries (number of letters, or force mode 0/1 at emit).
   - Exclude `anim` from the identity check.
   - Keep existing atlas rects unchanged.
   - Compute the ribbon SDF on the whole word.
