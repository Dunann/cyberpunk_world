## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 6 | The first idea in the program to work on the far field and the air rather than on geometry. The finding that the mountains already exist and are hidden is useful, and so is the reason not to raise them (the `rng(7070)` trap). Lighting the ridges like Chinese mountain-lighting projects fits the brief. The techniques themselves are standard: a low cloud layer, aerial perspective that thins with height, distance fade to the horizon colour, and lights placed by rule. |
| Feasibility and credibility | 4 | The CPU numbers reproduce exactly (I re-ran `sky2.mjs`: same table, f = 720 / tan(0.525) ≈ 1243 px, moon bearing 25°/25°, pose bearings 22/14/36°). But the model behind "the air hides them" leaves out the largest term. The terrain shader already blends far ranges 75-85% toward the horizon colour before any fog is applied. As a result, the contrast target (0.35) probably cannot be reached with the three constants the spec allows itself to tune. Step 3 can lower contrast instead of raising it. Step 4 adds real lights, which the spec says it does not. The sky changes in every pose, and no check covers it. |
| Expected impact | 5 | It targets the one change both critics name (critic 1's #2, critic 2's #3). If it works, the spec's own forecast is zone G +0.4 to +0.6, zone B +0.2, which is far from 9. A clean failure in the quick test would still settle whether the far field can be won by changing the air alone, or needs the terrain shader's haze or the heights changed. |
| **Overall (average)** | **5.00** | |

### Strongest reason it will fail
**The ranges are coloured like the horizon in the G-buffer, so making the fog thinner does not make them dark.** `groundShade` ends with its own aerial perspective (`terrainShade.js:543-554`). With `hzS = 900` and `hzL = 7000` for nature terrain, and the low-altitude ×1.5 factor, it sets `emis += skyHorizon(...) * hz * 0.9` and `albedo *= 1 - hz`. The albedo of far bare ground has already been multiplied by 0.38 and 0.5 (lines 323 and 534).

At the distances in the spec's own table, that gives:

| Range distance | hz | G-buffer colour |
|---|---|---|
| 5.0 km | 0.61 | 0.55 × horizon + 39% own colour |
| 8.2 km | 0.81 | 0.73 × horizon |
| 9.0 km | 0.85 | 0.77 × horizon |
| 10.9 km (G1 skyline mean) | 0.95 | 0.85 × horizon + 5% own colour |

The sky just above the ridge is about `skyHorizon` too. So before any fog, the ridge-to-sky contrast at G1 and G3 is only about 0.15-0.25, and fog with the proposed T of about 0.3-0.45 reduces it further, to roughly 0.05-0.1. The spec's contrast model ("about the sky's T") assumes a dark ridge. `sky2.mjs` models only the froxel density and never this term. The quick test's stop rule allows tuning only `seaTop`, `RANGE_SIGMA` and the mist light, and none of them touches `hz`. So the most likely outcome is a stop at step 4 of the quick test.

The real fix is to reduce `hz` for terrain beyond the basin. That changes every terrain pixel beyond 900 m from the camera unless it is gated by the ellipse distance. Step 2's `applyFogRange` makes the problem worse: it fades ranges beyond 9 km toward `skyHorizon` a second time, so they get the same fade twice.

### Other concerns
- **The sky changes in every pose, and the identity check excludes sky pixels.**
  - From my re-run, low-sky T (under 10°) rises at every pose: B1 0.003 → 0.16, A1 0.013 → 0.16, A3 0.027 → 0.17, B2 0.002 → 0.16, G4 0.11 → 0.19.
  - Sky rays from every camera cross the ring, so the far air's colour (and step 3's added moonlight) now shows in the lower sky of all 14 poses. Steeper sky rays reach 6.2 km above 1 km of altitude, where the edge haze drops from exp(-1000/2500) = 0.67 to exp(-1000/220) ≈ 0.01, so they change too.
  - "Nothing in the city changes" is true for surfaces only. The check in quick-test step 2 measures surface pixels within 4.7 km of the centre and within 4 km of the camera, so it cannot detect this.
  - B1 is the show pose that I-014 won. A clear loss there blocks adoption. The spec rates it "low" risk on the basis of the 5% terrain share and does not consider its sky.
- **Step 3 can remove the silhouette it is meant to create.**
  - Moon emission on moon-facing slopes is added on top of a surface that is already about 0.85 × horizon. That brings lit slopes to roughly the sky's brightness, so they disappear, while unlit slopes stay slightly darker.
  - The order inside `groundShade` decides how strong the effect is. Before lines 323 and 534, rock (albedo 0.1) gives about 0.013. After them it gives about 0.0026, five times less than the 0.02 the spec quotes.
  - "Forest stays dark" is not what happens: at distance, `hz` replaces forest albedo the same way it replaces rock.
  - The spec must state where the term goes, and the quick test must measure lit-slope contrast as well as the skyline.
- **The moonlit "sea of mist" may not read as realistic.**
  - Every eval capture has rain at 0.55 under an overcast deck at 1.8 km. `skyRadiance` hides the moon disc in rain, and the moon light reaching the city is held at 0.25.
  - A blue-white, moon-lit mist layer in the countryside, at three times the city's moon strength, is lit by a moon the sky shows as hidden. Real night views of Chongqing show the ranges as dark shapes against a sky glowing with city light, with valley mist lit warm from below by settlements.
  - Critics score coherence, and the I-024 lesson is that added light in haze reads as washed out.
  - Lighting the mist with a falloff of `skyCityGlow` (warm near the basin, fading outward) plus a small fixed moon term would be more believable and closer to the existing sky.
- **The haze gets thicker as the camera approaches (not a problem in stills, but visible in motion).**
  - `farK` depends on the distance along the view ray, so the scale height of the air at a fixed world point depends on how far away the camera is: 450 m when the point is more than 6.5 km away, 1,800 m when it is closer than 4 km.
  - A peak at 1,000 m altitude therefore sits in about 5 times denser aerial haze when seen from 3 km than from 7 km. Flying toward the ranges in the fly-through, at "Mountain edge" or near A6, the mountains become hazier as the camera gets closer.
  - A world-space rule would avoid this. One option is to let the scale height depend on the distance from the basin centre (`rc`), which the edge term already uses.
- **The ridge lights add more of the specks the critics already complain about.**
  - The existing `distantLights` chains are the scattered dot strings in the G3 sky band (about y 300-450). Critic 1's change 10 asks for fewer specks.
  - The spec adds about 400 more glows, each about 1.8-2 px across from G1 and G3 (half-size 6.6-8.8 m at 8-11 km). Trail glows every 40 m are about 6 px apart at 8 km, so trails will read as dotted lines, not lit paths. Step 5 also makes the existing glows 2-10 times brighter before they are retuned.
  - The beacons blink together, so a still captures them either all on or all off. That is a matter of luck unless the capture time is chosen.
  - Draw trails and pass roads as continuous thin emissive ribbons with a minimum width of about 1 px. Keep point glows for the beacons and temples.
- **"No light enters the deferred light list" is wrong if `mountainTemple` is reused as is.**
  - Each call pushes 3 real lights (`gardenViews.js:556-560`) and calls `rectHall`, which can add more. It also adds `reserve` rectangles and colliders.
  - The garden's lights go to `ctx.lights` in `garden.init`, before later modules add theirs, so every later light index shifts. Light order decides truncation when a tile list (`TILE_MAX`) or a fog cluster (`CL_MAX = 95`) overflows.
  - The temple reserves reach the vegetation mask through `world.shared.gardenReserve`. Street trees are probably not affected, but the identity checks in step 6 should list it.
  - Either use a temple variant without lights, reserves or colliders, or append the lights after all other modules and say so.
- **City pixels beyond 4 km of the camera change slightly.** The CBD is about 4.8 km from G1 and 4.3 km from G3, so `farK` thins the air in front of it a little (roughly a 5% change in T). That is probably harmless, but it breaks the claim that nothing in the city changes, and the identity rule is drawn just short of it (4 km).
- **B4 and A6 change more than the forecast says.** At B4, skyline T goes from 0.003 to 0.34, so the whole background behind the supertalls changes from flat haze to ranges. Tower silhouettes may lose contrast against dark mountains. That is medium risk, not low. With 5 targets, the rule needs 4 wins.
- **GPU:** the estimate is credible (about 10 more operations per fog sample; the far branch runs on under 12% of pixels; `skyRadiance` runs only where `cap > 0`; about 5,000 triangles). No concern.

### What would make it stronger
1. **Add the terrain shader's `hz` to the model, and make it part of the idea.** Add the `groundShade` aerial term to `sky2.mjs` (G-buffer colour = (1-hz) own + 0.9 hz horizon) and recompute the skyline contrast on main and with the proposed changes. Then, gated by `rangeW` (ellipse distance > 4.7 km), lower the `hz` cap and slope for ranges so that the near ranges (5-9 km) keep 40-60% of their own dark colour. Remove the second fade in `applyFogRange` or merge it with `hz`. Allow `hz` constants among the tuned ones.
2. **Measure the sky on all 14 poses.** Use a sky-pixel luminance and colour check on main and the candidate (median and 90th percentile of the top band), with limits as strict as the city identity check on non-target poses, B1 above all. Consider leaving the sky's fog as it is (sample at `FOG_FAR * 2` from a separate unchanged integral, or keep the old density for rays above about 5°) so that only terrain changes.
3. **Use world-space density.** Replace the camera-distance `farK` with a profile based on `rc`, so the haze does not thicken as the camera approaches.
4. **Light the mist with the city glow, not a fixed moon, and say where step 3 goes in `groundShade`.** Measure lit-slope versus unlit-slope versus sky contrast. Drop step 3 if it lowers skyline contrast.
5. **Draw ridge lights as lines, not dots.** Trails and pass roads as continuous ribbons, fewer point glows, a brightness limit, and no lights or reserves from the temple helper.
6. **Ship it in two stages.** Steps 1-2 plus the `hz` change first, judged on its own. Steps 3-5 as a follow-up only if the ranges read. Lights placed on ranges nobody can see will lose to plain sky.
