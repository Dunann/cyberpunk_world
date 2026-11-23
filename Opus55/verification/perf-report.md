# Performance report

- Adapter: nvidia lovelace NVIDIA GeForce RTX 4050 Laptop GPU
- Resolution: 2560x1440 (high preset), scripted 60 s fly-through, first 2 s excluded
- Point lights: 5033
- JS heap: 394.51 MB at start, 398.08 MB max, 211.30 MB at end

| Metric (ms) | Avg | p50 | p99 | Max |
|---|---|---|---|---|
| GPU time (timestamp queries, sum of passes) | 9.54 | 9.39 | 11.53 | 12.89 |
| Frame interval (requestAnimationFrame) | 10.58 | 8.40 | 17.00 | 25.40 |

Gate: GPU avg <= 11 ms, p99 <= 16.7 ms, max <= 25 ms -> **PASS**

| Pass | Avg ms | p99 ms | Max ms |
|---|---|---|---|
| lighting | 3.46 | 4.38 | 4.58 |
| gbuffer | 2.52 | 4.32 | 6.30 |
| taa | 0.88 | 0.92 | 0.93 |
| fog | 0.64 | 0.78 | 0.98 |
| ssr | 0.59 | 1.00 | 1.02 |
| post | 0.52 | 0.55 | 0.56 |
| forward | 0.37 | 1.35 | 1.56 |
| bld-cull | 0.17 | 0.54 | 0.74 |
| vegetation | 0.12 | 0.51 | 0.53 |
| lightshow | 0.07 | 0.37 | 0.60 |
| ssr-comp | 0.06 | 0.17 | 0.22 |
| bloom | 0.06 | 0.06 | 0.06 |
| traffic-cs | 0.05 | 0.05 | 0.44 |
| crowd-cs | 0.02 | 0.03 | 0.03 |
| rain | 0.02 | 0.02 | 0.03 |

No WebGPU errors.
