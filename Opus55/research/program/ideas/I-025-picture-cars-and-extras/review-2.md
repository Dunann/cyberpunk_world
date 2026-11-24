## Reviewer 2 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 5 | New ground for this program (no earlier idea touched the car or person meshes), and the "select by hashing existing seeds" rule is a clean way to keep streams fixed. But hero LODs and component-swap pedestrians are the standard game technique; the film framing changes no technical choice. |
| Feasibility and credibility | 6 | The B2 claim checks out against the code, the stream argument is correct, the GPU estimate is plausible and the cars-only quick test is cheap. Real gaps remain: the car paint will still look like a dark slab under this renderer's lighting, there is no plan for drawing 9 bodies from one list per tier, and the fixed lamp sprites force all bodies of a type to the same length and lamp height. |
| Expected impact | 6 | It removes defects the critics rate critical at B2 and B1, which must go before any 9. But the gain is limited to 2-3 poses, A4 may not meet its own 2% target rule, and the B1 spectators are seen from behind, so most of the face work is invisible. |
| **Overall (average)** | 5.67 | |

### Checks against the code
- **The B2 block is a car (verified, not only "almost certainly").** B2 is at x = 3050. The Lujiazui CBD grid has cx = 3300 and block = 125, so x = 3050 is a grid line (i = -2) and the camera stands on the road centre line. With road = 20, `laneW` is 4 and the lane centres are at ±2 m and ±6 m. For a north-south run, dir = +1 cars run at x = 3048, on the camera's left and moving toward it. So the block is an oncoming car in the inner lane: its centre is 2 m from the lens and its flank about 1.1 m away.
  - This fits the image. Its roof (1.38 m) is 0.32 m below the eye. The dark top spans about y 930-1250, matching a 60° vertical FOV (`fov: 1.05`). The reflective deck below it is the bonnet or boot at 0.9 m, which gets wet-ground SSR because `gbuf(..., wet 0.9)` and the surface is flat. The dark vertical notch at about 960-1010 x 1090-1260 is where the front wheel box would be.
  - The frame is the same in baseline, I-016 and I-016m, so the shot is stable at t = 100.
- **Mesh claims are correct.** The car is about 164 triangles (7-point profile, 4-point glass house, boxes for wheels and lamps). The wheel boxes stick out only 0.03 m past the 0.9 m body and are albedo 0.02, which is why critics see no wheels. The crowd LOD caps are at crowd.js:599, the style bits and `hide` collapse are as described, and the seed is in `Agent.c.y` and `CarIn.b.z`.
- **Stream identity holds as described.** `rng(31337)`/`rng(31338)` (cars) and `rng(8080)` (crowd) are untouched, and `buildRuns`, which the crowd also imports, is not edited. Hashing `seed` adds no draws.
- **Small inaccuracies:**
  - `?nocars&nocrowd` does not exist. The existing switch is `trafficParts=transit,air`, or `disable`.
  - The vegetation LODs scale in and out (vegetation.js:89-103); they have no dithered cross-fade to copy.
  - Jackets already have LED piping (8%, crowd.js fs, `h3 < 0.08`) and dark shoe soles, so two of the "new" components already exist.
  - At A4 the cars on the left cover nearer 1% of the frame than 3%. They are about 30-60 m away, so they fall mostly in the middle tier, not the hero tier.

### Strongest reason it will fail
The B2 car will still read as a large dark slab, because the problem there is mostly lighting, not geometry:
- The car keeps its existing paint index (here dark navy, index 3).
- The renderer's environment specular reflects only `skyRadiance`/`skyAmbient` (renderer.js lighting pass). SSR applies only to flat, upward-facing, wet surfaces (`groundRefl`, `n.y > 0.75`).
- So the vertical panels of a "clear-coat 0.12-0.2" hero car still reflect a dark night sky, not the neon street. Seam lines, handles and a darker sill on navy or black paint at night are a few percent of luminance.
- Wheels in arches would be the clearest gain, but at 1.1 m from the lens with a 60° FOV most of the wheels are below the frame. The mirror and the cabin seen through the side glass are the main visible changes.

A blind judge comparing two frames where 15% of the area is the same dark car mass has a good chance of calling B2 a tie. Then the idea needs both B1 and A4. At B1, the five foreground spectators all face the river with their backs to the camera, so faces, glasses and masks are not seen. At A4, the pose may not even pass the 2% target rule. The spec spends its most careful work (faces, the parallax cabin) where the target poses cannot show it, and does nothing about paint reflections, which decide how a car looks on a rainy neon street.

### Other concerns
- **No plan for drawing many bodies.** Nine bodies, each with hero and middle meshes, are different meshes, but the spec has one list and "one G-buffer pipeline" per tier. Three ways to do it:
  - one draw per (body, tier) with its own sub-list and capacities: 18 lists;
  - one merged mesh per tier that collapses the unused bodies the way people's parts are collapsed: every instance runs the vertex shader for all 9 bodies, about 9 × 3,500 × 48 + 9 × 450 × 700 ≈ 4.4M vertex evaluations, which is not in the GPU estimate;
  - one shared loft topology bent per body from a small parameter table, as `shape()` already does per type. This is the right answer.
  
  The spec should choose. The GPU cost section assumes the third without saying so.
- **The lamp sprites limit the fleet.** The sprites use fixed per-type offsets (`hl` 2.3 / 2.4 / 5.95, lateral 0.62-0.66 × `xs`, height 0.62-0.68 × `ys`), and the spec forbids changing them. So the saloon, hatchback, compact SUV, MPV and low coupe must all be 4.6 m long with lamps at about 0.65 m. They would differ only in the glass house. Per-body offsets computed in CAR_CS from the same seed hash would not touch any random stream, so this restriction is not needed. Drop it.
- **Body length versus car spacing.** The minimum spacing is `8 / (density × busy)`: 5 m on bridges at q2, and 8 m after a car even when a bus follows. Today's 4.5 m car, and the existing 11.7 m bus, already come close to touching. A box truck or MPV longer than the current per-type length will overlap the next car. At hero range on a street, that is an obvious defect. State that each body stays within its type's current length.
- **Wheel-spin motion vectors.** These need the along-distance from the previous frame. `CarOut` has no free component (p.w seed, f.w type, pp.w colour, pf.w fade), so the struct must grow. That is easy, but not in the plan.
- **People near the lens.** Agents under 4.5 m are shrunk (`smoothstep(2.0, 4.5, dist)` in CROWD_CS). At B1 the head at the bottom right is a half-size person. Hero detail on a shrunken figure makes the scale error more obvious. The hero tier should cull, not shrink, under about 3 m, or keep the shrink only outside the frame.
- **Umbrellas are not upgraded.** In rain, the nearest people are mostly umbrella: the A4 foreground figure, and one of the B1 group. The 10-sided canopy and pole are left as they are, so the largest person surface at A4 does not change.
- **The 150 m pop changes shape, not just detail.** An SUV or coupe that becomes the generic box at 150 m changes silhouette, which is more visible than a LOD change. It is visible only in bursts, but the u12 burst is judged.
- **A risk on the target rule.** If A4 falls below 2.0%, the targets may be B2 and B1 only, and 2/3 of 2 means both must win. The spec should say how the rule rounds before step 0.

### What would make it stronger
- **Add a cheap paint reflection to the hero and middle tiers.** For example, a procedural reflection of the city in the clear coat: a dark ground below the horizon, a lit band of facade colour above it and streaks of neon tint by the reflected direction, plus a stronger specular response to the existing point lights. This is the AAA "car paint" look, and it is what turns a dark slab into a car at B2. Check it on the held-out cameras before anything else.
- **Make the quick test decisive for B2.** Capture B2 three ways: main, the hero car, and that car's mesh hidden (dev only, not for adoption). If judges prefer "hidden" to the hero car, the defect is the car 1.1 m from the lens, not how the car is modelled. The program should know that before building the fleet.
- **Put the people work where the poses can see it.** For the B1 spectators seen from behind: hair shape and strands, collar and hood rims, backpacks and bags, cloth folds, hands and the raised phone, and pose variety. Keep faces simple until a target pose shows faces at hero range.
- **State the body-design rules:** one shared topology bent by per-body parameters; each body within its type's current length; lamp offsets per body from the seed hash.
- **Replace "pixel-identical with `?nocars&nocrowd`"** with the existing `trafficParts` switch, and keep the hashes of `CarIn`, `Agent` and the compute output.
