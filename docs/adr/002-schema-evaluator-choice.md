# ADR-002: Schema Evaluator Library Choice

## Status

Accepted

## Context

Texaryn's `SchemaEvaluationPort` requires a library that can:
- Produce a `SchemaProjection` (resolved schema view) synchronously given schema + data
- Validate data and return errors with JSON Pointer paths
- Support draft-07 and 2020-12 natively (dialect-aware, not keyword mapping)
- Resolve local `$ref` (including recursive)
- Collect annotations (title, description, readOnly, etc.) through applicators
- Handle if/then/else, dependentSchemas, dependentRequired, oneOf/anyOf
- Work in browsers without eval/new Function (CSP safe)

Two candidates were evaluated: `@hyperjump/json-schema` and `json-schema-library`.
Each was probed independently (subtasks 1b and 1c, isolated from each other to
avoid confirmation bias) against all 17 criteria in the task brief's evaluation
matrix, then both were run against the official JSON Schema Test Suite's
mandatory draft-07 and 2020-12 test files (subtask 1d), with remote-`$ref` cases
filtered identically for both (173 of 2,226 cases, out of Phase 1 scope).

## Decision

**json-schema-library**, because its `compileSchema(schema).toDataNodes(data)`
produces a correct `SchemaProjection` in a single synchronous call that already
resolves conditional/oneOf branches and suppresses inactive ones, where
hyperjump requires a two-pass design (a custom `EvaluationPlugin` for data-driven
evaluation, plus a bounded static schema walk that the 1b probe itself flags as
incomplete for fields behind `$ref` or inside arrays) to produce the same
result. json-schema-library is also synchronous end to end for local-`$ref`
schemas (no async step anywhere, exceeding the port's minimum requirement) and
includes human-readable error messages, while the two libraries' JSON Schema
Test Suite pass rates are a wash (json-schema-library wins draft-07 870/870 vs.
864/870; hyperjump wins 2020-12 1179/1183 vs. 1174/1183) and do not favor either
side strongly enough to change the outcome.

## Consequences

PR7-10's `@texaryn/schema-json` adapter will wrap `compileSchema()` +
`toDataNodes()` for `project()`, and `node.validate()` for `validate()`/
`validateAt()` (the latter via `getNode(pointer, data)` + validate on the
resolved node). Both are synchronous, so the adapter needs no async
initialization lifecycle for Phase 1's local-`$ref`-only scope.

Known limitations to carry into the adapter: json-schema-library asserts
`format` by default under 2020-12 rather than treating it as an annotation
(spec deviation) — the adapter must call `compileSchema(schema, {
formatAssertion: false })` to get spec-correct behavior, confirmed to work.
Validation error pointers arrive as `#`-prefixed URI fragments and need a
one-line `.replace(/^#/, '')` to become RFC 6901 `JsonPointer`s. The library is
maintained by a single dominant contributor (768 of the project's commits),
a bus-factor risk shared with hyperjump (283 of its commits from one
contributor) and therefore not a differentiator, but worth monitoring.

If json-schema-library needs to be replaced later, only `@texaryn/schema-json`
changes: `SchemaEvaluationPort` is the boundary, and no other package depends
on the library directly.

## Evaluation Data

See `packages/schema-json/spike/results.md` for the full comparison matrix.
