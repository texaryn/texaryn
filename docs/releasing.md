# Releasing Texaryn

## Pre-merge checks

Before merging the PR that prepares a release:

1. CI is green: build, typecheck, test, `docs:check`, `verify:packages`.
2. The disposable dry run results are recorded in the PR description.
3. For the first release that includes a new package, publish and deprecate the `0.0.0` placeholder from a machine with an npm login and add the trusted publisher (`ci-release.yml`, environment `npm-release`) before merging the Version Packages PR. OIDC cannot create a package.

`@texaryn/react-bootstrap` versions independently. `.changeset/config.json` puts `@texaryn/core`, `@texaryn/schema-json` and `@texaryn/react` in one `fixed` group, so those three always move together, but `@texaryn/react-bootstrap` is outside it: a changeset naming only that package moves only that package, and its number drifts away from the group's. Its first changeset is a minor, so its first version is `0.1.0` and it needs the placeholder step above.

## Merge the PR

After merging:

1. Confirm the `changesets` job ran (not skipped) in the Actions tab.
2. Confirm a `Version Packages` PR opened on the `changeset-release/main` branch, proposing `0.1.0` for `@texaryn/core`, `@texaryn/schema-json`, and `@texaryn/react`. The `publish` job should show as skipped (changesets still pending).

## On the Version Packages branch

1. Update install snippets in the root README, package READMEs, and `docs/getting-started.md`: change `@alpha` to bare package names.
2. Review the generated changelogs for wording.
3. Merge the Version Packages PR.

## Publish

After the Version Packages PR merges, the `changesets` job finds no pending changesets and runs `scripts/check-unpublished-packages.mjs`, which asks the registry for the exact version in each of the four public `package.json` files. Because the merge just raised those versions, they are missing, `should-publish` is true and the `publish` job starts. It targets the protected `npm-release` GitHub environment and waits there until a required reviewer approves the deployment: open the run for the merge commit in the Actions tab and use "Review deployments". Nothing reaches npm before that approval. The release is not live until the deployment is approved.

The check fails open. A 404 for any package means publish. A 5xx, a timeout or any other answer the script cannot classify also means publish, so an npm outage can delay a release at the gate but can never skip one. Only a confirmed 200 for every package stops the job.

The `publish` job pins npm to 11.19.1 before building. `.nvmrc` pins only the Node major, so the npm bundled with the runner's Node 24 build drifts between runs; trusted publishing needs npm 11.5.1 or later, and npm 12 changes publish behaviour.

Once approved, the job:

1. Publishes the packages that have a new version with provenance to npm under the `latest` dist-tag.
2. Pushes the `@texaryn/<name>@<version>` tags and `v<version>`.
3. Creates GitHub release `v<version>`, marked prerelease only when the version contains a hyphen.

## Later pushes to main

A later push to `main` with no pending changesets and every version already on npm stops before the gate: the registry check returns a 200 for each package, `should-publish` is false and `publish` is skipped. No deployment waits and nothing needs reviewing.

A waiting `publish` deployment on a changeset-free push therefore means one of two things: the registry does not have one of the versions (a partial publish, see Recovery) or it could not be consulted. Approve it and `changeset publish` does only what is needed, or reject it. Do not leave it waiting: the workflow's concurrency group lets one run per branch through at a time, and a run parked at the gate holds that slot, so every later push to `main` sits at "pending" until the deployment is approved or rejected.

## Post-publish

From a machine with an npm login:

1. Verify dist-tags: `npm dist-tag ls @texaryn/core` (and schema-json, react). `latest` must be `0.1.0`.
2. Remove the alpha tag: `npm dist-tag rm @texaryn/core alpha` (and schema-json, react).
3. Deprecate the placeholder: `npm deprecate "@texaryn/core@0.0.0" "Placeholder only, not a usable release."` (and schema-json, react).

## Recovery

If the `changesets` or `publish` job is skipped after a push to main without its condition being evaluated, look for a skipped job upstream in the `needs` chain. The `changeset` job runs only on pull_request events, so on every push it is skipped, and GitHub propagates that skip to every downstream job whose `if` lacks a status function, even through intermediate jobs that ran. The `changesets` job needed `!cancelled()` for this in #25, and `publish` needed it in #27; between the two fixes the 0.1.0 merge ran `changesets` and skipped `publish` (run 33786185407). Any job downstream of a job that can be skipped needs a status function in its `if`, in the shape `${{ !cancelled() && needs.<job>.result == 'success' && <gate> }}`.

If `publish` fails after some packages were published, the group is inconsistent: on 2026-09-03 an npm incident left `@texaryn/core@0.1.1` on the registry while `react` and `schema-json` stayed at 0.1.0 and no tags or release were created. Wait until the registry lists the published versions, then rerun the failed job (`gh run rerun <run-id> --failed`) and approve the deployment. `changeset publish` skips versions the registry already has and finishes the rest, and the tag and release steps run on the completed group. Rerunning before the registry has caught up makes `changeset publish` retry the published package and fail again.

If the Version Packages PR proposes an alpha version instead of a stable one, prerelease mode was not exited on main before merging.
