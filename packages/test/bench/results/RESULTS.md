# @youneed/test — runner benchmark results

Mean wall-clock to run the **same workload** (identical cases, native syntax per runner) in **milliseconds** (lower is better), `mean ± stddev`, via `hyperfine`.
Baseline for the relative column is **youneed**. Mode: full.

| Runner | mean ± stddev (ms) | median | min | max | vs youneed |
| --- | --- | --- | --- | --- | --- |
| @youneed/test | 186.2 ± 12.0 | 183.7 | 172.5 | 210.4 | 1.00× (baseline) |
| node:test | 292.7 ± 41.5 | 279.2 | 257.7 | 415.7 | 1.57× |
| vitest | 720.3 ± 64.7 | 709.3 | 649.9 | 862.3 | 3.87× |
| jest | 712.2 ± 19.5 | 717.1 | 679.2 | 736.2 | 3.83× |
| @playwright/test | 2389.2 ± 141.3 | 2339.9 | 2258.9 | 2681.7 | 12.83× |

> hyperfine times the whole command (startup + bootstrap + run). Numbers are
> machine-specific; trust back-to-back relative multipliers, not absolutes.
