## Reviewer 2 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 7 | The first idea to treat "readable mountains" as an air and light problem rather than a height problem, backed by a measurement that shows more height would not help. A sea of cloud in the yunhai tradition and ridge lighting borrowed from Chinese mountain lighting projects are a fresh combination for this program. Layered aerial perspective and fake moonlight on far terrain are standard techniques. |
| Feasibility and credibility | 4 | I reproduced the CPU numbers (f = 1242 px is right, and `sky2.mjs` gives the spec's table). The far city really is unchanged (ΔT ≤ 0.02). But the model leaves out the term that sets the ridge colour today: the aerial-perspective fade in `groundShade` already turns 60-90% of far range pixels into the horizon colour before any volume fog is applied. The density change also rewrites the sky in every pose: sky transmittance rises 1.5 to 17 times, on 18-53% of the frame at A1, A3, A5, B1, B4, G2 and G4. That change is not forecast and is excluded from the identity check. Moonlit slopes and contour-lit crests bring back looks that the code's own comments say were removed on purpose. `mountainTemple` adds real lights, against the spec's "no light enters the deferred list". |
| Expected impact | 5 | G1, G3 and B3 can gain on change 3 of critic 2 and half of change 2 of critic 1. If it works, about +0.3 to +0.5 in zone G. A global sky change makes a clear loss on some non-target pose (B1, A1, A5, B4) likely, and one such loss blocks adoption. Even a failure would teach the program what actually keeps the ranges hidden. |
| **Overall (average)** | **5.33** | |

### Strongest reason it will fail
The diagnosis covers only half of why the ranges don't read, and the cure changes the sky of every frame.

**1. The ridge colour is set by the surface shader, not only by the volume fog.** At the end of `groundShade` (`terrainShade.js`, about lines 543-552) far terrain already gets its own aerial perspective:
- `hz = min((1 - exp(-(dist - hzS)/hzL)) * mix(1.5, 0.7, smoothstep(200, 1800, p.y)), 0.96)`, with hzS = 900 m and hzL = 7000 m outside the city. This replaces `albedo *= 1 - hz` with `emis += skyHorizon(...) * hz * 0.9`.
- On top of that, `albedo *= 0.38` beyond 2.6 km and bare high ground `*= 0.5`.
- For a crest at about 900 m, hz ≈ 0.6 at 6.4 km (B4), 0.7 at 8 km (B3) and 0.84 at 10.9 km (G1).

So before the froxel fog is applied, a G1 ridge is about 0.75 × `skyHorizon`, the same function that the spec's `applyFogRange` fades it toward a second time. A ridge that is already 75% sky colour cannot become "dark layers in front of pale mist", whatever the fog transmittance.

Toward the city, `skyHorizon` includes `far * 1.15`, the city glow 2-5.5 km along the view. At G1 this is probably brighter than the cloud deck at y ≈ 0.19 just above the ridge. My rough estimate is ridge ≈ 0.07 against sky ≈ 0.05, but this needs a GPU check. The ridge may then be a pale band, not a dark one, which fits critic 1's "flat violet band".

The spec's contrast argument ("contrast ≈ the sky's T") and its target of 0.35 skyline contrast assume a dark ridge (`terr ≈ 0`), and nothing in the plan touches `hz`. With raw Weber contrast capped near 0.25 by `hz`, the volume fog alone (T 0.3-0.45) gives roughly 0.08-0.12. The quick test would then stop at "contrast missed", or it would be tuned by raising the mist light, which is the "bright wall" failure.

**2. The density change rewrites the sky of every pose.** The sky is fogged with the full 9 km froxel column (`renderer.js:121`). Far haze at altitude, the 2500 m edge term and the 1800 m aerial term are exactly what the plan thins out. I ran the spec's own formulas over the sky pixels (`measure/r2_skyall.mjs`, step 32, no noise, rain 0.55):

| Pose | Sky share of frame | Sky T now → new | Haze share of the sky colour (1 − T), now → new |
|---|---|---|---|
| A1 | 28.5% | 0.18 → 0.36 | 0.82 → 0.65 |
| A3 | 52.9% | 0.26 → 0.38 | 0.74 → 0.62 |
| A5 | 23.6% | 0.06 → 0.40 | 0.94 → 0.60 |
| B1 (show) | 36.7% | 0.09 → 0.37 | 0.91 → 0.63 |
| B4 | 26.9% | 0.03 → 0.44 | 0.97 → 0.56 |
| G2 | 24.0% | 0.16 → 0.31 | 0.84 → 0.69 |
| G4 | 35.9% | 0.26 → 0.35 | 0.74 → 0.65 |
| A2 | 18.2% | 0.27 → 0.42 | 0.73 → 0.58 |

Step 3 also adds moonlit Li of about 0.02 × `SKY_MOON_COL` in all air beyond the 4,700 m ellipse. Every 9 km sky ray from an eval camera ends in that air, and today's far haze Li is only about 0.01-0.04. Where the sky ends up brighter or darker depends on the direction (forward scattering toward the moon, city glow on the clouds), but the change is large wherever the sky shows.

The spec forecasts A1, A2, A4, A5 and B2 as "identical or within noise", and B1 as background behind towers. Its identity check covers only surfaces within 4.7 km of the centre and 4 km of the camera, so the sky is never compared. Under EVAL.md, one clear loss on any non-target pose blocks adoption, and the B1 show pose, with 37% sky behind the lasers, is the most exposed.

### Other concerns
- **Lit slopes bring back looks the code removed on purpose.** `terrainShade.js` says:
  - "bare high ground far away stays dark (it read as pale snow under the moon)";
  - "far natural slopes are dark masses ... instead of pale, mottled blobs";
  - the grazing "silver skyline" is gated to cameras in the southern mountains because "seen from the city the many small crests read as contour stripes".

  The plan adds `albedo/π × SKY_MOON_COL × 0.55 × saturate(dot(n, moon))` from city cameras. That is 3.2 times the moonlight the city itself receives (0.25 + 0.55 against 0.25), on every moon-facing slope beyond 4.7 km, on a 32 m far map. This invites both rejected looks, and the realism is doubtful too: the near hills (Nanshan under G1) stay at 0.25 while ridges 8 km away are lit at 0.8. The spec's fallback ("lower `RANGE_MOON` on forest, keep it on rock") keeps it on exactly the bare rock that read as snow. An existing `crest` term (0.045 × moon.w) already gives a silver edge and could be raised instead.
- **Ridge lights add specks, which both critics already penalise.**
  - Critic 1's change 10 asks for "fewer drone specks". I-022 was rejected partly for sub-pixel far lights that shimmer.
  - About 400 glows at 1.5-2 px is more speck count than the existing `distantLights` (about 9 × 7-15 glows plus road dots), which is what makes the dotted clusters in G1 and G3 today.
  - Wind farms have no visible structure: an 85 m mast at 9 km is about 12 px tall and well under 1 px wide, and the spec gives no rotors. They read as rows of red dots.
  - `PAT.BEACON` blinks all beacons together (`fract(time() * 0.55)`, floor 0.2), so in a still the rows are bright or dim by the capture time alone.
  - `mountainTemple` was scaled to be "seen from 1.1 km". At 8-10 km the whole complex is 12-15 px and its lanterns are sub-pixel.
  - `relayMast` beacons are 1.5 m, about 0.2 px at 9 km, and will flicker under TAA. The glow size rule in step 4 covers only the new glows, not these.
- **The spec's claim of no new lights is false.** `mountainTemple` pushes 3 real point lights per temple (`gardenViews.js:556-559`), 9 in all, and appends them to `lights` before the pagoda, compound and I-016 park lights, which shifts their indices. They also add `reserve` rectangles to `gardenReserve`, which go into the vegetation mask. That mask is the street-tree filter that feeds the `rng(4242)` fixed-tree draws. It is probably harmless 5 km out, beyond the street trees, but the "fixed-tree prefix equal to main" check must be run, not assumed. `rng(7070)` is correctly left alone: `distantLights` and `hillsideLife` both draw from `env.R`, and `rangeLights` after them with `rng(7373)` cannot shift them.
- **Step 5 cannot hold every camera within 20%.** Far-glow transmittance rises by a different factor at each pose (G1 about 1.7 times, B4 about 80 times at the skyline by the spec's own table). One emission scale cannot keep the glows' brightness within 20% of main at every camera. Either the glows at G1 stay too dim, or those at B3 and B4 become new bright specks.
- **Density now depends on the camera, which suits the temporal history badly.** `farK` depends on distance along the ray. The march blends the medium with reprojected history at a 0.1 blend, so during flights the far density lags and smears. This is minor for stills, but untested in the burst frames.
- **Froxel resolution against a 220 m layer.** Between 4 and 9 km the medium is evaluated every two slices, about 0.6-1.2 km apart along the ray. A thin, jittered sea-of-mist layer seen at grazing angles is where banding and temporal noise appear. The "mist top" is also an exponential gradient, not a surface, so from G3 it may read as a low glow rather than a cloud sea.
- **Checked and correct:**
  - f = 720 / tan(0.525) = 1242 px.
  - The coverage and skyline-T tables reproduce.
  - For far city pixels the spec's claim holds: at G1 and G3, ΔT ≤ 0.02 on the 4.8-6.3% of frame that is city more than 4 km away.
  - The `moonDir` bearing is right. Lots end at an ellipse distance of 3.9 km, so nothing urban sits under the new far terms.
  - The GPU estimate (+0.02-0.05 ms) is plausible.

### What would make it stronger
- **Model the whole pipeline before claiming contrast.** Port the `hz`, `albedo *= 0.38` and `crest` terms of `groundShade`, plus `skyHorizon` and `skyRadiance`, into the CPU model and predict pixel luminance, not T. Better still, add a uniform-driven arm and measure ridge-to-sky contrast on one GPU capture of G1 and G3 before writing the plan.
- **Leave the sky's fog alone.** Change only what terrain pixels receive:
  - lower or reshape `hz` for crest pixels (for example, make `hz` grow with height above the valley floor, so the sky-coloured mist sits low and the crests stay dark);
  - give far terrain an analytic layered haze inside `groundShade` or `applyFogRange`, instead of editing `medium()`, which every sky ray integrates.

  Then the sky and everything else stay identical by construction, and the identity check can cover every non-range pixel, sky included.
- **If the volume fog must change, add the sky to the identity check** and forecast the sky change at A1, A5, B1 and B4. Treat any visible sky change on B1 as a stop condition.
- **Keep the ranges dark and earn the contrast from the backdrop.**
  - Raise the existing `crest` edge term instead of lighting whole moon-facing slopes.
  - Never light bare high ground from city cameras.
  - Brighten the low sky or mist just behind the far ranges (a band in the `skyHorizon` direction) rather than the ranges themselves.
- **Fewer, larger, structured lights.**
  - Drop the wind-farm dots unless masts and rotors are at least a few px wide at eval distances.
  - Replace temples at 8-10 km with one or two larger lit features the size of the I-016 park plazas, or a lit ridge trail as a continuous thin emissive line built for at least 1 px coverage.
  - Cap the total new glow count (for example at 120) and size every new emitter, including mast beacons and temple lanterns, by the 1242 px focal length at the eval distances.
- **Make the "no new lights" claim true** by calling `mountainTemple` with a no-light variant, and run the fixed-tree prefix and light-order checks as part of the plan.
