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

`.github/workflows/pages.yml` builds both, copies `apps/playground/dist` into
this site's output, and uploads the result. This site also owns the site-wide
`404.html`, which redirects paths under the playground mount back to the
playground so a stale example id keeps its old behaviour.

## Broken links fail the build

`starlight-links-validator` runs on every build and exits non-zero on a broken
internal link. That is on from the first commit deliberately: switching it on
after a site has content means starting with a backlog and learning to ignore
the warnings.

## What lives where, for now

The authored guides, ADRs and release documentation are still under the
repository's `docs/` directory, and the API reference is still generated there
by TypeDoc via `pnpm docs`. Neither is affected by this application.

Migrating that content here is a separate change, and an intentional one:
`docs/plans/` and much of `docs/adr/` are engineering history rather than
product documentation, so the move is a curation decision rather than a copy.
