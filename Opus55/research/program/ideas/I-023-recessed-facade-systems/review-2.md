## Reviewer 2 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 7 | A closed-form box recess per cell, with an exact cell mean used as its own level of detail, is clearly unlike the geometry route (I-005, I-012) and the filtering route (I-006). It is a natural extension of interior mapping, so an expert would not be surprised, but it is the first idea in the program that changes what a facade is without adding triangles. |
| Feasibility and credibility | 6 | The core math is right. I checked the back-wall and glass intervals, the closed-form means, the `det` limits (5.5 px and 2 px), the AC unit band (0.1–0.28 of the floor, 0.02–0.62 m out), the shared tower seed, the depth prepass (about 1x shading per pixel), and the glow texture (256², 48 m cells). The cost estimate is credible. But four of the 11 systems cannot be built with the model as written: fins, capped mullions, the ribbon and the balcony bands come out as egg-crate. The edge filter ignores how the shift changes from pixel to pixel. Detail is faded per bay, not per sub-cell. The rule for G-buffer normals in the blend band is missing. And the "real light" map is a 170 m blur of point lights only. |
| Expected impact | 6 | This is the critics' first-ranked change, and it reaches most towers. But most A6, G1 and G3 facade pixels have cells of 2–9 px. There the relief shrinks to a few percent less glass and a thin lit sliver. The visible B2 and B4 gains come from the glass arm, which the cheap control may deliver alone. If adopted: roughly +0.2–0.4 per zone. If it fails, the program learns whether shading relief moves the judges, the last untested route for the critics' top request. |
| **Overall (average)** | **6.33** | |

### Strongest reason it will fail
Most of the work goes into the recess, and the recess may not show where it is judged.
- **A6 and H4 cells are small.** With FOV 1.05 at 1440p, a focal length of about 1242 px, a 3 m cell is 9 px at 400 m, 6 px at 600 m and under 4 px past 950 m. Most of A6 (330 m up, towers 400–1,500 m away) lies in or near the `det` blend band.
- **Shallow systems barely change anything there.** A 0.3 m punched reveal seen 35° from above gives `s.y ≈ 0.07`. Lit glass shrinks by about 15%, and a sub-pixel sill gets own-window light. The ±5% luma rule then tunes even that back toward today's mean.
- **Only the deep systems read at these distances**, and two of them do not work as specified. A per-cell box closes every floor at `y = 0` and `y = 1`, so "Fins" (0.55 m) show shelf undersides at every floor line and look the same as "Egg-crate" from the street or from the air. Capped mullions, the recessed ribbon (with `ww = 0.94`, the 0.06 piers become 0.4 m deep fins) and the balcony bands have the same problem. One of the three quick-test systems (office fins) is among them.
- **So the quick-test rule (3 of 4 wins in both orders) will probably fail at A6 and H4.** Close views like H1 and H2 should win, but aerial views will most likely tie.
- **Meanwhile, the change reaches nine non-target poses.** B1 and B3 are exposed in particular, because the `cityRefl()` replacement also changes every LED and glass tower across the river (see below). One clear loss blocks adoption.

### Other concerns
- **Open axes are needed.** Fins and mullion caps are open in y, and ribbons and balcony bands are open in x. Along an open axis, the ray must be allowed to cross into the neighbouring cell. The window content must then be looked up at `id = floor(cell + f + s)` with that cell's `winLit` state. As written, `Cell` and step A keep `q` inside the cell, so the result is egg-crate. Without open axes the facade has five or six distinct looks, not 11.
- **The filter width misses the shift.** The back-wall and glass intervals are `[o0 - s, ...]`, and `s ∝ d.xy / d.z` changes quickly across the screen at grazing angles: the B2 left wall, H3 at 70°, and the near half of every street view. Filtering with `fw` of `f` alone under-filters those edges, so they will crawl under TAA. Use `fwidth(f + s)` for the shifted edges, or `fw + fwidth(s)`.
- **Detail must fade per sub-cell, not per bay.** `det` is computed from the bay (`cp = max(fw / cw, fw / floorH)`), but Narrow pairs, Fins and Capped mullions put features at half the bay width. At bay sizes of 2–5.5 px those features are 1–2.75 px, which is exactly the moiré band the idea promises to remove. Compute `det` from the sub-cell size, and run the sweep in step G per system at that size.
- **Panel mix is the dot noise again.** It makes 25–40% of 1.5 m panes opaque, chosen by a per-pane hash. At 2–5 px per pane, that random binary pattern is the "pixel-noise curtain wall" in a new form. It needs clustering (by floor or by bay group) and must fade with the sub-cell `det`.
- **The G-buffer normal rule in the blend and far bands is missing.** Step D mixes side normals by coverage, but nothing says what happens when `det < 1`. From above, the visible sides are sills and loggia floors with `n.y ≈ 1`, and the lighting pass treats those differently:
  - more `skyAmbient`;
  - wet roughness, because `wetness = 0.8` by default and walls have `S.wet = 0.6`;
  - moon specular.

  If the coverage-mixed normal survives into the distant band, all aerial facades tilt upward and change in tone. The ±5% luma check measures the frame mean, not this. Write the face normal once `det < 1`, and keep `S.rough` and `S.wet` at wall values on the sides. Today `S.rough` is mixed toward 0.1 by `G.cov`, and an implementer who copies that turns wet sills into SSR "ground".
- **The light map is not the city's light, and pane tilt does almost nothing.**
  - `glowB` holds only `ctx.lights` (lamps and sign lights) splatted into 48 m cells and blurred with σ = 3.5 cells, about 170 m. It has no window light, no LED facades and no neon edge strips.
  - A ±0.012 rad pane tilt moves the lookup by about 5 m at 400 m, which cannot be seen in a 170 m blur. The sky gradient is also too smooth for the tilt to show. The tilt only changes point-light glints.
  - Upward reflections get nothing from this term. This includes all street-level glass and B1's towers seen from the water. Those towers lose today's skyline band (`wcol·0.16`) and strips and become darker.
  - The brightness is calibrated only on the B2 podium. "Smooth glass may look duller" (I-006's concern) is answered weakly.
- **The `cityRefl()` swap reaches poses the glass test never looks at.** It applies to materials 3, 16 and 18, including LED parts (flag 4 is handled inside the glass branch). So it changes the B1 light-show towers, where I-014's only gain was, and also B3 and G3. The three-arm test checks only B2, B4 and H3. Add B1 and B3 (or a held-out far-bank camera at water level) as no-clear-loss checks, and calibrate brightness on one far glass tower as well.
- **The `FLAG.TEXT` exclusion breaks "one system per tower".** `tower()` gives all 1–3 segments the same seed, but only the part that carries a character has the flag. So the most prominent riverfront towers get one flat segment between recessed ones. The text overlay only writes emissive with a dim factor at equal depth, so it works over a recessed facade too. Leave TEXT parts recessed, or flatten only the slot rectangle on the slot face.
- **Capped mullions on B2's left wall.** At 0.15 m depth and 2 m podium panes, the glass is mostly hidden beyond about 80° from the face normal. That covers the far third of the wall, where the I-012 reviewer saw the lit interiors as the brightest detail. Whether B2's podium gets this system is a hash roll, and the glass systems are never tested before the full build. Either include the three glass systems in the quick test, or limit capped mullions to towers (not podiums under 30 m).
- **The face frame must be shared.** `interior()` uses `vt` from `tangentView()` (x along `T = (-n.z, 0, n.x)`), while the recess takes its x sign from `tAlong`. For standard rings they agree (I checked `ringEval`: `fd` grows along `T`). But compute one face-frame `d` and pass it to both, so the room and the reveal can never move in opposite directions on some ring kind.
- **Bind-layout details.** `drawLayout` is also used by the text pipeline (`textDrawGroups`), so binding 2 must be added there too.
- **Separate the hashes.** Use separate hash inputs for the system choice and for the continuous parameters (depth, glass size). Otherwise depth correlates with the system choice inside each split.
- **The spec is out of date on I-018.** It calls I-018 "in evaluation", but it was not adopted (nearly neutral). The far-view claim "towers differ by system (vertical lines, horizontal bands...)" holds only for cells of 2–6 px. Below 2 px the exact mean leaves only mean brightness and how it changes with angle. Expect little at G1 and G3.
- **Things the spec gets right:**
  - The traced cause of the B2 and B4 defects (confirmed by both I-006 reviewers).
  - Held-out cameras fixed by a rule before any render is viewed.
  - Both judge orders.
  - The cheap `cityRefl()` control as an arm.
  - No JS random-stream changes, guarded by `hyd-identity`.
  - The AC-unit rule: the sill band stays flush, and AC tops are at 0.283 of the floor, under `y0 = 0.3`.
  - A GPU stop rule measured with alternating bench pairs. My ALU count gives about 0.05 ms at 2.6M facade pixels on this GPU. The real uncertainty is register pressure in the large `fs` shader, and the bench catches that.

### What would make it stronger
- **Add open axes to the model.** Give `Sys` a per-axis open flag. On an open axis there is no wall at the cell edge; `q` may leave the cell, and the window content and `winLit` are taken from the shifted cell's id. The closed-form mean still holds (`v = 1` on that axis). Show Fins and Egg-crate side by side at H2 before the judge sees them.
- **Use the sub-cell for filtering and fading.** Compute `det` per sub-cell, filter shifted edges with `fwidth(f + s)`, and give Panel mix clustered (not per-pane) choices that fade with `det`.
- **Define the G-buffer normal, roughness and wetness for every band.** Use side normals only while `det > 0.5`, and keep wall roughness and wetness on the sides. Add an aerial luma and tone check at H4 and G3 in addition to the frame mean.
- **Split the glass decision from the recess.** Run the three glass arms first, with B1 and B3 added as no-clear-loss poses. If the cheap control wins or ties, ship it (or merge it as its own small idea) and judge the recess on its own targets, so a glass loss cannot hide a recess win, and the reverse. For the light-map arm, consider waiting for I-024's emissive light field, which would contain window and LED light. Today's map does not.
- **Make the recess visible at A6 distances.** Put the deep systems where the aerial views look: loggia columns and balcony bands on `BALC` parts, fins and egg-crate on offices. Report the share of A6 and H4 facade pixels with cells of at least 6 px that use a deep system. If it is under about 15%, A6 should not be a recess target.
- **Keep TEXT towers consistent.** Recess them, or flatten only the slot rectangle on the slot face.
- **Test the systems that will ship.** Include at least one glass system (capped mullions) and the frame grid in the quick test, and limit capped mullions on podiums under 30 m until H3 shows the interiors survive.
