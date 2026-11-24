# Current best (runs/I-016m) - strict critic findings

## Critic 1 (2026-11-24)
Zone means: A 5.79, B 5.69, G 5.88 (computed from best-016m-critic-1.json).

Critical defects: A2 embankment wall is a blank untextured slab across the full width; B2 a large purple-black untextured block fills the bottom left (0-1030, 900-1440).

Major defects (selection): identical window/balcony module across Hongyadong (A1, A2); flat black embankment strip (A1); supertall bases hidden behind the stack, look pasted on (A1); identical small sign rectangles (A2); unlit black wedge in front of the stack (A3, 580-1000 x 840-1150); peninsula tip a sharp slab (A3, G2, G3 "tray"); flat storefront panels with no interiors, car-sized AC box with spiral decal, wheel-less box cars (A4, B2); guideway beam untextured with no piers, black voids below it and under the hillside street (A5); one window texture on every tower, no terrain relief (A6, G1, G3); mannequin spectators, flat promenade (B1); pixel-noise curtain wall (B2); dark forest band on far bank (B3, G2); stripe/moire on cylinder facade (B4); mountains barely visible (G1, G3); empty brown lots mid-city (G3, 1170-1800 x 690-830); clone lollipop trees (G2); bump-texture hillside, city sits on top of slope with no step-down (G4).

Ten changes ranked by the critic:
1. Several facade systems (curtain wall with mullions, residential with balconies/AC, banded concrete), mipmapped to remove moire. A1 A2 A3 A5 A6 B2 B3 B4 G1 G3 G4.
2. Real hill terrain under the city and readable mountains (layered haze, lit ridgelines, buildings stepping up slopes). A4 A6 G1 G3 G4 B3.
3. Near-camera materials (storefront interiors, paving, embankment walls, railings, grime). A2 A4 B1 B2 G1 G2 A5.
4. Riverside edges: stepped revetments, piers, stairs, moored boats, lit walkways. A1 A2 A3 G2 G3 B3.
5. Fill voids / remove placeholders (A3 wedge, B2 slab, G3 empty lots, A5 voids, B3/G2 forest strips).
6. Break up the Hongyadong stack (roof forms, floor heights, lanterns, varied signs, crowds). A1 A2 A3 G2.
7. Better people and vehicles. A4 B1 B2 A2 G2 G4.
8. Supertall forms: crowns, setbacks, fins; less reliance on real shapes. A3 B1 B2 B3 B4.
9. Vegetation variety. G2 B3 G3 G4 A5 G1.
10. Missing brief parts: Central Asian/Mongolian architecture and script, readable holograms and aircraft; fewer drone specks and searchlights.

## Critic 2 (2026-11-24)
Zone means: A 5.58, B 5.62, G 5.44. Two-critic means: **A 5.67, B 5.62, G 5.62** (baseline A 5.33, B 5.34, G 5.12). Axis means: detail 4.86, character 6.00, coherence 5.64, brief 6.07. Distance to the goal of 9 everywhere: 3.3-4.1 points; detail is the weakest axis.

Critical: A3 huge dark curved wedge (600-970 x 840-1150); B1 mannequin foreground characters; B2 the purple box; G3 districts as flat slabs with geometric corners.

New points not in critic 1:
- **Near-replica landmarks (violates the user's rule "inspired by, never replicas"):** Shanghai Tower (B1, B3, B4, G3), Bank of China (B2, G3), Canton Tower (G2, G3), Raffles City (A3, G2), Petronas (B3, G3), CN Tower (G3), Salesforce (A6).
- Laser fan converges on an empty point over the water with no emitter (B1); searchlights and beams are hard-edged solid quads (B4, G1, G4).
- Suspension bridge deck curves sharply (B3); no historic Bund facades visible (B3).
- Unexplained primitives: A4 blue-purple slope plane (0-600 x 380-560), A6 floating neon bars, G1 glass pyramids, A5 floating guideway.
- Rain is invisible in most frames; river empty of traffic (A3, G3).
- Cable-car passengers are flat 2D cut-outs (G4); identical bridge pylons (G4).

Critic 2's ranked changes: 1 facade systems; 2 hill terrain; 3 tall readable mountains in mist; 4 people and vehicles; 5 waterfront edges and river traffic; 6 redesign near-replica landmarks; 7 visible Central Asian/Mongolian culture; 8 remove/model unexplained primitives; 9 volumetric beams, emitters, readable drones; 10 ground materials and varied vegetation.
