## Reviewer 2 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 5 | Treating the sky as a composed hierarchy (sparse far glow, a few readable near craft, a few focal points) is a sound film and game idea, and nobody in the program has framed it this way. But the parts are not new. Vertiports and cargo drones are the items I-009 review-1 deferred. The airships are I-020's. The taxi redesign and the light fade are routine changes. |
| Feasibility and credibility | 4 | It is cheap on the GPU, and the `rng(555)` handling is right in principle. But several claims about the code are wrong, and two of them undo the reasoning for their parts. The proposed light fade makes mid-distance specks brighter, not fainter. The sightline rule cannot affect the ship behind all three I-020 losses. Other errors: police and helicopters share the taxi mesh; the peninsula has no helipads; airship beams don't exist on main, so dropping them removes no searchlight. It is also five systems in one bundle, which is what I-009 review-1 warned against. |
| Expected impact | 4 | The spec's own forecast is +0.05 to +0.15 per zone, against a gap of 3.3 to 4.1 points to the 9+ goal, and nothing here touches the detail axis (the weakest, 4.86). The critics rank sky items 9th and 10th of 10. In the eval stills the sky is already fairly sparse (B3, G3, A6, B4 show tens of light pairs, not hundreds), so removing specks changes little that a judge would notice. What the program would learn: whether readable aircraft move blind judges. That is worth something, but parts 1 and 2 test it alone. |
| **Overall (average)** | **4.33** | |

### Strongest reason it will fail
The two parts written to fix known failures do not fix them, and the rest is too small to win targets.

**The sightline rule (part 5).** All three I-020 losses (S01, S04, S07) were the *confluence* ship, at about 530 m. The cameras were aerial, at 486–563 m (`I-020-airships-only/fresh-cameras.json`). The rule only protects viewers on the rivers at y = 10 m looking at the upper half of towers within 1.2 km. The landmarks near the confluence are `raffles` (350 m), `ridge` (340 m) and `beacon` (420 m, 1.9 km away). Any sightline from y = 10 to them stays below about 400 m, while the hull's lowest point (530 − `HULL_R` 18 − 15 m margin) is about 497 m. So the rule cannot move the confluence ship at all. The views that lost would lose again. The secondary check would not catch it either: I-020's losses were "slight", and the check only forbids clear losses.

**The light fade (part 1).** `FLYER_LIGHT_WGSL` already dims every sprite as it grows (`col *= pow(r / rr, 1.2)`), so the spec's premise of "full brightness, only fog dims it" is false. The proposed change multiplies `pxMin` by `1 − smoothstep(600, 1500, dist)`, which shrinks `rr` and so *raises* the peak brightness per pixel. For a drone at 1.2 km (about 0.97 m per pixel at fov 1.05 and 1440 px):

| | Main | Proposed |
|---|---|---|
| `rr` | 1.64 m | 0.43 m |
| Peak value | about 0.8 | about 2.5 (×3, after the 0.6 colour fade) |
| Gaussian 1/e radius | about 1.15 px | about 0.3 px |

So mid-distance lights become brighter sub-pixel pinpricks. Under TAA jitter they will shimmer, and bloom picks them up. That is the opposite of the "faint, sparse glow" the spec describes.

**What is left to win targets with:**
- **Taxis.** A 9 m taxi is 20 px only within about 560 m.
- **Vertiports.** They can only appear where `CROWNS_CBD` crowns exist: the CBD, the Bund, and the office towers of urban districts. The peninsula is `DT.HILLSIDE` and uses `CROWNS_RES` (`buildings_gen.js:655, 728`), so A6 and A3 cannot get vertiports.
- **Airships.** Distant hulls already read as "shapeless magenta glitch" to I-009's judges.

The likely outcome is ties on most targets, below the 2/3 rule.

### Other concerns
- **The target rule picks targets that will tie or lose.**
  - "Airship hull ≥ 40 px": a 180 m hull is 40 px out to about 5.6 km, so any pose with a ship anywhere in view becomes a target. A distant hull is the case I-009's judges marked down.
  - "Vertiport stack ≥ 30 px": the 45 m stack meets that out to about 1.9 km.
  - Occlusion: the rule tests "terrain occlusion only", so a vertiport or ship hidden behind towers still makes its pose a target.
  - This doesn't game the metric, but it wastes targets.
- **Police and helicopters cannot "keep their current meshes" as written.**
  - All mesh flyers share `evtolMesh` in one instanced draw (`air.js:619`). Police use it at scale 0.75 and helicopters at 2.3 (`air.js:88`). A new taxi mesh changes them too: the helicopters become 21 m ducted-fan craft.
  - Keeping them needs a second mesh and draw. The taxi range is split in the `mesh` array (taxis 0–319, police and helicopters, then CBD taxis), so this also needs reordering or two `firstInstance` ranges.
- **A "type 5" collides with existing branches.** Every type test above 3.5 is a helicopter branch (`ty > 3.5`: scale 2.3, dark albedo, grey LEDs, `pxMin` 1.1). A cargo drone tagged 5 would be drawn as a helicopter unless every branch is rewritten.
- **Appended flyers are not meshed.** Cargo drones "appended after all existing flyers" land in the light-only range: only instances 0 to `meshCount` − 1 get meshes. They have to be inserted before `other`. The thinning hash must then use the original drone index, or the kept set changes with the insertion.
- **The thinning is not distance-based.** "Near traffic stays" is false: the one-in-four cut also removes 75% of the CBD corridor beacon drones that thread the supertalls in B4, the closest drones in any eval pose.
- **"Fewer searchlights" is not addressed.**
  - The searchlights the critics named (B4, G1, G4 "hard-edged solid quads") are the tower crown beams and the helicopter beams (`air.js` `BEAM_WGSL`).
  - Main has no airship beams, so dropping them removes nothing from the current best.
  - Critic 2 also named the B1 laser fan.
- **Cargo lanes have no clearance test.**
  - The rivers at 60–120 m cross the Bund suspension and cable-stayed bridge pylons and the cableway (G4).
  - They also pass right under the drone show (centre 2380, 215, −1000), which sits over the river in B1. B1 is the busiest frame and I-014's adopted win, so "B1 untouched" will not hold.
- **Fact errors to correct:**
  - I-020 did not lose G4. `LOG.md` records slight wins at G1, G3 and G4 and no eval-pose losses.
  - The G3 "H" pads are on low Nan'an urban towers, which the 120 m roof rule will mostly exclude (and the rule does not say whether "roof height" means above ground or absolute Y).
  - The taxi mesh: four 12-segment ducted rings with inner and outer walls is about 400 triangles before the fuselage, so "about 300" is low. That is still cheap.
  - "Rings read as circles at any distance": a 3.2 m ring is 4 px at 800 m.
- **Larger taxis on untested lanes.**
  - `LANES` are not tested against buildings: only the CBD corridors are. A lane at 130 m crosses the hillside districts.
  - Taxis twice the size, meshed out to 2200 m, make any existing clipping into towers easier to see. Clipping is a detached-or-intersecting defect, the user's priority 2.
- **The vertiport layout has an ordering problem.** Spirals are to be tested against the airship tracks, but the tracks are computed in the skyops module from `airCorridors`, which `air.js` publishes. `air.js` would have to call `skyopsLayout` itself, before the skyops module runs.
- **Vertiport rings risk the "unexplained primitives" defect** critic 2 named: floating neon bars in A6, hard quads elsewhere. They would sit mostly in B4, already the densest frame (crown beams, the show, a neon curtain wall). The ring radius is not specified.
- **GPU.** The total is credible. The bench fly-through may not pass close to a vertiport, so measure the worst case (rings filling half the screen) with `--stats` at a close held-out camera, as I-009 did for the trail.
- **The quick test mixes two changes.**
  - It judges the speck cut and the new taxi together, so a pass cannot say which one helped.
  - Six of the eight cameras sit 150–400 m from a taxi lane, where a 9 m designed vehicle (37 px at 300 m) will almost surely beat a box. That says little about the 1–3 km eval distances, where the speck change acts.
- **The script choice per ship is arbitrary.**
  - The confluence ship's home is the Chongqing core, not a Mongolian district.
  - The west ship's district (West Hills) is `DT.URBAN`, not Uyghur.
  - Tie the scripts to the districts each ship flies over, or to the Steppe Quarter's neighbours, so the culture reads as placed rather than random.

### What would make it stronger
1. **Fix the fade.** Keep `pxMin` and fade the colour (energy) only, for example `col *= 1 − smoothstep(900, 1600, dist)`, so sprites keep their footprint and dim smoothly. Or reduce `pxMin` and `col` together so that peak brightness never rises. Check this on a held-out camera at 0.8–1.5 km before and after.
2. **Rewrite the sightline rule against the real failure.**
   - Viewers: aerial viewpoints too, not only river points. For example, points on the ship's own altitude band 300–700 m from the track (the S-camera geometry) and the high eval-like altitudes 200–600 m on a district grid.
   - Targets: landmark tops at any distance up to about 3 km.
   - Alternatively, require that a ship never occupies the screen between a viewer and a landmark top within N degrees.
   - Then regenerate the S cameras from the *new* tracks with I-020's generator. The old absolute cameras no longer frame moved ships.
3. **Split the bundle.** Ship parts 1 and 2 as the first adoptable idea. Make vertiports, cargo drones and airships follow-ups, each judged on its own. This matches I-009 review-1 fix 1 and lets a loss be traced to one cause.
4. **Tighten the target rule.**
   - Hull at least 150 px (within about 1.5 km).
   - Vertiport stack at least 60 px.
   - Occlusion tested against the building colliders (the `cbdCorridors` `blocked` test already does this on the CPU), not terrain only.
5. **Make the thinning distance-aware or sector-aware.** Keep the CBD corridor drones, and thin only the lane drones. Better, thin by a hash and fade by distance, so near traffic really stays.
6. **Specify the separate meshes.** Taxi, police and helicopter, and cargo, each with its own draw over a contiguous instance range, with the type branches rewritten so the new type cannot fall into the helicopter path.
7. **Add clearance tests** for the cargo lanes (bridge pylons and cables, cableway, drone-show volume), and test the main `LANES` for taxi clipping at the new size.
8. **Be honest about scope:** this does not address the critics' searchlight complaint. Adding a soft-edged volumetric look for the existing crown beams would answer critic 2's item 9 directly, and those beams appear in B3, B4, G1, G3 and G4.
