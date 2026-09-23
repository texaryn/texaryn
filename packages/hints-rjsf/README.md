# @texaryn/hints-rjsf

Converts a JSON-serializable RJSF 5.24.13 uiSchema, with Backstage Software Templates as the primary source, into Texaryn UI hints. It lists the host components the uiSchema names and reports every difference from what RJSF renders. ADR-006 records the decision.

Private: not published.

## Use

```ts
import { componentTester, fromUiSchema, splitBackstageStep } from '@texaryn/hints-rjsf'
import { createFormRuntime } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'

const { schema, uiSchema } = splitBackstageStep(step)
const port = await createJsonSchemaAdapter(schema)
const conversion = fromUiSchema(uiSchema, port.project(initialData))
const runtime = createFormRuntime(port, { initialData, hints: conversion.hints })

registry.register(componentTester(conversion, 'RepoUrlPicker'), RepoUrlPicker)
// in the component: conversion.uiSchemaAt(node.dataPointer)?.options.allowedHosts
```

`componentTester` returns a core `WidgetTester` at rank 10, above every built-in tester, so the same line works in React, Vue and Web Components. It matches rows added after the conversion.

## What it returns

| Member | Holds |
| --- | --- |
| `hints` | `placeholder`, `helpText`, `widget: 'textarea'`, `order`, `canReorder` |
| `components` | every `ui:field`, and every `ui:widget` Texaryn does not render itself, with its data location |
| `issues` | every difference from RJSF, with a code, the canonical key, the path to the key in the uiSchema, the data location and the value |
| `uiSchemaAt(pointer)` | RJSF's effective options and the uiSchema subtree at a location |

`splitBackstageStep` also returns `sources`, which maps each uiSchema key path to where the author wrote it in the step.

## Issue codes

| Code | Means |
| --- | --- |
| `unsupported` | RJSF renders it and Texaryn has no destination for it there |
| `conflict` | the destination exists and another source already fills it |
| `conditional` | RJSF's value depends on the selected `oneOf` or `anyOf` option, or Backstage's flattening discarded a branch's value |
| `unaddressable` | a static hint cannot address it: every row, keys chosen by the data, or a location the projection has no node for |
| `unknown-location` | it names no child the projection has there: a typo, or a property this port does not project |
| `invalid-value` | outside the JSON-serializable profile, or input RJSF itself rejects or drops |

Both functions never throw. A projection whose `nodes` is not a `Map` reads as empty, and a value nested deeper than 256 levels is `invalid-value`.

## Where Texaryn and RJSF differ

- RJSF shows reorder controls by default, so every statically addressable array gets `canReorder: true` unless `orderable` is false. An array inside a row keeps Texaryn's default.
- `helpText` replaces the description. `ui:help` is carried only where the field has no description; beside one it is a `conflict`.
- A placeholder on a select, and descriptions or help on objects and arrays, render in RJSF and not in Texaryn.
- `ui:order` matches RJSF for listed names and for siblings in one `properties` map. Unlisted siblings from applicators follow Texaryn's child order.
- Only the seven keys RJSF types as global options (`addable`, `copyable`, `orderable`, `removable`, `label`, `duplicateKeySuffixSeparator`, `enableMarkdownInDescription`) form the base under every location. Any other key in `ui:globalOptions` is reported `unsupported` once, because RJSF applies it at some call sites only.
- A requirement the host does not render falls back to the default widget for its type: a `password` renders as plain text, `hidden` stays visible.
