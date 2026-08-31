# @texaryn/demo

Private development demo for the Texaryn monorepo.

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
pnpm --filter @texaryn/demo dev
```

Build the demo with:

```bash
pnpm --filter @texaryn/demo build
```

## What the demo shows

The interface has three main areas:

1. A sample-schema selector and editable JSON Schema source.
2. The form rendered through Texaryn's React renderer.
3. The current runtime data as live JSON.

Changing the schema creates a new `@texaryn/schema-json` adapter. The rendered form is driven by `useForm`, `FormRoot`, and the default React widget registry.

## Packages exercised

The demo depends on workspace versions of:

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
