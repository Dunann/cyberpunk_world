# Performance report

- Adapter: nvidia lovelace NVIDIA GeForce RTX 4050 Laptop GPU
- Resolution: 2560x1440 (high preset), scripted 60 s fly-through, first 2 s excluded
- Point lights: 4973
- JS heap: 272.61 MB at start, 272.61 MB max, 195.86 MB at end

| Metric (ms) | Avg | p50 | p99 | Max |
|---|---|---|---|---|
| GPU time (timestamp queries, sum of passes) | 9.08 | 8.98 | 10.68 | 12.41 |
| Frame interval (requestAnimationFrame) | 10.11 | 10.00 | 14.60 | 24.30 |

Gate: GPU avg <= 11 ms, p99 <= 16.7 ms, max <= 25 ms -> **PASS**

| Pass | Avg ms | p99 ms | Max ms |
|---|---|---|---|
| lighting | 3.37 | 4.16 | 4.48 |
| gbuffer | 2.22 | 3.66 | 5.56 |
| taa | 0.88 | 0.93 | 0.95 |
| fog | 0.65 | 0.80 | 0.97 |
| ssr | 0.55 | 0.87 | 0.89 |
| post | 0.52 | 0.55 | 0.56 |
| forward | 0.37 | 1.15 | 1.40 |
| vegetation | 0.14 | 0.53 | 0.56 |
| bld-cull | 0.10 | 0.51 | 0.74 |
| ssr-comp | 0.07 | 0.17 | 0.22 |
| lightshow | 0.07 | 0.38 | 0.62 |
| bloom | 0.06 | 0.06 | 0.06 |
| traffic-cs | 0.04 | 0.04 | 0.45 |
| crowd-cs | 0.02 | 0.03 | 0.44 |
| rain | 0.01 | 0.02 | 0.02 |

No WebGPU errors.
