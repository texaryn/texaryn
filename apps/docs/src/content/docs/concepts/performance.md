---
title: Performance baseline
description: Reproducible runtime, React, and browser input measurements for Texaryn.
---

This page records a local baseline for the published React form path. The
measurements are not comparisons with other form libraries and are not CI
thresholds.

The measured packages use source from
[commit `973dfca`](https://github.com/texaryn/texaryn/commit/973dfcab2498a8997cdb77686531a7ae4577a18d).
The benchmark runner added with this baseline
([source](https://github.com/texaryn/texaryn/blob/main/apps/playground/scripts/benchmarks/run.mjs))
prints its measurements and environment as JSON. Run it with
[`pnpm bench:performance`](https://github.com/texaryn/texaryn/blob/main/package.json).

## Environment

| Component | Version or value |
| --- | --- |
| OS | macOS 25.6.0, arm64 |
| CPU | Apple M1 Max |
| Memory | 32 GiB |
| Node.js | 26.5.1 |
| Chromium | 153.0.8010.12, headless |

Each timing reports the median and 95th percentile. Compiler measurements use
200 samples after five warmups. First render uses 20 samples after five
warmups. Array commands use 60 samples for 10 and 100 rows, and 30 samples for
1,000 rows.

## Compiler and first render

The compiler measurement calls `compile()` with an already prepared schema
projection. It excludes schema adapter preparation and projection work.

| Schema fields | IR nodes | Compile p50 | Compile p95 |
| ---: | ---: | ---: | ---: |
| 10 | 11 | 0.0062 ms | 0.0143 ms |
| 50 | 51 | 0.0242 ms | 0.0293 ms |
| 200 | 201 | 0.0526 ms | 0.1042 ms |

The first render measurement includes schema adapter creation, runtime creation,
and React `renderToString()`. It does not include browser startup, network
transfer, or a browser paint.

| Schema fields | p50 | p95 |
| ---: | ---: | ---: |
| 10 | 2.0509 ms | 3.7809 ms |
| 50 | 3.4337 ms | 9.6008 ms |
| 200 | 10.9988 ms | 12.3198 ms |

The 50-field compiler result is below the roadmap target of 1 ms. The end to end
server render includes substantially more work than `compile()` alone.

## Browser input to DOM update

The runner measures 200 checkbox input events in a 50-field form. It starts at
the browser `input` event and stops at the next animation frame where the
runtime data matches the checkbox and the conditionally rendered `Extra` field
is present or absent as expected.

| Events | p50 | p95 |
| ---: | ---: | ---: |
| 200 | 4.7 ms | 6.7 ms |

This includes browser frame scheduling and a conditional renderer update. It is
a single headless Chromium run, not a device-wide user latency guarantee.

## Array operations

Each sample measures one `InsertItem`, `RemoveItem`, or `MoveItem` dispatch on
the core runtime. It includes projection and compilation work, and excludes a
renderer update.

| Rows | Command | p50 | p95 |
| ---: | --- | ---: | ---: |
| 10 | Insert | 0.2046 ms | 0.3173 ms |
| 10 | Remove | 0.1907 ms | 0.2560 ms |
| 10 | Move | 0.1867 ms | 0.2581 ms |
| 100 | Insert | 1.7043 ms | 2.3044 ms |
| 100 | Remove | 1.5449 ms | 2.0184 ms |
| 100 | Move | 1.6604 ms | 2.4717 ms |
| 1,000 | Insert | 16.8838 ms | 19.0648 ms |
| 1,000 | Remove | 16.4632 ms | 18.2936 ms |
| 1,000 | Move | 16.7814 ms | 18.3409 ms |

The 1,000-row case exceeds one 60 Hz frame per command at p95 on this machine.
This synthetic workload does not show whether applications routinely need
arrays of this size.

## Validation throughput

The runner validates the same valid object against a prepared 50-field JSON
Schema adapter 2,000 times. The measured rate was **68,269 validations per
second**. The schema has scalar string properties without additional
constraints, so this is a small validation workload.

## Memory

The browser benchmark measures Chromium JavaScript heap deltas after forced
garbage collection. The schema adapter and app bundle are loaded before the
baseline. Each size gets 10 warmup mount and unmount cycles, one measured mount,
then 50 measured mount and unmount cycles. Mounted deltas include the runtime
and rendered React tree.

| IR nodes | Mounted heap delta | After unmount | After 50 cycles |
| ---: | ---: | ---: | ---: |
| 13 | +251 KiB | +35 KiB | +196 KiB |
| 53 | +867 KiB | +6 KiB | +75 KiB |
| 203 | +2,080 KiB | -178 KiB | -275 KiB |

These are single-run heap samples, not process memory or proof that subscriptions
cannot leak. Garbage collection and runtime warmup affect the residual heap.
Repeat the benchmark on the target browser and device before making a memory
claim.

## Reproduce

Run from the repository root:

```sh
pnpm bench:performance
```

The command builds workspace packages, runs the benchmark in Node and headless
Chromium, then prints the results and environment as JSON. It requires the
Playwright Chromium browser to be installed. Performance measurements are not
run in CI because shared runners do not provide a stable timing baseline.
