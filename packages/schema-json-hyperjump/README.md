# @texaryn/schema-json-hyperjump

Alternate JSON Schema adapter for Texaryn, backed by `@hyperjump/json-schema`.

> This package is currently private and is not published to npm. It exists to prove that Texaryn's `SchemaEvaluationPort` can be implemented by materially different JSON Schema engines.

## Purpose

Texaryn's architecture depends on schema evaluation being replaceable:

```text
json-schema-library ----\
                         > SchemaEvaluationPort -> @texaryn/core
Hyperjump --------------/
```

`@texaryn/schema-json-hyperjump` implements the same framework-neutral projection and validation contract as `@texaryn/schema-json`, using Hyperjump's different compilation and evaluation model.

## Workspace usage

Inside the Texaryn monorepo:

```ts
import { createHyperjumpAdapter } from '@texaryn/schema-json-hyperjump'

const adapter = await createHyperjumpAdapter(schema)

const projection = adapter.project(data)
const validation = await adapter.validate(data)
```

The package is marked `private: true`, so there is intentionally no npm installation command yet.

## JSON Schema dialect support

| Dialect   | Support           |
| --------- | ----------------- |
| Draft 4   | Not yet supported |
| Draft 6   | Not yet supported |
| Draft 7   | Supported         |
| 2019-09   | Supported         |
| 2020-12   | Supported         |

Dialect detection uses `$schema`, with Draft 7 as the default fallback.

```ts
const adapter = await createHyperjumpAdapter(schema, {
  defaultDialect: '2020-12',
})
```

## How it differs from the primary adapter

Hyperjump has a different integration model from `json-schema-library`:

1. The factory performs asynchronous schema registration, lookup, and compilation.
2. `project()` uses Hyperjump evaluation plus a bounded static schema walk.
3. Branch activity is derived from evaluation scope validity.
4. `validate()` maps Hyperjump BASIC output into Texaryn validation errors.
5. Each adapter instance receives a unique schema URI to avoid collisions in Hyperjump's process-wide registry.

These differences are intentional. If both adapters satisfy the same conformance suite, the port is proving an architectural boundary rather than hiding two nearly identical integrations.

## Projection behavior

The adapter projects both populated and unfilled schema fields.

It supports current Texaryn requirements including:

- local `$ref`
- recursive local `$ref`, expanded once past the data by the rule `@texaryn/schema-json` documents
- arrays with `items` and `prefixItems`
- `if` / `then` / `else`
- `oneOf`
- `anyOf`
- `allOf`
- `dependentSchemas`
- Draft 7 schema-form `dependencies`
- JSON Pointer escaping
- active and inactive branch skeletons

Dynamic branches are resolved so selected but incomplete branches can still expose the fields the user needs to complete them.

A recursive schema follows the same rule as the primary adapter, from a byte-identical copy of its schema graph: below the last location that holds data, a path never applies the same schemas twice, a past-the-data object whose schemas a descendant would repeat carries a `recursion` boundary, an object whose members the budget withheld carries `budget`, and the limits are 16 objects and 512 nodes that exist because of the recursion. `boundaryTargets` has the next withheld instance pointer for each boundary reason, with a generation scoped token. Pass selected tokens to `project(data, { expandedBoundaryTokens })` to reveal those locations one at a time. The runtime supplies `boundaryGeneration`; direct adapter callers can leave it at zero or increment it whenever replacing a container changes pointer ownership. Built in renderers show one action per boundary reason on an object and advance one target per click. Expansion changes the view only and does not write form data or affect validation and initialization. `createHyperjumpAdapter` rejects a schema that applies itself at one instance location with the package's own `SameLocationCycleError`. Only `#`-local references are followed.

A location without a `type` takes its shape by the rule `@texaryn/schema-json` implements, from a byte-identical copy of its `projection-shape.ts`. The keywords of the positions that apply there are read together: object keywords alone give `object`, array keywords alone give `array`, an explicit `type` wins, and keywords of two types are ambiguous. A location that gets no shape is omitted with everything beneath it, so no node lacks its parent, its parent still lists it in `children`, and the topmost one of each branch is reported as `unresolved-projection-shape` or `ambiguous-projection-shape`, unless the value selects none of the branches of a `oneOf` or `anyOf` that some branch could render, which the port contract keeps out of the diagnostics. The keywords read are the location's own, its `allOf` members, the selected `oneOf` or `anyOf` branch and the reference target of any of these. A `then`, `else` or dependent-schema branch adds none to the location it applies at, so the shape and the reports do not follow the value the branch depends on. A `type` that only positions that do not apply declare is used when they all agree; when they disagree, a location that lists children takes `object` if it is one of them, or else the one `object` or `array` among them, and otherwise it gets no shape. A location beneath a scalar is omitted with everything beneath it and not reported. The primary adapter does not read `allOf` members and treats a type from positions that do not apply differently, so a few typeless locations resolve differently; ADR-007 lists them.

For an `undefined` root the evaluation pass reads `{}` and the static walk sees the root as absent, so `project(undefined)` equals `project({})` except for the root's `active` flag. That flag is decided at each schema position the walk reaches at the root: the root itself, an `allOf` member, a `then` or `else`, a `oneOf` or `anyOf` branch and a dependent-schema branch (`dependencies` in draft-07). A position with no `type` that holds a `oneOf`, an `anyOf`, an `if` with a `then` or `else`, or dependent schemas sets the flag to `false` when none of the branches it holds is active, and a branch of a position that is not itself active is not active. An active position the walk reaches later sets the flag back to `true`, so the result follows the order in which the walk reaches the positions. A typeless `oneOf` or `anyOf` wrapper root whose branches carry a `type` is therefore inactive for an absent root unless a branch is active for `{}`, and a typed root is inactive when an `allOf` member, a `then` or `else`, a `oneOf` or `anyOf` branch or a dependent-schema branch holds one of these constructs with no active branch. A position whose own keywords imply a shape is exempt, except where it holds a `oneOf`, as ADR-007 states. The primary adapter differs for some typeless `oneOf` and `anyOf` wrapper roots as well, in the root's `type`, its `active` flag, or whether it is projected and reported.

One difference from the primary adapter concerns `defaultSources`. Where Hyperjump's evaluator reports a default that its static conflict walk never visits (under `additionalProperties` or `patternProperties`, in a Draft 7 `dependencies` branch, or behind a reference that is not `#`-local), a node whose schemas lie on a cycle carries an empty `defaultSources`. `schema-defaults` initialization then cannot see that default repeat at a deeper level, so a default that recreates itself in one of those shapes runs until the 32-pass initialization budget is exhausted. A `default` beside `$ref` in 2019-09 and 2020-12 does not: Hyperjump reports it only where the data holds the location, and never writes it.

## Validation

```ts
const result = await adapter.validate(data)
```

The result follows Texaryn's `ValidationResult` contract.

Hyperjump does not provide human-readable messages in its BASIC output, so `ValidationError.message` may be absent. Consumers should rely on `instancePointer`, `keyword`, and `params` rather than assuming every adapter provides the same message text.

Required errors are normalized to the missing property pointer.

This adapter currently implements `project()` and `validate()`. The optional `validateAt()` port method is not exposed.

## Conformance

The repository contains a shared factory-parametrized conformance suite under `tests/conformance/`.

The same cases run against both:

- `@texaryn/schema-json`
- `@texaryn/schema-json-hyperjump`

The suite checks the portable contract rather than implementation-specific details.

## API

```ts
import {
  createHyperjumpAdapter,
  type HyperjumpAdapterConfig,
} from '@texaryn/schema-json-hyperjump'
```

### `createHyperjumpAdapter(schema, config?)`

Asynchronously prepares a Hyperjump-backed `SchemaEvaluationPort` implementation.

### `HyperjumpAdapterConfig`

```ts
interface HyperjumpAdapterConfig {
  defaultDialect?: 'draft-07' | '2019-09' | '2020-12'
}
```

## Development

From the repository root:

```bash
pnpm build
pnpm typecheck
pnpm test
```

The package is included in root build, typecheck, and Vitest projects, but ignored by Changesets while it remains private.

## Related packages

- [`@texaryn/core`](../core/README.md), port contract and runtime
- [`@texaryn/schema-json`](../schema-json/README.md), published primary JSON Schema adapter

## License

Apache-2.0
