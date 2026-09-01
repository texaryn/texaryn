# @texaryn/react

React bindings, hooks, prop getters, renderer components, and default widgets for Texaryn.

> Status: early alpha. Public APIs may change before 1.0.

## Install

```bash
pnpm add @texaryn/core@alpha @texaryn/schema-json@alpha @texaryn/react@alpha react react-dom
```

`@texaryn/react` requires React 18 or newer.

## Quick start

```tsx
import { createRoot } from 'react-dom/client'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import {
  FormProvider,
  FormRoot,
  createDefaultRegistry,
  useForm,
} from '@texaryn/react'

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  title: 'Profile',
  properties: {
    name: { type: 'string', title: 'Name' },
    age: { type: 'integer', title: 'Age', minimum: 18 },
  },
  required: ['name'],
}

const adapter = await createJsonSchemaAdapter(schema)
const registry = createDefaultRegistry()

function App() {
  const form = useForm(adapter, {
    initialData: {
      name: '',
      age: 18,
    },
  })

  return (
    <FormProvider value={form.runtime}>
      <FormRoot registry={registry} />
      <pre>{JSON.stringify(form.data, null, 2)}</pre>
    </FormProvider>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
```

React observes the Texaryn runtime. It does not evaluate JSON Schema or own the canonical form state.

## Main APIs

### `useForm(port, options?)`

Creates a Texaryn runtime for a React component and subscribes to its top-level stores.

```ts
const form = useForm(port, {
  initialData,
  hints,
  onSubmit,
})
```

It returns:

```ts
interface UseFormReturn {
  runtime: FormRuntime
  document: UIDocument
  data: unknown
  submission: SubmissionState
  dispatch(command: Command): void
  getNodeState(nodeId: NodeId): NodeState | undefined
}
```

The runtime is destroyed automatically when the hook unmounts.

### `FormProvider`

Provides a `FormRuntime` to renderer components and hooks:

```tsx
<FormProvider value={form.runtime}>
  <FormRoot registry={registry} />
</FormProvider>
```

`useFormContext()` returns the current runtime.

### `FormRoot`

Renders the root node of the current `UIDocument` using a renderer registry:

```tsx
<FormRoot registry={registry} />
```

### `NodeRenderer`

Renders an individual semantic UI node and resolves the matching widget through the registry.

## Field hooks

The package exports:

- `useField`
- `useFieldArray`
- `useStore`

These hooks bridge React subscriptions to the runtime's framework-neutral stores and commands.

## Prop getters

For custom widgets and design systems, Texaryn exports accessible prop helpers:

- `getInputProps`
- `getLabelProps`
- `getErrorProps`
- `getDescriptionProps`

They translate semantic field state into DOM-facing props without moving form behavior into React components.

## Default widgets

`createDefaultRegistry()` registers the built-in React widgets:

- `TextInput`
- `NumberInput`
- `Checkbox`
- `Select`
- `Textarea`
- `ObjectLayout`
- `ArrayControl`

```ts
import { createDefaultRegistry } from '@texaryn/react'

const registry = createDefaultRegistry()
```

The default registry is intentionally small. Applications can supply their own registry and widget components for a product or design system.

## Custom rendering

The renderer boundary is registry-based. React components are selected from semantic node information rather than from JSON Schema keywords directly.

This keeps the dependency direction clear:

```text
@texaryn/schema-json
        |
        v
   @texaryn/core
        |
        v
   @texaryn/react
```

The schema adapter interprets data semantics. The core compiles and runs the form. React renders the result.

## Public exports

### Hooks

- `useStore`
- `useForm`
- `useField`
- `useFieldArray`
- `useFormContext`

### Context and rendering

- `FormContext`
- `FormProvider`
- `FormRoot`
- `NodeRenderer`
- `useRendererContext`

### Prop getters

- `getInputProps`
- `getLabelProps`
- `getErrorProps`
- `getDescriptionProps`

### Widgets

- `TextInput`
- `NumberInput`
- `Checkbox`
- `Select`
- `Textarea`
- `ObjectLayout`
- `ArrayControl`
- `createDefaultRegistry`

## Related packages

- [`@texaryn/core`](../core/README.md), runtime and renderer contracts
- [`@texaryn/schema-json`](../schema-json/README.md), JSON Schema adapter
- [`@texaryn/demo`](../demo/README.md), repository demo application

See the [repository README](../../README.md) for the complete architecture.

## License

Apache-2.0
