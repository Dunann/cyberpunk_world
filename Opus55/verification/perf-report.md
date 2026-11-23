# Performance report

- Adapter: nvidia lovelace NVIDIA GeForce RTX 4050 Laptop GPU
- Resolution: 2560x1440 (high preset), scripted 60 s fly-through, first 2 s excluded
- Point lights: 5091
- JS heap: 280.71 MB at start, 280.71 MB max, 208.02 MB at end

| Metric (ms) | Avg | p50 | p99 | Max |
|---|---|---|---|---|
| GPU time (timestamp queries, sum of passes) | 9.44 | 9.33 | 11.16 | 13.10 |
| Frame interval (requestAnimationFrame) | 10.47 | 10.40 | 13.40 | 20.80 |

Gate: GPU avg <= 11 ms, p99 <= 16.7 ms, max <= 25 ms -> **PASS**

| Pass | Avg ms | p99 ms | Max ms |
|---|---|---|---|
| lighting | 3.40 | 4.20 | 4.41 |
| gbuffer | 2.45 | 4.22 | 6.42 |
| taa | 0.90 | 0.94 | 0.94 |
| fog | 0.63 | 0.78 | 0.99 |
| ssr | 0.59 | 0.93 | 0.95 |
| post | 0.52 | 0.55 | 0.56 |
| forward | 0.37 | 1.34 | 1.54 |
| bld-cull | 0.17 | 0.54 | 0.56 |
| vegetation | 0.13 | 0.52 | 0.53 |
| ssr-comp | 0.07 | 0.19 | 0.24 |
| lightshow | 0.07 | 0.38 | 0.61 |
| bloom | 0.06 | 0.06 | 0.06 |
| traffic-cs | 0.04 | 0.05 | 0.42 |
| crowd-cs | 0.03 | 0.03 | 0.42 |
| rain | 0.01 | 0.02 | 0.02 |

No WebGPU errors.
