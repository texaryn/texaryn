# @texaryn/schema-json

JSON Schema evaluation and validation adapter for Texaryn, backed by `json-schema-library`.

> Status: pre-1.0. Public APIs may change before 1.0.

## Install

```bash
pnpm add @texaryn/core@alpha @texaryn/schema-json@alpha
```

## Quick start

```ts
import { createJsonSchemaAdapter } from '@texaryn/schema-json'

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    name: {
      type: 'string',
      title: 'Name',
      minLength: 2,
    },
  },
  required: ['name'],
}

const adapter = await createJsonSchemaAdapter(schema)

const projection = adapter.project({ name: '' })
const validation = await adapter.validate({ name: '' })

console.log(projection.nodes.get('/name'))
console.log(validation.valid, validation.errors)
```

The returned object implements `SchemaEvaluationPort` from `@texaryn/core`.

## JSON Schema dialect support

| Dialect   | Support           |
| --------- | ----------------- |
| Draft 4   | Not yet supported |
| Draft 6   | Not yet supported |
| Draft 7   | Supported         |
| 2019-09   | Supported         |
| 2020-12   | Supported         |

The adapter detects the dialect from `$schema`. If `$schema` is absent or unrecognized, the adapter uses `draft-07` by default. You can override the fallback:

```ts
const adapter = await createJsonSchemaAdapter(schema, {
  defaultDialect: '2020-12',
})
```

## Projection

`project(data)` turns the schema plus current instance data into a framework-neutral `SchemaProjection`.

The projection contains one `NodeProjection` per JSON Pointer and includes information such as:

- JSON Schema type
- format
- constraints
- enum values
- annotations
- object children and required flags
- whether a node is active for the current data

This allows Texaryn to render fields that are declared by the schema even when they have not been filled yet.

## Dynamic schema behavior

The adapter currently handles the schema features required by Texaryn's runtime and renderer, including:

- objects and primitive fields
- arrays
- enums
- local `$ref`
- `if` / `then` / `else`
- `oneOf`
- `anyOf`
- `dependentSchemas`
- `dependentRequired`
- Draft 7 `dependencies`
- annotations and field constraints

Inactive conditional fields remain represented in the projection with `active: false`, allowing the runtime and renderer to preserve a deterministic UI structure across branch changes.

## Validation

```ts
const result = await adapter.validate(data)

if (!result.valid) {
  for (const error of result.errors) {
    console.log(error.instancePointer, error.keyword, error.message)
  }
}
```

Validation errors are normalized to Texaryn's `ValidationError` contract:

```ts
interface ValidationError {
  instancePointer: string
  keyword: string
  message?: string
  params: Record<string, unknown>
}
```

Required-property errors are located at the missing property pointer rather than only at the parent object.

## Scoped validation

This adapter also implements the optional `validateAt()` port method:

```ts
const result = await adapter.validateAt(data, '/profile')
```

The result contains validation errors at that pointer or below it.

## API

```ts
import {
  createJsonSchemaAdapter,
  type AdapterConfig,
  type Dialect,
} from '@texaryn/schema-json'
```

### `createJsonSchemaAdapter(schema, config?)`

Creates a prepared adapter for one schema.

```ts
const adapter = await createJsonSchemaAdapter(schema, {
  defaultDialect: 'draft-07',
})
```

### `AdapterConfig`

```ts
interface AdapterConfig {
  defaultDialect?: Dialect
}
```

### `Dialect`

The union of dialect identifiers the adapter recognizes:

```ts
type Dialect = 'draft-07' | '2019-09' | '2020-12'
```

## Architecture

The adapter is deliberately separate from `@texaryn/core`:

```text
JSON Schema
    |
    v
@texaryn/schema-json
    |
    v
SchemaEvaluationPort
    |
    v
@texaryn/core
```

The core runtime does not know which JSON Schema library produced the projection or validation result.

That boundary allows additional implementations to satisfy the same port without changing the runtime or renderer.

## Related packages

- [`@texaryn/core`](../core/README.md), runtime and framework-neutral contracts
- [`@texaryn/react`](../react/README.md), React bindings and renderer
- [`@texaryn/schema-json-hyperjump`](../schema-json-hyperjump/README.md), private alternate adapter used to validate the port abstraction

See the [repository README](../../README.md) for a complete example.

## License

Apache-2.0
