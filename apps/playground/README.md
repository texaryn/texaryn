# @texaryn/playground

The playground application. Private to the workspace and never published.

It exercises the complete pipeline against the executable example catalog:

```text
@texaryn/examples
        |
        v
@texaryn/schema-json
        |
        v
@texaryn/core runtime
        |
        v
@texaryn/react + a renderer registry
        |
        v
rendered form, live data and the inspector
```

## Run locally

From the repository root:

```bash
pnpm install
pnpm build
pnpm --filter @texaryn/playground dev
```

`pnpm build` is required first, not optional. The workspace packages resolve
through their compiled `dist` output, so the dev server cannot resolve
`@texaryn/core` or `@texaryn/react` until they have been built once.

The dev server mounts the app at `/playground/`, matching where it lives in
production.

## What the playground shows

Three areas:

1. The example catalog, with category navigation and search over titles,
   descriptions and capability ids, alongside the schema for the selected
   example.
2. The form, rendered through the selected renderer.
3. The inspector: data, validation, projection, IR, runtime state, schema and
   hints.

Selecting an example loads its schema, hints and initial data from
`@texaryn/examples`, so the playground keeps no catalog of its own. Editing the
schema switches to a custom schema rendered from the editor contents alone.

Changing renderer does not rebuild the form. The runtime belongs to the
selected example, and the renderer is presentation over it, so switching
between Default, Bootstrap and Material UI preserves whatever has been typed.

## URLs

Each example has a stable URL, and the renderer is carried in the query:

```text
/texaryn/playground/basics-string
/texaryn/playground/conditional-if-then-else?renderer=mui
```

Form data is deliberately not in the URL.

## Deployment

The playground is published as part of one GitHub Pages artifact, alongside
the documentation site, by `.github/workflows/pages.yml` on every push to
`main`:

```text
texaryn.github.io/texaryn/             documentation site
texaryn.github.io/texaryn/playground/  this application
```

The docs site owns the root, so this application is built with
`--base=/texaryn/playground/` and composed into the site output under
`playground/`.

`build:pages` also runs `scripts/materialize-routes.mjs`, which writes a real
entry point for every catalog example. The docs site owns the site-wide
`404.html`, so the playground cannot rely on an SPA fallback: each supported
URL is a file that exists. A stale example id falls back through the site 404,
which redirects paths under the playground mount back to it.

## Packages exercised

- `@texaryn/core`
- `@texaryn/schema-json`
- `@texaryn/react`
- `@texaryn/react-bootstrap`
- `@texaryn/react-mui`
- `@texaryn/examples`

It exists for development, manual exploration and end-to-end verification
rather than as a reusable package.

## Related documentation

- [`@texaryn/core`](../../packages/core/README.md)
- [`@texaryn/schema-json`](../../packages/schema-json/README.md)
- [`@texaryn/react`](../../packages/react/README.md)
- [`@texaryn/examples`](../../packages/examples/README.md)
- [Repository README](../../README.md)
- [Roadmap](../../ROADMAP.md)
