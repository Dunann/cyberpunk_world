# Code map: Opus55/source/src

Read `Opus55/source/BRIEF.md` first: it is the engine contract (G-buffer outputs, motion vectors, forward pass, lights, no per-frame allocations, WGSL in `/* wgsl */` literals, build and capture tools). Coordinates are meters: X east, Y up, Z south. The water surface is at Y = 0.

| Area | Files |
|---|---|
| Core engine | `renderer.js` (deferred, tiled lighting, TAA, module hooks), `common.js` (shared WGSL: Frame `F`, `terrainHeight`, `worldInfo`, `districtRoad`, `applyFog`), `post.js` (bloom, composite), `gpu.js`, `lights.js`, `main.js` (module order and `ctx`), `controls.js`, `quality.js` |
| World layout and terrain generation | `world.js` (`RIVERS`, `LAKE`, `DISTRICTS`, `BRIDGES`, `ROUTES`, `LANDMARKS`, `POSES`, lot generation `_buildLots`, colliders) and `terrainLand.js` (`landHeight`, `carveWater`) |
| Terrain rendering | `terrain.js`, `terrainShade.js` (ground material, roads, puddles), `terrainGen.js`, `terrainLamps.js`, `terrainBank.js` (river embankments and promenades) |
| Vegetation | `vegetation.js`, `vegMeshes.js` (GPU-placed trees with LODs; placement rules decide where forest appears) |
| Gardens | `garden.js`, `gardenMesh.js`, `gardenViews.js` |
| Buildings | `buildings.js` (GPU culling and draws), `buildings_gen.js` (district generators, crowns, props, sign slots), `buildings_landmarks.js` (landmarks, the Hongyadong stilt complex `stilts`, the night market), `buildings_wgsl.js` (parametric shapes and facade materials) |
| Water, bridges, boats, light show | `water.js`, `waterGen.js`, `waterSSR.js` (river and wet-ground reflections), `bridges.js`, `boats.js`, `lightshow.js`, `showBeams.js` |
| Traffic and people | `traffic.js` (wrapper), `trafficCars.js`, `trafficGeom.js`, `transit.js`, `transitLayout.js`, `transitStatic.js` (monorail, metro, cableway, Liziba tower), `air.js`, `airShapes.js` (air traffic, drone show), `crowd.js`, `crowdMesh.js` |
| Signs | `signs.js`, `signAtlas.js` (Canvas2D atlas of CJK, Mongolian, Cyrillic and Uyghur text), `signPlace.js` |
| Atmosphere and sound | `sky.js`, `fog.js`, `rain.js`, `audio.js` |

## Tools
Run from `Opus55/source`:
- `node build.mjs --dev`, then `node tools/capture.mjs --poses-file ../eval/poses-v1.json --ids A1,A2 --jpg --profile <unique> --out out/<dir>` captures eval cameras.
- `--cam x,y,z,yaw,pitch,t --name foo` captures a custom camera.
- `--stats` adds GPU ms per pass.
- `node tools/probe.mjs x,z` gives terrain height, water distance and district.

## Current costs
- **Whole frame:** about 9.6 ms of GPU time at 2560x1440. The budget is 11 ms average.
- **Largest passes:**

| Pass | Approx. ms |
|---|---|
| lighting | 3.4 |
| gbuffer | 2.5 |
| taa | 0.9 |
| fog | 0.65 |
| ssr | 0.5 |
| post | 0.53 |
