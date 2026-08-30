# Schema evaluator spike: comparison and recommendation

Inputs: `hyperjump-results.json` (subtask 1b, 17/17 criteria, 15 pass / 2 partial),
`jsl-results.json` (subtask 1c, 17/17 criteria, 13 pass / 4 partial),
`test-suite-results.json` (subtask 1d, JSON Schema Test Suite, mandatory files only).

Both probes were written and run in isolation from each other (confirmation-bias
isolation per the task brief); this document is the first place their findings are
read side by side.

## Test suite methodology note

The task instruction for this subtask (step 6) scopes the run to the **mandatory**
test files under `test-suite/tests/draft7/` and `test-suite/tests/draft2020-12/`,
excluding the `optional/` subdirectory. This differs from the evaluation matrix
row's original wording ("full optional + mandatory suites") in the task brief;
this report follows the explicit subtask instruction (mandatory only). Remote-`$ref`
cases (schema or `$ref`/`$dynamicRef`/`$recursiveRef` targeting a URI not starting
with `#`, plus two `$schema` cases pointing at a custom metaschema hosted on the
suite's local test server) were filtered identically for both libraries before
either one saw them: 173 of 2,226 mandatory cases (7.8%) skipped, log in
`test-suite-results.json`'s `skippedGroups`.

## Evaluation matrix

| # | Criterion | hyperjump | jsl |
|---|---|---|---|
| 1 | `project()` feasibility | **Pass**, with real integration cost: no single documented call returns a full `NodeProjection` map. Requires a custom `EvaluationPlugin` (data-driven pass) plus a bounded static schema walk (deliberately does not follow `$ref` or recurse into `items`/`prefixItems`) to backfill unfilled-but-active fields. | **Pass**, direct: `compileSchema(schema).toDataNodes(data)` is a single synchronous call that already resolves oneOf/if-then-else branches and suppresses inactive ones, mapping onto `NodeProjection` per pointer with minimal adapter code. |
| 2 | `validate()` feasibility | Pass. BASIC output format gives `{ valid, errors: [{ keyword, instanceLocation }] }`; `instanceLocation` is `#`-prefixed and maps to `instancePointer` by stripping `#`. No human-readable message. | Pass. `node.validate(data)` returns `{ valid, errors, annotations }`; error `pointer` is a `#`-prefixed URI fragment, same one-line strip. Includes a human-readable `message` per error out of the box. |
| 3 | Draft-07 support | Pass on hand-written cases. Test suite: **864/870** mandatory cases (99.3%), 2 genuine failures + 4 thrown (see below). | Pass on hand-written cases. Test suite: **870/870** mandatory cases (100%). |
| 4 | 2020-12 support | Pass on hand-written cases ($ref, $dynamicRef, dependentSchemas, prefixItems, unevaluatedProperties). Test suite: **1179/1183** (99.7%), 4 thrown, 0 genuine failures. | Upgraded from probe's "partial" to **Pass**: the probe didn't exercise `$dynamicRef`/`prefixItems`/`unevaluatedProperties` directly, but the test suite now does, and all 9 of jsl's 2020-12 failures are in `format.json` (see limitations) — the `dynamicRef.json`, `prefixItems.json`, and `unevaluatedProperties.json` suite files pass 100%. Test suite: **1174/1183** (99.2%). |
| 5 | Local `$ref` | Pass. All 3 pointers (2 direct + 1 recursive) resolved with no custom code, recursion followed to arbitrary depth. | Pass. Same 3 pointers resolve with no custom code; recursion confirmed to re-resolve the same schema node. |
| 6 | Annotation collection | Pass. title/description/readOnly/default collected through `allOf`; through `oneOf`, only the matching branch's annotations surface. Non-matching branch's field must be separately reconciled via the static-walk pass (see #1) to appear as `active: false`. | Pass. Same annotations collected through `allOf` and the matching `oneOf` branch via `toDataNodes()`; the non-matching branch's field is absent from the result entirely (not surfaced-then-filtered, simply never descended into). |
| 7 | `if`/`then`/`else` | Pass, but required fixing a real design bug during probing: hyperjump only fires keyword evaluations for instance pointers that have a value, so an unfilled-but-active optional field (e.g. `nickname` in the personal branch) looked identical to a field in a non-matching branch until the static-walk pass was added. | Pass, directly: `getNode(pointer, data)` reflects the currently active branch with no extra work — an unfilled optional field in the active branch is still resolved as active. |
| 8 | `dependentSchemas`/`dependentRequired` | Pass. Both keywords evaluate correctly in both data states; `cvv` field activates only when `creditCard` is present. | Pass. Same behavior; both a missing-dependency error and a required-property error are reported together when only `creditCard` is given. |
| 9 | `oneOf`/`anyOf` discrimination | Pass. Branch switches correctly on the `kind` discriminator in both directions. | Pass. Same, via `getNode()`; `getChildSelection()` additionally exposes the raw (non-data-resolved) branch candidates for a property, useful for building form pickers before a `kind` value is chosen. |
| 10 | JSON Schema Test Suite pass rate | **Draft-07: 864/870 (99.3%)**. **2020-12: 1179/1183 (99.7%)**. 2 genuine failures (draft-07 `ref.json`, "naive replacement of `$ref` with its destination is not correct" group — an enum-vs-`$ref` edge case). 8 thrown (both drafts' `ref.json`, "`$id` with file URI still resolves pointers" groups — hyperjump's `registerSchema` refuses to register a schema whose `$id` uses a `file:` URI scheme, a deliberate security restriction, not a bug). | **Draft-07: 870/870 (100%)**. **2020-12: 1174/1183 (99.2%)**. All 9 failures are in `format.json` (see limitations); 0 thrown. |
| 11 | CSP / `eval` safety | Pass. Zero `new Function`/`eval(`/`Function(` matches across the installed package; pure AST interpreter. | Pass. Zero matches across the shipped `dist/*.mjs`/`dist/*.cjs`; pure interpretation, no code generation. |
| 12 | Bundle size | See "Bundle size correction" below. Corrected, apples-to-apples figure: **~15-17 KB gzip** for the exact import surface a `project()`/`validate()` adapter needs. | Corrected figure: **~31 KB gzip** for the same adapter-scope import surface, bundled under identical methodology. |
| 13 | Sync hot-path | Pass, with a caveat: `registerSchema`/`compile`/`getSchema` are async (schema preparation); the returned `interpret()` call is genuinely synchronous. Matches the port's required async-prepare-then-sync-project pattern exactly, no more, no less. | Pass, and stronger: `compileSchema()` itself is synchronous for schemas with only local `$ref` (no `Promise` anywhere), and so are `getNode()`, `toDataNodes()`, and `validate()`. No async step is needed anywhere in the adapter for Phase 1's local-`$ref`-only scope. |
| 14 | Preparation cost | 100 iterations, flat-object (5 fields): mean **0.41ms**, p95 0.70ms. | 100 iterations, flat-object (5 fields): **0.066ms/iter**. 50-field/5-conditional schema: **0.31ms/iter**. |
| 15 | Error path mapping | Pass. `instanceLocation` (`#/homeAddress`) maps to RFC 6901 `instancePointer` by stripping the leading `#`. Verified through a nested `$ref`. | Pass. `pointer` (`#/items/1`) maps the same way. Verified through a nested array/object path. |
| 16 | Annotation semantics (failed-branch suppression) | Pass, and this is the criterion the brief singled out as hyperjump-only. Verified structurally: a schema scope's collected annotations only merge into its parent if that scope itself validated (`lib/evaluation-plugins/annotations.js`), so a failed `oneOf` branch's annotations never leak through even without a `const` discriminator. | **Also pass, contradicting the brief's stated expectation.** Tested with the same no-discriminator case (type-shape only, no `const` field): `toDataNodes()` resolves to the one branch that validates and never surfaces the failing branch's schema at all. Different mechanism (resolve-to-the-match vs. surface-then-filter-by-validity), same observable result for the port's needs. |
| 17 | Ecosystem health | 334,718 weekly downloads, last publish 2026-08-05, 315 GitHub stars, 7 open issues. Bus factor: top contributor 283 commits vs. next at 5 (single-maintainer risk, marked partial for this reason). | 549,579 weekly downloads, last publish 2026-07-18, 11 open GitHub issues. Bus factor: top contributor 768 commits vs. next at 11 (single-maintainer risk, marked partial for the same reason). Both libraries carry comparable bus-factor risk; neither is a differentiator. |

## Bundle size correction

Both probes reported bundle size, but by different and non-comparable measures:
hyperjump reported `npm pack` size (61.0 KB gzip tarball, unpacked 427 KB — the
*whole* package: every draft, OpenAPI dialects, formats, bundling); jsl reported
both its `npm pack` tarball (613 KB) and its shipped ESM entry point
`dist/index.mjs` gzipped alone (22.5 KB). The task brief for this subtask
specifically calls out this trap: "use the meaningful number: gzipped ESM entry,
not full tarball." Comparing 61 KB against 22.5 KB is not that comparison — one
number is a full untouched tarball, the other is already a single tree-shaken
entry file.

To get a real apples-to-apples number, this subtask built a minimal entry file
for each library containing only the imports the port's adapter actually needs
(hyperjump: `registerSchema` (both drafts), `compile`, `interpret`, `getSchema`,
the `Instance` module — the same set `hyperjump-probe.ts`'s `buildProjectionSync`
uses; jsl: `compileSchema`), bundled and minified with Vite/Rollup (confirmed with
a second, independent run through esbuild directly, same results within noise):

- **hyperjump: 66,357 bytes raw / ~15-17 KB gzip** (Vite: 54,977 bytes raw / 15,094
  bytes gzip for just the draft-2020-12 entry; esbuild with the full adapter
  surface: 66,357 bytes raw / 16,965 bytes gzip).
- **jsl: 118,270-119,355 bytes raw / ~31.4 KB gzip** (Vite: 31,389 bytes gzip;
  esbuild: 31,489 bytes gzip) for `compileSchema` alone — `compileSchema` is not
  further tree-shakeable below the shipped `dist/index.mjs` file's own bundled
  size in this bundler-agnostic test.

**This flips the naive probe-number comparison**: under identical methodology and
matched to the adapter's actual import surface, hyperjump is the smaller
dependency (roughly half the gzipped size), not jsl. This number is reported
plainly because it does not change the recommendation below — integration
complexity at the port's core method dominates the decision, and jsl's ~31 KB
still lines up with the roadmap's own ~31 KB estimate for it.

One caveat worth carrying forward: `@hyperjump/browser` (a hyperjump dependency)
ships a Node-only default entry (`lib/index.js`, which statically imports
`node:fs` for a `file:` URI scheme plugin) and a separate browser-safe entry
(`lib/index.browser.js`), switched via the legacy `package.json` `"browser"`
field — but its `"exports"` map does not declare a `browser` condition, so a
bundler that resolves `"exports"` without also honoring the legacy `"browser"`
field will pull in the Node-only file and fail (confirmed: bare `esbuild --bundle`
fails on `node:fs`/`node:fs/promises`/`node:url` with no extra config). **Vite
(and Rollup underneath it) resolves this correctly out of the box** — the Vite
build above succeeded with zero configuration and contains zero references to
`node:fs`. This was not caught by either probe's CSP/eval grep, since both probes
ran the library directly under Node, where `"exports"` resolves to the safe
target anyway. Not a blocker given Vite/Rollup handle it correctly, but worth a
one-line note for any consumer building with a bare esbuild/webpack pipeline
that doesn't already honor the `"browser"` field.

## Recommendation

**Choose json-schema-library (jsl).**

The decisive factor is integration complexity at the port's one non-optional
synchronous method, `project()`. hyperjump can produce a correct
`SchemaProjection`, but only through a two-pass design proven out during the 1b
probe: a custom `EvaluationPlugin` capturing data-driven keyword evaluations, plus
a second, bounded static schema walk to backfill unfilled-but-active fields (the
1b probe's own report flags that this static pass deliberately does not follow
`$ref` or recurse into `items`/`prefixItems` — a real completeness gap for a form
runtime with nested or array-shaped schemas, not just extra code). jsl's
`compileSchema(schema).toDataNodes(data)` does the equivalent work — branch
resolution and annotation suppression together — in one synchronous call, and
that call already handles `$ref` and nested structures because it walks the
*data*, not a bounded reconstruction of the schema.

Everything else roughly offsets:
- Test suite pass rate is a wash by design, not a tiebreaker: jsl wins draft-07
  (870/870 vs. 864/870), hyperjump wins 2020-12 (1179/1183 vs. 1174/1183). Neither
  gap is large enough on its own to decide anything.
- jsl is sync straight through, including preparation (no async needed anywhere
  for local-`$ref`-only schemas), which exceeds the port's minimum requirement
  (async-prepare-once, then sync) rather than merely meeting it.
- jsl includes human-readable error messages in its stable API; hyperjump does
  not.
- The corrected bundle-size comparison actually favors hyperjump (~16 KB vs. ~31
  KB gzip for matched import surfaces), but this does not outweigh the
  integration-complexity and completeness findings above.
- Both libraries pass the failed-oneOf-branch annotation-suppression criterion
  the original task brief expected only hyperjump to pass (different mechanisms,
  same observable correctness for the port's needs) — so this is not a
  differentiator either.
- Both carry single-maintainer bus-factor risk at a similar order of magnitude.

## Known limitations of json-schema-library (for PR7-10)

- **Format is asserted by default in 2020-12, not annotation-only.** All 9 of
  jsl's mandatory-suite failures are in `format.json`: 2020-12 makes `format` an
  annotation unless the format-assertion vocabulary is explicitly declared, but
  jsl's default `compileSchema()` behavior treats an invalid `email`/`date`/`uuid`/
  etc. string as a validation error. Confirmed fix: `compileSchema(schema, {
  formatAssertion: false })` restores spec-correct annotation-only behavior
  (verified directly: an invalid email validates as `true` under this option).
  PR7's adapter should set this explicitly rather than relying on the default,
  since a form consumer would otherwise see spurious required-format validation
  errors that the 2020-12 spec says should not block submission by default.
- Error pointers are `#`-prefixed URI fragments (`"#/age"`), not RFC 6901
  `JsonPointer`s (`"/age"`) — needs the one-line `.replace(/^#/, '')` the probe
  already validated, same transform hyperjump needs.
- `oneOf`/`anyOf` resolve to the first branch that validates against the given
  data, rather than surfacing every attempted branch and filtering by validity.
  This is architecturally different from hyperjump's mechanism but produces the
  same correct result for every case tested (see criterion 16); worth knowing
  for anyone reading jsl's source expecting hyperjump's shape.
- `getNode(pointer, data)` takes a **data/instance** pointer (`/age`), not a
  schema pointer (`/properties/age`) — confirmed via direct testing in the 1c
  probe, since the wrong pointer shape fails silently (`{node: undefined, error:
  undefined}`), not with an error.
- `eachNode()`, named in the original task brief's step 3, does not exist in
  jsl's public API. `toSchemaNodes()` (static, all branches) and `toDataNodes()`
  (data-resolved, single active branch per pointer) are the real exports; PR7
  should reference this document rather than the brief for the actual API names.
- Single-maintainer bus factor (768 commits vs. 11 for the next contributor) —
  shared with hyperjump, not unique to jsl, but real.

## Architectural insight: async-prepare-then-sync-project

Both candidates satisfy the pattern the port assumes (`project()` must be sync;
`validate()` may be async), but to different degrees:

- **hyperjump requires it.** `registerSchema` → `getSchema` → `compile` is
  necessarily async (even for purely local schemas), and only the resulting
  `interpret()` call is synchronous. An hyperjump-backed adapter has a real
  "compile once, await it, then call synchronously forever after" lifecycle that
  PR7 needs to model explicitly (e.g., a `ready` promise the adapter awaits once
  per schema before its `project()` can be called).
- **jsl exceeds it.** `compileSchema()` is synchronous whenever the schema uses
  only local `$ref` (the entirety of Phase 1's scope) — there is no async step
  in the adapter's lifecycle at all. Async only becomes necessary if a future
  phase adds remote `$ref` fetching, at which point jsl's `compileSchema` would
  need to be wrapped in a resolver that fetches first, same as hyperjump would.

This means the port's `MaybePromise<ValidationResult>` return type on `validate()`
is not exercised by either library for Phase 1's local-`$ref`-only scope: jsl's
`validate()` is plain-synchronous today, and would only need to resolve a promise
if a future phase's remote-`$ref` support required it. The port's design already
anticipates this correctly by allowing (not requiring) a promise there.
