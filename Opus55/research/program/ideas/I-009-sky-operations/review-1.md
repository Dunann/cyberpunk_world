## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 6 | Airships, launches and air taxis are familiar cyberpunk sky elements (Blade Runner, Cyberpunk 2077). The transfers are good and specific: junk-sail fins, airport lighting (rabbit flashers, nav lights), launch-photography smoke. It is the first idea in the program aimed at the sky and at the user's priority 5. |
| Feasibility and credibility | 5 | The GPU claim is plausible and every pattern it relies on exists (`air.js` beams, CPU transforms with previous-frame motion in `transit.js`, `applyFog`, `F.misc.zw`, `F.show.x`). But several of the spec's facts are wrong for this codebase (details below): there are no helipads on the peninsula; `towerTops` leaves out the hillside and urban towers; the airship altitude band runs through existing taxi lanes; the spaceport sector reaches past the edge of the CPU heightmap; and the trail is about 90% faded at the t = 100 poses. It is also a large bundle of five systems. |
| Expected impact | 6 | This is the only idea on a user-named priority, and 40–60% of the wide poses is empty sky, so a good airship is a large, visible change that a pairwise judge will notice. Realistically, though, it shows up in 3–4 of the 7 declared targets, not the 5 that adoption needs. Even a failure tells us whether sky content wins blind comparisons. |
| **Overall (average)** | **5.67** | |

### Strongest reason it will fail
Eval poses are captured at fixed, frozen times (`capture.mjs` sets `ctx.time = t`, with t = 100 for A3, A6, B3 and G3). Under the spec's own rules, most of the new content is either missing from those stills or too small to matter:

- **The launch trail is nearly gone at t = 100.** The launch is at phase 0 of a 150 s cycle and the trail lives 110 s, so at t = 100 it is 91% through its fade.
- **The vertiports cannot appear in A3 or A6.** `helipad` exists only in `CROWNS_CBD` (`buildings_gen.js:656`). Hillside towers use `CROWNS_RES`, so the peninsula has no helipads.
- **A6 barely changes.** Its sky is under 10% of the frame, and the rivers are hidden by towers.
- **The spaceport is too far away to read.** It is 3.6 km from B1, 4.6 km from B3 and 6.9 km from G1, so the 160 m tower is at most about 55 px tall, and from B1 it is hidden behind the CBD. At G1, the trail at 40 s is only about 14 px wide.
- **The airships are a coin toss.** Whether an airship is in a given still depends on its phase on a lap of about 330 s, and at A3 the confluence ship is often nearly overhead, above the top of the frame (frame top at about 45° elevation, ship at about 55°).

So the realistic visible change on the targets is the airships in G1, G3, B3 and perhaps B1 and A3: short of the 5 of 7 wins that adoption needs. Meanwhile:

- B1 already has the busiest sky in the set (dragon, lasers, beams), so it carries a real risk of a clutter loss.
- The confluence ship is likely to appear in G2, which is not a target, and the lower-Jade ship is likely to appear over Hongyadong in A1 and A2, also not targets. Any clear loss there blocks adoption.

### Other concerns
- **GPU cost: plausible, but measure it in isolation.**
  - My estimate is 0.1–0.35 ms average. Airships are about 1–2% of the frame at 400 m. The beam shader (`air.js` `BEAM_WGSL`) is one depth read plus one fog sample per pixel. 16 extra lights are small next to the existing 5,033.
  - The headroom (11 − 9.64 = 1.36 ms) is shared with the other prototypes (I-014, I-015).
  - The forward pass already has a p99 of 1.38 ms around the Bund show, and beams, trail and cloud glow all add to it.
  - The bench fly-through does not fly near the airships or the spaceport, so their worst-case views are not covered.
- **Airship clearance uses the wrong data.**
  - `world.shared.towerTops` (`buildings.js:113`) contains only landmark, CBD and Bund towers. The confluence and lower-Jade tracks pass hillside and urban towers that it does not include.
  - The same altitude band (280–420 m) crosses existing air traffic:
    - lanes at 320 m and 410 m (`air.js` LANES) cross the confluence;
    - the Bund taxi circle at 340 m (r = 380 m) comes within about 150 m of the Bund–CBD track;
    - CBD corridors run up to 345 m.
  - Taxis would fly through the hulls, and with frozen capture times, one may sit inside a hull in an eval still.
- **The spaceport site search reaches past the near heightmap.**
  - The near heightmap ends at x = 6144 (`TERRAIN.ORIGIN`/`SIZE`), and `world.heightAt` returns clamped edge values beyond it. I probed the sector: heights repeat beyond about x = 6000.
  - Inside the sector the heights are 200–560 m, with slopes of about 13° (about 65 m per 300 m). No flat 300 m patch exists, so the deck on piles carries all the attachment risk.
  - Detached elements are the user's priority 2, so a floating deck would be a defect.
- **From the Bund, the trail will read as a searchlight beam.**
  - The gravity turn tilts east, which is almost straight away from the B1 and B3 cameras, so it is foreshortened and the trail looks vertical.
  - A smooth Gaussian ribbon with a 6–94 m radius is the same shape as the many white and gold beams already in B3, G1 and G3.
  - The three xenon sky beams at the spaceport make this confusion worse.
- **The trail will draw over the clouds.** The clouds are sky radiance, not geometry (`sky.js`, base 1800 m), so they are not in the depth buffer. Any ribbon or glow above 1800 m would be drawn on top of them.
- **The cloud glow disc is the wrong tool.** An additive disc at y = 1800 gives a hard flat edge at grazing angles and does not light the fog. `skyCityGlow(xz)` already exists for this exact purpose and is also used by the fog.
- **Dark hull against a dark sky.**
  - A "dark metallic hull" against the dark purple sky leaves only the LEDs visible. That makes it a floating light strip, which is the toy look the spec itself fears.
  - The silhouette must read: an underside lit by the city glow, and a top lit by the moon.
- **Adding `SKY_WORDS` to the sign atlas repacks it.** `signAtlas.js` packs tallest-first, so new words can move or overflow existing entries and change signs in A4 and B2, the best-liked street pose and a street target of I-012.
- **Little effect at eval distance.** Vertiports, cargo drones and spaceplanes are 5–30 m objects, a few pixels at the distances in the wide poses. They add a `buildings_gen.js` hook that can conflict with I-012/I-013/I-017, plus chase and strobe lights that can flicker in `burst-u62`.
- **No eval-camera tuning in the spec as written.** The site rule, the river stretches and the phases are all stated as rules. Two things still have to be locked down before the first capture: the phase offsets and the trail timing (period, lifetime, fade curve). The stills are deterministic, so changing either after seeing a capture would tune the result to the eval cameras.
- **The spaceport bearing.** Placing it "toward the CBD" puts it behind the CBD as seen from the Bund. It is acceptable only because it is defined from `DISTRICTS`, not from poses, and the bearing must not be adjusted later.

### What would make it stronger: required fixes for the prototype
1. **Narrow the first prototype to two systems: the airships and the launch** (pad, tower, rocket, plume, trail, cloud underglow).
   - Defer the vertiports, cargo drones, spaceplanes, runway flashers and the three xenon sky beams to a follow-up idea.
   - Do not edit `buildings_gen.js` or `buildings.js` in this prototype.
2. **Declare the target poses with a fixed geometric rule, before any pairwise judging.**
   - Drop A6 now: its sky is under 10% of the frame and the peninsula has no helipads.
   - Then, after building the content by rule, compute for every one of the 14 poses, at its pose time:
     - the projected screen size of each airship hull: a target if it is at least 150 px long and not hidden by depth;
     - the projected screen size of the trail: a target if it is at least 250 px tall.
   - The targets are exactly the poses that pass. Do not add or drop poses by looking at the images.
   - Record the computed numbers in the spec.
3. **Fix all timing and placement constants in code before the first capture, and never change them after seeing a capture.**
   - Airship phases come from `rng()` with a constant seed.
   - Launch period, smoke lifetime and fade curve are as given in fix 5.
   - The code reviewer must reject any later change to these values.
4. **Use three airships, not four, on rule-defined stretches.**
   - **Confluence:** centred on the Jade/Great River centerline intersection, with the track along the Great River centerline.
   - **Bund–CBD:** the longer part of the Great River between the Bund Suspension and North Cable bridges that keeps 300 m from the drone-show centre (2380, 215, −1000).
   - **Great River west of the peninsula.**
   - Drop the lower-Jade ship. It would hover over Hongyadong, which I-015 is rebuilding, in the non-target poses A1 and A2.
   - Track length 1.2–1.8 km at 6 m/s, so a ship stays in its own stretch of sky.
5. **Make the trail present at every moment, by design rather than by pose times.**
   - Launch period 150 s, smoke lifetime 240 s, so at least one trail younger than 150 s is always in the sky.
   - Opacity `(1 − age/240)^0.7`.
   - Cost: at most two ribbons.
6. **Make the trail read as rocket smoke from any bearing, at 3–7 km.**
   - **Wind shear with altitude:** drift direction rotates about 60–90° and drift speed doubles between 300 m and 1800 m, so the column develops a visible dogleg even when the turn is foreshortened.
   - **Puffy, uneven profile:** width varies with 3D noise along the trail and over time; the moonlit side is brighter than the shadow side; the trail is warm where the plume lights it.
   - **Width:** radius = 15 m + 2.0 m/s × age, capped at 250 m. A 6–94 m radius is 7–20 px at the distances where it is seen.
   - **Gravity turn:** at least 35° from vertical by the cloud deck. Launch azimuth is a fixed rule (downrange, away from the city: due east).
   - **No sky beams at the spaceport.**
7. **Clip everything at the cloud deck.**
   - Fade the ribbon and plume with `1 − smoothstep(1650, 1800, y)`.
   - Draw nothing above 1800 m, because the clouds are not in the depth buffer.
8. **Draw the launch glow on the clouds through `skyCityGlow(xz)` in `sky.js`, not with an additive disc.**
   - Add a launch-glow term to the frame uniform: position plus intensity.
   - This lights the clouds, the fog and the reflections together, with no flat edge, for a few ALU operations.
9. **Spaceport site.**
   - Search 4.5–5.5 km from (300, −300), on the bearing from the city centre to the CBD district centre, ±20°.
   - Stay inside |x|, |z| ≤ 5900, where `world.heightAt` is valid.
   - Choose the patch with the smallest height range. Build the deck on piles that visibly reach the ground at every corner and edge midpoint, using `heightAt` at each pile.
   - Commit the rule with a comment.
10. **Airship altitude and clearance.**
    - **Towers:** test with `world.collidersNear` plus `LANDMARKS`, as `cbdCorridors()` in `air.js` does, not with `towerTops`: 70 m vertical and 250 m horizontal clearance.
    - **Air traffic:** exclude every altitude within ±40 m of any `LANES`, `CIRCLES` or CBD-corridor altitude (including the ±10 m taxi offsets) whose path passes within 300 m horizontally of the track.
    - Use the lowest altitude of at least 280 m that passes both tests.
11. **Airship look.**
    - The hull silhouette must read against the sky: underside lit by `skyCityGlow` from below, a moonlit top edge, and panel lines that fade with `fwidth`.
    - Nav lights and 1 Hz strobes as specified, with the strobe flash at least 0.1 s.
    - One searchlight per ship, not two.
    - While `F.show.x > 0`, ships within 1.5 km of the show centre switch off their searchlights and dim their LED bands to at most 30%.
12. **Sign atlas.**
    - Append `SKY_WORDS` after all existing entries.
    - Assert that the atlas does not overflow.
    - Verify that A4 and B2 captures are pixel-identical to the baseline apart from new sky content. If not, give the airship bands their own small atlas.
13. **GPU.**
    - Give the module its own timestamp passes (`skyops-gbuffer`, `skyops-fwd`).
    - Cap: at most 0.35 ms average and at most 0.6 ms p99 in the full bench.
    - Also run `--stats` on custom cameras that the bench does not reach, and report them:
      - 300 m from an airship with its beam crossing the frame;
      - 1.5 km from the pad during ignition;
      - in B1 during the show.
14. **Motion and temporal checks.**
    - Every CPU-moved mesh writes previous-frame transforms.
    - Clamp the plume core to HDR 50 or less.
    - Check `burst-u62` and a custom 4-frame burst near an airship for strobe or trail ghosting.
15. **Held-out cameras.**
    - Capture four custom cameras not near any eval pose: two from the Nan'an bank, one from the West Hills, one from the Steppe quarter.
    - Include them in the prototype report, so the look is judged away from the eval set.
