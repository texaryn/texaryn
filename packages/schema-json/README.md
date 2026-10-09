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

Inactive conditional fields remain represented in the projection with `active: false`, allowing the runtime and renderer to preserve a deterministic UI structure across branch changes. A branch the specification never evaluates (a `then` or `else` without `if`, a `then` under `if: false`, an `else` under `if: true`) contributes no fields unless a reference points into it or a schema inside it declares an `$id`, `$anchor` or `$dynamicAnchor`.

## Recursive schemas

A local `$ref` may point back to a schema that contains it, such as `{ properties: { child: { $ref: '#' } } }` or a definition that refers to itself. The projection expands such a schema once past the data: below the last location that holds data, a path never applies the same schemas twice. At `{}` the example above projects `/child`, and once `/child` holds an object it projects `/child/child`. Each level the user fills exposes the next.

`boundaries` on an object's `NodeProjection` says why the projection withheld something beneath it: `recursion` when a descendant would repeat the object's schemas, `budget` when a fixed per-projection limit withheld members. The limits are 16 objects and 512 nodes, counted only over locations that exist because of the recursion, two or more levels below the data; they never cut a member of a location that holds data. A node the projection reached only by expanding the recursion carries `recursiveExpansion`, and `schema-defaults` initialization never writes there.

A schema that applies itself at one instance location without crossing into a property or item, such as `{ allOf: [{ $ref: '#' }] }`, makes the evaluator recurse without end, so `createJsonSchemaAdapter` rejects it with `SameLocationCycleError`. Its `positions` field lists the schema positions of each cycle, and the message names one of them and the path through the cycle. The check reads the schema, not the data: a cycle behind an `if` is rejected even while the `if` does not hold, except the branches the specification never evaluates. It is conservative for dynamic references, treating a `$dynamicRef` to a `$dynamicAnchor` as reaching every `$dynamicAnchor` of that name and a `$recursiveRef` as reaching every schema that declares `$recursiveAnchor: true`, so a schema whose dynamic references could close such a cycle is rejected even when no evaluation selects it.

The [JSON Schema support guide](https://texaryn.github.io/texaryn/guides/json-schema-support/#recursive-references) has the details, and ADR-007 records the decision.

Adapter creation also rejects a retained static `$ref` when json-schema-library resolves it to different declarations with different validation assertions in the validation tree and the normalised projection tree. The check covers the dialect's supported assertions, including boolean subschemas. The error is `ProjectionValidationDivergenceError`.

The adapter exposes `projectSubmission(data)` for supported schemas. It removes values declared only by inactive branches, keeps provisional fields, and preserves undeclared data so validation can still reject it. This opt-in treats an inactive declaration as form data to omit even when an enclosing object allows additional properties. `createFormRuntime` selects the mode with `submission: 'projected'`; it validates and submits the same independent snapshot, while the form's live data stays unchanged. Schemas with dynamic references or `unevaluatedProperties` or `unevaluatedItems` do not expose this capability yet. The private Hyperjump adapter also does not expose it. Runtime creation fails if projected submission is requested without the capability.

## json-schema-library version

The dependency is pinned to exactly `11.6.2`. In Draft 7, json-schema-library 11.6.2 overwrites the registry entry that `"$ref": "#"` resolves through, so without a fix the reference reaches another node and validation is wrong. The adapter pins that entry to the document root, and every other entry the library files for its own location to the node compiled there, so a reduction during projection cannot replace a definition with a reduced copy. Because the fix depends on the library's internal registry, adapter creation throws an error naming json-schema-library 11.6.2 when the registry is shaped differently, or when a self-test on two probe schemas shows the fix no longer repairs validation. A newer json-schema-library release is not installed until a Texaryn release raises the pin after the registry fix and its self-test pass against it.

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

`instancePointer` is an RFC 6901 pointer: a property named `a/b` is `/a~1b`, and `a~b` is `/a~0b`. json-schema-library joins property names into its own error pointers without escaping, so the adapter recovers the real keys from the validated data. Two locations whose keys read the same once joined, such as `a/b` holding `c` next to `a` holding `b/c`, are told apart by the value the error reports. When both hold equal values and only one fails, the error is located at the first of them in key order, until json-schema-library escapes at the source (sagold/json-schema-library#130). `params` is json-schema-library's raw error data, and its pointers are not escaped.

A data key named like an `Object.prototype` member (`__proto__`, `constructor`, `toString`) validates and projects like any other key. The one exception is a schema that combines `patternProperties` with `additionalProperties: false`: json-schema-library reads that schema's plain `properties` object, so it treats such an undeclared key as declared.

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
  ProjectionValidationDivergenceError,
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

### `ProjectionValidationDivergenceError`

Thrown by `createJsonSchemaAdapter` when one retained static `$ref` resolves to different declarations with different validation assertions for validation and projection. Its `reference` and `sourcePosition` identify the reference site. `validationPosition` and `projectionPosition` identify the two resolved schema positions.

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
