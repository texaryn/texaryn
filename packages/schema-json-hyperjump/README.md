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

## Supported dialects

The adapter supports:

- Draft 7
- Draft 2019-09
- Draft 2020-12

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
- recursive local `$ref`, bounded by instance depth
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
