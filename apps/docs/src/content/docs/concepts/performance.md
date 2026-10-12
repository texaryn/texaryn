---
title: Performance baseline
description: Reproducible runtime, renderer, and browser input measurements for Texaryn.
---

This page records local baselines for Texaryn's runtime and renderer paths,
plus one workload comparison with RJSF. The measurements are not CI thresholds
or general library rankings.

The original runtime and React measurements use packages from
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
| 10 | 11 | 0.0078 ms | 0.0267 ms |
| 50 | 51 | 0.0374 ms | 0.0635 ms |
| 200 | 201 | 0.0495 ms | 0.1499 ms |

The first render measurement includes schema adapter creation, runtime creation,
and React `renderToString()`. It does not include browser startup, network
transfer, or a browser paint.

| Schema fields | p50 | p95 |
| ---: | ---: | ---: |
| 10 | 2.2505 ms | 3.9232 ms |
| 50 | 3.1213 ms | 8.9223 ms |
| 200 | 10.4516 ms | 11.3652 ms |

The 50-field compiler result is below the roadmap target of 1 ms. The end to end
server render includes substantially more work than `compile()` alone.

## Schema projection

These measurements isolate synchronous `project()` calls from the
`@texaryn/schema-json` adapter. They exclude adapter creation, schema
preparation, compilation, and result validation. Each workload reuses a
prepared adapter and prebuilt data snapshots. Five warmups precede the measured
samples. Flat and recursive cases use 200 timed samples each. The conditional
case records 200 timed calls total, alternating the discriminator for 100
inactive and 100 active samples.

| Flat schema fields | Projected nodes | Samples | p50 | p95 |
| ---: | ---: | ---: | ---: | ---: |
| 10 | 11 | 200 | 0.1980 ms | 0.3184 ms |
| 50 | 51 | 200 | 0.3275 ms | 0.4514 ms |
| 200 | 201 | 200 | 1.2928 ms | 1.5884 ms |

The 50-field conditional fixture projects 53 candidate nodes in either state.
Changing `enabled` exercises both branch activation and removal.

| Conditional state | Samples | p50 | p95 |
| --- | ---: | ---: | ---: |
| Inactive | 100 | 2.6472 ms | 3.0393 ms |
| Active | 100 | 2.6448 ms | 3.2204 ms |

The recursive fixture is synthetic and mutually recursive across four schema
definitions. It uses the adapter's default limits of 16 speculative objects
and 512 speculative nodes, with boundary generation 0. The expanded case adds
one budget boundary token at `/p0/p0/p1/p2`. Each case uses its own prepared
adapter with otherwise matching schema, data, limits, and generation.

| Recursive case | Nodes | Recursion boundary nodes | Budget boundary nodes | Recursive expansion nodes | Samples | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Bounded | 49 | 23 | 18 | 39 | 200 | 8.9555 ms | 12.2237 ms |
| One budget boundary expanded | 51 | 24 | 19 | 41 | 200 | 9.0030 ms | 9.8089 ms |

These are workload measurements, not a transferable per-node cost or a claim
about typical form latency. Recursion and budget boundary counts can overlap on
the same node. The two recursive timings are separate workload measurements;
the lower p95 in the expanded case does not establish that expansion is faster.
The recursive fixture specifically exercises both recursion and budget
boundaries.

## Browser input to DOM update

The runner measures 200 checkbox input events in a 50-field form. It starts at
the browser `input` event and stops at the next animation frame where the
runtime data matches the checkbox and the conditionally rendered `Extra` field
is present or absent as expected.

| Events | p50 | p95 |
| ---: | ---: | ---: |
| 200 | 4.8 ms | 6.1 ms |

This includes browser frame scheduling and a conditional renderer update. It is
a single headless Chromium run, not a device-wide user latency guarantee.

## Cross-renderer browser comparison

This production-build comparison uses one 50-field JSON Schema form with 50
string controls, one checkbox, and the conditional `Extra` field. Each renderer
uses the same schema adapter, core runtime, initial data, and default registry.
The schema adapter, registries, runtime, and data are ready before timing starts.

Mount timing includes framework mounting and ends after the harness checks the
expected controls at the second animation frame. It has 15 measured mounts per
renderer across five randomized trials, with two warmup mounts and three
measured mounts per trial. Each renderer trial uses a fresh browser page, and
renderer order is randomized. Each trial also performs five warmup activation
and removal cycles. Input timing starts at the checkbox `input` event and ends
at the first animation frame where both runtime data and the visible
conditional control match the checkbox state. The measured 200 transitions in
each trial produce 500 activation samples and 500 removal samples per renderer.

| Renderer | Mount p50 | Mount p95 | Activation p50 | Activation p95 | Removal p50 | Removal p95 | Combined p50 | Combined p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| React | 27.7 ms | 29.5 ms | 10.2 ms | 12.6 ms | 10.4 ms | 12.5 ms | 10.3 ms | 12.6 ms |
| Vue | 27.1 ms | 28.1 ms | 14.6 ms | 15.7 ms | 14.5 ms | 15.7 ms | 14.6 ms | 15.7 ms |
| Svelte | 27.4 ms | 28.8 ms | 14.7 ms | 15.5 ms | 14.6 ms | 15.7 ms | 14.7 ms | 15.6 ms |
| Solid | 27.6 ms | 28.5 ms | 14.6 ms | 15.6 ms | 14.5 ms | 15.4 ms | 14.5 ms | 15.6 ms |
| Web Components | 27.8 ms | 29.1 ms | 14.4 ms | 15.6 ms | 14.5 ms | 15.5 ms | 14.4 ms | 15.6 ms |
| Angular | 27.1 ms | 28.8 ms | 30.6 ms | 32.0 ms | 30.8 ms | 32.1 ms | 30.7 ms | 32.1 ms |

The run used macOS 25.6.0 on an Apple M1 Max with Node.js 26.5.1 and headless
Chromium 153.0.8010.12. It used the benchmark source at
[commit `60ff8ff`](https://github.com/texaryn/texaryn/commit/60ff8ff).
A frame observation confirms that the DOM update was visible by that point. It
includes frame scheduling and does not confirm a
completed paint. Angular development mode is disabled, and the harness asserts
`isDevMode() === false`. These results cover this form and machine only. They do
not measure cold bundle transfer or general framework performance. The earlier
single-run React input measurement above uses the Vite development server, so
its values are not directly comparable with this production-build comparison.

The comparison measures Texaryn renderer paths over the same core runtime.

## Comparison with RJSF

This production browser comparison uses a 50-field Draft 7 schema with 50
string controls, an `enabled` checkbox, and an `Extra` field conditional on
`enabled`. Texaryn uses `@texaryn/schema-json` and its default React registry.
RJSF uses `@rjsf/core` 5.24.13 and `@rjsf/validator-ajv8` 5.24.13 with its
default unthemed widgets. The RJSF submit button is omitted and its root element
is a `div`, matching the Texaryn `FormRoot` boundary. Both paths receive the
same schema and initial data.

The timer starts before each library's form setup and ends after the harness
checks the expected controls at the second animation frame. For Texaryn, setup
creates a new schema adapter and runtime from the Draft 7 schema and data.
RJSF receives the schema and data in its form component and resolves the visible
fields while rendering. The RJSF module and AJV validator are loaded before
timing. Each library gets five randomized fresh-page trials, two warmup mounts
and three measured setup and mount samples per trial. Each trial also performs
five conditional warmup cycles and 200 measured input transitions. That gives
15 setup and mount samples, 500 activation samples, and 500 removal samples per
library. Input timing starts at the checkbox `input` event and ends at the first
animation frame where form data and the visible conditional control match.

| Library path | Setup and mount p50 | Setup and mount p95 | Activation p50 | Activation p95 | Removal p50 | Removal p95 | Combined transition p50 | Combined transition p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Texaryn React | 31.1 ms | 32.3 ms | 10.6 ms | 12.4 ms | 10.9 ms | 12.3 ms | 10.7 ms | 12.4 ms |
| RJSF 5.24.13 | 31.1 ms | 32.6 ms | 11.9 ms | 13.4 ms | 12.0 ms | 13.5 ms | 11.9 ms | 13.4 ms |

This is one workload on one machine, not a general performance ranking. The
timed setup differs by library: Texaryn creates its schema adapter and runtime,
while RJSF builds its form from the supplied schema and data. The run used
macOS 25.6.0 on an Apple M1 Max with Node.js 26.5.1 and headless Chromium
153.0.8010.12. The benchmark implementation was at commit `0519b3b`. It does
not measure cold bundle transfer, validation, arrays, or themed renderers.

## Array operations

Each sample measures one `InsertItem`, `RemoveItem`, or `MoveItem` dispatch on
the core runtime. It includes projection and compilation work, and excludes a
renderer update.

| Rows | Command | p50 | p95 |
| ---: | --- | ---: | ---: |
| 10 | Insert | 0.2045 ms | 0.3054 ms |
| 10 | Remove | 0.1802 ms | 0.2209 ms |
| 10 | Move | 0.1922 ms | 0.2341 ms |
| 100 | Insert | 1.5580 ms | 2.1045 ms |
| 100 | Remove | 1.4502 ms | 1.7402 ms |
| 100 | Move | 1.4626 ms | 1.8021 ms |
| 1,000 | Insert | 15.8373 ms | 17.2435 ms |
| 1,000 | Remove | 15.8612 ms | 17.1364 ms |
| 1,000 | Move | 16.8661 ms | 19.6340 ms |

The 1,000-row case exceeds one 60 Hz frame for one command at p95 on this machine.
This synthetic workload does not show whether applications routinely need
arrays of this size.

## Validation throughput

The runner validates the same valid object against a prepared 50-field JSON
Schema adapter 2,000 times. The measured rate was **79,524 validations per
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
| 13 | +251 KiB | +35 KiB | +206 KiB |
| 53 | +874 KiB | +29 KiB | +94 KiB |
| 203 | +2,350 KiB | +99 KiB | +356 KiB |

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
