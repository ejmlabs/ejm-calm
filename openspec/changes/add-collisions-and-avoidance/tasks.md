## 1. Registry

- [x] 1.1 `obstacles.ts`: spatial hash, capsules and spheres, overlap and feeler queries; analytic samplers exposed beside it; tests
- [x] 1.2 Record load time (desktop and phone medians: first paint, first contentful paint, first sea frame, KB) before and after

Load time, seed 42, 9 Mbps down, 1.5 Mbps up, 170 ms round trip, phone CPU slowed 4×; medians of 7 cold loads per build, base and branch interleaved on a shared machine under heavy load (load average about 40 on 8 cores, software GL), so absolute times are inflated and noisy (phone first sea frame ranged 19–36 s in both builds):

| Profile | Metric | Before | After |
|---|---|---|---|
| Desktop | First paint | 2620 ms | 1024 ms |
| Desktop | First contentful paint | 2620 ms | 1024 ms |
| Desktop | First sea frame | 15517 ms | 15370 ms |
| Desktop | Transfer | 784.3 KB | 788.2 KB |
| Phone | First paint | 1996 ms | 1820 ms |
| Phone | First contentful paint | 1996 ms | 1820 ms (one load reported none; first paint shown) |
| Phone | First sea frame | 26404 ms | 25638 ms |
| Phone | Transfer | 785.5 KB | 789.4 KB |

The script grows by 3.9 KB before compression; no dependency is added. Nothing new runs before the first frame.
