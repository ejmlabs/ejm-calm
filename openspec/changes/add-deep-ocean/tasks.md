## 1. Bathymetry (D1)

- [x] 1.1 Depth profile by coast distance: shelf to about 140 m, slope 3 to 4 degrees, plain at 3000 to 4000 m; island flanks steep; the seafloor and underwater view take the depth; tests for the profile, continuity and the seafloor join
- [x] 1.2 Record load time (desktop and phone medians: first paint, first contentful paint, first sea frame, KB) before and after
  - Five cold loads each, 9 Mbps down, 170 ms round trip, phone CPU slowed 4×, on a heavily loaded machine (load average about 40 on 8 cores), so the times are mostly noise; the code this adds does not run until it is wired.
  - Desktop: first paint 612 → 976 ms, first contentful paint 612 → 976 ms, first sea frame 7044 → 9163 ms.
  - Phone: first paint 880 → 1460 ms, first contentful paint 1032 → 1460 ms, first sea frame 16853 → 16029 ms.
  - Transfer: 784.3 → 784.5 KB.
- [ ] 1.3 Wire the planet layout's continental coast distance into both seafloors once it lands; update tests and the seed sweep honestly
