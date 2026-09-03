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

After the Version Packages PR merges, the `changesets` job finds no pending changesets and sets `should-publish` to true, so the `publish` job starts. It targets the protected `npm-release` GitHub environment and waits there until a required reviewer approves the deployment: open the run for the merge commit in the Actions tab and use "Review deployments". Nothing reaches npm before that approval. The release is not live until the deployment is approved.

Once approved, the job:

1. Publishes the three packages with provenance to npm under the `latest` dist-tag.
2. Pushes the `@texaryn/<name>@<version>` tags and `v<version>`.
3. Creates GitHub release `v<version>`, marked prerelease only when the version contains a hyphen.

## Later pushes to main

Any later push to `main` with no pending changesets also sets `should-publish` to true, so the `publish` job starts and waits at the same gate even when there is nothing to release. Approving it runs `changeset publish`, which compares each package version against the registry, finds every version already published, and exits without publishing. The GitHub release steps run only when the action reports `published == 'true'`, so they do not run either. A waiting `publish` deployment on such a push is expected and is not a release signal. Approve it and let it exit, or reject it, which marks that run failed. An unreviewed deployment expires after 30 days.

## Post-publish

From a machine with an npm login:

1. Verify dist-tags: `npm dist-tag ls @texaryn/core` (and schema-json, react). `latest` must be `0.1.0`.
2. Remove the alpha tag: `npm dist-tag rm @texaryn/core alpha` (and schema-json, react).
3. Deprecate the placeholder: `npm deprecate "@texaryn/core@0.0.0" "Placeholder only, not a usable release."` (and schema-json, react).

## Recovery

If the `changesets` or `publish` job is skipped after a push to main without its condition being evaluated, look for a skipped job upstream in the `needs` chain. The `changeset` job runs only on pull_request events, so on every push it is skipped, and GitHub propagates that skip to every downstream job whose `if` lacks a status function, even through intermediate jobs that ran. The `changesets` job needed `!cancelled()` for this in #25, and `publish` needed it in #27; between the two fixes the 0.1.0 merge ran `changesets` and skipped `publish` (run 33786185407). Any job downstream of a job that can be skipped needs a status function in its `if`, in the shape `${{ !cancelled() && needs.<job>.result == 'success' && <gate> }}`.

If the Version Packages PR proposes an alpha version instead of a stable one, prerelease mode was not exited on main before merging.
