---
title: Architecture
description: How the packages divide the work, and why the boundaries sit where they do.
---

Texaryn is a small set of packages with deliberately narrow boundaries. Each
one can be understood without reading the others.

## Packages

| Package | Responsibility |
| --- | --- |
| `@texaryn/core` | The framework-neutral runtime: versioned UI documents, form commands, validation and submission lifecycle |
| `@texaryn/collaboration-yjs` | Optional Yjs binding for shared scalar field values; the host supplies the document and provider |
| `@texaryn/schema-json` | JSON Schema evaluation behind the schema port, across three dialects |
| `@texaryn/react` | The React binding: form hooks, display documents and the default widgets |
| `@texaryn/angular` | The Angular binding: signals, standalone form and display components |
| `@texaryn/react-bootstrap` | Bootstrap 5 widgets over the React binding |
| `@texaryn/react-mui` | Material UI v9 widgets over the React binding |
| `@texaryn/vue` | The Vue 3 binding: form composables, display documents, and the default widgets |
| `@texaryn/solid` | The SolidJS binding: signal subscriptions, display documents, and default widgets |
| `@texaryn/svelte` | The Svelte 5 binding: readable store bridge, form and display components |
| `@texaryn/web-components` | The custom element binding: form and display roots with native widgets in light DOM |

## The schema port

Core never imports a schema library. It talks to a port that projects data
into a `SchemaProjection` and validates it. `@texaryn/schema-json` is one
implementation, which is what keeps JSON Schema from becoming an assumption
rather than a choice.

## Collaborative scalar edits

The optional `@texaryn/collaboration-yjs` package stores a bootstrap snapshot
and scalar overrides by JSON Pointer. Core stays independent of Yjs and
transport code. The host supplies a `Y.Doc` and provider. Version 1 keeps array
lengths and object properties fixed, so concurrent array ordering is outside
this package's contract.

```mermaid
flowchart LR
  App[Host application] --> Runtime[FormRuntime]
  Runtime -->|committed scalar edits| Adapter[@texaryn/collaboration-yjs]
  Adapter <-->|baseline and pointer overrides| Doc[Y.Doc]
  App --> Provider[Host selected provider]
  Provider <-->|Yjs updates| Doc
```

## Independent versions

Every package versions on its own contract. A breaking change in the React
binding does not make `@texaryn/core` a major, and a core major does not force
one on bindings that absorb it without breaking their own API. Internal
dependencies are caret ranges rather than exact pins, so a version describes a
package rather than the state of the repository.

## Where things are proven

Each capability declares the layer its semantic proof belongs to.

- **Projection** covers schema semantics: what a keyword does to the projected
  document.
- **Runtime** covers behaviour over time: commands, validation triggers, array
  identity, submission.
- **Renderer** covers what reaches the page, including accessibility, and is
  proven by shared conformance suites across every supported renderer.

Keeping those apart is what stops a renderer concern from being answered by a
runtime test, or an accessibility claim from resting on one design system's
implementation.
