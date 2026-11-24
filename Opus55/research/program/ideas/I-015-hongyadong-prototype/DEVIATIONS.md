# I-015 deviations from the spec (and from the I-011 base it modifies)

Branch `idea/I-015`. Code: `Opus55/source/src/buildings_stilts.js` (new), `buildings_landmarks.js` (old `stilts()` removed, the new generator called instead), `buildings_wgsl.js` (new material ids and shader branches). `buildings.js` is untouched.

## Site and level count (fix 1)
- The cliff rule walk gives 516 m (z −380 to +110). The 480 m clamp trims the end with the lower crest, one station at a time; that removed 7 stations (28 m) at the north end (crest 64–72 m) and 2 stations (8 m) at the south end. The complex runs from (321, 99) to (171, −357).
- Level count per station: `floor((crest − 7)/7.2)`, eroded over ±2 stations, adjacent runs differ by at most one level, runs shorter than 3 stations merge into the lower neighbour. Result: 12 levels in the middle, 8–11 towards the ends.
- **Added:** both ends also step down by one level every 8 m, to 3 levels (arcade plus two levels) at the end pavilion. Without this, each end was a single vertical cut through all levels (seen on the first held-out renders).
- **Changed:** the gallery depth `g` is smoothed over ±6 stations. Computed per station, `g` jumps where the level count changes, which kinked the level fronts by up to 4 m between neighbouring stations.
- Gentle ends: the depth rule caps units at 20 m. Instead, galleries widen into terraces (fronts are pushed inland so that no unit is deeper than 20 m from the sectioned rock). Units can still be deeper where the real ground under a unit's rear edge is lower than the smoothed section. Each unit is extended until the ground at its rear edge reaches its top. The maximum depth is in the `stats.maxDepth` output.

## Structure
- **Facade and core blocks.** Each deep unit is a 6 m facade block on its own chord, plus a core block behind it on the level's shared core line (6 m behind the level front). This stops neighbouring units from meeting in wedges deep inside the stack.
- **Underpinning.** At the stepped ends the terrain falls away along the bank, so a unit's rear can stand on neither rock nor the level below. In those places a timber mass (WOOD, role `underpin`) is built down to the ground under the unsupported part. There are 87 of these, mostly hidden, and they count as support like rock.
- **Toe (fix 3).** Level 0 is an open braced frame everywhere along the bank. Column rows stand 3.4 m apart inland and 3.2 m along the bank, on stone footings, and all columns stand behind water distance 7 (the promenade ends at 6.2). Front-row piers carry lanterns, and alternate front bays are braced. Under the deck, where the rock comes within 4 m of the deck, a lit timber shop wall closes the undercroft and carries the deck back to the rock.
- **Tower bays.** Each is one block per level, aligned to the bank normal rather than to the chord of the front line, so its sides run inland like the units beside it. Eaves on every floor; a pavilion with a double hip roof on the plaza.
- **End pavilions (fix 2).** Each end gets a two-level tower bay standing on the deck, with the pavilion roof. Galleries return around every exposed end (side eaves, glow strips, railing), and the plaza ends at a balustrade.
- **Stair bays.** There are only 3, not about 7. A stair bay needs a level-count run of at least about 9 m. The end tapers, the Raffles tower zone, the lift and the tower bays leave no such space at the other candidate positions. Each stair bay is a 6.5 m recess through all levels with two switchback flights per floor (leaned slabs with painted treads, plus 10 step props per flight), landings and a lit slatted back panel. Each also has a river-walk stair from the promenade up through an opening in the level-1 deck.

## Lift (fix 4)
- A vertical 3 × 3 m glass shaft beside the 28° stepped face can bridge to only about two levels within 6 m. The shaft therefore stands inside the stack, and the units of the lower levels are split around it.
- Its front emerges three levels below the top. From there it rises in the open, against the stack, to 6 m above the plaza, with a machine room, a vertical sign slot and a lit cabin.
- Bridges are 0.4 m (level N−1 gallery) and 4.1 m (plaza), both at most 6 m. It is at z ≈ −119, the station nearest the middle that is clear of other features.

## Raffles tower 4 (fix 5)
- The generator collects solid landmark parts that reach into the stack as obstacles. Tower 4's base is at 80 m, above the stack in front of it, so it gets:
  - a timber podium from the level-8 roof (71.8 m) up to its base, which units may bury into, like rock;
  - a timber skirt 0.3 m in front of each river-facing face, from the lowest roof under it up to plaza level, carrying the eave lines and glow strips across, with the plaza balustrade on top.
- Units of levels 9–11 that meet the tower or the skirts are shortened, narrowed or split around them.

## Glow, materials, numbering (fixes 7, 8)
- Every pent eave has a separate emissive strip, 0.32 m tall, along its lower front edge. The strips are counted in the part total below.
- New material ids replace the flag bits: `MASONRY 21` (winW 1 = stair treads), `PLASTER 22`, `LACQUER 23`, `SHOPWOOD 24` (open shopfront on the lower floor), `RAIL 25`.
  - The `DECK` flag was not needed: the roof caps of WOOD and its variants are drawn as wet planks.
  - A WOOD part with param > 2 has a lantern-lit underside; the level-1 deck uses this.
  - No flag bits are used.
- Weep holes in the masonry were left out. Masonry is only footings, stair flights and landings, and planters (1–2% of the complex's screen area).

## Clearance solver and audit
- **Clearance.** Units are checked against obstacles (landmark parts, the lift shaft, skirts), then shortened (face unit), narrowed or split.
- **Dressing clearance.** Eaves, strips, railings, lanterns, oriels and plaza props are checked through a spatial hash against everything already placed, including the levels above, because dressing runs after all bodies. Anything that would cut into another group is not placed (34 pieces).
- **Audit (`?hydaudit`).** It runs a full pairwise check of all 9.4k registered pieces through a 4 m hash, and a support check on load-bearing pieces. Support counts only if it comes from below: rock, a carrier top within 0.35 m, or a column under a deck or landing. Overhang of up to 1 m is allowed.
- **Designed joints the audit does not count:**
  - parts of one unit;
  - neighbouring units of one level: up to 1 m where facades meet; core blocks, which lie at least 6 m behind the fronts inside the stack, at any depth;
  - units butting against a tower bay's sides from its base level up;
  - burial into a podium or an underpinning block.
- 4,784 such joints are reported separately.

## Other
- **Vegetation (fix 6).** The footprint plus 10 m is pushed to `world.shared.gardenReserve` in 20 m segments.
- **Plaza collider (fix 9).** The plaza is the top units' roof, so the bodies' colliders cover it. Deck parts (0.6 m) get colliders through `world.addCollider` directly.
- **Prop cap (fix 10).** 1,000, 3,500 or 6,500 props by quality, counted on the complex's own counter. Step props are added last, so the cap drops them first.
- **Lights.** 38 at priority 3, below the I-011 figure of about 60: undercroft every 32 m, tower uplights, stair bays every third level, plaza every 24 m.
- **Random numbers.** The complex uses its own fixed seed, `rng(15015)`. Removing the old `stilts()` removes its calls on the shared landmark stream, so the steppe landmarks generated after it (gerdome huts, registan minarets, market stalls) get different random values. Districts are not affected, because they use per-lot seeds. Of the eval poses, only G3 sees the steppe, at about 4 km, where these few-metre differences are below a pixel.
- **Dev tools.**
  - `?hydmask` repaints the complex in flat colours (magenta, with masonry green) and every other building black. It was used to measure the screen region, masonry share and glow.
  - `?hydaudit` stores the audit in `world.shared.landmarkSites.stilts.audit`.

## Quick test results (implementer, not the official evaluation)
- **Audit (`?hydaudit`):** 0 overlaps and 0 unsupported pieces out of 9,363; 4,784 designed joints. The complex has 10,942 parts, of which 3,721 are props and 257 are masonry, plus 38 lights.
- **Masonry share** of the complex's screen area: 1.2% (H1), 0.7% (H3), 1.6% (H2).
- **Glow, mean luminance (0–255)** over the complex region, I-015 against baseline. "Same region" is the old complex's screen region measured in the I-015 image.

  | Camera | I-015 | Baseline | I-015 in the old complex's region |
  |---|---|---|---|
  | H1 | 105.2 | 97.9 | 100.4 |
  | H3 | 104.6 | 99.1 | 104.9 |
  | H2 | 99.0 | 96.4 | 98.7 |

- **`functional.mjs`:** 18/18.
- **GPU: not settled.** Up to three other implementers' browsers shared the GPU throughout; under that contention even the baseline read 25–31 ms on average.
  - Only one back-to-back pair ran with no other browser seen. Baseline: average 9.51, p99 11.45, worst 13.89 (PASS). I-015: average 10.12, p99 22.22, worst 23.90 (fails on p99). Its lighting pass p99 was 10.9 ms against the baseline's 4.3.
  - Static probes at fly-through positions near the complex (u 0–0.13) show I-015 at +0.1 to +0.5 ms over the baseline, with no position spiking.
  - Whether the p99 rise is real or contention is unresolved. It needs a fly-through bench on a quiet GPU.
