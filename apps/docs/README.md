# @texaryn/docs

The documentation site. Private to the workspace and never published.

Built with [Astro Starlight](https://starlight.astro.build/).

```bash
pnpm --filter @texaryn/docs dev
pnpm --filter @texaryn/docs build
pnpm --filter @texaryn/docs preview
```

## Deployment

This site owns the root of the GitHub Pages artifact, and the playground is
composed into it under `playground/`:

```text
texaryn.github.io/texaryn/             this site
texaryn.github.io/texaryn/api/         generated API reference
texaryn.github.io/texaryn/playground/  the playground application
```

`pnpm site:build` from the repository root builds both applications, composes
them and checks the result. `.github/workflows/pages.yml` runs that one command
and uploads `apps/docs/dist`, and the pull request build runs the same command
without deploying, so what ships is the artifact that was checked. This site
also owns the site-wide `404.html`, which redirects paths under the playground
mount back to the playground so a stale example id keeps its old behaviour.

## Two link checks, at two different seams

`starlight-links-validator` runs on every build and exits non-zero on a broken
internal link. That is on from the first commit deliberately: switching it on
after a site has content means starting with a backlog and learning to ignore
the warnings. It cannot see the playground, which belongs to the other build,
so `/playground` is excluded from it.

That exclusion is a seam, and a link across it shipped: every "Open in the
playground" link pointed at `/texarynplayground/<id>` while this build
reported all internal links valid. `scripts/check-site-links.mjs` runs over
the composed artifact, where the two applications are one site and nothing
needs excluding. It asserts that every anchor resolves to a file the artifact
can serve, and that the routes into the playground are offered at all: a page
that exists but that nothing links to is broken from a reader's side.

## What lives where

Guides, concepts and the generated API reference live here. The repository's
[`docs/`](../../docs/README.md) directory holds maintainer material: the
release runbook, design records, implementation plans, and the separate
`docs/api` artifact that gates type surface drift.
