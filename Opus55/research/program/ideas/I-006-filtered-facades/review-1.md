## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 5 | Reflection probes with parallax correction, structured window occupancy and size-based shading levels are all standard game techniques. They are new to this program and well matched to named defects, but nothing here is unusual. |
| Feasibility and credibility | 5 | The diagnosis is right: I checked `cityRefl()` and the B2 and B4 crops, and the bake can be built on `vs`. But the GPU estimate leaves out the largest new cost, the probe rule does not pick the districts it names, the bundle changes every facade in the city, and the quick test only checks part A. |
| Expected impact | 4 | Only B2 and B4 are likely to change visibly. Of the 7 target poses, 4 (G1, G3, A1, A3) will probably tie, so the 5 wins needed for adoption are unlikely. Even if it is adopted, zone B gains roughly 0.2, far short of the 8 goal, and the city-wide changes risk a clear loss on non-target poses. |
| **Overall (average)** | **4.67** | |

### Strongest reason it will fail
The spec combines one fix with a clear, local target (glass reflecting the real city, which mainly affects B2 and B4) with two changes that affect every facade in the city: occupancy, and the shading bands with cladding and uplight. It then lists 7 target poses. Adoption needs wins on at least 2/3 of the targets (5 of 7), and `make-pairs.mjs` counts a tie as a non-win.
- **G1 and G3:** towers there are almost entirely in the far band (< 2.5 px), which keeps the current `farE` path. Only the occupancy distribution and the brighter far walls change there, so a judge sees almost no difference and will call a tie.
- **A1 and A3:** glass is a small share of the frame.
- **A6:** the crop shows towers made of mat 0/1/2 walls with 8–10 px windows. Random lit windows at that size already read like a real city at night, so the gain from lit cores and stacks is subtle and could go either way.
- **Result:** realistic wins are B2, B4 and perhaps A6, which is 2–3 of 7.

The city-wide parts also put non-target poses at risk of a clear loss:
- **The detail cut-off moves from about 5.5 px to 10 px.** Today `det` = 1 for cells over 5.5 px (`smoothstep(0.18, 0.5, cp)`). The new mid band strips interiors, curtains and cages from 5.5–10 px windows. Hongyadong (mat 5/6/8) and the hillside styles also go through `windowGrid`, so the change reaches A2 and A4. A4 is the pose both critics liked best.
- **Wall uplight and the removed far-wall darkening** change the mood of every street and aerial view.

Even if the glass fix works well, this bundle is set up to fail the adoption rule.

### Other concerns
- **The GPU cost estimate is incomplete.** The estimate of −0.15 to +0.05 ms counts only the glass swap and the saving from skipping `interior()`. It leaves out:
  - **Step A6:** cubemap reflection on dark mat 0/1/2 window glass at mid and near size. These are the most common building pixels. Unlit windows are about 60% of window cells, while `interior()` runs only on lit ones, so this new lookup covers more pixels than the saving does. Each pixel needs two sphere intersections and two trilinear cube-array samples.
  - **The 30% blend overlap**, where two bands are evaluated.
  - **Cladding and uplight** on every wall pixel.
  - **A larger `fs` uber-shader**, which uses more registers and slows every building pixel.

  My estimate is about −0.1 to +0.3 ms. That likely still passes alone, since there is about 1.36 ms of headroom. But headroom is shared with other ideas, and the stated range is not credible. The quick test's "buildings pass costs no more" only measures part A on two poses, not the full `bench.mjs` fly-through, which is the actual gate.
- **Probe placement does not follow its own rule, and leans toward the eval districts.** By `DISTRICTS` area (rx·rz), the four largest built districts are:
  - Nan'an (875k);
  - CBD (798k);
  - Yuzhong (775k);
  - West Hills or Steppe (595k).

  Bund (246k) and Jiangbei (322k), both named in the spec, are the two smallest. The named set is exactly the districts where the A and B poses are. That is not keyed to coordinates, so it is not a hard violation, but it amounts to choosing probes by where the cameras are. Meanwhile Nan'an and West Hills also contain glass towers (`genUrban`, line 775: 50% of the k < 0.75 branch). Those towers would reflect a district 1–3 km away, which breaks the "reflects the real city" claim everywhere the eval does not look.
- **Near flat glass will look blurry and dull.** On flat glass near the camera, `dR` is about 0.0007 rad per pixel, against 0.006 rad per texel at 256² per face. The cubemap is magnified about 8×, so the lookup stays at mip 0.
  - The probe stores only the far-field floor-band average (`det` forced to 0), so it holds no individual windows.
  - The probe sits 80–200 m up, so street-level surroundings (the opposite podium, lamps, cars) are not in it.
  - B2's podium would therefore change from "dot noise" to a soft smear. The judge ranks "detail and finish" first, so this could lose rather than win. The spec names this risk but has no fix beyond "keep it bright".
- **The B4 stripes may come back in another form.** The towers next to the B4 cylinder have strong vertical neon edge strips. A vertical cylinder correctly reflects those as vertical coloured streaks. There will be fewer of them and they will be more blurred, but the critics might still call them stripes.
- **The `ledColor` tint is in the wrong place.** It is evaluated at the glass point, not at the reflected facade, so during the show glass glows as if it were itself an LED screen.
- **The sky may be counted twice.** Glass, and dark windows with `S.mid = 2`, already get `skyRadiance(R)` × Fresnel in the lighting pass. Adding sky to the probe, either in the clear colour or in the lookup, would count it twice.
- **Implementation traps the plan does not mention:**
  - The probe pipeline uses the same shader module, which would declare the cube texture binding in `drawLayout`. The bake cannot bind the texture it is rendering into, so it needs a dummy cube texture or a separate layout.
  - Frame data at `init` is all zeros: `F.params.w` (quality), time and show. The probe frame must be filled in completely, not copied.
  - Rendering cube faces with a reverse-Z infinite projection flips handedness, so the face orientation and `cullMode` must be checked.
- **The scope is large for 2–3 days.** The plan covers a bake pipeline, a rewrite of occupancy, three shading bands, 4 cladding types and a moiré audit of 6 patterns, all in a 1000-line shader that I-005 also edits. The 0.3 m tile grid also adds one more periodic pattern, which is the very thing the moiré complaint is about.
- **The repeated core column may add a new pattern.** A cool-white lit column on 70% of towers would itself show up as a repeated feature in aerials (A6, G3). Critics already penalise "the same X everywhere".
- **There is no comparison with a trivial fix.** The spec does not compare the bake with simply filtering `cityRefl()` better:
  - fade the dot layer once its period drops below about 6 px (today `detail` only fades at blur > 0.004, so near flat glass keeps 1.5–3 px dots);
  - break up the neon strips along their height.

  That fix takes minutes. Without it, we cannot tell whether the bake is worth its complexity.

### What would make it stronger
- **Split the idea:**
  - **I-006a, glass reflections only:** targets B2 and B4, plus a non-eval CBD or Bund podium camera for checking.
  - **I-006b, occupancy and bands:** a separate idea with its own targets, judged on its own.

  The smaller targets make the 2/3 rule reachable, and no single change can cause a regression that hides another change's win.
- **Choose probes by a system rule that matches the data,** for example one probe per built district that has glass towers, or k-means on the positions of glass parts. Use 6–8 probes (about 35 MB) so that every district reflects its own surroundings. Drop the named list of four.
- **Make the quick test decisive:**
  - Compare the bake against the well-filtered `cityRefl()` described above.
  - Run the blind pairwise judge on B2, B4 and the custom podium camera.
  - Run the full `bench.mjs` fly-through, not per-pass `--stats` on two poses.
- **Re-cost the idea in full,** including the dark-window lookups, the band overlap and cladding, and measure the change on the fly-through. If the dark-window reflection costs more than about 0.1 ms, drop it.
- **Keep near-band detail where it shows.** Keep the current `det` threshold (about 5.5 px) for balconies, cages, laundry and Hongyadong lattice styles, and apply the "mid band" only to the parallax interior call. Leave the wall uplight and far-wall brightness out of this idea, or make them a separate idea, so A4, A2 and the aerials do not shift.
- **Make the probes sharper.** Bake them with near-detail windows (or `det` around 0.5) at 512² for the CBD and Bund, so near flat glass shows individual lit windows instead of a smear.
