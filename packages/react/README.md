# @texaryn/react

React bindings, hooks, prop getters, renderer components, and default widgets for Texaryn.

> Status: pre-1.0. Public APIs may change before 1.0.

## Install

```bash
pnpm add @texaryn/core @texaryn/schema-json @texaryn/react react react-dom
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

They translate semantic field state into DOM-facing props without moving form behavior into React components. `getInputProps` also carries the field's `placeholder` hint, so any widget that spreads its result onto an input shows it.

## Error display

`useField` returns `showErrors`, which is `true` only once a field is both touched and invalid. Widgets use it to decide whether to render inline errors:

```tsx
import { FieldErrors } from '@texaryn/react'

<FieldErrors node={node} errors={errors} showErrors={showErrors} />
```

`ErrorSummary` reads the runtime's `visibleErrors` store and renders a jump-linked list of every currently visible error above the form:

```tsx
import { ErrorSummary } from '@texaryn/react'

<FormProvider value={form.runtime}>
  <ErrorSummary />
  <FormRoot registry={registry} />
</FormProvider>
```

All default widgets already render `FieldErrors` internally, so most applications only need to add `ErrorSummary`.

## Submission

`useForm` exposes the runtime's `submission` state and a `dispatch` function. Start a submission by dispatching `Submit`:

```tsx
<button
  type="button"
  disabled={
    form.submission.status === 'validating' ||
    form.submission.status === 'submitting'
  }
  onClick={() => form.dispatch({ type: 'Submit' })}
>
  Submit
</button>
```

`form.submission.status` moves through `idle`, `validating`, `submitting`, and `submitted`. An invalid validation result returns the status to `idle` and updates node errors without setting `form.submission.error`. The error is set only when the validator throws or rejects, or when `onSubmit` throws or rejects; the status returns to `idle` in those cases too:

```tsx
{form.submission.error != null && (
  <p>{String(form.submission.error)}</p>
)}
```

React does not own the submission lifecycle. It only observes the `submission` store that `@texaryn/core` computes; see the [`@texaryn/core` README](../core/README.md#submission-lifecycle) for the full snapshot semantics.

## Custom widgets

`useFieldBinding(node)` composes everything a field widget needs: the value and `setValue`, the label, description and placeholder, display-gated `errors` with a first `error` and an `invalid` flag, the ARIA prop getters, and two event-shaped adapters ready to spread onto a native control, `domInputProps` for value controls and `domCheckboxProps` for checkboxes. They own the display value and the coercion for text, number, checkbox and select controls, so a widget is markup around one hook:

```tsx
import { useFieldBinding } from '@texaryn/react'
import type { FieldNode, UINode } from '@texaryn/core'

function BootstrapTextInput({ node }: { node: UINode }) {
  const field = useFieldBinding(node as FieldNode)
  return (
    <div className="mb-3">
      <label {...field.labelProps} className="form-label">{field.label}</label>
      <input {...field.domInputProps} type="text" className={field.invalid ? 'form-control is-invalid' : 'form-control'} />
      {field.description ? <div {...field.descriptionProps} className="form-text">{field.description}</div> : null}
    </div>
  )
}
```

`setValue(value)` is the fundamental operation; the `onChange` on the DOM surfaces is a convenience that coerces the DOM event and calls it. A component that deals in values directly uses `field.value` and `field.setValue` instead. Checkboxes spread `domCheckboxProps` (`checked`); text, number, textarea and select controls spread `domInputProps` (`value`). The lower-level `getInputProps`, `getLabelProps`, `getErrorProps` and `getDescriptionProps` remain available and unchanged.

A renderer that shows either the error or the description, not both, owns `aria-describedby` for what it renders; the binding's props reference both elements because the default widgets render both.

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
- `UseFormReturn`
- `useField`
- `UseFieldReturn`
- `useFieldArray`
- `UseFieldArrayReturn`
- `useFieldBinding`
- `FieldBinding`
- `DomValueInputProps`
- `DomCheckedInputProps`
- `DomInputBaseProps`
- `useFormContext`

### Context and rendering

- `FormContext`
- `FormProvider`
- `FormRoot`
- `FormRootProps`
- `NodeRenderer`
- `NodeRendererProps`
- `useRendererContext`
- `WidgetComponent`
- `RendererContextValue`

### Error display

- `FieldErrors`
- `FieldErrorsProps`
- `ErrorSummary`

### Prop getters

- `getInputProps`
- `getLabelProps`
- `getErrorProps`
- `getDescriptionProps`
- `InputProps`
- `LabelProps`
- `ErrorProps`
- `DescriptionProps`
- `FieldState`

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
- [`@texaryn/react-bootstrap`](../react-bootstrap/README.md), Bootstrap 5 widget registry
- [`@texaryn/react-mui`](../react-mui/README.md), Material UI v9 widget registry
- [`@texaryn/playground`](../../apps/playground/README.md), repository playground application

See the [repository README](../../README.md) for the complete architecture.

## License

Apache-2.0
