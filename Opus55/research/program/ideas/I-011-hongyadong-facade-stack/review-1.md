## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 5 | The façade stack is how the real building works, and the design follows I-004 review 1's "what would make it stronger" list almost item by item. Grounding another module's floating landmark is a small new step. It is a sound, expected design, not a surprising one. |
| Feasibility and credibility | 6 | Much better than I-004. The section at z −140, the Raffles tower 4 base, part and prop counts, light counts and flag and material numbers all check out against the code. The GPU gate is safe. But the site was measured at one section and applied to a bank that changes a lot along its length. The podium rule conflicts with the stack under the spec's own failure rules. Vegetation will grow into the north end. The quick test is about 1.5 days of work, not a cheap test. |
| Expected impact | 7 | It targets the user's named priority 2 and both critics' top two findings. If built as specified, wins on A1 and A2 are likely, and that alone meets the adoption rule. A3 gains only partly (see below). Zone A gain is about +0.3 to +0.4. If a clean, fully dressed stack still loses on A1 and A2, the program learns that procedural rebuilds of this landmark are not enough. |
| **Overall (average)** | 6.00 | |

### Strongest reason it will fail
The spec measured one cross-section (z −140) and built the whole design on it: 12 levels, g ≈ 3 m, plaza meeting the crest. But the bank it will actually cover is not uniform. I ran the spec's own walk with `probe`-style queries: 4 m stations at water distance 10, keeping going while the rise within 60 m inland is at least 35 m. The criterion holds from about z −388 to z +106, not −300 to +120. That is about 530 m, so the 480 m clamp decides where the ends fall, and the spec does not say how it is applied.

Along that stretch the section changes a lot:

| Stretch | Crest | Crest distance `u_c` | Rise at 40 m inland | Gradient (first 40 m) |
|---|---|---|---|---|
| North, z −390 to −330 | 62–76 m | 84–97 m | 24–35 m | about 0.5–0.9 |
| Centre, z −290 to +50 | 82–97 m | 53–74 m | 42–76 m | about 1.0–1.9 |
| South, z +68 to +106 | 84 falling to 48 m | 64 falling to 48 m | | |

`N = round((crest − 7)/7.2)` therefore runs from 8 to 12 to 6 along the bank, and the spec does not define any of the following:
- whether N is per station or global;
- how the stack top and the "plaza along the whole bank" step by whole 7.2 m levels where N changes;
- what the exposed level ends look like at those steps;
- what happens on the gentle north slope. There, `(u_c − D_top − f_0)/N` ≈ 7.5 gets clamped to 3.8. By the unit depth rule, the top units become 50–60 m deep, and the stack stands as a 70° stepped wall well in front of a 35–45° slope.

All of this lands in A1, which shows the entire complex. The north end (z −300 to −370) falls at about x 2150–2560 px of A1, where trees stand today. The stilts landmark has `r: 0`, so `vegetation.js` `buildMask` never stamps it. The Raffles stamp only reaches z ≈ −272. Trees will therefore grow through the north end of the stack and its plaza. A target pose with tree trunks through the building, a stepped and ragged top, and exposed end walls is the kind of visible defect that loses a blind comparison to a clean baseline.

### Other concerns
- **The podium rule cuts a hole in the middle of A1 and A2.**
  - Probe results: tower 4's base is at 80.0 m. The ground under its river-side edge is 42–66 m, so the gap is 14–38 m, not "about 20 m". Its front corners are at water distance 37–47, which is u ≈ 27–37.
  - The stack's own levels 5–9 (fronts at u = 12–24, rears reaching u ≈ 30–46) already fill the space under the tower's front, and level 9's roof is at 79 m, right under the base.
  - The spec puts obstacles in first and builds a podium "beneath its whole footprint, plus 2 m". Units in levels 5–9 then intersect the podium at their rear.
  - None of the four listed resolutions (narrow, set back, drop to one floor, replace with landing or gap) shortens a unit's rear. Read literally, about 36 m of levels 5–9 becomes landings and planted gaps, right in the centre of A1 and A2.
  - Fix: put the podium into the support field as if it were rock, so units may bury into it, and expose it only above level 9.
- **The pent-eave glow is below one pixel at A1.**
  - `MAT.ROOFTILE` glows only on the bottom 12% of the part's height (`buildings_wgsl.js`, the `mat == 12u` branch). A leaned eave plate with a 1.3 m projection is about 0.5–0.8 m tall, so its glow band is 6–10 cm.
  - At A1 (248 m away, 60° vertical field of view, 1440 px), one pixel is about 0.2 m. That makes the glow band 0.3–0.5 px, and about 1 px at A2.
  - Today's roofs have 3.2 m tall bands of about 0.38 m, which is 2–5 px. These bands are the "gold lines" the critics praised.
  - The "stacked lines of warm light" therefore need a separate emissive strip part, or a glow width with a minimum in pixels. Either adds about 1,300 parts that are not in the count.
  - The glow gate protects mean luminance, not these lines.
- **The held-out cameras are close to the A2 view.**
  - The slice rule picks the station at tower 4 (z ≈ −68). The held-out river camera looks along that station's normal, (−0.95, 0.31). A2 looks along (−0.949, 0.316), which is the same direction.
  - The river camera is 120 m away and 10 m high. A2 is about 95 m away and 25 m high. Their frames overlap over roughly z −190 to −45.
  - This is not tuning to coordinates, and the rule is principled. But "art direction on held-out cameras" here is mostly art direction on a shifted A2, so it does not show that the result generalises.
- **GPU: the claim holds, but the description of the fly-through is wrong.**
  - I sampled `dev.js` PATH (the same spline, the y ≥ ground + 8 clamp, and fov 1.05). The complex is in the frustum during the first 7.5 s, mostly seen edge-on while the camera flies north along the face, and again at 0.7–3.4 km distance around t = 36–46 s. The face is never seen head-on.
  - At t ≈ 6.3–7 s the camera passes 55–90 m from the south end. It then crosses the plateau at y ≈ 96–99 m, at about u ≈ 81 from the bank, which is right at the plaza's rear edge (`u_c + D_top` ≈ 66–83). That is 3–6 m above the plaza deck, among its lamp posts, planter trees, kiosks and tower-bay roofs, which rise up to 10 m.
  - My estimate is a fly-through average rise of +0.05–0.15 ms, including some uber-shader register pressure. That is well inside the 1.36 ms headroom, and p99 and the worst frame have large margins.
  - The near pass over the plaza is the one place a worst-frame spike could come from. It must be checked with the full build, not the slice. It must not be "fixed" by moving dressing off the path, because that would be tuning to the bench path.
- **Quick test 4 is under-defined.** "Scaled to 430 m, no more than 0.6 ms" has no stated scaling rule, and screen cost does not scale with bank length. Say how it is computed, or measure the full build at the held-out cameras instead.
- **A3 gains only partly.**
  - If the clamp is symmetric about the seed, the south end is about z +88. Even at z +106, the extension covers A3 from about x 820–940 px to 1150 px. The bare slab spans about 600–1150 px.
  - The stack's south end wall faces both the A3 and G2 cameras. The spec lists "ends" under masonry, so a dark block may show there.
  - Treat A3 as likely a tie. A1 and A2 must both win.
- **Smaller points:**
  - The spec's plan coordinates are approximate. At z +120 the bank is at x ≈ 328, not 260.
  - The lots-removal step is harmless but does nothing: I found 0 lots in the reserved region.
  - "Vault-deck legs" do not exist; the vault deck is at about 280 m.
  - `buildings.js` skips colliders for parts with `h < 2`. A thin plaza deck gets no collider, so the player falls through.
  - The complex's own 6,500-prop cap ignores quality level. At low quality the global budget is 20,000, so the complex alone would add about a third.
  - `f_0` is given as water distance 7, while sections are measured from the station at water distance 10. The g formula mixes the two.

### What would make it stronger
- **Measure every station, not one section.**
  - State the clamp rule, for example: trim the end with the lower crest first.
  - Define N per station, and how the top and the plaza step where N changes: a tower bay or a stair bay at every step, never a bare end.
  - Add a rule for gentle sections (gradient under about 1.3 over 40 m): fewer, deeper levels, or end the complex there.
  - Give the masonry share and the treatment of both end walls.
- **Treat the obstacle podium as support, like rock.** Only the part above the stack (levels 10–11 and the plaza notch) should be built and shown.
- **Stamp the reserved region into the vegetation exclusion mask**, for example by pushing it to `world.shared.gardenReserve` in buildings init, which runs before vegetation.
- **Eave light lines:** use a separate emissive strip with a minimum width of about 1.5 px, and add its parts to the count. Extend the glow gate to the number of distinct lit horizontal lines visible at a 250 m held-out camera.
- **Held-out cameras:** add at least two from stations outside A2's frustum (z < −250 or z > 0), at heights and angles unlike A1 and A2, and do art direction on all of them.
- **Run the fly-through bench on the full build**, and record the worst frame at t ≈ 6–7 s.
- **Quick-test A/B:** use the `pairwise-judge-v1` prompt, and require preference at both the river and the oblique crop.
- **Smaller fixes:** scale the complex's prop cap with quality, and give the plaza deck a collider.
