# @texaryn/vue

Vue 3 bindings for Texaryn: composables, provide/inject context, a renderer
and a small set of native widgets.

Not published yet. It becomes public once the `0.0.0` placeholder is on npm,
which is a manual step because OIDC cannot perform a package's first publish.

```ts
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { useForm, provideFormRuntime, FormRoot, createDefaultRegistry } from '@texaryn/vue'

const form = useForm(port, { initialData })
provideFormRuntime(form.runtime)
// then render <FormRoot :registry="createDefaultRegistry()" /> in a descendant
```

`useForm` creates the runtime and ties it to the calling scope. Providing is a
separate call rather than a side effect of construction: React's equivalent is
`<FormProvider>` in the template, and Vue's is a setup call. Note that a
component cannot inject what it provided itself, so `FormRoot` and anything
using `useField` has to be a descendant.

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

## No single file components

The package ships plain TypeScript with render functions, so it builds with
the same `tsc --build` as every other package in the workspace and needs no
Vue-specific toolchain to compile. Consumers are free to use SFCs; nothing
here requires them to.
