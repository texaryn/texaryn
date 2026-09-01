# @texaryn/core

Framework-neutral UI IR, compiler, runtime, state, commands, identity, and renderer registry for Texaryn.

> Status: early alpha. Public APIs may change before 1.0.

## Install

```bash
pnpm add @texaryn/core@alpha
```

`@texaryn/core` has no React or DOM dependency.

## What it does

Texaryn keeps schema evaluation, UI structure, runtime state, and rendering separate:

```text
SchemaEvaluationPort
        |
        v
SchemaProjection
        |
        v
     compile()
        |
        v
    UIDocument
        |
        v
  FormRuntime
        |
        v
    Renderer
```

The core package owns the framework-neutral contracts and deterministic runtime. A schema adapter supplies semantic information through `SchemaEvaluationPort`, and a renderer consumes the resulting UI document and runtime state.

## Quick start

Most applications use `@texaryn/core` together with a schema adapter and a renderer.

```ts
import { createFormRuntime } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name' },
  },
  required: ['name'],
}

const adapter = await createJsonSchemaAdapter(schema)

const runtime = createFormRuntime(adapter, {
  initialData: { name: '' },
  onSubmit(data) {
    console.log(data)
  },
})

const document = runtime.document.getSnapshot()
const data = runtime.data.getSnapshot()

console.log(document.rootId, data)

runtime.dispatch({ type: 'Submit' })

runtime.destroy()
```

## Schema evaluation contract

Schema libraries integrate with Texaryn through `SchemaEvaluationPort`:

```ts
interface SchemaEvaluationPort {
  project(data: unknown): SchemaProjection
  validate(data: unknown): ValidationResult | Promise<ValidationResult>
  validateAt?(
    data: unknown,
    pointer: JsonPointer,
  ): ValidationResult | Promise<ValidationResult>
}
```

The core does not parse or validate JSON Schema itself. That responsibility belongs to schema adapter packages such as `@texaryn/schema-json`.

## Runtime

Create a runtime with:

```ts
import { createFormRuntime } from '@texaryn/core'

const runtime = createFormRuntime(port, {
  initialData,
  hints,
  onSubmit,
})
```

A `FormRuntime` exposes stores for:

- `document`, the current `UIDocument`
- `data`, the current form data
- `submission`, the current submission state

It also exposes:

- `dispatch(command)`
- `getNodeState(nodeId)`
- `destroy()`

Node state is kept outside the UI IR and includes value, validation, dirty/touched state, visibility, and disabled state.

## Commands

The runtime currently understands:

```ts
{ type: 'SetValue', nodeId, value }
{ type: 'InsertItem', containerId, index, value? }
{ type: 'RemoveItem', containerId, index }
{ type: 'MoveItem', containerId, from, to }
{ type: 'SetTouched', nodeId }
{ type: 'Submit' }
{ type: 'Reset', data? }
```

Commands are data. They do not contain renderer or DOM behavior.

## UI IR

`compile()` converts a `SchemaProjection` into a flat, versioned `UIDocument`:

```ts
interface UIDocument {
  version: 1
  rootId: NodeId
  nodes: Record<NodeId, UINode>
}
```

The IR contains semantic nodes such as fields, containers, text, and actions. It describes what the UI means, not how a framework should render it.

## UI hints

Presentation can be layered on top of schema semantics:

```ts
const hints = {
  '/email': {
    placeholder: 'you@example.com',
    order: 1,
  },
  '/bio': {
    widget: 'textarea',
    helpText: 'Tell us about yourself.',
    order: 2,
  },
}
```

Pass hints to `createFormRuntime()` or, in React, to `useForm()`.

## Renderer registry

The core exports a framework-neutral renderer registry:

```ts
import { createRendererRegistry } from '@texaryn/core'

const registry = createRendererRegistry()
```

Framework packages can register concrete widget components without adding framework dependencies to the runtime.

## Stable array identity

The core includes identity helpers used to keep dynamic array items stable across inserts, removals, moves, and recompilation:

- `createIdentityMap`
- `registerArray`
- `insertItem`
- `removeItem`
- `moveItem`
- `resolvePointer`
- `reconcile`

## Key exports

### Schema and IR

- `SchemaEvaluationPort`
- `SchemaProjection`
- `NodeProjection`
- `UIDocument`
- `UINode`
- `FieldNode`
- `ContainerNode`
- `compile`

### Runtime and state

- `createFormRuntime`
- `FormRuntime`
- `FormRuntimeOptions`
- `NodeState`
- `createStore`
- `Store`

### Commands

- `Command`
- `Effect`
- `processCommand`

### JSON Pointer helpers

- `getAtPointer`
- `setAtPointer`
- `parsePointer`

### Rendering

- `createRendererRegistry`
- `RendererRegistry`
- `WidgetTester`

## Design constraints

`@texaryn/core` intentionally does not depend on:

- React
- the DOM
- a JSON Schema implementation
- an AI SDK or transport protocol

That boundary is what allows the same runtime model to support different schema engines and renderers.

## Related packages

- [`@texaryn/schema-json`](../schema-json/README.md), primary JSON Schema adapter
- [`@texaryn/react`](../react/README.md), React bindings and default renderer

See the [repository README](../../README.md) and [ROADMAP](../../ROADMAP.md) for the full architecture.

## License

Apache-2.0
