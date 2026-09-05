# @texaryn/vue

Vue 3 bindings for Texaryn: composables, provide/inject context, a renderer
and a small set of native widgets.

> Status: pre-1.0. Public APIs may change before 1.0.

## Install

```bash
pnpm add @texaryn/core @texaryn/schema-json @texaryn/vue vue
```

`@texaryn/vue` requires Vue 3.4 or newer.

## Quick start

```vue
<script setup lang="ts">
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { FormRoot, useForm, provideFormRuntime, createDefaultRegistry } from '@texaryn/vue'

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: { name: { type: 'string', title: 'Name' } },
  required: ['name'],
}

const port = await createJsonSchemaAdapter(schema)
const form = useForm(port, { initialData: { name: '' } })
provideFormRuntime(form.runtime)

const registry = createDefaultRegistry()
</script>

<template>
  <!-- FormRoot has to be a descendant, not this component itself -->
  <FormRoot :registry="registry" />
</template>
```

`useForm` creates the runtime and ties it to the calling scope. Providing is a
separate call rather than a side effect of construction: React's equivalent is
`<FormProvider>` in the template, and Vue's is a setup call.

A component cannot inject what it provided itself, so `FormRoot` and anything
calling `useField` has to be a descendant of whichever component called
`provideFormRuntime`.

## Lifetime is a requirement, not a convention

`useForm` and `useStore` throw when called outside `setup()` or an active
`effectScope`. Both own something that only teardown releases, a runtime with
live validation timers and a store subscription, and neither returns a handle
the caller could stop. Requiring a scope is what makes that ownership real:
the check runs before anything is created, so a misuse cannot leak the thing
it was about to allocate. Stopping the scope destroys the runtime and
unsubscribes.

## What it does not depend on

`@texaryn/core` and Vue. Not `@texaryn/react`. The point of a second binding is
to find out what core actually promises, and reaching into the first binding
for a helper would answer a different question.

## Node ids are accepted as refs or getters, and that matters

`useField` and `useFieldArray` take `MaybeRefOrGetter<NodeId>`, not `NodeId`.

Node ids follow position in the document. Array item identity is carried
separately as `StableItemId`, and a row keyed on that keeps its component
instance through a move while the node underneath it becomes a different one.
React re-reads the id on every render, so it follows for free. A Vue
composable that captured the id in `setup` would keep reading the old position
and keep writing to it, so typing into a moved row would overwrite the row
that took its place.

The same reasoning applies to reads. `getNodeState` is a map lookup with no
reactivity of its own, and the runtime replaces a node's state bundle when its
id leaves the document and returns. `useField` reads the document ref when it
resolves the bundle so a recompile re-resolves it.

Both are covered by tests that fail when the behaviour is removed.

## Conformance

`tests/example-conformance/vue.test.ts` runs the whole catalog through this
package and makes the same two claims the React renderers make: every example
mounts without a console error or warning, and every active node in every
example resolves a widget. The framework-neutral half of that harness is
shared; mounting is not, because the two frameworks do not share a mounting
model.

## No single file components

The package ships plain TypeScript with render functions, so it builds with
the same `tsc --build` as every other package in the workspace and needs no
Vue-specific toolchain to compile. Consumers are free to use SFCs; nothing
here requires them to.

## Related packages

- [`@texaryn/core`](../core/README.md), runtime and renderer contracts
- [`@texaryn/schema-json`](../schema-json/README.md), JSON Schema adapter
- [`@texaryn/react`](../react/README.md), the React binding over the same runtime

See the [repository README](../../README.md) for the complete architecture.

## License

Apache-2.0
