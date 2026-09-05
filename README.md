<p align="center">
  <img src="./assets/logo/texaryn-mark.svg" alt="Texaryn" width="160" />
</p>

<h1 align="center">Texaryn</h1>

<p align="center">
  <strong>Framework-neutral runtime for schema-driven interfaces.</strong>
</p>

<p align="center">
  Compile data semantics into a UI IR, run it through a headless runtime, and render it with React or another renderer.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@texaryn/core">
    <img src="https://img.shields.io/npm/v/@texaryn/core" alt="npm version" />
  </a>
  <a href="https://github.com/texaryn/texaryn/actions/workflows/ci-release.yml">
    <img src="https://github.com/texaryn/texaryn/actions/workflows/ci-release.yml/badge.svg" alt="CI" />
  </a>
  <a href="https://codecov.io/gh/texaryn/texaryn">
    <img src="https://codecov.io/gh/texaryn/texaryn/branch/main/graph/badge.svg" alt="coverage" />
  </a>
  <a href="https://www.npmjs.com/package/@texaryn/core">
    <img src="https://img.shields.io/npm/dm/@texaryn/core" alt="npm downloads" />
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/github/license/texaryn/texaryn" alt="license" />
  </a>
</p>

<p align="center">
  <a href="https://texaryn.github.io/texaryn/">Documentation</a> •
  <a href="https://texaryn.github.io/texaryn/playground/">Playground</a> •
  <a href="https://texaryn.github.io/texaryn/start/getting-started/">Getting Started</a> •
  <a href="https://texaryn.github.io/texaryn/api/">API Reference</a> •
  <a href="./ROADMAP.md">Roadmap</a>
</p>

---

## Why Texaryn?

Most schema-driven UI libraries tightly couple schema interpretation, form state, and a specific rendering framework.

Texaryn separates them.

```text
JSON Schema
    ↓
Schema Evaluation
    ↓
SchemaProjection
    ↓
IR Compiler
    ↓
UIDocument
    ↓
Deterministic Runtime
    ↓
Renderer
    ↓
React / Web / ...
```

The core has no dependency on React, the DOM, or an AI SDK.

That makes the UI definition portable, inspectable, testable, and safe to transform without generating or evaluating framework code.

## Quick start

```bash
pnpm add @texaryn/core @texaryn/schema-json @texaryn/react
```

React 18 or newer is required by `@texaryn/react`.

```tsx
import { createRoot } from 'react-dom/client'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import {
  FormProvider,
  FormRoot,
  ErrorSummary,
  createDefaultRegistry,
  useForm,
} from '@texaryn/react'

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  title: 'Profile',
  required: ['name'],
  properties: {
    name: {
      type: 'string',
      title: 'Name',
      minLength: 2,
    },
    age: {
      type: 'integer',
      title: 'Age',
      minimum: 18,
    },
    newsletter: {
      type: 'boolean',
      title: 'Subscribe to newsletter',
    },
  },
}

const adapter = await createJsonSchemaAdapter(schema)
const registry = createDefaultRegistry()

function App() {
  const form = useForm(adapter, {
    initialData: {
      name: '',
      age: 18,
      newsletter: false,
    },
    hints: {
      '/name': { validationTrigger: 'blur' },
    },
    onSubmit: async (data) => {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      console.log('Submitted:', data)
    },
  })

  return (
    <FormProvider value={form.runtime}>
      <ErrorSummary />
      <FormRoot registry={registry} />

      <button
        type="button"
        disabled={
          form.submission.status === 'validating' ||
          form.submission.status === 'submitting'
        }
        onClick={() => form.dispatch({ type: 'Submit' })}
      >
        {form.submission.status === 'submitting' ? 'Submitting...' : 'Submit'}
      </button>

      <h2>Data</h2>
      <pre>{JSON.stringify(form.data, null, 2)}</pre>
    </FormProvider>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
```

The schema is evaluated independently from React. React observes the runtime and renders the resulting UI document.

See [Getting started](https://texaryn.github.io/texaryn/start/getting-started/) for a longer walkthrough, including validation triggers and the full submission lifecycle.

## Documentation

Product documentation is published at
[texaryn.github.io/texaryn](https://texaryn.github.io/texaryn/):

- [Getting started](https://texaryn.github.io/texaryn/start/getting-started/)
- [Architecture](https://texaryn.github.io/texaryn/concepts/architecture/)
- [Migrating from RJSF](https://texaryn.github.io/texaryn/guides/migrating-from-rjsf/)
- [API reference](https://texaryn.github.io/texaryn/api/)
- [Playground](https://texaryn.github.io/texaryn/playground/)

Its sources live in [`apps/docs`](apps/docs). Maintainer material stays in
[`docs/`](docs/README.md): the [release runbook](docs/releasing.md), design
records, and the generated `docs/api` artifact that `pnpm docs:check` gates.

## Packages

| Package | Purpose |
| --- | --- |
| `@texaryn/core` | UI IR, compiler, runtime, state, commands, identity, renderer registry |
| `@texaryn/schema-json` | JSON Schema evaluation and validation adapter |
| `@texaryn/react` | React bindings, hooks, prop getters, renderer, and default widgets |
| `@texaryn/react-bootstrap` | Bootstrap 5 widgets: native markup and classes on top of `@texaryn/react` |
| `@texaryn/react-mui` | Material UI v9 widgets: MUI components on top of `@texaryn/react` |

`@texaryn/vue` is in the repository and releasing shortly, as Vue 3 bindings
over the same core. The playground renders through it, and until `0.1.0`
reaches npm it cannot be installed.

The repository also contains two private applications: `@texaryn/playground`, which exercises the complete pipeline against the example catalog, and `@texaryn/docs`, the documentation site.

## Architecture

Texaryn deliberately keeps four concerns separate.

### 1. Schema evaluation

A schema adapter implements the framework-neutral `SchemaEvaluationPort`.

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

The JSON Schema adapter currently understands these dialects:

- Draft 7
- 2019-09
- 2020-12

### 2. UI IR

Schema evaluation produces a projection which is compiled into a versioned UI document.

```ts
interface UIDocument {
  version: 1
  rootId: NodeId
  nodes: Record<NodeId, UINode>
}
```

The IR describes **what the UI means**, not how React, Vue, or the DOM should render it.

### 3. Runtime

`FormRuntime` owns behavior and state:

- values
- validation
- dirty state
- touched state
- visibility
- disabled state
- submission state
- stable array identity

Renderers consume this state instead of owning it.

### 4. Renderer

Renderers map semantic UI nodes to concrete components.

The React package provides:

- `useForm`
- `useField`
- `useFieldArray`
- `FormProvider`
- `FormRoot`
- `NodeRenderer`
- accessible prop getters
- a default widget registry

The registry is extensible, so applications can replace or add widgets without modifying the runtime.

## Default React widgets

`@texaryn/react` currently includes:

- text input
- number input
- checkbox
- select
- textarea
- object layout
- array control

The default set is intentionally small. Texaryn's renderer registry is designed for applications and design systems to provide their own components.

## JSON Schema support

Texaryn's JSON Schema adapter currently covers the schema features needed by the first runtime and renderer implementation, including:

- primitive and object schemas
- arrays
- enums
- local `$ref`
- `if` / `then` / `else`
- `dependentSchemas`
- `dependentRequired`
- Draft 7 `dependencies`
- `oneOf`
- `anyOf`
- annotations and constraints
- validation errors mapped to JSON Pointers

Validation remains the responsibility of the schema adapter. The core runtime does not attempt to become a JSON Schema validator.

## UI hints

Data semantics and presentation are intentionally separate.

JSON Schema describes the data.

Texaryn UI hints can describe presentation choices such as:

```ts
const hints = {
  '/email': {
    placeholder: 'you@example.com',
    order: 1,
  },
  '/bio': {
    widget: 'textarea',
    helpText: 'Tell us a little about yourself.',
    order: 2,
  },
}
```

Pass hints to the runtime:

```ts
const form = useForm(adapter, {
  initialData,
  hints,
})
```

Schema meaning remains intact while renderers retain control over presentation.

## Headless by design

`@texaryn/core` does not depend on React or the DOM.

```text
@texaryn/schema-json
        ↓
   @texaryn/core
        ↑
   @texaryn/react
```

Framework packages are consumers of the core contracts.

React is the first maintained renderer, not part of the runtime architecture itself.

## Designed for dynamic UI

Texaryn uses a serializable, deterministic UI representation instead of generated framework code.

This makes the same runtime model suitable for UI definitions coming from:

- static application schemas
- servers
- configuration systems
- visual builders
- agents and AI systems

An external system can produce or modify structured UI data while the Texaryn runtime remains responsible for validation, state, identity, and deterministic execution.

No generated JavaScript or `eval()` is required.

## Development

Texaryn is a pnpm monorepo.

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

Run the playground:

```bash
pnpm --filter @texaryn/playground dev
```

It browses the example catalog, renders each example through any of the four renderers, and inspects the pipeline from schema through projection and IR to the rendered form. `pnpm build` has to run first, because the workspace packages resolve through their compiled output.

## Principles

Texaryn is built around a few constraints:

- **Framework-neutral core:** rendering frameworks stay at the edge.
- **Schema semantics first:** presentation does not redefine data meaning.
- **Deterministic runtime:** behavior is explicit and testable.
- **Serializable UI:** UI definitions are data, not generated framework code.
- **Stable identity:** dynamic arrays should not destroy component identity.
- **Extensible rendering:** semantic nodes map to replaceable widgets.
- **No protocol lock-in:** the core does not depend on an AI/UI transport protocol.

## Roadmap

Texaryn is being built incrementally.

### Completed

- Core IR and runtime foundations
- stable array identity
- JSON Schema evaluation layer
- Draft 7 / 2019-09 / 2020-12 dialect boundary
- conditionals and schema composition
- React runtime bindings
- React hooks
- accessible prop getters
- widget registry
- default React widgets
- renderer conformance tests
- end-to-end demo
- validation triggers and debounce
- display-policy-aware error presentation
- submission lifecycle with snapshot semantics
- Vue renderer sharing one runtime with React, proving framework neutrality

### Next

- additional schema adapters
- further runtime capabilities based on real usage

See [`ROADMAP.md`](./ROADMAP.md) for the detailed implementation roadmap.

## Project status

Texaryn is pre-1.0 and under active development. Public APIs may change before 1.0.

The architecture is established, but APIs are expected to evolve as the runtime is exercised by real applications and additional renderers.

If you are experimenting with Texaryn today, pin exact versions.

## Contributing

Issues, design discussions, and focused pull requests are welcome.

For architectural changes, please open a discussion or issue first so changes can be evaluated against the framework-neutral runtime boundaries.

---

<p align="center">
  <strong>Schema semantics in. Deterministic UI out.</strong>
</p>
