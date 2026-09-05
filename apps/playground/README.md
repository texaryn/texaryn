# @texaryn/playground

Private playground application for the Texaryn monorepo.

This application exercises the complete pipeline:

```text
editable JSON Schema
        |
        v
@texaryn/schema-json
        |
        v
@texaryn/core runtime
        |
        v
@texaryn/react
        |
        v
rendered form + live data
```

The package is private and is not published to npm.

## Run locally

From the repository root:

```bash
pnpm install
pnpm --filter @texaryn/playground dev
```

Build the playground with:

```bash
pnpm --filter @texaryn/playground build
```

## What the playground shows

The interface has three main areas:

1. A sample-schema selector and editable JSON Schema source.
2. The form rendered through Texaryn's React renderer.
3. The current runtime data as live JSON.

Changing the schema creates a new `@texaryn/schema-json` adapter. The rendered form is driven by `useForm`, `FormRoot`, and the default React widget registry.

Selecting a sample loads its schema together with the sample's UI hints and initial data. Editing or pasting into the schema editor switches the selector to "Custom schema": the form is then rendered from the editor contents alone, with no hints and empty initial data, so what you see comes from your schema and nothing else.

## Live playground

The playground is deployed to [texaryn.github.io/texaryn](https://texaryn.github.io/texaryn/) by `.github/workflows/pages.yml` on every push to `main`. The workflow builds the workspace packages, then runs `build:pages` (a `vite build` with `--base=/texaryn/`, the path GitHub Pages serves a project site under) and publishes `apps/playground/dist`.

## Packages exercised

The playground depends on workspace versions of:

- `@texaryn/core`
- `@texaryn/schema-json`
- `@texaryn/react`

It is intended for development, manual exploration, and end-to-end verification rather than as a reusable package.

## Related documentation

- [`@texaryn/core`](../core/README.md)
- [`@texaryn/schema-json`](../schema-json/README.md)
- [`@texaryn/react`](../react/README.md)
- [Repository README](../../README.md)
- [Roadmap](../../ROADMAP.md)
