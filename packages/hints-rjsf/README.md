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

The conversion needs the port's projection, so it fails wherever `@texaryn/schema-json` cannot project the step, for example a `oneOf` inside `dependencies` (issue #121).

## API

```ts
export function fromUiSchema(uiSchema: unknown, projection: SchemaProjection): UiSchemaConversion
export function componentTester(conversion: UiSchemaConversion, name: string, rank?: number): WidgetTester
export function splitBackstageStep(step: unknown): BackstageStepSplit

export interface UiSchemaConversion {
  readonly hints: UIHints
  readonly components: readonly ComponentRequirement[]
  readonly issues: readonly UiSchemaIssue[]
  uiSchemaAt(pointer: JsonPointer): UiSchemaEntry | undefined
}

export interface ComponentRequirement {
  readonly name: string
  readonly key: 'ui:field' | 'ui:widget'
  readonly path: string
  readonly pointer: JsonPointer
  readonly rows: boolean
}

export interface UiSchemaEntry {
  readonly component?: string
  readonly options: Readonly<Record<string, JsonValue>>
  readonly uiSchema: JsonObject
}

export interface UiSchemaIssue {
  readonly code: UiSchemaIssueCode
  readonly key: string
  readonly path: string
  readonly pointer?: JsonPointer
  readonly value?: JsonValue
  readonly message: string
}
```

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

## Mapping

Node kinds: S string field, E enum field (any scalar with `enumValues`), N number or integer field, B boolean field, O object, A array. "hint" writes the hint named; "comp" adds a component requirement; "unsup", "confl", "cond", "unaddr", "invalid" are the issue codes; "ign" produces nothing (RJSF ignores it there). A key at a location a component owns produces nothing: the component receives it through `uiSchemaAt`.

| Effective key | S | E | N | B | O | A |
| --- | --- | --- | --- | --- | --- | --- |
| `placeholder` | hint `placeholder` | unsup (RJSF labels the empty option) | hint `placeholder` | ign | ign | ign |
| `description` | hint `helpText` | hint `helpText` | hint `helpText` | hint `helpText` | unsup | unsup |
| `help` | hint `helpText`, or confl when the projected description or `description` fills the slot | same | same | same | unsup | unsup |
| `title` | unsup unless equal to the projected title | same | same | same | same | same |
| `enableMarkdownInDescription: true` | unsup where a description renders | same | same | same | same | same |
| `label: false` | unsup | unsup | unsup | unsup | unsup | unsup |
| `classNames`, `style`, unprefixed `classNames` | unsup | unsup | unsup | unsup | unsup | unsup |
| `disabled: true` | unsup | unsup | unsup | unsup | unsup | unsup |
| `readonly: true` | unsup unless the projected node is already read-only | same | same | same | same | same |
| `hideError: true`, `autofocus: true` | unsup | unsup | unsup | unsup | unsup | unsup |
| `autocomplete`, `inputType` | unsup | ign | unsup | ign | ign | ign |
| `emptyValue` | unsup | unsup | unsup | ign | ign | ign |
| `rows` | unsup when the effective widget is `textarea`, else ign | same, for a string enum carrying the textarea hint | ign | ign | ign | ign |
| `enumNames` | ign | unsup | ign | ign (RJSF reads it only for a boolean's radio or select, which are components) | ign | unsup |
| `enumDisabled` | ign | unsup | ign | ign | ign | unsup |
| `accept`, `filePreview` | unsup on a string whose format is `data-url` (RJSF renders a file input there by default, Texaryn a text input), else ign | ign | ign | ign | ign | ign |
| `inline`, `yearsRange`, `format`, `hideNowButton`, `hideClearButton` | ign (their widgets are components) | ign | ign | ign | ign | ign |
| `order` | ign | ign | ign | ign | hint `order` on the listed children | ign |
| `orderable` | ign | ign | ign | ign | ign | hint `canReorder`, true unless `orderable` is false |
| `addable: false`, `removable: false`, `copyable: true` | ign | ign | ign | ign | ign | unsup |
| `expandable`, `duplicateKeySuffixSeparator` | ign | ign | ign | ign | ign | ign |
| `*Template` (14 template keys) | unsup | unsup | unsup | unsup | unsup | unsup |
| `backstage` | unsup | unsup | unsup | unsup | unsup | unsup |
| any other key | ign | ign | ign | ign | ign | ign |

`ui:widget`, effective string value, by kind:

| Value | S | E | N | B | O | A |
| --- | --- | --- | --- | --- | --- | --- |
| RJSF's rendering equals Texaryn's default: `text` (S, N), `updown` (N), `select` (E; A with enum items, where it restates RJSF's own default and the multi-select difference is the renderer's, not the uiSchema's), `checkbox` (B) | nothing | nothing | nothing | nothing | | nothing |
| `textarea` | hint `widget: 'textarea'` | hint (string enums; RJSF renders a textarea too), comp otherwise | comp | comp | ign | comp |
| `hidden` | unsup: stays visible and editable, Texaryn has no visibility contract; never a component | same | same | same | same | same |
| any other name | comp | comp | comp | comp | ign | comp |

`ui:widget` on an object is ignored by RJSF apart from `hidden`. A standard name on a type RJSF's stock registry rejects is still a component requirement, because RJSF resolves a registered name before its type map and the conversion cannot see the registry. `ui:field` is a component at any kind and wins over `ui:widget`, as in RJSF.

Where the kind is unknown, inside `items` or in an unaddressable or conditional subtree, no `ui:widget` value counts as Texaryn's default: inside `items` a component name is a requirement with `rows: true`, and every other name is reported.

An array-form `items` gives RJSF tuple positions, and RJSF applies it only to a fixed-items array. Neither Texaryn port marks a tuple: both project `/arr/0` only when the data holds a row, for lists and tuples alike, so the conversion cannot tell a position from a list row. Every key beneath an array-form `items` that is not ign is `unaddressable`, components included, and `uiSchemaAt` never enters it.

## Where Texaryn and RJSF differ

- RJSF shows reorder controls by default, so every statically addressable array gets `canReorder: true` unless `orderable` is false. An array inside a row keeps Texaryn's default.
- `helpText` replaces the description. `ui:help` is carried only where the field has no description; beside one it is a `conflict`.
- A placeholder on a select, and descriptions or help on objects and arrays, render in RJSF and not in Texaryn.
- `ui:order` matches RJSF for listed names and for siblings in one `properties` map. Unlisted siblings from applicators follow Texaryn's child order.
- Only the seven keys RJSF types as global options (`addable`, `copyable`, `orderable`, `removable`, `label`, `duplicateKeySuffixSeparator`, `enableMarkdownInDescription`) form the base under every location. Any other key in `ui:globalOptions` is reported `unsupported` once, because RJSF applies it at some call sites only.
- A requirement the host does not render falls back to the default widget for its type, so a `password` renders as plain text.
- `ui:widget: hidden` is an `unsupported` issue, never a requirement, and the field stays visible and editable.
- An array-form `items` is reported, never converted, because no port tells a tuple position from a list row.
