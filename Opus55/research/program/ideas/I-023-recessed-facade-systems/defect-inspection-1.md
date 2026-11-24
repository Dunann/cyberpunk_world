# I-023 defect inspection 1 (held-out H1-H6, candidate images only, strict AAA bar)

Counts: H1 0 critical / 5 major / 5 minor; H2 1/5/6; H3 1/4/3; H4 0/4/4; H5 0/3/5; H6 1/5/3.

## Defects attributable to I-023 (fix round)
1. **Reveals lit at a constant brightness** - bright white wedges on every lit window's top-left reveal; on ribbon floors they form a "saw blade" (H2 critical, 780-1420 x 0-330), cut-out-card windows (H1), beige reveals on unlit windows (H3 1000-1480 x 900-1300), sawtooth on cylinder rings and at grazing angles (H6). Fix: reveals lit by the room light (dark when unlit), ambient-occlusion falloff toward the outside, side reveals differ.
2. **Two window scales on one facade** - recessed windows sit over the old tiny-window speckle (H6 critical: 0-670 x 340-1440, 1440-1820 x 300-1440). Fix: one bay grid per facade; distant LOD keeps the same grid.
3. **Unlit floors lose floor articulation** (both blind judges, H6: several storeys read as one) and unlit glass is a flat black hole (H1, H2). Fix: floor slab/spandrel lines and dark reflective glass on unlit floors.
4. **Lit segments of random length / slivers** not snapped to the bay grid (H6 1560-1800 x 580-620 etc.; partial rectangle 935-955 x 820-860); isolated lit cells read as grey-white missing panels (H2). Fix: lit units follow the bay grid and curvature, no partial cells.
5. **Grazing-angle aliasing** - window grid collapses into shimmering stripes (H3 0-760 x 0-900), fin pinstripes at the aliasing limit (H6), seam stripes on a curved edge (H6 560-670 x 600-1440). Fix: filter by footprint at grazing angles.
6. **Glowing props in dark rooms** (H1 major) - coloured bars on sills of unlit windows glow. Fix: props visible/lit only when the room is lit (check whether I-023's own-window light causes this).
7. Lit ribbon bands overexposed flat white (H2, H6). Fix: exposure and interior depth.

## Pre-existing defects (not I-023; for the defect backlog)
Flat empty roofs with only an outline glow (H4, H5); one stepped Art Deco crown cloned across the skyline (H4, H5); placeholder beige planes on a near building (H3 critical); floating magenta slab (H3); AC boxes as floating cubes (H3); sign "confetti" noise at distance (H4, H5); pink crown stripes shear across facets (H1); flat pagoda eaves (H1); city ending abruptly against black terrain (H4); bridge "pyramids" (H5); invisible rain/no wet facades.

## Inspector's top 5
1 reveals by geometry; 2 one window grid + correct LOD filtering; 3 unlit glass and wall as real materials, dark props when unlit; 4 realistic occupancy (no whole floors in one colour, no slivers, lower band exposure); 5 replace placeholder geometry (H3 near building, empty roofs, cloned crowns).
