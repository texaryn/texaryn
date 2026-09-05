# @texaryn/docs

The documentation site. Private to the workspace and never published.

Built with [Astro Starlight](https://starlight.astro.build/).

```bash
pnpm --filter @texaryn/docs dev
pnpm --filter @texaryn/docs build
pnpm --filter @texaryn/docs preview
```

## Not deployed yet

This is the shell: a landing page, a navigation structure and a build that CI
runs. GitHub Pages still serves the playground, and combining the two into one
artifact is a later change.

`site` and `base` are already configured for `texaryn.github.io/texaryn`, so
generated links are correct now rather than needing rework when the deployment
moves.

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
