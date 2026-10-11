# @texaryn/schema-zod

Zod 4 adapter for Texaryn's `SchemaEvaluationPort`.

Zod remains the validation authority. Texaryn converts the Zod input schema to
JSON Schema for field projection, then runs Zod's asynchronous parser for
validation. This keeps custom refinements in validation while using the
production `@texaryn/schema-json` adapter for schema traversal and field
annotations.

```ts
import * as z from 'zod'
import { createZodAdapter } from '@texaryn/schema-zod'

const registration = z.object({
  name: z.string().min(1).meta({ title: 'Name' }),
  email: z.email().optional(),
})

const port = await createZodAdapter(registration)
const projection = port.project({})
const result = await port.validate({ name: '', email: 'invalid' })
```

The adapter requires Zod 4. Schemas must be convertible to JSON Schema. The
default rejects unrepresentable types. Setting `unrepresentable: 'any'`
explicitly allows Zod to omit those constraints from the projected schema;
validation still runs through Zod.

The generated JSON Schema describes the schema's input side. Transforms do not
change the form's data. Zod refinements and transforms remain active during
validation, but Zod omits custom refinements and transform behavior from the
generated JSON Schema. They therefore do not add projected UI constraints.
Validation errors preserve Zod messages and report instance pointers using JSON
Pointer escaping. `validateAt` filters full validation results to the requested
pointer and its descendants.

Projected submission is not exposed because Zod's parsing and object policies
can differ from JSON Schema branch projection.

## API

### `createZodAdapter(schema, config?)`

Creates a `SchemaEvaluationPort` from a Zod 4 schema. The returned object has
`project`, `validate`, and `validateAt` methods.

Configuration:

1. `target`: JSON Schema `draft-07` or `draft-2020-12`. Defaults to
   `draft-2020-12`.
2. `unrepresentable`: `throw` or `any`. Defaults to `throw`.
