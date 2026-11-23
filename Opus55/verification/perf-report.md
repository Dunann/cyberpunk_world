# Performance report

- Adapter: nvidia lovelace NVIDIA GeForce RTX 4050 Laptop GPU
- Resolution: 2560x1440 (high preset), scripted 60 s fly-through, first 2 s excluded
- Point lights: 4778
- JS heap: 149.63 MB at start, 154.93 MB max, 125.77 MB at end

| Metric (ms) | Avg | p50 | p99 | Max |
|---|---|---|---|---|
| GPU time (timestamp queries, sum of passes) | 8.44 | 8.39 | 9.89 | 10.16 |
| Frame interval (requestAnimationFrame) | 9.41 | 8.30 | 16.90 | 17.90 |

Gate: GPU avg <= 11 ms, p99 <= 16.7 ms, max <= 25 ms -> **PASS**

| Pass | Avg ms | p99 ms | Max ms |
|---|---|---|---|
| lighting | 3.26 | 3.94 | 4.15 |
| gbuffer | 1.89 | 2.63 | 3.21 |
| taa | 0.90 | 0.95 | 1.01 |
| fog | 0.65 | 0.80 | 1.14 |
| post | 0.53 | 0.55 | 0.57 |
| ssr | 0.42 | 0.68 | 0.72 |
| forward | 0.30 | 1.04 | 1.41 |
| vegetation | 0.15 | 0.53 | 0.72 |
| ssr-comp | 0.10 | 0.15 | 0.18 |
| bld-cull | 0.07 | 0.49 | 0.57 |
| lightshow | 0.07 | 0.47 | 0.66 |
| bloom | 0.06 | 0.06 | 0.08 |
| traffic-cs | 0.04 | 0.41 | 0.49 |
| rain | 0.02 | 0.02 | 0.02 |

No WebGPU errors.
