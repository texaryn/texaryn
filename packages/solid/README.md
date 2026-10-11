# @texaryn/solid

SolidJS bindings and default widgets for Texaryn forms.

```tsx
import { render } from 'solid-js/web'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createForm, createDefaultRegistry, FormRoot } from '@texaryn/solid'

const schema = await createJsonSchemaAdapter({
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name' },
  },
})
const form = createForm(schema, { initialData: { name: '' } })

render(
  () => <FormRoot form={form} registry={createDefaultRegistry()} showErrorSummary />,
  document.getElementById('app')!,
)
```

`FormRoot` owns the runtime by default and destroys it when the Solid owner is
disposed. Set `destroyOnUnmount={false}` when another owner manages the runtime.
The default registry renders fields, object groups, arrays, validation messages,
and projection boundary actions. Use `useStore` to subscribe to a Texaryn store
inside an owned Solid scope, and `useFormContext` to access the active form,
registry, messages, and document.

Solid 1.9 or later is a peer dependency.
