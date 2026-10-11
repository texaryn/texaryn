# @texaryn/svelte

Svelte 5 bindings and a default renderer for Texaryn. The package connects
Svelte stores and components to the shared Texaryn runtime. Schema projection,
validation, and form commands remain in `@texaryn/core` and the selected schema
adapter.

## Install

```sh
pnpm add @texaryn/core @texaryn/schema-json @texaryn/svelte svelte
```

Svelte 5.20 or newer is required.

## Use

Create the schema adapter before mounting the component tree, then create a
runtime in a component whose lifetime matches the form.

```ts
// main.ts
import { mount } from 'svelte'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import App from './App.svelte'

const adapter = await createJsonSchemaAdapter({
  type: 'object',
  title: 'Profile',
  required: ['name'],
  properties: {
    name: { type: 'string', title: 'Name', minLength: 2 },
    age: { type: 'integer', title: 'Age', minimum: 18 },
  },
})

mount(App, {
  target: document.getElementById('app')!,
  props: { adapter },
})
```

```svelte
<!-- App.svelte -->
<script lang="ts">
  import type { SchemaEvaluationPort } from '@texaryn/core'
  import { createDefaultRegistry, createForm, FormRoot } from '@texaryn/svelte'

  let { adapter }: { adapter: SchemaEvaluationPort } = $props()
  const form = createForm(adapter, { initialData: { name: '', age: 18 } })
  const data = form.data
  const registry = createDefaultRegistry()
</script>

<FormRoot {form} {registry}>
  <h2>Data</h2>
  <pre>{JSON.stringify($data, null, 2)}</pre>
</FormRoot>
```

`FormRoot` creates a server rendering safe id prefix with Svelte's component id
unless `idPrefix` is provided. The prefix must be unique among forms rendered
by the same component tree. `FormRoot` destroys the runtime when it unmounts by
default. Set `destroyOnUnmount={false}` when another owner manages the runtime.

The default registry renders text, number, checkbox, enum, object, and array
nodes. It also includes field errors, a live error summary, array add and
remove controls, and opt in reorder controls driven by `canReorder` UI hints.
`FormRoot` accepts a complete custom `FormMessages` object, or uses the English
defaults.

## Custom widgets

Widgets are Svelte 5 components that accept a `node` prop. Add them to a
`RendererRegistry<WidgetComponent>` and pass that registry to `FormRoot`.
Descendants can call `useFormContext()` to read the form, registry, messages,
and id prefix. The call must happen while the component is being initialized
below `FormRoot`.

```svelte
<script lang="ts">
  import type { UINode } from '@texaryn/core'
  import { useFormContext } from '@texaryn/svelte'

  let { node }: { node: UINode } = $props()
  const { form } = useFormContext()
</script>

<div data-node-id={node.id}>{node.annotations.title}</div>
```

`createFieldBinding` adapts a field node and runtime state to Svelte readable
stores. The default field widget uses it to preserve enum values of different
types, update validation state, and connect labels and errors through ARIA
attributes.

## Runtime ownership

`createForm` returns readable stores backed by the framework-neutral runtime.
Mount one runtime per form and let `FormRoot` own its teardown, or disable
`destroyOnUnmount` when an application has an explicit owner. Unmounting
unsubscribes the Svelte bridge stores and stops runtime validation work.

The package depends on `@texaryn/core` and Svelte. It does not depend on
`@texaryn/react`, Vue, or a second form state library.

## Related packages

- [`@texaryn/core`](../core/README.md), runtime and renderer contracts
- [`@texaryn/schema-json`](../schema-json/README.md), JSON Schema adapter
- [`@texaryn/react`](../react/README.md), React bindings for the same runtime

See the [repository README](../../README.md) for the complete architecture.

## License

Apache-2.0
