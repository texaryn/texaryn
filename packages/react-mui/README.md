# @texaryn/react-mui

Material UI v9 widgets for Texaryn: MUI components on top of `@texaryn/react`.

> Status: pre-1.0. Public APIs may change before 1.0.

## Install

```bash
pnpm add @texaryn/core @texaryn/schema-json @texaryn/react @texaryn/react-mui @mui/material @emotion/react @emotion/styled react react-dom
```

`@mui/material` is a peer dependency (`^9.0.0`), and so are `@texaryn/react` and `react` (18 or newer). `@emotion/react` and `@emotion/styled` are MUI's default styling engine, not a Texaryn dependency: MUI needs them on the page to render its `sx` prop and its component styles, and this package never imports them itself.

## Quick start

Swap `createDefaultRegistry()` for `createMuiRegistry()`. Nothing else about the form changes:

```tsx
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { FormProvider, FormRoot, ErrorSummary, useForm } from '@texaryn/react'
import { createMuiRegistry } from '@texaryn/react-mui'

// schema as in the @texaryn/react quick start
const adapter = await createJsonSchemaAdapter(schema)
const registry = createMuiRegistry()

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

This package is theme-neutral: it calls no `createTheme`, renders no `ThemeProvider` and imports no `CssBaseline`. A page that wants MUI's default look wraps its own tree in a `ThemeProvider`; a page with no `ThemeProvider` still gets MUI's baked-in default theme, because that is how `@mui/material` components behave without one.

```tsx
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'

const theme = createTheme({ palette: { mode: 'dark' } })

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {/* FormProvider, FormRoot, etc. */}
    </ThemeProvider>
  )
}
```

## What this package renders

`createMuiRegistry()` returns a `RendererRegistry<WidgetComponent>` with seven widgets, each built from a MUI component.

| Widget | Node it matches | MUI components |
| --- | --- | --- |
| `MuiTextInput` | string field with no enum | `TextField` |
| `MuiNumberInput` | number or integer field | `TextField` with `type="number"` |
| `MuiTextarea` | field with the `textarea` widget hint | `TextField` with `multiline` |
| `MuiSelect` | field with enum values | `TextField` with `select`, `MenuItem` per option |
| `MuiCheckbox` | boolean field | `FormControl`, `FormControlLabel`, `Checkbox`, `FormHelperText` |
| `MuiObjectLayout` | object container | `Stack` around the children |
| `MuiArrayControl` | array container | `Stack`, `Box` per item, `Button` to add or remove |

Enum outranks the primitive type, so a string field with an `enum` renders as a select, and the `textarea` hint outranks both.

### Error display: replace, not both

Where `@texaryn/react-bootstrap` and the default registry show the description and every visible error together, this package shows one line of helper text at a time: the description while the field is valid, and the first visible error in its place once the field is invalid. That is `TextField`'s own `helperText` model, one slot, so the widgets pass it `field.error ?? field.description` rather than rendering both. The error line carries `role="alert"` through `slotProps.formHelperText`.

### `aria-required`, not `required`

Widgets set `aria-required` on the underlying input when a field is required, but never the native HTML `required` attribute. Texaryn's own validation is authoritative: a native `required` would let the browser block submission or show its own validation UI before Texaryn's runtime ever sees the value, which would fight the runtime's validation-trigger and error-display policy instead of deferring to it.

## Composing your own registry

Every widget is exported, so a registry can mix these with your own. A widget is markup around [`useFieldBinding`](../react/README.md#custom-widgets), which supplies the label, description, display-gated errors and a DOM surface to spread: `domInputProps` for text, number, textarea and select controls, `domCheckboxProps` for checkboxes.

```tsx
import { createRendererRegistry } from '@texaryn/core'
import type { FieldNode, UINode } from '@texaryn/core'
import { useFieldBinding } from '@texaryn/react'
import type { WidgetComponent } from '@texaryn/react'
import TextField from '@mui/material/TextField'
import { MuiTextInput, MuiObjectLayout } from '@texaryn/react-mui'

function EmailInput({ node }: { node: UINode }) {
  const field = useFieldBinding(node as FieldNode)
  return (
    <TextField
      id={field.domInputProps.id}
      name={field.domInputProps.name}
      value={field.domInputProps.value}
      onChange={field.domInputProps.onChange}
      onBlur={field.domInputProps.onBlur}
      type="email"
      label={field.label}
      error={field.invalid}
      helperText={field.error ?? field.description}
      fullWidth
    />
  )
}

const registry = createRendererRegistry<WidgetComponent>()
registry.register({ test: (n) => n.type === 'container' && n.containerType === 'object', rank: 1 }, MuiObjectLayout)
registry.register({ test: (n) => n.type === 'field' && n.fieldType === 'string', rank: 1 }, MuiTextInput)
registry.register({ test: (n) => n.type === 'field' && n.format === 'email', rank: 10 }, EmailInput)
```

## What this package does not do

- It does not depend on MUI X, `@mui/icons-material`, or Base UI. The seven widgets use only `@mui/material` components.
- It does not create a theme, render a `ThemeProvider`, or render `CssBaseline`. Theming is entirely the consuming page's decision.
- It does not depend on `@emotion/react` or `@emotion/styled` at runtime; they are declared only as dev dependencies for building and testing this package. The consuming page installs them for MUI's styling engine.
- It does not set native HTML `required`, `min`, `max`, or `pattern` attributes. Texaryn's runtime is the single source of validation; the widgets only reflect its state through ARIA attributes.
- It does not own form state. Values, validation, touched state and error display all come from the runtime through `@texaryn/react`.

## Related packages

- [`@texaryn/react`](../react/README.md), React bindings, hooks and default widgets
- [`@texaryn/react-bootstrap`](../react-bootstrap/README.md), Bootstrap 5 widgets
- [`@texaryn/core`](../core/README.md), runtime and renderer contracts
- [`@texaryn/schema-json`](../schema-json/README.md), JSON Schema adapter

See the [repository README](../../README.md) for the complete architecture.

## License

Apache-2.0
