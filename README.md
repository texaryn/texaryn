<p align="center">
  <img src="./assets/logo/texaryn-mark.svg" alt="Texaryn" width="160" />
</p>

<h1 align="center">Texaryn</h1>

<p align="center">
  <strong>Schema-driven forms. Your framework. Your design system.</strong>
</p>

<p align="center">
  Turn JSON Schema, TypeBox or Zod schemas into forms with validation and submission.<br />
  Render with React, Angular, Vue, Svelte, SolidJS or Web Components.
</p>

<p align="center">
  <a href="https://github.com/texaryn/texaryn/actions/workflows/ci-release.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/texaryn/texaryn/ci-release.yml?branch=main&label=CI" alt="CI" />
  </a>
  <a href="https://codecov.io/gh/texaryn/texaryn">
    <img src="https://img.shields.io/codecov/c/github/texaryn/texaryn?label=coverage" alt="coverage" />
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/github/license/texaryn/texaryn?label=license" alt="license" />
  </a>
</p>

<p align="center">
  <a href="https://texaryn.github.io/texaryn/">Documentation</a> •
  <a href="https://texaryn.github.io/texaryn/playground/">Playground</a> •
  <a href="https://texaryn.github.io/texaryn/start/getting-started/">Getting Started</a> •
  <a href="https://texaryn.github.io/texaryn/api/">API Reference</a> •
  <a href="./ROADMAP.md">Roadmap</a>
</p>

## Why Texaryn?

Build settings pages, onboarding flows and forms whose fields change with the data. Texaryn reads the schema, manages form state, and renders the controls through your framework.

- **Keep your components.** Use the default widgets, React Bootstrap or Material UI, or register your own design system.
- **Share form behavior.** Validation, submission, conditional fields and array identity live in a headless TypeScript runtime. Framework bindings observe that runtime.
- **Choose your schema.** Use JSON Schema, TypeBox's JSON Schema output, or Zod 4. Presentation hints stay separate from the data contract.
- **Inspect what runs.** The schema projection and UI document are data you can inspect in the [playground](https://texaryn.github.io/texaryn/playground/).

Need lists, tables or host actions instead of editable fields? [Display documents](https://texaryn.github.io/texaryn/guides/display-documents/) use the same bindings without a schema adapter.

## Try a form

Start in an existing React TypeScript application with React 18.3 or React 19:

```bash
pnpm add @texaryn/core @texaryn/schema-json @texaryn/react
```

Replace `src/main.tsx` with this example. The page needs a `<div id="root"></div>`.

```tsx
import { createRoot } from 'react-dom/client'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import {
  ErrorSummary, FormProvider, FormRoot, createDefaultRegistry, useForm,
} from '@texaryn/react'

async function main() {
  const adapter = await createJsonSchemaAdapter({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    title: 'Profile',
    required: ['name'],
    properties: {
      name: { type: 'string', title: 'Name', minLength: 2 },
      newsletter: { type: 'boolean', title: 'Subscribe to newsletter' },
    },
  })
  const registry = createDefaultRegistry()

  function App() {
    const form = useForm(adapter, {
      initialData: { name: '', newsletter: false },
      onSubmit: (data) => console.log('Submitted', data),
    })

    return (
      <FormProvider value={form.runtime}>
        <form noValidate onSubmit={(event) => {
          event.preventDefault()
          form.dispatch({ type: 'Submit' })
        }}>
          <ErrorSummary />
          <FormRoot registry={registry} />
          <button type="submit">Submit</button>
        </form>
      </FormProvider>
    )
  }

  createRoot(document.getElementById('root')!).render(<App />)
}

void main()
```

Submit an empty name to see the error summary. Enter two or more characters and submit to log the data in the browser console. The example does not send data to a server.

[Getting started](https://texaryn.github.io/texaryn/start/getting-started/) explains the example and adds presentation hints. For other frameworks, start with [Choose your packages](https://texaryn.github.io/texaryn/start/choose-packages/).

## Packages

Install the headless core, a schema adapter and the binding for your framework. The [package catalog](https://texaryn.github.io/texaryn/start/choose-packages/) lists all 12 published packages, setup guides and current npm versions.

## Explore

| I want to… | Start here |
| --- | --- |
| Try conditional fields, arrays or styling | [Interactive playground](https://texaryn.github.io/texaryn/playground/) |
| Pick a framework or schema adapter | [Packages and setup](https://texaryn.github.io/texaryn/start/choose-packages/) |
| Check JSON Schema keywords and limits | [JSON Schema support](https://texaryn.github.io/texaryn/guides/json-schema-support/) |
| Control validation and submission | [Validation and submission](https://texaryn.github.io/texaryn/guides/validation-and-submission/) |
| Replace or style the widgets | [Custom styling](https://texaryn.github.io/texaryn/guides/custom-styling/) |
| Port a React JSON Schema Form application | [Migration guide](https://texaryn.github.io/texaryn/guides/migrating-from-rjsf/) |
| Generate UI with a model | [AI generation contract](https://texaryn.github.io/texaryn/guides/ai-generation/) |
| Understand the runtime or look up a type | [Architecture](https://texaryn.github.io/texaryn/concepts/architecture/) · [API reference](https://texaryn.github.io/texaryn/api/) |

Coding agents can read [llms.txt](https://texaryn.github.io/texaryn/llms.txt) or the full documentation in [llms-full.txt](https://texaryn.github.io/texaryn/llms-full.txt).

## Status and compatibility

`@texaryn/core`, `@texaryn/schema-json` and `@texaryn/react` are at 1.0. Other packages are versioned independently; packages below 1.0 may change between minor releases. See the [roadmap](https://texaryn.github.io/texaryn/roadmap/) for package status and product direction.

JSON Schema Draft 4, Draft 7, 2019-09 and 2020-12 are supported. Validation support and generated controls have different limits: check the [support guide](https://texaryn.github.io/texaryn/guides/json-schema-support/) against your schemas before adopting.

## Contribute

[Report an issue](https://github.com/texaryn/texaryn/issues) or open a focused pull request. For a change to a package boundary, open an issue first.

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm --filter @texaryn/playground dev
```

Build first: workspace packages resolve through their compiled output. The [documentation site sources](apps/docs) and [maintainer docs](docs/README.md) explain the site build and release process.

[Apache-2.0 license](LICENSE).
