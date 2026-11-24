## Reviewer 1 (2026-11-24)

| | Score (1–10) | Reason |
|---|---|---|
| Creativity | 5 | New to this program (no earlier idea touched cars or people), but the method is standard AAA practice: a close-range LOD0 and component swaps keyed by an instance hash. The film framing adds a useful discipline (a fixed fleet and wardrobe), not a new technique. |
| Feasibility and credibility | 6 | The GPU cost and the shared random streams hold up against the code. There are real gaps: the "lamp sprites unchanged" rule conflicts with a varied fleet, the tier boundaries make components pop, CarOut has no free field for wheel spin, and the standing poses need joint rotations the shader does not have. The quick test covers only the car half. |
| Expected impact | 6 | It removes two critical defects (B2 box car, B1 mannequins) and one major defect (box cars at A4 and B2). Those defects must go at some point, because the goal allows nothing above minor. But it moves only 3 of 14 poses, by about +0.5 to +1.0 at best: about +0.4 for Zone B and +0.1 for Zone A. |
| **Overall (average)** | 5.67 | |

### Checks against the code and images
- **The B2 purple block is the existing car mesh. The spec's claim is correct.** In the crop of `runs/I-016m/B2-cbd-street.jpg`:
  - The purple diagonal band is the body flank (the 7-point profile, y 0.3-0.92 m). The navy paint `paint(3)` = (0.02, 0.04, 0.12) with metal 0.55 reads purple under the violet street light. No palette entry is purple.
  - The black slab above the band is the glass house: albedo 0.01, roughness 0.05, `m = 2`.
  - The two small black rectangles are the box wheels (material 2).
  - The FOV is 1.05 rad, so the focal length is about 1,242 px. A wheel box is 0.64 m tall and about 210 px on screen, which puts the near flank at about 3.8 m. The roof edge sits about 70-120 px below the horizon, which fits a 1.38 m roof seen from 1.7 m.
  - Conclusion: this is one car at about 3-6 m, seen from above and from the side.
- **The spec's "wheels hidden inside the body" is not quite right.** The wheel boxes (y 0-0.64, outer x 0.93) stick out 3 cm past the body (x 0.9) and hang below the 0.3 m sill. They are visible but do not read as wheels. That matches the critics' "wheel-less".
- **The seeds are where the spec says.**
  - Car: `rnd()` goes into `CarIn.b.z`, is copied to `CarOut.p.w`, and reaches the fragment shader as `info.w`.
  - Person: the seed is `Agent.c.y`, copied to `Person.p.w`.
  - Selection by hash adds no CPU draws to `rng(31337)`, `rng(31338)`, `rng(8080)` or `rng(9191)`. Placements, types, colours and style bits stay identical by construction.
- **The GPU estimate is credible.**
  - There is no shadow-map pass in `renderer.js`, so every added triangle is drawn once, in the G-buffer.
  - +0.55M triangles in the worst case, plus cheap pixel shading on 2-15% of the frame, fits the +0.05-0.15 ms average estimate. The budget risk is low.
- **Some "new" features already exist:**
  - LOD0 already has a nose box and shoe boxes (`crowdMesh.js`).
  - Skin already varies per person: `mix(...)` by `h` in the person `fs`.
  - 8% of jackets already have LED piping (`h3 < 0.08`).
  - The new 5-tone skin and the 12% LED trim must replace these, not stack on top of them. Because the person `fs` is shared by all LODs, these shading changes also reach far people, so "far people keep the existing look" is only true for the meshes.
- **The B1 spectators face away from the camera.** They face the river (+x), and so does the camera, so the judges see the backs of heads. In B1 the face work (eyes, brows, lips, masks, glasses) is almost invisible. B1 gains only from back and side views: hair, collars, backpacks and bags, hands, cloth detail, build and pose. Faces pay off only at A4, where the foreground umbrella walker faces the camera, and on walkers.

### Strongest reason it will fail
The B2 car is 3-6 m from the lens and covers about 15% of the frame, seen from above: roof, glass house, flank and arches. At that range, a 3,500-triangle loft car with flat paint, seams from uv lines and a parallax cabin seen at a grazing angle is likely to read as a toy to a strict judge anchored on AAA games. The renderer has no environment reflections on paint beyond SSR, which is what sells car bodies in games. So B2 probably wins only because "something that looks like a car" beats "a purple slab". That is a pairwise win, but the critic gain is smaller than claimed, and detail stays the weakest axis.

The people half carries B1, and it is not tested before the full build:
- The quick test is cars only.
- At B1, most of the people budget (faces) cannot be seen.
- The spec's own uncanny-valley risk has no go/no-go rule.

The likely outcome is a B2 win, a lean at A4 and a tie at B1. That is 2/3 at best, with no margin, after about 1,500 lines of work.

### Other concerns
- **The lamp-sprite rule conflicts with the fleet.**
  - Sprite offsets depend only on type: `hl` = 2.3 m for type 0, 2.4 m for vans, 5.95 m for buses, with heights of 0.62-0.68 m.
  - Five type-0 bodies (saloon, hatchback, compact SUV, MPV, low coupe) with different lengths and lamp heights cannot all sit under the same sprites. Lights would float off the body, and the u12 burst would show it.
  - Either the fleet varies only the roof and glass house (little variety), or the sprite offsets must come from the same body hash in `CAR_CS`. That is harmless to the random streams and costs nothing, so the spec should allow it.
- **Wheel spin needs data that CarOut does not carry.**
  - All four `w` lanes of `CarOut` are used (seed, type, colour, fade), and the along-distance is not stored. The struct must grow to 80 bytes, or the angle must be computed another way.
  - At 9-17 m/s with a 0.36 m radius, the wheel turns about 25-47° per 60 Hz frame. A 5-spoke rim (72° period) will alias: it looks static or turns backwards, and TAA will ghost it. Use a rotational blur of the spokes above a few rad/s, as games do.
- **Tier overflow is not deterministic.**
  - The append uses `atomicAdd`, so when the hero list is full, which cars spill to the middle tier changes from frame to frame. Cars would flicker between meshes (wheels, interior, underglow) in motion.
  - The "no overflow at eval poses" check does not cover the fly-through or held-out views. Size the hero capacity well above the observed maximum, or choose the hero tier by distance rank.
- **Components pop at the tier boundaries.**
  - Girth, shoes, eyewear, masks, headphones and LED trim are hero-only, so they appear at 12 m. Bags appear at 22 m. A person who suddenly gains a backpack or a wider body is a visible pop.
  - Cheap components should be on every level that shows them: girth as a vertex scale on all LODs, bags on LOD0 and LOD1, or a dithered fade.
  - The same applies to car paint roughness and seams at the 150 m boundary.
- **The new standing poses need new joint rotations.** The arm rig is two `rotX` rotations about the local x axis (`arm()` in `PERSON_WGSL`). Crossed arms and hands in pockets need the arm to swing in toward the body, which a rotation about x cannot do. A head tilt needs the head, hair and hat parts (1, 15-18, 25) to rotate together about the neck. This part is underestimated.
- **People shrink near the lens.** `pf.w` includes `smoothstep(2.0, 4.5, dist)`, so people closer than 4.5 m shrink instead of fading out. The grey head at the bottom centre of B1 (about 1,120-1,200 x 1,360-1,440) is probably one of them. The hero tier inherits this. A strict judge sees a child-sized figure, so replace the shrink with a dithered fade or a cull.
- **Specular shimmer.** A clear-coat roughness of 0.12-0.2 under the many point lights gives tiny, sharp highlights that will sparkle in motion on 1-2 px seams. Clamp the roughness by distance, or filter it by normal variance.
- **Inconsistencies in the spec.**
  - "Total capacity and the lamp list are unchanged" conflicts with hero 48 + middle 700 + far 2,600.
  - The middle-tier capacity at q0 and q1 is not given ("—").
  - The crowd args buffer (16 u32, glint count at index 15) and the car args buffer (lamp count at index 6, read by the lamp vertex shader) both need new layouts for the extra indirect draws. The spec does not mention this.
- **The identity check depends on order.** The near lists are filled by atomics, so their order changes between runs. Sort by seed before hashing the compute output. `?nocars` and `?nocrowd` do not exist yet. Only `noplan` exists, in `plan.js`, so both flags must be added as dev flags.
- **Merge overlap with I-026.** I-026 appends gallery agents in `crowd.js` from its own stream. The two do not conflict on streams, because I-025 hashes the seeds, but whichever lands second must re-run the identity check.

### What would make it stronger
1. **Add a people quick test before the full build.** Build the hero person on its own and capture B1, A4 and the two promenade held-out cameras. Run one blind judge on both orders, with a go rule such as "wins or ties at B1 and wins at least 1 of 2 promenade cameras". A clear "prefers main" from any judge stops the face work.
2. **Put the people budget where the camera sees it.** At B1 that means back and side silhouettes: backpacks and bags, hood and collar rims, hair shapes, hands, cloth folds and seams, and pose variety. Faces should be value shapes only, and only after step 1 passes.
3. **Take lamp sprite offsets and heights from the body hash** in `CAR_CS`, so the fleet can really vary in length and height. Then require bars and sprites to line up per body in the u12 burst.
4. **Prove the B2 car at its real range.** Before eval, capture B2 and one held-out camera with a hero car at 3-6 m seen from above. Spend the extra effort on what shows from there: roof panel lines and sunroof or roof rails, the glass reflecting the street through SSR (`m = 2` already exists), the arch and tyre silhouettes, and a metallic-flake paint term. Have one judge compare it against main. A win at B2 only "because it is no longer a slab" is fine for adoption, but the critic-score claim should be stated that way.
5. **Fix the tier mechanics in the spec:**
   - put components on all the levels that show them, or fade them in a dithered band;
   - give the hero list headroom, or choose it by distance rank;
   - blur the spokes when the wheel turns fast;
   - make the near-lens shrink a fade;
   - store the along-distance in a larger CarOut.
6. **Name the new rotations** the standing poses need (an arm swing toward the body, a neck pivot for parts 1, 15-18 and 25), or drop crossed arms and hands in pockets and keep the poses that `rotX` can do: the weight shift, the drink, the raised phone and the head tilt (once a neck pivot is added).
