# @texaryn/schema-json

JSON Schema evaluation and validation adapter for Texaryn, backed by `json-schema-library`.

> Status: pre-1.0. Public APIs may change before 1.0.

## Install

```bash
pnpm add @texaryn/core @texaryn/schema-json
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

Dialect support does not mean every keyword generates a form control or that Texaryn provides full specification compliance. See the [JSON Schema support guide](https://texaryn.github.io/texaryn/guides/json-schema-support/) for the capability matrix, projection limits and validation behavior.

The adapter detects the dialect from `$schema`. If `$schema` is absent or unrecognized, the adapter uses `draft-07` by default. You can override the fallback:

```ts
const adapter = await createJsonSchemaAdapter(schema, {
  defaultDialect: '2020-12',
})
```

The detected dialect alone decides whether the schema's own `format` keywords are asserted. Draft 7 asserts them, and so does a schema whose `$schema` is absent or unrecognized while the fallback is `draft-07`; 2019-09 and 2020-12 never do, even when the format-assertion vocabulary is declared, and the adapter has no option that changes that. The `format` keywords inside a published metaschema reached through `$ref` are asserted in every dialect.

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
- local `$ref`, including recursive references
- `if` / `then` / `else`
- `oneOf`
- `anyOf`
- `dependentSchemas`
- `dependentRequired`
- Draft 7 `dependencies`
- annotations and field constraints

Inactive conditional fields remain represented in the projection with `active: false`, allowing the runtime and renderer to preserve a deterministic UI structure across branch changes. A branch the specification never evaluates (a `then` or `else` without `if`, a `then` under `if: false`, an `else` under `if: true`) contributes no fields unless a `$ref` points into it or a schema inside it declares an `$id`, `$anchor` or `$dynamicAnchor`.

## Recursive schemas

A local `$ref` may point back to a schema that contains it, such as `{ properties: { child: { $ref: '#' } } }` or a definition that refers to itself. The projection expands such a schema once past the data: below the last location that holds data, a path never applies the same schemas twice. At `{}` the example above projects `/child`, and once `/child` holds an object it projects `/child/child`. Each level the user fills exposes the next.

An object beneath which the projection stopped carries `boundaries` on its `NodeProjection`: `recursion` when a descendant would repeat the object's schemas, `budget` when a fixed per-projection limit withheld members. The limits are 16 objects and 512 nodes, counted only over locations that exist because of the recursion, two or more levels below the data; they never cut a member of a location that holds data. A node the projection reached only by expanding the recursion carries `recursiveExpansion`, and `schema-defaults` initialization never writes there.

A schema that applies itself at one instance location without crossing into a property or item, such as `{ allOf: [{ $ref: '#' }] }`, makes the evaluator recurse without end, so `createJsonSchemaAdapter` rejects it with `SameLocationCycleError`. Its `positions` field lists the schema positions of each cycle, and the message names one of them and the path through the cycle. The check reads the schema, not the data: a cycle behind an `if` is rejected even while the `if` does not hold, except the branches the specification never evaluates. It is conservative for dynamic references, treating a `$dynamicRef` to a `$dynamicAnchor` as reaching every `$dynamicAnchor` of that name and a `$recursiveRef` as reaching every schema that declares `$recursiveAnchor: true`, so a schema whose dynamic references could close such a cycle is rejected even when no evaluation selects it.

The [JSON Schema support guide](https://texaryn.github.io/texaryn/guides/json-schema-support/#recursive-references) has the details, and ADR-007 records the decision.

## json-schema-library version

The dependency range is `~11.6.2`. In Draft 7, json-schema-library 11.6.2 overwrites the registry entry that `"$ref": "#"` resolves through, so without a fix the reference reaches another node and validation is wrong. The adapter pins that entry to the document root. Because the fix depends on the library's internal registry, adapter creation throws an error naming json-schema-library 11.6.2 when the registry is shaped differently, or when a self-test on two probe schemas shows the fix no longer repairs validation. A new json-schema-library minor needs a Texaryn release that verifies the internal again.

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
  SameLocationCycleError,
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

### `SameLocationCycleError`

Thrown by `createJsonSchemaAdapter` for a schema that applies itself at one instance location. A host that loads authored schemas can tell a broken schema from a failed load with `instanceof`:

```ts
try {
  await createJsonSchemaAdapter(schema)
} catch (error) {
  if (error instanceof SameLocationCycleError) console.log(error.positions, error.message)
  else throw error
}
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
- [`@texaryn/vue`](../vue/README.md), Vue bindings and renderer
- [`@texaryn/schema-json-hyperjump`](../schema-json-hyperjump/README.md), private alternate adapter used to validate the port abstraction

See the [repository README](../../README.md) for a complete example.

## License

Apache-2.0
