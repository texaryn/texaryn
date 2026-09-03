# Getting started with Texaryn

Texaryn turns a JSON Schema into a working form: schema evaluation, a headless runtime, and a React renderer.

## Install

```bash
pnpm add @texaryn/core@alpha @texaryn/schema-json@alpha @texaryn/react@alpha
```

React 18 or newer is required by `@texaryn/react`.

## Create the adapter

A schema adapter implements the `SchemaEvaluationPort` that the runtime consumes:

```ts
import { createJsonSchemaAdapter } from '@texaryn/schema-json'

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  title: 'Contact Form',
  properties: {
    name: { type: 'string', title: 'Full Name', minLength: 1 },
    email: { type: 'string', title: 'Email', format: 'email' },
    age: { type: 'integer', title: 'Age', minimum: 0, maximum: 150 },
    subscribe: { type: 'boolean', title: 'Subscribe to newsletter' },
    role: {
      type: 'string',
      title: 'Role',
      enum: ['developer', 'designer', 'manager', 'other'],
    },
    bio: { type: 'string', title: 'Bio', maxLength: 500 },
  },
  required: ['name', 'email'],
}

const adapter = await createJsonSchemaAdapter(schema)
```

The adapter detects the dialect from `$schema`. Supported: Draft 7, 2019-09, and 2020-12.

## Create the form

In React, `useForm` creates the runtime and subscribes to its stores:

```tsx
import { useForm, FormProvider, FormRoot, ErrorSummary, createDefaultRegistry } from '@texaryn/react'

const registry = createDefaultRegistry()

function App() {
  const form = useForm(adapter, {
    initialData: { name: '', email: '', subscribe: false },
    hints: {
      '/name': { validationTrigger: 'blur' },
      '/email': { validationTrigger: 'change', placeholder: 'you@example.com' },
      '/bio': { widget: 'textarea' },
    },
    onSubmit: async (data) => {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      console.log('Submitted:', data)
    },
  })

  return (
    <FormProvider value={form.runtime}>
      <ErrorSummary />
      <FormRoot registry={registry} />

      <button
        type="button"
        disabled={
          form.submission.status === 'validating' ||
          form.submission.status === 'submitting'
        }
        onClick={() => form.dispatch({ type: 'Submit' })}
      >
        {form.submission.status === 'validating'
          ? 'Validating...'
          : form.submission.status === 'submitting'
            ? 'Submitting...'
            : 'Submit'}
      </button>

      {form.submission.status === 'submitted' && <p>Submitted successfully.</p>}
      {form.submission.error != null && (
        <p style={{ color: 'red' }}>
          {form.submission.error instanceof Error
            ? form.submission.error.message
            : String(form.submission.error)}
        </p>
      )}
    </FormProvider>
  )
}
```

For non-React hosts, use `createFormRuntime` from `@texaryn/core` directly:

```ts
import { createFormRuntime } from '@texaryn/core'

const runtime = createFormRuntime(adapter, { initialData, hints, onSubmit })
runtime.dispatch({ type: 'Submit' })
```

## Render

`FormProvider` makes the runtime available to all children. `FormRoot` walks the UI document and renders each node through the `registry`.

`createDefaultRegistry()` includes: text input, number input, checkbox, select, textarea, object layout, and array control. Replace or extend widgets by providing a custom registry.

## Validation

Texaryn validates per field based on the `validationTrigger` hint:

- `'blur'`: validates when the user leaves the field.
- `'change'`: validates as the user types, with debounce.
- `'submit'`: validates only on submission.

The runtime tracks `showErrors` per node. Errors appear only after the user has interacted with the field. React prop getters set `aria-invalid` and link `aria-describedby` to error elements automatically.

`FieldErrors` renders inline errors per field (included in all default widgets). `ErrorSummary` renders a jump-linked list of all visible errors above the form.

## Submit

Dispatch a `Submit` command to start the submission lifecycle:

```ts
form.dispatch({ type: 'Submit' })
```

The lifecycle progresses through four states: `idle`, `validating`, `submitting`, `submitted`.

Submit captures the current form data as an immutable snapshot. Validation and `onSubmit` both operate on the captured snapshot. Edits during submission update the live form state but do not alter the in-flight payload.

If validation fails, the state returns to `idle` and errors become visible. If `onSubmit` throws, the state returns to `idle` with `submission.error` set. A fresh Submit after failure clears the old error and starts again.

Duplicate Submit while validating or submitting is a no-op.

## Next steps

- [API reference](api/) for the full type surface
- Package READMEs: [@texaryn/core](../packages/core/README.md), [@texaryn/schema-json](../packages/schema-json/README.md), [@texaryn/react](../packages/react/README.md)
- [Migrating from RJSF](migrating-from-rjsf.md) if you are coming from react-jsonschema-form
- [Release runbook](releasing.md) for maintainers
