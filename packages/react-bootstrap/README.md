# @texaryn/react-bootstrap

Bootstrap 5 widgets for Texaryn: native HTML with Bootstrap classes, on top of `@texaryn/react`.

> Status: pre-1.0. Public APIs may change before 1.0.

## Install

```bash
pnpm add @texaryn/core @texaryn/schema-json @texaryn/react @texaryn/react-bootstrap react react-dom bootstrap
```

`bootstrap` is a peer dependency (`^5.3`), and so are `@texaryn/react` and `react` (18 or newer). The package reads no Bootstrap JavaScript and imports no stylesheet: the page loads Bootstrap 5.3 CSS itself, from the installed `bootstrap` package or from a CDN link.

## Quick start

Swap `createDefaultRegistry()` for `createBootstrapRegistry()`. Nothing else about the form changes:

```tsx
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { FormProvider, FormRoot, ErrorSummary, useForm } from '@texaryn/react'
import { createBootstrapRegistry } from '@texaryn/react-bootstrap'
import 'bootstrap/dist/css/bootstrap.min.css'

// schema as in the @texaryn/react quick start
const adapter = await createJsonSchemaAdapter(schema)
const registry = createBootstrapRegistry()

function App() {
  const form = useForm(adapter, { initialData: { name: '' } })

  return (
    <FormProvider value={form.runtime}>
      <ErrorSummary />
      <FormRoot registry={registry} />
    </FormProvider>
  )
}
```

The CSS import above assumes a bundler that resolves stylesheet imports. A page without one adds the equivalent `<link>` tag instead.

## What this package renders

`createBootstrapRegistry()` returns a `RendererRegistry<WidgetComponent>` with seven widgets. Each field widget sits in a `mb-3` wrapper, adds `is-invalid` to its control while the field shows errors, and renders the description as `form-text` and every visible error as `invalid-feedback d-block` inside the binding's `role="alert"` container.

| Widget | Node it matches | Classes |
| --- | --- | --- |
| `BootstrapTextInput` | string field with no enum | `form-label`, `form-control` with `type="text"` |
| `BootstrapNumberInput` | number or integer field | `form-label`, `form-control` with `type="number"` |
| `BootstrapTextarea` | field with the `textarea` widget hint | `form-label`, `form-control` |
| `BootstrapSelect` | field with enum values | `form-label`, `form-select` |
| `BootstrapCheckbox` | boolean field | `form-check`, `form-check-input`, `form-check-label` |
| `BootstrapObjectLayout` | object container | none, a plain `div` around the children |
| `BootstrapArrayControl` | array container | `btn btn-primary` to add, `btn btn-outline-danger btn-sm` to remove |

Enum outranks the primitive type, so a string field with an `enum` renders as a select, and the `textarea` hint outranks both.

`invalid-feedback` is hidden by Bootstrap unless it directly follows an `.is-invalid` sibling. The error lines sit inside the alert container rather than beside the control, so each one carries `d-block`.

## Composing your own registry

Every widget is exported, so a registry can mix these with your own. A widget is markup around [`useFieldBinding`](../react/README.md#custom-widgets), which supplies the label, description, display-gated errors and a DOM surface to spread: `domInputProps` for text, number, textarea and select controls, `domCheckboxProps` for checkboxes.

```tsx
import { createRendererRegistry } from '@texaryn/core'
import type { FieldNode, UINode } from '@texaryn/core'
import { useFieldBinding } from '@texaryn/react'
import type { WidgetComponent } from '@texaryn/react'
import { BootstrapTextInput, BootstrapObjectLayout } from '@texaryn/react-bootstrap'

function EmailInput({ node }: { node: UINode }) {
  const field = useFieldBinding(node as FieldNode)
  return (
    <div className="mb-3">
      <label {...field.labelProps} className="form-label">{field.label}</label>
      <input {...field.domInputProps} type="email" className="form-control" />
    </div>
  )
}

const registry = createRendererRegistry<WidgetComponent>()
registry.register({ test: (n) => n.type === 'container' && n.containerType === 'object', rank: 1 }, BootstrapObjectLayout)
registry.register({ test: (n) => n.type === 'field' && n.fieldType === 'string', rank: 1 }, BootstrapTextInput)
registry.register({ test: (n) => n.type === 'field' && n.format === 'email', rank: 10 }, EmailInput)
```

`BootstrapFeedback` is exported too, so a custom widget can render the same description and error block as the built-in ones.

## What this package does not do

- It does not depend on `react-bootstrap` or any other component library. The widgets render `input`, `select`, `textarea`, `label`, `div` and `button` elements directly.
- It does not load or bundle Bootstrap CSS. The page is responsible for having Bootstrap 5.3 on it; without the stylesheet the form still works and still carries the classes, it is just unstyled.
- It does not load Bootstrap's JavaScript. No widget uses a Bootstrap component that needs it.
- It does not own form state. Values, validation, touched state and error display all come from the runtime through `@texaryn/react`.

## Related packages

- [`@texaryn/react`](../react/README.md), React bindings, hooks and default widgets
- [`@texaryn/core`](../core/README.md), runtime and renderer contracts
- [`@texaryn/schema-json`](../schema-json/README.md), JSON Schema adapter

See the [repository README](../../README.md) for the complete architecture.

## License

Apache-2.0
