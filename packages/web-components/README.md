# @texaryn/web-components

A `<texaryn-form>` custom element for Texaryn, rendering native form controls
in light DOM. Usable from any framework, or from none.

> Status: pre-1.0. Public APIs may change before 1.0.

## Install

```bash
pnpm add @texaryn/core @texaryn/schema-json @texaryn/web-components
```

The package depends on `@texaryn/core` only. It has no framework dependency
and loads no stylesheet.

## Quick start

Registration is explicit, so importing the package defines nothing on its own:

```ts
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createDefaultRegistry, defineTexarynForm } from '@texaryn/web-components'
import type { TexarynFormElement } from '@texaryn/web-components'

defineTexarynForm()

const port = await createJsonSchemaAdapter({
  type: 'object',
  properties: { name: { type: 'string', title: 'Name' } },
  required: ['name'],
})

const form = document.createElement('texaryn-form') as TexarynFormElement
form.registry = createDefaultRegistry()
form.options = { initialData: { name: '' }, onSubmit: (data) => console.log(data) }
form.port = port
document.body.append(form)
```

## Two ownership modes

The element either creates a runtime or borrows one, and the two are mutually
exclusive: setting both throws.

- `port` plus `options` is the managed mode. The element creates a runtime and
  destroys it when the element is removed from the document. `options` is read
  when that runtime is created, so set it before `port`; setting `port` again
  rebuilds the runtime with the current options.
- `runtime` is the primitive input. A runtime assigned this way is borrowed
  and never destroyed by the element, which is what lets an application own
  one runtime and render it through several bindings.

Being removed from the document is not the same as being discarded. Moving the
element between parents fires `disconnectedCallback` too, so disposal is
deferred and skipped if the element is connected again, and a reparent keeps
the runtime, the controls and their values.

## Events

Native events are left alone. The controls are real elements in light DOM, so
`input`, `change` and `blur` bubble on their own. The element adds only its own
namespaced events, each carrying a store snapshot as `detail`:

- `texaryn-data-change`, the current form data
- `texaryn-submission-change`, the current submission state

## Submission

The element renders one `<form novalidate>` and turns its `submit` event into
the `Submit` command, so a `type="submit"` button placed inside the form works
the way a consumer expects. The runtime owns validation, which is why the
native `novalidate` is set and required fields carry `aria-required` rather
than the native `required` attribute.

## Ids

Every id is `<prefix>-<nodeId>-<suffix>`, where the prefix is the element's own
`id` attribute when it has one and an allocated value otherwise. Two forms on
one page therefore share no ids, and every `for` and `aria-describedby`
resolves inside its own element.

## Key exports

- `defineTexarynForm`
- `TexarynFormElement`
- `createDefaultRegistry`
- `mountForm`
- `makeId`
- `textInput`, `numberInput`, `checkbox`, `select`, `textarea`
- `objectLayout`, `arrayControl`
- types: `DomWidget`, `WidgetFactory`, `NodeBinding`, `RenderContext`, `Mount`

## Not in this release

Shadow DOM, `formAssociated` and `ElementInternals`, nesting inside another
`<form>`, group and layout containers beyond objects and arrays, text and
action nodes, and focus management after a failed submit.

## Related packages

- [`@texaryn/core`](../core/README.md), runtime and renderer contracts
- [`@texaryn/schema-json`](../schema-json/README.md), JSON Schema adapter
- [`@texaryn/react`](../react/README.md), the React binding over the same runtime
- [`@texaryn/vue`](../vue/README.md), the Vue binding over the same runtime

See the [repository README](../../README.md) for the complete architecture.

## License

Apache-2.0
