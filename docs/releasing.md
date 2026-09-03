# Releasing Texaryn

## Pre-merge checks

Before merging the PR that prepares a release:

1. CI is green: build, typecheck, test, `docs:check`, `verify:packages`.
2. The disposable dry run results are recorded in the PR description.

## Merge the PR

After merging:

1. Confirm the `changesets` job ran (not skipped) in the Actions tab.
2. Confirm a `Version Packages` PR opened on the `changeset-release/main` branch, proposing `0.1.0` for `@texaryn/core`, `@texaryn/schema-json`, and `@texaryn/react`. The `publish` job should show as skipped (changesets still pending).

## On the Version Packages branch

1. Update install snippets in the root README, package READMEs, and `docs/getting-started.md`: change `@alpha` to bare package names.
2. Review the generated changelogs for wording.
3. Merge the Version Packages PR.

## Publish

The `publish` job runs automatically after the Version Packages PR merges:

1. It publishes the three packages with provenance to npm.
2. It creates GitHub release `v0.1.0` (no prerelease flag, since the version has no hyphen).

## Post-publish

From a machine with an npm login:

1. Verify dist-tags: `npm dist-tag ls @texaryn/core` (and schema-json, react). `latest` must be `0.1.0`.
2. Remove the alpha tag: `npm dist-tag rm @texaryn/core alpha` (and schema-json, react).
3. Deprecate the placeholder: `npm deprecate "@texaryn/core@0.0.0" "Placeholder only, not a usable release."` (and schema-json, react).

## Recovery

If the `changesets` job is skipped after a push to main, check the `needs` chain for a job that was skipped on a pull_request event and whose condition lacks a status function.

If the Version Packages PR proposes an alpha version instead of a stable one, prerelease mode was not exited on main before merging.
