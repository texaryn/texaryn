---
title: Architecture
description: How the packages divide the work, and why the boundaries sit where they do.
---

Texaryn is a small set of packages with deliberately narrow boundaries. Each
one can be understood without reading the others.

## Packages

| Package | Responsibility |
| --- | --- |
| `@texaryn/core` | The framework-neutral runtime: IR, commands, validation and submission lifecycle |
| `@texaryn/schema-json` | JSON Schema evaluation behind the schema port, across three dialects |
| `@texaryn/react` | The React binding: hooks, prop getters and the default widgets |
| `@texaryn/react-bootstrap` | Bootstrap 5 widgets over the React binding |
| `@texaryn/react-mui` | Material UI v9 widgets over the React binding |

## The schema port

Core never imports a schema library. It talks to a port that projects data
into a `SchemaProjection` and validates it. `@texaryn/schema-json` is one
implementation, which is what keeps JSON Schema from becoming an assumption
rather than a choice.

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
